import { NextFunction, Request, Response } from "express"
import {
  RateLimiterPostgres,
  RateLimiterMemory,
  RateLimiterRes,
} from "rate-limiter-flexible"
import { database } from "../../clients/database/knex-db.js"
import { User } from "../routes/v1/api-models.js"

// User tier types
export type UserTier = "anonymous" | "authenticated" | "admin"

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

export interface RateLimitConfig {
  points: number
}

// Tiered rate limit configuration
export interface TieredRateLimit {
  anonymous: RateLimitConfig
  authenticated: RateLimitConfig
  admin?: RateLimitConfig
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
    points: 60,
    duration: 60,
    blockDuration: 300, // 5 minutes
    inMemoryBlockOnConsumed: 60, // Block in memory after 10 violations (same as points)
    keyPrefix: "scmarket:anon",
  }),
  authenticated: createRateLimiter({
    points: 60,
    duration: 60,
    blockDuration: 600, // 10 minutes
    inMemoryBlockOnConsumed: 60, // Block in memory after 60 violations (same as points)
    keyPrefix: "scmarket:auth",
  }),
  admin: createRateLimiter({
    points: 300,
    duration: 60,
    blockDuration: 0, // No blocking for admins
    inMemoryBlockOnConsumed: 300, // Block in memory after 300 violations (same as points)
    keyPrefix: "scmarket:admin",
  }),
}

// Create hour-based rate limiters for listing updates (600 requests per hour)
export const hourBasedRateLimiters = {
  anonymous: createRateLimiter({
    points: 600,
    duration: 3600, // 1 hour in seconds
    blockDuration: 600, // 10 minutes
    inMemoryBlockOnConsumed: 600,
    keyPrefix: "scmarket:anon:hour",
  }),
  authenticated: createRateLimiter({
    points: 600,
    duration: 3600, // 1 hour in seconds
    blockDuration: 600, // 10 minutes
    inMemoryBlockOnConsumed: 600,
    keyPrefix: "scmarket:auth:hour",
  }),
  admin: createRateLimiter({
    points: 600,
    duration: 3600, // 1 hour in seconds
    blockDuration: 0, // No blocking for admins
    inMemoryBlockOnConsumed: 600,
    keyPrefix: "scmarket:admin:hour",
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

    // Debug logging for language endpoint
    if (endpoint === "/languages") {
      const user = req.user as User
      logger.info("Rate limiter check for /languages", {
        hasUser: !!req.user,
        userId: user?.user_id,
        userTier,
        key,
        isAuthenticated: req.isAuthenticated?.(),
      })
    }

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

// Enhanced rate limiting middleware factory for hour-based rate limits
export function createHourBasedRateLimit(tieredConfig: TieredRateLimit) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userTier = detectUserTier(req)
    const key = generateRateLimitKey(req, userTier)
    const endpoint = req.path

    // Get the appropriate hour-based rate limiter for the user tier
    const rateLimiter = hourBasedRateLimiters[userTier]
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
  anonymous: { points: 15 },
  authenticated: { points: 15 },
  admin: { points: 1 },
})

export const writeRateLimit = createRateLimit({
  anonymous: { points: 3 },
  authenticated: { points: 1 }, // 60 writes per minute
  admin: { points: 1 },
})

export const readRateLimit = createRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 1 },
  admin: { points: 1 },
})

export const bulkRateLimit = createRateLimit({
  anonymous: { points: 15 },
  authenticated: { points: 15 },
  admin: { points: 1 },
})

// Specialized rate limit for notification operations (marking as read, etc.)
export const notificationRateLimit = createRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 1 },
  admin: { points: 1 },
})

// Generic rate limit for common write operations (messages, acknowledgments, etc.)
export const commonWriteRateLimit = createRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 0.5 }, // 120 messages per minute
  admin: { points: 1 },
})

// Hour-based rate limit for listing updates (600 requests per hour)
// Each request consumes 1 point, so 600 points = 600 requests per hour
export const listingUpdateRateLimit = createHourBasedRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 1 },
  admin: { points: 1 },
})
