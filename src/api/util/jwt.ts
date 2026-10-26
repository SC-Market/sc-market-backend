/**
 * JWT Authentication Utilities
 *
 * Handles JWT access token generation/validation and refresh token management.
 * Access tokens are stateless (no DB lookup). Refresh tokens are stored in DB.
 *
 * Cookie layout:
 *   scmarket.access  — short-lived JWT (15 min), sent on all requests
 *   scmarket.refresh — opaque token (60 days), sent only to /api/auth/*
 */

import jwt from "jsonwebtoken"
import crypto from "node:crypto"
import { Response, Request } from "express"
import { env } from "../../config/env.js"
import { getKnex } from "../../clients/database/knex-db.js"
import type { SiteRole } from "./site-role.js"

// ── Types ──────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string       // user_id
  role: SiteRole
  username: string
  /** refresh_tokens.token_id of this session (absent on tokens minted before MFA). */
  sid?: string
  /** Unix seconds (fractional) of the session's last successful MFA. */
  mfa_at?: number
  /** RFC 8176 authentication methods, e.g. ["oauth", "otp"]. */
  amr?: string[]
  iat: number
  exp: number
}

/** Session claims carried into every access token of a refresh-token chain. */
export interface AccessSession {
  sid: string
  mfaAt?: Date | null
  amr?: string[] | null
}

export interface RefreshTokenRecord {
  token_id: string
  user_id: string
  token_hash: string
  expires_at: Date
  created_at: Date
  revoked_at: Date | null
  user_agent: string | null
  ip_address: string | null
  mfa_at?: Date | null
  amr?: string[] | null
}

export interface UserForJWT {
  user_id: string
  role: SiteRole
  username: string
}

// ── Config ─────────────────────────────────────────────────────────────────

const JWT_SECRET = () => env.JWT_SECRET || env.SESSION_SECRET!
const ACCESS_TOKEN_EXPIRY = "15m"
const REFRESH_TOKEN_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000 // 60 days
const CLOCK_TOLERANCE_SECONDS = 30

function isProduction(): boolean {
  return env.NODE_ENV === "production"
}

// ── Access Token ───────────────────────────────────────────────────────────

