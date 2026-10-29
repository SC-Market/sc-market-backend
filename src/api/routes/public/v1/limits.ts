/**
 * Rate limits and isolation of the public API (design doc §5).
 *
 * | Bucket                    | Limit                    | Key      |
 * | per token, reads          | 120/min, burst 30 / 10 s | token id |
 * | per token, writes         | 30/min                   | token id |
 * | per user (all tokens)     | 300/min                  | user id  |
 * | invalid token attempts    | 20 per 15 min, then 429  | IP       |
 *
 * In-memory per instance (RateLimiterMemory): approximate across instances,
 * no load on the database.
 *
 * Isolation: every public request runs its queries on its own small pool
 * (max 3 connections, statement_timeout 3s, lock_timeout 2s, acquire timeout
 * 1.5s) via withPoolOverride, so a flood can only exhaust that pool; it then
 * answers 503 SERVICE_UNAVAILABLE with Retry-After: 5. At most
 * MAX_IN_FLIGHT requests are handled at once per instance; more get the same
 * 503 instead of queueing.
 */

import type { Response } from "express"
import type { Knex } from "knex"
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible"
import { createDedicatedKnex } from "../../../../clients/database/knex-db.js"
import { PublicApiError } from "./errors.js"

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

export const LIMITS = {
  tokenReads: { points: 120, duration: 60 },
  tokenReadBurst: { points: 30, duration: 10 },
  tokenWrites: { points: 30, duration: 60 },
  user: { points: 300, duration: 60 },
  invalidTokenPerIp: { points: 20, duration: 15 * 60 },
} as const

function limiter(cfg: { points: number; duration: number }, keyPrefix: string) {
  return new RateLimiterMemory({ ...cfg, keyPrefix })
}

let tokenReads = limiter(LIMITS.tokenReads, "pub-read")
let tokenReadBurst = limiter(LIMITS.tokenReadBurst, "pub-burst")
let tokenWrites = limiter(LIMITS.tokenWrites, "pub-write")
let perUser = limiter(LIMITS.user, "pub-user")
let invalidPerIp = limiter(LIMITS.invalidTokenPerIp, "pub-bad-token")

/** For tests: fresh, empty buckets. */
export function resetPublicRateLimits(): void {
  tokenReads = limiter(LIMITS.tokenReads, "pub-read")
  tokenReadBurst = limiter(LIMITS.tokenReadBurst, "pub-burst")
  tokenWrites = limiter(LIMITS.tokenWrites, "pub-write")
  perUser = limiter(LIMITS.user, "pub-user")
  invalidPerIp = limiter(LIMITS.invalidTokenPerIp, "pub-bad-token")
}

function setHeaders(res: Response, limit: number, r: RateLimiterRes) {
  res.setHeader("X-RateLimit-Limit", String(limit))
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, r.remainingPoints)))
  res.setHeader(
    "X-RateLimit-Reset",
    String(Math.ceil((Date.now() + r.msBeforeNext) / 1000)),
  )
}

function tooMany(r: RateLimiterRes, message: string): PublicApiError {
  const retry = Math.max(1, Math.ceil(r.msBeforeNext / 1000))
  return new PublicApiError(
    429,
    "RATE_LIMIT_EXCEEDED",
    message,
    { retry_after_seconds: retry },
    {
      "Retry-After": String(retry),
    },
  )
}

async function consume(
  l: RateLimiterMemory,
  key: string,
): Promise<RateLimiterRes | { rejected: RateLimiterRes }> {
  try {
    return await l.consume(key)
  } catch (r) {
    if (r instanceof RateLimiterRes) return { rejected: r }
    throw r
  }
}

/**
 * Charge one request to the token's and the user's buckets; sets the
 * X-RateLimit-* headers of the token bucket. Throws a 429 PublicApiError
 * when a bucket is empty.
 */
export async function chargeRequest(
  res: Response,
  tokenId: string,
  userId: string,
  method: string,
): Promise<void> {
  const write = WRITE_METHODS.has(method.toUpperCase())
  const tokenBucket = write ? tokenWrites : tokenReads
  const tokenLimit = write
    ? LIMITS.tokenWrites.points
    : LIMITS.tokenReads.points

  const user = await consume(perUser, userId)
  if ("rejected" in user)
    throw tooMany(user.rejected, "Too many requests for this account")

  if (!write) {
    const burst = await consume(tokenReadBurst, tokenId)
    if ("rejected" in burst) {
      setHeaders(res, LIMITS.tokenReadBurst.points, burst.rejected)
      throw tooMany(
        burst.rejected,
        "Too many requests for this token, slow down",
      )
    }
  }
  const token = await consume(tokenBucket, tokenId)
  if ("rejected" in token) {
    setHeaders(res, tokenLimit, token.rejected)
    throw tooMany(token.rejected, "Too many requests for this token")
  }
  setHeaders(res, tokenLimit, token)
}

/** 429 while this IP has used up its invalid-token attempts. */
export async function assertIpMayTryTokens(ip: string): Promise<void> {
  const r = await invalidPerIp.get(ip)
  if (r && r.consumedPoints >= LIMITS.invalidTokenPerIp.points) {
    throw tooMany(r, "Too many invalid token attempts")
  }
}

export async function recordInvalidToken(ip: string): Promise<void> {
  await consume(invalidPerIp, ip)
}

// ─── Pool and in-flight cap ─────────────────────────────────────────────────

export const PUBLIC_POOL = {
  maxConnections: 3,
  acquireConnectionTimeoutMs: 1500,
  timeouts: {
    statement_timeout: "3s",
    lock_timeout: "2s",
    idle_in_transaction_session_timeout: "10s",
  },
} as const

let pool: Knex | null = null

/** The public API's own pool, created on first use. */
export function publicPool(): Knex {
  pool ??= createDedicatedKnex(
    { ...PUBLIC_POOL.timeouts },
    PUBLIC_POOL.maxConnections,
    PUBLIC_POOL.acquireConnectionTimeoutMs,
  )
  return pool
}

export const MAX_IN_FLIGHT = 20
let inFlight = 0

export function serviceBusy(): PublicApiError {
  return new PublicApiError(
    503,
    "SERVICE_UNAVAILABLE",
    "The public API is busy, retry shortly",
    undefined,
    {
      "Retry-After": "5",
    },
  )
}

/** Take an in-flight slot, released when the response ends. Throws 503 when full. */
export function acquireSlot(res: Response): void {
  if (inFlight >= MAX_IN_FLIGHT) throw serviceBusy()
  inFlight++
  let released = false
  const release = () => {
    if (released) return
    released = true
    inFlight--
  }
  res.once("finish", release)
  res.once("close", release)
}
