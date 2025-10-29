import { NextFunction, Request, Response } from "express"
import {
  RateLimiterPostgres,
  RateLimiterMemory,
  RateLimiterRes,
} from "rate-limiter-flexible"
import { database } from "../../clients/database/knex-db.js"
import { User } from "../routes/v1/api-models.js"

// User tier types
export type UserTier = "anonymous" | "authenticated" | "premium" | "admin"

// Rate limiter configuration interface
export interface RateLimiterConfig {
  points: number
  duration: number
  blockDuration?: number
  execEvenly?: boolean
  inMemoryBlockOnConsumed?: number
  keyPrefix?: string
  insuranceLimiter?: RateLimiterMemory
}

// Tiered rate limit configuration
export interface TieredRateLimit {
  anonymous: RateLimiterConfig
  authenticated: RateLimiterConfig
  premium?: RateLimiterConfig
  admin?: RateLimiterConfig
}

// Rate limit response interface
export interface RateLimitResponse {
  error: "RATE_LIMIT_EXCEEDED"
  message: string
  retryAfter: number
  limit: number
  remaining: number
  resetTime: number
  userTier: UserTier
  endpoint: string
}

// Create a rate limiter using library's built-in features
export function createRateLimiter(
  config: RateLimiterConfig,
): RateLimiterPostgres {
  return new RateLimiterPostgres({
    storeClient: database.knex,
    storeType: "knex",
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration || 0,
    execEvenly: config.execEvenly || false,
    inMemoryBlockOnConsumed: config.inMemoryBlockOnConsumed || 0,
    keyPrefix: config.keyPrefix || "scmarket",
    insuranceLimiter: config.insuranceLimiter || createMemoryFallback(),
  })
}

// Create memory fallback using library's insurance strategy
export function createMemoryFallback(): RateLimiterMemory {
  return new RateLimiterMemory({
    points: 10,
    duration: 60,
    keyPrefix: "scmarket:insurance",
  })
}

// Create rate limiters for each tier
export const rateLimiters = {
  anonymous: createRateLimiter({
    points: 10,
    duration: 60,
    blockDuration: 300, // 5 minutes
    inMemoryBlockOnConsumed: 10, // Block in memory after 10 violations (same as points)
    keyPrefix: "scmarket:anon",
  }),
  authenticated: createRateLimiter({
    points: 60,
    duration: 60,
    blockDuration: 600, // 10 minutes
    inMemoryBlockOnConsumed: 60, // Block in memory after 60 violations (same as points)
    keyPrefix: "scmarket:auth",
  }),
  premium: createRateLimiter({
    points: 120,
    duration: 60,
    blockDuration: 300,
    inMemoryBlockOnConsumed: 120, // Block in memory after 120 violations (same as points)
    keyPrefix: "scmarket:premium",
  }),
  admin: createRateLimiter({
    points: 300,
    duration: 60,
    blockDuration: 0, // No blocking for admins
    inMemoryBlockOnConsumed: 300, // Block in memory after 300 violations (same as points)
    keyPrefix: "scmarket:admin",
  }),
}

// Detect user tier from request
export function detectUserTier(req: Request): UserTier {
  const user = req.user as User

  if (!user) {
    return "anonymous"
  }

  // Check if user is admin based on role
  if (user.role === "admin") {
    return "admin"
  }

  // For now, all authenticated users are treated as regular users
  // Premium tier can be added later when the feature is implemented
  return "authenticated"
}

// Generate rate limit key
export function generateRateLimitKey(req: Request, userTier: UserTier): string {
  const user = req.user as User
  const ip = req.ip

  if (userTier === "anonymous") {
    return `ip:${ip}`
  }

  return `user:${user?.user_id}:ip:${ip}`
}

// Create rate limit response
export function createRateLimitResponse(
  rateLimiterRes: RateLimiterRes,
  userTier: UserTier,
  endpoint: string,
  limit: number,
): RateLimitResponse {
  const resetTime = Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000)

  return {
    error: "RATE_LIMIT_EXCEEDED",
    message:
      "Rate limit exceeded. Too many requests in the specified time window.",
    retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
    limit,
    remaining: rateLimiterRes.remainingPoints,
    resetTime,
    userTier,
    endpoint,
  }
}

// Set rate limit headers
export function setRateLimitHeaders(
  res: Response,
  rateLimiterRes: RateLimiterRes,
  limit: number,
): void {
  const resetTime = Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000)

  res.set({
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": rateLimiterRes.remainingPoints.toString(),
    "X-RateLimit-Reset": resetTime.toString(),
  })
}

// Enhanced rate limiting middleware factory
export function createRateLimit(tieredConfig: TieredRateLimit) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userTier = detectUserTier(req)
    const key = generateRateLimitKey(req, userTier)
    const endpoint = req.path

    // Get the appropriate rate limiter for the user tier
    const rateLimiter = rateLimiters[userTier]
    const config = tieredConfig[userTier]

    if (!rateLimiter || !config) {
      // If no rate limiter configured for this tier, allow the request
      return next()
    }

    rateLimiter
      .consume(key, config.points)
      .then((rateLimiterRes: RateLimiterRes) => {
        // Set rate limit headers
        setRateLimitHeaders(res, rateLimiterRes, config.points)
        next()
      })
      .catch((rateLimiterRes: RateLimiterRes) => {
        // Rate limit exceeded
        const rateLimitResponse = createRateLimitResponse(
          rateLimiterRes,
          userTier,
          endpoint,
          config.points,
        )

        // Set rate limit headers including retry-after
        setRateLimitHeaders(res, rateLimiterRes, config.points)
        res.set(
          "X-RateLimit-Retry-After",
          rateLimitResponse.retryAfter.toString(),
        )

        // Send 429 response
        res.status(429).json(rateLimitResponse)
      })
  }
}

// Predefined rate limit configurations for different endpoint types
export const criticalRateLimit = createRateLimit({
  anonymous: { points: 1, duration: 60, blockDuration: 900 },
  authenticated: { points: 2, duration: 60, blockDuration: 600 },
  admin: { points: 5, duration: 60, blockDuration: 0 },
})

export const writeRateLimit = createRateLimit({
  anonymous: { points: 5, duration: 60, blockDuration: 300 },
  authenticated: { points: 10, duration: 60, blockDuration: 300 },
  admin: { points: 30, duration: 60, blockDuration: 0 },
})

export const readRateLimit = createRateLimit({
  anonymous: { points: 60, duration: 60, blockDuration: 180 },
  authenticated: { points: 60, duration: 60, blockDuration: 180 },
  admin: { points: 100, duration: 60, blockDuration: 0 },
})

export const bulkRateLimit = createRateLimit({
  anonymous: { points: 2, duration: 60, blockDuration: 600 },
  authenticated: { points: 5, duration: 60, blockDuration: 300 },
  admin: { points: 20, duration: 60, blockDuration: 0 },
})

// Specialized rate limit for notification operations (marking as read, etc.)
export const notificationRateLimit = createRateLimit({
  anonymous: { points: 10, duration: 60, blockDuration: 300 },
  authenticated: { points: 30, duration: 60, blockDuration: 180 },
  admin: { points: 100, duration: 60, blockDuration: 0 },
})

// Generic rate limit for common write operations (messages, acknowledgments, etc.)
export const commonWriteRateLimit = createRateLimit({
  anonymous: { points: 15, duration: 60, blockDuration: 300 },
  authenticated: { points: 40, duration: 60, blockDuration: 180 },
  admin: { points: 100, duration: 60, blockDuration: 0 },
})