export function generateAccessToken(
  user: UserForJWT,
  session?: AccessSession,
): string {
  return jwt.sign(
    {
      sub: user.user_id,
      role: user.role,
      username: user.username,
      ...(session && { sid: session.sid }),
      ...(session?.mfaAt && { mfa_at: session.mfaAt.getTime() / 1000 }),
      ...(session?.mfaAt && session.amr && { amr: session.amr }),
    },
    JWT_SECRET(),
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  )
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET(), {
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    }) as JWTPayload
    if (payload.sid !== undefined && typeof payload.sid !== "string") return null
    if (payload.mfa_at !== undefined && typeof payload.mfa_at !== "number") return null
    if (
      payload.amr !== undefined &&
      !(Array.isArray(payload.amr) && payload.amr.every((m) => typeof m === "string"))
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

// ── Refresh Token ──────────────────────────────────────────────────────────

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/** Store a new refresh token; returns its token_id (the session id). */
export async function saveRefreshToken(
  userId: string,
  rawToken: string,
  req: Request,
): Promise<string> {
  const knex = getKnex()
  const [row] = await knex("refresh_tokens")
    .insert({
      user_id: userId,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      user_agent: req.headers["user-agent"]?.substring(0, 500) || null,
      ip_address: req.ip || null,
    })
    .returning(["token_id"])
  return row.token_id
}

export async function validateRefreshToken(
  rawToken: string,
): Promise<RefreshTokenRecord | null> {
  const knex = getKnex()
  const record = await knex<RefreshTokenRecord>("refresh_tokens")
    .where({ token_hash: hashToken(rawToken) })
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .first()
  return record || null
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const knex = getKnex()
  await knex("refresh_tokens")
    .where({ token_hash: hashToken(rawToken) })
    .update({ revoked_at: new Date() })
}

/**
 * Rotate a refresh token: revoke the old one and issue a new one atomically.
 * Returns the new raw refresh token, or null if the old token is invalid.
 */
export interface RotatedSession {
  newRawToken: string
  userId: string
  /** The new row's token_id: the `sid` of access tokens minted from it. */
  tokenId: string
  /** Carried over from the old row, so MFA elevation survives rotation. */
  mfaAt: Date | null
  amr: string[] | null
}

export async function rotateRefreshToken(
  oldRawToken: string,
  req: Request,
): Promise<RotatedSession | null> {
  const knex = getKnex()
  const oldHash = hashToken(oldRawToken)

  // Revoke old token and get its record in one step
  // First try: token is not yet revoked
  let updated = await knex("refresh_tokens")
    .where({ token_hash: oldHash })
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .update({ revoked_at: new Date() })
    .returning(["user_id", "mfa_at", "amr"])

  // Grace period: if token was revoked in the last 10s (client retried after network hiccup),
  // allow it and just return the existing session
  if (!updated || updated.length === 0) {
    const recent = await knex("refresh_tokens")
      .where({ token_hash: oldHash })
      .where("revoked_at", ">", new Date(Date.now() - 10_000))
      .where("expires_at", ">", new Date())
      .first()
    if (recent) {
      updated = [{ user_id: recent.user_id, mfa_at: recent.mfa_at, amr: recent.amr }]
    }
  }

  if (!updated || updated.length === 0) return null

  const { user_id: userId, mfa_at: mfaAt = null, amr = null } = updated[0]
  const newRawToken = generateRefreshToken()
  const [row] = await knex("refresh_tokens")
    .insert({
      user_id: userId,
      token_hash: hashToken(newRawToken),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      user_agent: req.headers["user-agent"]?.substring(0, 500) || null,
      ip_address: req.ip || null,
      // Copy the session's MFA elevation into the rotated row (it would
      // otherwise drop every 15 minutes).
      mfa_at: mfaAt,
      amr,
    })
    .returning(["token_id"])

  return { newRawToken, userId, tokenId: row.token_id, mfaAt, amr }
}

/**
 * Record a successful MFA on a session (refresh-token row). Returns false if
 * the session is gone (revoked, expired, or not this user's).
 */
export async function elevateRefreshSession(
  sid: string,
  userId: string,
  at: Date,
  amr: string[],
): Promise<boolean> {
  const updated = await getKnex()("refresh_tokens")
    .where({ token_id: sid, user_id: userId })
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .update({ mfa_at: at, amr })
  return updated > 0
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<number> {
  const knex = getKnex()
  return knex("refresh_tokens")
    .where({ user_id: userId })
    .whereNull("revoked_at")
    .update({ revoked_at: new Date() })
}

export async function getUserSessions(userId: string): Promise<RefreshTokenRecord[]> {
  const knex = getKnex()
  return knex<RefreshTokenRecord>("refresh_tokens")
    .where({ user_id: userId })
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .orderBy("created_at", "desc")
}

export async function revokeSessionById(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const knex = getKnex()
  const updated = await knex("refresh_tokens")
    .where({ token_id: tokenId, user_id: userId })
    .whereNull("revoked_at")
    .update({ revoked_at: new Date() })
  return updated > 0
}

// ── Cookies ────────────────────────────────────────────────────────────────

const ACCESS_COOKIE = "scmarket.access"
const REFRESH_COOKIE = "scmarket.refresh"

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  const prod = isProduction()
  const sameSite = prod ? ("none" as const) : ("lax" as const)

  // Clear old refresh cookie with wrong path (legacy cleanup)
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: prod, sameSite, path: "/" })

  setAccessCookie(res, accessToken)

  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: prod,
    sameSite,
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  })
}

/** Replace only the access cookie (e.g. after an MFA elevation). */
export function setAccessCookie(res: Response, accessToken: string): void {
  const prod = isProduction()
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: 15 * 60 * 1000, // 15 min
  })
}

export function clearAuthCookies(res: Response): void {
  const prod = isProduction()
  const sameSite = prod ? ("none" as const) : ("lax" as const)

  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure: prod, sameSite, path: "/" })
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: prod, sameSite, path: "/api/auth" })
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: prod, sameSite, path: "/" }) // legacy
}

export function getAccessTokenFromRequest(req: Request): string | null {
  return req.cookies?.[ACCESS_COOKIE] || null
}

export function getRefreshTokenFromRequest(req: Request): string | null {
  return req.cookies?.[REFRESH_COOKIE] || null
}

// ── Toggle ─────────────────────────────────────────────────────────────────

export function isJWTAuthEnabled(): boolean {
  return env.JWT_AUTH_ENABLED !== "false"
}
