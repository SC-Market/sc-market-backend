/**
 * When does MFA count? Pure functions over the request's auth context.
 *
 * - Admin power needs an MFA on this session within 24 h
 *   (ADMIN_MFA_MAX_AGE_SECONDS), newer than the account's mfa_changed_at.
 * - Sensitive actions need one within 10 min (step-up).
 * - API tokens never carry a session MFA. A token holds admin power only if it
 *   carries an admin-only scope and was minted (or last changed) under a
 *   step-up that is still newer than mfa_changed_at.
 */

import {
  ADMIN_MFA_MAX_AGE_SECONDS,
  STEP_UP_MAX_AGE_SECONDS,
} from "./config.js"

export type AuthMethod = "session" | "jwt" | "token"

export interface RequestAuth {
  method: AuthMethod
  /** refresh_tokens.token_id of this browser session (JWT auth only). */
  sid?: string
  /** Unix seconds (fractional) of the session's last successful MFA. */
  mfaAt?: number
  amr?: string[]
  /** api_tokens.mfa_at for token auth. */
  tokenMfaAt?: Date | null
  tokenScopes?: string[]
}

const ADMIN_ONLY_SCOPES = new Set(["admin", "moderation:read", "moderation:write"])

function newerThan(mfaAtSeconds: number, changedAt: Date | null | undefined): boolean {
  return !changedAt || mfaAtSeconds * 1000 > changedAt.getTime()
}

function sessionMfaWithin(
  auth: RequestAuth | undefined,
  changedAt: Date | null | undefined,
  maxAgeSeconds: number,
  nowSeconds: number,
): boolean {
  if (!auth || auth.method === "token" || auth.mfaAt === undefined) return false
  const age = nowSeconds - auth.mfaAt
  return age >= -60 && age <= maxAgeSeconds && newerThan(auth.mfaAt, changedAt)
}

export function adminMfaSatisfied(
  auth: RequestAuth | undefined,
  changedAt: Date | null | undefined,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (auth?.method === "token") {
    const at = auth.tokenMfaAt
    return (
      !!at &&
      (auth.tokenScopes || []).some((s) => ADMIN_ONLY_SCOPES.has(s)) &&
      newerThan(at.getTime() / 1000, changedAt)
    )
  }
  return sessionMfaWithin(auth, changedAt, ADMIN_MFA_MAX_AGE_SECONDS, nowSeconds)
}

export function stepUpSatisfied(
  auth: RequestAuth | undefined,
  changedAt: Date | null | undefined,
  nowSeconds = Date.now() / 1000,
): boolean {
  return sessionMfaWithin(auth, changedAt, STEP_UP_MAX_AGE_SECONDS, nowSeconds)
}

/** Until when (unix seconds) the session's MFA satisfies a window, or null. */
export function windowEndsAt(
  auth: RequestAuth | undefined,
  changedAt: Date | null | undefined,
  maxAgeSeconds: number,
  nowSeconds = Date.now() / 1000,
): number | null {
  if (!sessionMfaWithin(auth, changedAt, maxAgeSeconds, nowSeconds)) return null
  return auth!.mfaAt! + maxAgeSeconds
}
