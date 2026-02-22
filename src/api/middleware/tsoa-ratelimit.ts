import { Request, Response, NextFunction } from "express"
import {
  createRateLimit,
  createHourBasedRateLimit,
  TieredRateLimit,
} from "./enhanced-ratelimiting.js"

/**
 * TSOA Middleware Adapters for Rate Limiting
 * 
 * TSOA expects middleware to be Express RequestHandler functions that can be
 * used with the @Middlewares decorator. This file provides adapters that wrap
 * the existing rate limiting middleware to work seamlessly with TSOA controllers.
 * 
 * Usage in TSOA controllers:
 * ```typescript
 * import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit"
 * 
 * @Route("api/v1/example")
 * export class ExampleController extends BaseController {
 *   @Get("items")
 *   @Middlewares(tsoaReadRateLimit)
 *   public async getItems(): Promise<ItemsResponse> {
 *     // Implementation
 *   }
 * 
 *   @Post("items")
 *   @Middlewares(tsoaWriteRateLimit)
 *   public async createItem(@Body() payload: CreateItemPayload): Promise<ItemResponse> {
 *     // Implementation
 *   }
 * }
 * ```
 */

/**
 * Create a TSOA-compatible rate limiting middleware
 * 
 * This adapter wraps the existing createRateLimit function to ensure
 * compatibility with TSOA's @Middlewares decorator.
 * 
 * @param config - Tiered rate limit configuration
 * @returns Express RequestHandler compatible with TSOA
 */
export function createTsoaRateLimit(config: TieredRateLimit) {
  const rateLimitMiddleware = createRateLimit(config)
  
  return (req: Request, res: Response, next: NextFunction) => {
    rateLimitMiddleware(req, res, next)
  }
}

/**
 * Create a TSOA-compatible hour-based rate limiting middleware
 * 
 * This adapter wraps the existing createHourBasedRateLimit function for
 * endpoints that need longer time windows (e.g., listing updates).
 * 
 * @param config - Tiered rate limit configuration
 * @returns Express RequestHandler compatible with TSOA
 */
export function createTsoaHourBasedRateLimit(config: TieredRateLimit) {
  const rateLimitMiddleware = createHourBasedRateLimit(config)
  
  return (req: Request, res: Response, next: NextFunction) => {
    rateLimitMiddleware(req, res, next)
  }
}

/**
 * Pre-configured TSOA rate limiters for common use cases
 * 
 * These are ready-to-use rate limiters that can be applied directly
 * to TSOA controller methods using the @Middlewares decorator.
 */

/**
 * Critical operations rate limiter (15 points per request)
 * Use for: Admin operations, bulk operations, expensive queries
 * 
 * Limits:
 * - Anonymous: 4 requests/minute
 * - Authenticated: 4 requests/minute
 * - Admin: 60 requests/minute
 */
export const tsoaCriticalRateLimit = createTsoaRateLimit({
  anonymous: { points: 15 },
  authenticated: { points: 15 },
  admin: { points: 1 },
})

/**
 * Write operations rate limiter (1-3 points per request)
 * Use for: POST, PUT, DELETE endpoints that modify data
 * 
 * Limits:
 * - Anonymous: 20 requests/minute
 * - Authenticated: 60 requests/minute
 * - Admin: 60 requests/minute
 */
export const tsoaWriteRateLimit = createTsoaRateLimit({
  anonymous: { points: 3 },
  authenticated: { points: 1 },
  admin: { points: 1 },
})

/**
 * Read operations rate limiter (1 point per request)
 * Use for: GET endpoints that read data
 * 
 * Limits:
 * - Anonymous: 60 requests/minute
 * - Authenticated: 60 requests/minute
 * - Admin: 60 requests/minute
 */
export const tsoaReadRateLimit = createTsoaRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 1 },
  admin: { points: 1 },
})

/**
 * Bulk operations rate limiter (15 points per request)
 * Use for: Endpoints that process multiple items at once
 * 
 * Limits:
 * - Anonymous: 4 requests/minute
 * - Authenticated: 4 requests/minute
 * - Admin: 60 requests/minute
 */
export const tsoaBulkRateLimit = createTsoaRateLimit({
  anonymous: { points: 15 },
  authenticated: { points: 15 },
  admin: { points: 1 },
})

/**
 * Notification operations rate limiter (1 point per request)
 * Use for: Marking notifications as read, dismissing notifications
 * 
 * Limits:
 * - Anonymous: 60 requests/minute
 * - Authenticated: 60 requests/minute
 * - Admin: 60 requests/minute
 */
export const tsoaNotificationRateLimit = createTsoaRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 1 },
  admin: { points: 1 },
})

/**
 * Common write operations rate limiter (0.5-1 points per request)
 * Use for: Messages, acknowledgments, and other frequent write operations
 * 
 * Limits:
 * - Anonymous: 60 requests/minute
 * - Authenticated: 120 requests/minute
 * - Admin: 60 requests/minute
 */
export const tsoaCommonWriteRateLimit = createTsoaRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 0.5 },
  admin: { points: 1 },
})

/**
 * Listing update rate limiter (1 point per request, hour-based)
 * Use for: Market listing updates that need longer time windows
 * 
 * Limits:
 * - Anonymous: 600 requests/hour
 * - Authenticated: 600 requests/hour
 * - Admin: 600 requests/hour
 */
export const tsoaListingUpdateRateLimit = createTsoaHourBasedRateLimit({
  anonymous: { points: 1 },
  authenticated: { points: 1 },
  admin: { points: 1 },
})
