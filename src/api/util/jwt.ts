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

// ── Types ──────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string       // user_id
  role: string      // "user" | "admin"
  username: string
  iat: number
  exp: number
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
}

export interface UserForJWT {
  user_id: string
  role: string
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

export function generateAccessToken(user: UserForJWT): string {
  return jwt.sign(
    { sub: user.user_id, role: user.role, username: user.username },
    JWT_SECRET(),
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  )
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET(), {
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    }) as JWTPayload
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

export async function saveRefreshToken(
  userId: string,
  rawToken: string,
  req: Request,
): Promise<void> {
  const knex = getKnex()
  await knex("refresh_tokens").insert({
    user_id: userId,
    token_hash: hashToken(rawToken),
    expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    user_agent: req.headers["user-agent"]?.substring(0, 500) || null,
    ip_address: req.ip || null,
  })
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
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: prod, sameSite, path: "/api/auth" })

  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: prod,
    sameSite,
    path: "/",
    maxAge: 15 * 60 * 1000, // 15 min
  })

  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: prod,
    sameSite,
    path: "/",
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  })
}

export function clearAuthCookies(res: Response): void {
  const prod = isProduction()
  const sameSite = prod ? ("none" as const) : ("lax" as const)

  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure: prod, sameSite, path: "/" })
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: prod, sameSite, path: "/" })
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
