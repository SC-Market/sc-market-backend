/**
 * Rate limit for POST /api/v2/integrations/scmdb/ingest/{token}.
 *
 * The ingest endpoint is anonymous (the token in the path is the credential)
 * and every call costs a DB lookup, plus a write and a snapshot rewrite for a
 * valid token. Two in-memory buckets, per instance (approximate across
 * instances, and no load on the DB pool):
 * - per token: SCMDB sends one event per blueprint change plus occasional
 *   snapshots, far below the limit;
 * - per IP: bounds token guessing and floods with random tokens.
 * Over the limit the request is answered 429 before the handler runs.
 */

import crypto from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible"
import { createErrorResponse } from "../../../v1/util/response.js"
import { ErrorCode } from "../../../v1/util/error-codes.js"

export const SCMDB_INGEST_LIMITS = {
  perToken: { points: 60, duration: 60 },
  perIp: { points: 120, duration: 60 },
} as const

export function createScmdbIngestRateLimit() {
  const perToken = new RateLimiterMemory({
    keyPrefix: "scmdb_tok",
    ...SCMDB_INGEST_LIMITS.perToken,
  })
  const perIp = new RateLimiterMemory({
    keyPrefix: "scmdb_ip",
    ...SCMDB_INGEST_LIMITS.perIp,
  })

  return async function scmdbIngestRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const token = String(req.params.token ?? "")
    // Keyed by a hash so the limiter never holds the secret itself.
    const tokenKey = crypto.createHash("sha256").update(token).digest("hex")
    const ipKey = req.ip || "unknown"
    try {
      await perIp.consume(ipKey)
      await perToken.consume(tokenKey)
      next()
    } catch (e) {
      if (!(e instanceof RateLimiterRes)) return next(e)
      const retryAfter = Math.max(1, Math.ceil(e.msBeforeNext / 1000))
      res.setHeader("Retry-After", String(retryAfter))
      res.status(429).json(
        createErrorResponse(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          "Too many SCMDB sync events",
          {
            retry_after: retryAfter,
          },
        ),
      )
    }
  }
}

export const scmdbIngestRateLimit = createScmdbIngestRateLimit()
