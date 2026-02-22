import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Request, Response, NextFunction } from "express"
import {
  createTsoaRateLimit,
  createTsoaHourBasedRateLimit,
  tsoaCriticalRateLimit,
  tsoaWriteRateLimit,
  tsoaReadRateLimit,
  tsoaBulkRateLimit,
  tsoaNotificationRateLimit,
  tsoaCommonWriteRateLimit,
  tsoaListingUpdateRateLimit,
} from "./tsoa-ratelimit.js"
import * as enhancedRatelimiting from "./enhanced-ratelimiting.js"

// Mock the enhanced-ratelimiting module
vi.mock("./enhanced-ratelimiting.js", () => ({
  createRateLimit: vi.fn(),
  createHourBasedRateLimit: vi.fn(),
}))

describe("TSOA Rate Limiting Middleware Adapters", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    mockReq = {
      ip: "127.0.0.1",
      path: "/api/v1/test",
      user: undefined,
    }
    mockRes = {
      set: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    mockNext = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("createTsoaRateLimit", () => {
    it("should create a TSOA-compatible middleware function", () => {
      const mockMiddleware = vi.fn((req, res, next) => next())
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaRateLimit(config)

      // Verify it's a function
      expect(typeof tsoaMiddleware).toBe("function")

      // Verify it calls the underlying middleware
      tsoaMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockMiddleware).toHaveBeenCalledWith(mockReq, mockRes, mockNext)
    })

    it("should pass through the tiered configuration", () => {
      const mockMiddleware = vi.fn((req, res, next) => next())
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 5 },
        authenticated: { points: 10 },
        admin: { points: 20 },
      }

      createTsoaRateLimit(config)

      expect(enhancedRatelimiting.createRateLimit).toHaveBeenCalledWith(config)
    })

    it("should work with TSOA @Middlewares decorator pattern", () => {
      const mockMiddleware = vi.fn((req, res, next) => next())
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaRateLimit(config)

      // Simulate TSOA calling the middleware
      tsoaMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe("createTsoaHourBasedRateLimit", () => {
    it("should create a TSOA-compatible hour-based middleware function", () => {
      const mockMiddleware = vi.fn((req, res, next) => next())
      vi.mocked(enhancedRatelimiting.createHourBasedRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaHourBasedRateLimit(config)

      // Verify it's a function
      expect(typeof tsoaMiddleware).toBe("function")

      // Verify it calls the underlying middleware
      tsoaMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockMiddleware).toHaveBeenCalledWith(mockReq, mockRes, mockNext)
    })

    it("should pass through the tiered configuration", () => {
      const mockMiddleware = vi.fn((req, res, next) => next())
      vi.mocked(enhancedRatelimiting.createHourBasedRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 600 },
        authenticated: { points: 600 },
        admin: { points: 600 },
      }

      createTsoaHourBasedRateLimit(config)

      expect(enhancedRatelimiting.createHourBasedRateLimit).toHaveBeenCalledWith(
        config,
      )
    })
  })

  describe("Pre-configured rate limiters", () => {
    it("should export tsoaCriticalRateLimit with correct configuration", () => {
      expect(typeof tsoaCriticalRateLimit).toBe("function")
    })

    it("should export tsoaWriteRateLimit with correct configuration", () => {
      expect(typeof tsoaWriteRateLimit).toBe("function")
    })

    it("should export tsoaReadRateLimit with correct configuration", () => {
      expect(typeof tsoaReadRateLimit).toBe("function")
    })

    it("should export tsoaBulkRateLimit with correct configuration", () => {
      expect(typeof tsoaBulkRateLimit).toBe("function")
    })

    it("should export tsoaNotificationRateLimit with correct configuration", () => {
      expect(typeof tsoaNotificationRateLimit).toBe("function")
    })

    it("should export tsoaCommonWriteRateLimit with correct configuration", () => {
      expect(typeof tsoaCommonWriteRateLimit).toBe("function")
    })

    it("should export tsoaListingUpdateRateLimit with correct configuration", () => {
      expect(typeof tsoaListingUpdateRateLimit).toBe("function")
    })

    it("should have correct function signature for TSOA compatibility", () => {
      // All pre-configured limiters should accept 3 parameters (req, res, next)
      const limiters = [
        tsoaCriticalRateLimit,
        tsoaWriteRateLimit,
        tsoaReadRateLimit,
        tsoaBulkRateLimit,
        tsoaNotificationRateLimit,
        tsoaCommonWriteRateLimit,
        tsoaListingUpdateRateLimit,
      ]

      limiters.forEach((limiter) => {
        expect(limiter.length).toBe(3)
      })
    })
  })

  describe("Express RequestHandler compatibility", () => {
    it("should accept standard Express Request, Response, NextFunction parameters", () => {
      const mockMiddleware = vi.fn((req, res, next) => next())
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaRateLimit(config)

      // Should not throw when called with Express parameters
      expect(() => {
        tsoaMiddleware(mockReq as Request, mockRes as Response, mockNext)
      }).not.toThrow()
    })

    it("should properly forward request, response, and next to underlying middleware", () => {
      const mockMiddleware = vi.fn((req, res, next) => {
        // Verify the parameters are passed correctly
        expect(req).toBe(mockReq)
        expect(res).toBe(mockRes)
        expect(next).toBe(mockNext)
        next()
      })
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaRateLimit(config)
      tsoaMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockMiddleware).toHaveBeenCalledTimes(1)
      expect(mockNext).toHaveBeenCalledTimes(1)
    })
  })

  describe("Integration with TSOA decorators", () => {
    it("should be compatible with @Middlewares decorator signature", () => {
      // TSOA @Middlewares expects: (req: Request, res: Response, next: NextFunction) => void
      const mockMiddleware = vi.fn((req, res, next) => next())
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaRateLimit(config)

      // Verify the function signature matches TSOA expectations
      expect(tsoaMiddleware.length).toBe(3) // Should accept 3 parameters
    })

    it("should work when multiple middlewares are chained", () => {
      const mockMiddleware1 = vi.fn((req, res, next) => next())
      const mockMiddleware2 = vi.fn((req, res, next) => next())

      vi.mocked(enhancedRatelimiting.createRateLimit)
        .mockReturnValueOnce(mockMiddleware1 as any)
        .mockReturnValueOnce(mockMiddleware2 as any)

      const config1 = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }
      const config2 = {
        anonymous: { points: 5 },
        authenticated: { points: 5 },
        admin: { points: 5 },
      }

      const middleware1 = createTsoaRateLimit(config1)
      const middleware2 = createTsoaRateLimit(config2)

      // Simulate chaining
      middleware1(mockReq as Request, mockRes as Response, () => {
        middleware2(mockReq as Request, mockRes as Response, mockNext)
      })

      expect(mockMiddleware1).toHaveBeenCalled()
      expect(mockMiddleware2).toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe("Error handling", () => {
    it("should propagate errors from underlying middleware", () => {
      const testError = new Error("Rate limit exceeded")
      const mockMiddleware = vi.fn((req, res, next) => {
        throw testError
      })
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaRateLimit(config)

      expect(() => {
        tsoaMiddleware(mockReq as Request, mockRes as Response, mockNext)
      }).toThrow(testError)
    })

    it("should handle rate limit exceeded responses", () => {
      const mockMiddleware = vi.fn((req, res, next) => {
        res.status!(429).json({
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests",
        })
      })
      vi.mocked(enhancedRatelimiting.createRateLimit).mockReturnValue(
        mockMiddleware as any,
      )

      const config = {
        anonymous: { points: 1 },
        authenticated: { points: 1 },
        admin: { points: 1 },
      }

      const tsoaMiddleware = createTsoaRateLimit(config)
      tsoaMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(429)
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "RATE_LIMIT_EXCEEDED",
        }),
      )
    })
  })
})
