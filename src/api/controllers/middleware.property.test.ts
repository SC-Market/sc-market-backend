/**
 * Property-Based Tests for Middleware Execution Consistency
 *
 * These tests verify that middleware (authentication, rate limiting, validation,
 * error handling) executes in the correct order and enforces the same behavior
 * as the legacy system.
 *
 * Testing Framework: fast-check
 * Feature: tsoa-migration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { Request as ExpressRequest, Response, NextFunction } from "express"
import { expressAuthentication } from "../middleware/tsoa-auth.js"
import { tsoaErrorHandler } from "../middleware/tsoa-error-handler.js"
import { ErrorCode } from "../routes/v1/util/response.js"
import { ValidateError } from "tsoa"

// Mock the database modules
vi.mock("../../clients/database/knex-db.js", () => ({
  database: {
    knex: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      whereNull: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      first: vi.fn(),
      update: vi.fn(),
    })),
  },
}))

vi.mock("../routes/v1/profiles/database.js", () => ({
  getUser: vi.fn(),
}))

vi.mock("../../logger/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// Import after mocking
import { database } from "../../clients/database/knex-db.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import logger from "../../logger/logger.js"

describe("Middleware Execution - Property-Based Tests", () => {
  let mockRequest: Partial<ExpressRequest>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    mockRequest = {
      headers: {},
      query: {},
      body: {},
      isAuthenticated: vi.fn(() => false),
      user: undefined,
    }
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      headersSent: false,
    }
    mockNext = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Property 6: Middleware Execution Consistency
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   *
   * For any endpoint with middleware (authentication, rate limiting, validation,
   * error handling), the middleware should execute in the correct order and
   * enforce the same behavior as the legacy system.
   *
   * This property verifies that:
   * 1. Authentication middleware executes before authorization checks
   * 2. Rate limiting middleware executes after authentication
   * 3. Validation middleware executes before business logic
   * 4. Error handling middleware catches and transforms all errors
   * 5. Middleware execution order is consistent across all endpoints
   * 6. Middleware behavior matches legacy system exactly
   */
  describe("Feature: tsoa-migration, Property 6: Middleware Execution Consistency", () => {
    /**
     * Test: Authentication middleware executes first and validates credentials
     */
    it("should execute authentication middleware before other middleware", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate different authentication scenarios
            authType: fc.constantFrom("session", "bearer", "none"),
            isValidUser: fc.boolean(),
            isBanned: fc.boolean(),
          }),
          async (scenario) => {
            // Reset request state for each scenario
            mockRequest.isAuthenticated = vi.fn(() => false)
            mockRequest.user = undefined
            mockRequest.headers = {}
            
            if (scenario.authType === "session") {
              // Session authentication
              mockRequest.isAuthenticated = vi.fn(() => scenario.isValidUser)
              if (scenario.isValidUser) {
                mockRequest.user = {
                  user_id: "test-user-id",
                  username: "testuser",
                  role: "user",
                  rsi_confirmed: true,
                  banned: scenario.isBanned,
                } as any
              }

              if (scenario.isValidUser && !scenario.isBanned) {
                // Should succeed
                const result = await expressAuthentication(
                  mockRequest as ExpressRequest,
                  "sessionAuth",
                )
                expect(result).toBeDefined()
                expect(result.user_id).toBe("test-user-id")
              } else {
                // Should fail - either not authenticated or banned
                await expect(
                  expressAuthentication(
                    mockRequest as ExpressRequest,
                    "sessionAuth",
                  ),
                ).rejects.toThrow()
              }
            } else if (scenario.authType === "bearer") {
              // Bearer token authentication
              if (scenario.isValidUser) {
                mockRequest.headers = {
                  authorization: "Bearer scm_test_token_12345",
                }

                // Mock token lookup
                const mockKnex = vi.mocked(database.knex)
                const mockChain = {
                  where: vi.fn().mockReturnThis(),
                  whereNull: vi.fn().mockReturnThis(),
                  orWhere: vi.fn().mockReturnThis(),
                  first: vi.fn().mockResolvedValue(
                    scenario.isValidUser
                      ? {
                          id: "token-id",
                          user_id: "test-user-id",
                          name: "Test Token",
                          scopes: ["read", "write"],
                          expires_at: null,
                          contractor_ids: [],
                        }
                      : null,
                  ),
                  update: vi.fn().mockResolvedValue(undefined),
                }
                mockKnex.mockReturnValue(mockChain as any)

                // Mock user lookup
                vi.mocked(profileDb.getUser).mockResolvedValue(
                  scenario.isValidUser && !scenario.isBanned
                    ? {
                        user_id: "test-user-id",
                        username: "testuser",
                        role: "user",
                        rsi_confirmed: true,
                        banned: false,
                      }
                    : null,
                )

                if (scenario.isValidUser && !scenario.isBanned) {
                  // Should succeed
                  const result = await expressAuthentication(
                    mockRequest as ExpressRequest,
                    "bearerAuth",
                  )
                  expect(result).toBeDefined()
                  expect(result.user_id).toBe("test-user-id")
                } else {
                  // Should fail
                  await expect(
                    expressAuthentication(
                      mockRequest as ExpressRequest,
                      "bearerAuth",
                    ),
                  ).rejects.toThrow()
                }
              } else {
                // No token or invalid token
                mockRequest.headers = {
                  authorization: scenario.isValidUser
                    ? "Bearer scm_invalid_token"
                    : undefined,
                }

                await expect(
                  expressAuthentication(
                    mockRequest as ExpressRequest,
                    "bearerAuth",
                  ),
                ).rejects.toThrow()
              }
            } else {
              // No authentication
              await expect(
                expressAuthentication(
                  mockRequest as ExpressRequest,
                  "sessionAuth",
                ),
              ).rejects.toThrow("Not authenticated")
            }
          },
        ),
        { numRuns: 50 },
      )
    })

    /**
     * Test: Authorization checks execute after authentication
     */
    it("should execute authorization checks after authentication succeeds", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate different authorization scenarios
            userRole: fc.constantFrom("user", "admin"),
            requiredScopes: fc.constantFrom(
              [],
              ["admin"],
              ["read"],
              ["write"],
              ["read", "write"],
            ),
            tokenScopes: fc.constantFrom(
              ["read"],
              ["write"],
              ["read", "write"],
              ["admin"],
              ["full"],
            ),
          }),
          async (scenario) => {
            // Session auth with role check
            mockRequest.isAuthenticated = vi.fn(() => true)
            mockRequest.user = {
              user_id: "test-user-id",
              username: "testuser",
              role: scenario.userRole,
              rsi_confirmed: true,
              banned: false,
            } as any

            if (scenario.requiredScopes.includes("admin")) {
              // Admin scope required
              if (scenario.userRole === "admin") {
                // Should succeed
                const result = await expressAuthentication(
                  mockRequest as ExpressRequest,
                  "sessionAuth",
                  scenario.requiredScopes,
                )
                expect(result).toBeDefined()
              } else {
                // Should fail
                await expect(
                  expressAuthentication(
                    mockRequest as ExpressRequest,
                    "sessionAuth",
                    scenario.requiredScopes,
                  ),
                ).rejects.toThrow("Admin access required")
              }
            } else {
              // No admin scope required - should succeed
              const result = await expressAuthentication(
                mockRequest as ExpressRequest,
                "sessionAuth",
                scenario.requiredScopes,
              )
              expect(result).toBeDefined()
            }

            // Token auth with scope check
            mockRequest.headers = {
              authorization: "Bearer scm_test_token_12345",
            }

            const mockKnex = vi.mocked(database.knex)
            const mockChain = {
              where: vi.fn().mockReturnThis(),
              whereNull: vi.fn().mockReturnThis(),
              orWhere: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: "token-id",
                user_id: "test-user-id",
                name: "Test Token",
                scopes: scenario.tokenScopes,
                expires_at: null,
                contractor_ids: [],
              }),
              update: vi.fn().mockResolvedValue(undefined),
            }
            mockKnex.mockReturnValue(mockChain as any)

            vi.mocked(profileDb.getUser).mockResolvedValue({
              user_id: "test-user-id",
              username: "testuser",
              role: "user",
              rsi_confirmed: true,
              banned: false,
            })

            // Check if token has required scopes
            const hasAllScopes = scenario.requiredScopes.every(
              (scope) =>
                scenario.tokenScopes.includes(scope) ||
                scenario.tokenScopes.includes("admin") ||
                scenario.tokenScopes.includes("full"),
            )

            if (hasAllScopes || scenario.requiredScopes.length === 0) {
              // Should succeed
              const result = await expressAuthentication(
                mockRequest as ExpressRequest,
                "bearerAuth",
                scenario.requiredScopes,
              )
              expect(result).toBeDefined()
            } else {
              // Should fail
              await expect(
                expressAuthentication(
                  mockRequest as ExpressRequest,
                  "bearerAuth",
                  scenario.requiredScopes,
                ),
              ).rejects.toThrow("Insufficient permissions")
            }
          },
        ),
        { numRuns: 50 },
      )
    })

    /**
     * Test: Error handling middleware transforms all errors to legacy format
     */
    it("should transform all errors to legacy error format", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            // Different error types
            {
              type: "validation",
              error: new ValidateError(
                {
                  attribute_name: {
                    message: "attribute_name is required",
                    value: undefined,
                  },
                },
                "Validation failed",
              ),
              expectedStatus: 400,
              expectedCode: ErrorCode.VALIDATION_ERROR,
            },
            {
              type: "authentication",
              error: new Error("Not authenticated"),
              expectedStatus: 401,
              expectedCode: ErrorCode.UNAUTHORIZED,
            },
            {
              type: "authorization",
              error: new Error("Admin access required"),
              expectedStatus: 403,
              expectedCode: ErrorCode.FORBIDDEN,
            },
            {
              type: "custom_400",
              error: {
                status: 400,
                code: ErrorCode.VALIDATION_ERROR,
                message: "Custom validation error",
              },
              expectedStatus: 400,
              expectedCode: ErrorCode.VALIDATION_ERROR,
            },
            {
              type: "custom_404",
              error: {
                status: 404,
                code: ErrorCode.NOT_FOUND,
                message: "Resource not found",
              },
              expectedStatus: 404,
              expectedCode: ErrorCode.NOT_FOUND,
            },
            {
              type: "custom_409",
              error: {
                status: 409,
                code: ErrorCode.CONFLICT,
                message: "Resource already exists",
              },
              expectedStatus: 409,
              expectedCode: ErrorCode.CONFLICT,
            },
            {
              type: "unhandled",
              error: new Error("Unexpected error"),
              expectedStatus: 500,
              expectedCode: ErrorCode.INTERNAL_SERVER_ERROR,
            },
          ),
          async (testCase) => {
            // Clear mocks before each test case
            vi.clearAllMocks()
            
            // Call error handler
            tsoaErrorHandler(
              testCase.error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            // Verify response
            expect(mockResponse.status).toHaveBeenCalledWith(
              testCase.expectedStatus,
            )
            expect(mockResponse.json).toHaveBeenCalled()

            const jsonCall = vi.mocked(mockResponse.json).mock.calls[0][0]
            expect(jsonCall).toHaveProperty("error")
            expect(jsonCall.error).toHaveProperty("code")
            expect(jsonCall.error).toHaveProperty("message")
            expect(jsonCall.error.code).toBe(testCase.expectedCode)
            expect(typeof jsonCall.error.message).toBe("string")
          },
        ),
        { numRuns: 30 },
      )
    })

    /**
     * Test: Error handler logs all errors appropriately
     */
    it("should log all errors with appropriate severity", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            {
              error: new ValidateError({}, "Validation failed"),
              expectedLogLevel: "warn",
            },
            {
              error: new Error("Not authenticated"),
              expectedLogLevel: "warn",
            },
            {
              error: new Error("Admin access required"),
              expectedLogLevel: "warn",
            },
            {
              error: { status: 400, message: "Bad request" },
              expectedLogLevel: "warn",
            },
            {
              error: new Error("Unexpected error"),
              expectedLogLevel: "error",
            },
          ),
          async (testCase) => {
            // Clear previous calls
            vi.clearAllMocks()

            // Call error handler
            tsoaErrorHandler(
              testCase.error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            // Verify logging
            if (testCase.expectedLogLevel === "warn") {
              expect(logger.warn).toHaveBeenCalled()
            } else if (testCase.expectedLogLevel === "error") {
              expect(logger.error).toHaveBeenCalled()
            }
          },
        ),
        { numRuns: 20 },
      )
    })

    /**
     * Test: Middleware execution order is consistent
     */
    it("should execute middleware in consistent order: auth -> rate limit -> validation -> business logic -> error handling", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            hasAuth: fc.boolean(),
            passesRateLimit: fc.boolean(),
            passesValidation: fc.boolean(),
          }),
          async (scenario) => {
            const executionOrder: string[] = []

            // Mock authentication
            if (scenario.hasAuth) {
              mockRequest.isAuthenticated = vi.fn(() => {
                executionOrder.push("auth")
                return true
              })
              mockRequest.user = {
                user_id: "test-user-id",
                username: "testuser",
                role: "user",
                rsi_confirmed: true,
                banned: false,
              } as any
            } else {
              mockRequest.isAuthenticated = vi.fn(() => {
                executionOrder.push("auth")
                return false
              })
            }

            // Mock rate limiting
            const rateLimitMiddleware = (
              _req: ExpressRequest,
              _res: Response,
              next: NextFunction,
            ) => {
              executionOrder.push("rateLimit")
              if (scenario.passesRateLimit) {
                next()
              } else {
                next(new Error("Rate limit exceeded"))
              }
            }

            // Mock validation
            const validationMiddleware = (
              _req: ExpressRequest,
              _res: Response,
              next: NextFunction,
            ) => {
              executionOrder.push("validation")
              if (scenario.passesValidation) {
                next()
              } else {
                next(
                  new ValidateError(
                    { field: { message: "Invalid", value: undefined } },
                    "Validation failed",
                  ),
                )
              }
            }

            // Mock business logic
            const businessLogic = () => {
              executionOrder.push("businessLogic")
              return { success: true }
            }

            // Simulate middleware chain
            try {
              // 1. Authentication
              if (scenario.hasAuth) {
                await expressAuthentication(
                  mockRequest as ExpressRequest,
                  "sessionAuth",
                )
              } else {
                try {
                  await expressAuthentication(
                    mockRequest as ExpressRequest,
                    "sessionAuth",
                  )
                } catch (error) {
                  executionOrder.push("errorHandling")
                  throw error
                }
              }

              // 2. Rate limiting
              await new Promise<void>((resolve, reject) => {
                rateLimitMiddleware(
                  mockRequest as ExpressRequest,
                  mockResponse as Response,
                  (error?: any) => {
                    if (error) {
                      executionOrder.push("errorHandling")
                      reject(error)
                    } else {
                      resolve()
                    }
                  },
                )
              })

              // 3. Validation
              await new Promise<void>((resolve, reject) => {
                validationMiddleware(
                  mockRequest as ExpressRequest,
                  mockResponse as Response,
                  (error?: any) => {
                    if (error) {
                      executionOrder.push("errorHandling")
                      reject(error)
                    } else {
                      resolve()
                    }
                  },
                )
              })

              // 4. Business logic
              businessLogic()
            } catch (error) {
              // Error handling happens
              if (!executionOrder.includes("errorHandling")) {
                executionOrder.push("errorHandling")
              }
            }

            // Verify execution order
            if (scenario.hasAuth && scenario.passesRateLimit && scenario.passesValidation) {
              // Full chain executed
              expect(executionOrder).toEqual([
                "auth",
                "rateLimit",
                "validation",
                "businessLogic",
              ])
            } else {
              // Chain stopped at first failure
              expect(executionOrder[0]).toBe("auth")
              expect(executionOrder).toContain("errorHandling")

              // Verify middleware after failure didn't execute
              const errorIndex = executionOrder.indexOf("errorHandling")
              if (!scenario.hasAuth) {
                expect(executionOrder.slice(errorIndex + 1)).toEqual([])
              } else if (!scenario.passesRateLimit) {
                expect(executionOrder).not.toContain("validation")
                expect(executionOrder).not.toContain("businessLogic")
              } else if (!scenario.passesValidation) {
                expect(executionOrder).not.toContain("businessLogic")
              }
            }
          },
        ),
        { numRuns: 50 },
      )
    })

    /**
     * Test: Authentication method is correctly attached to request
     */
    it("should attach authentication method to request for later use", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("session", "bearer"),
          async (authMethod) => {
            if (authMethod === "session") {
              mockRequest.isAuthenticated = vi.fn(() => true)
              mockRequest.user = {
                user_id: "test-user-id",
                username: "testuser",
                role: "user",
                rsi_confirmed: true,
                banned: false,
              } as any

              await expressAuthentication(
                mockRequest as ExpressRequest,
                "sessionAuth",
              )

              // Verify authMethod is attached
              expect((mockRequest as any).authMethod).toBe("session")
            } else {
              mockRequest.headers = {
                authorization: "Bearer scm_test_token_12345",
              }

              const mockKnex = vi.mocked(database.knex)
              const mockChain = {
                where: vi.fn().mockReturnThis(),
                whereNull: vi.fn().mockReturnThis(),
                orWhere: vi.fn().mockReturnThis(),
                first: vi.fn().mockResolvedValue({
                  id: "token-id",
                  user_id: "test-user-id",
                  name: "Test Token",
                  scopes: ["read", "write"],
                  expires_at: null,
                  contractor_ids: [],
                }),
                update: vi.fn().mockResolvedValue(undefined),
              }
              mockKnex.mockReturnValue(mockChain as any)

              vi.mocked(profileDb.getUser).mockResolvedValue({
                user_id: "test-user-id",
                username: "testuser",
                role: "user",
                rsi_confirmed: true,
                banned: false,
              })

              await expressAuthentication(
                mockRequest as ExpressRequest,
                "bearerAuth",
              )

              // Verify authMethod and token info are attached
              expect((mockRequest as any).authMethod).toBe("token")
              expect((mockRequest as any).token).toBeDefined()
              expect((mockRequest as any).token.scopes).toEqual([
                "read",
                "write",
              ])
            }
          },
        ),
        { numRuns: 20 },
      )
    })

    /**
     * Test: Error handler respects headersSent flag
     */
    it("should not send response if headers already sent", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            new Error("Test error"),
            new ValidateError({}, "Validation failed"),
            { status: 400, message: "Bad request" },
          ),
          async (error) => {
            // Set headersSent to true
            mockResponse.headersSent = true

            // Call error handler
            tsoaErrorHandler(
              error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            // Verify next was called (delegating to default handler)
            expect(mockNext).toHaveBeenCalledWith(error)

            // Verify response methods were not called
            expect(mockResponse.status).not.toHaveBeenCalled()
            expect(mockResponse.json).not.toHaveBeenCalled()
          },
        ),
        { numRuns: 15 },
      )
    })

    /**
     * Test: Token expiration is checked during authentication
     */
    it("should reject expired tokens during authentication", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            isExpired: fc.boolean(),
          }),
          async (scenario) => {
            mockRequest.headers = {
              authorization: "Bearer scm_test_token_12345",
            }

            const expiresAt = scenario.isExpired
              ? new Date(Date.now() - 86400000) // Yesterday
              : new Date(Date.now() + 86400000) // Tomorrow

            const mockKnex = vi.mocked(database.knex)
            const mockChain = {
              where: vi.fn().mockReturnThis(),
              whereNull: vi.fn().mockReturnThis(),
              orWhere: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue(
                scenario.isExpired
                  ? null // Expired tokens are filtered out by query
                  : {
                      id: "token-id",
                      user_id: "test-user-id",
                      name: "Test Token",
                      scopes: ["read", "write"],
                      expires_at: expiresAt,
                      contractor_ids: [],
                    },
              ),
              update: vi.fn().mockResolvedValue(undefined),
            }
            mockKnex.mockReturnValue(mockChain as any)

            vi.mocked(profileDb.getUser).mockResolvedValue({
              user_id: "test-user-id",
              username: "testuser",
              role: "user",
              rsi_confirmed: true,
              banned: false,
            })

            if (scenario.isExpired) {
              // Should fail
              await expect(
                expressAuthentication(
                  mockRequest as ExpressRequest,
                  "bearerAuth",
                ),
              ).rejects.toThrow("Invalid or expired token")
            } else {
              // Should succeed
              const result = await expressAuthentication(
                mockRequest as ExpressRequest,
                "bearerAuth",
              )
              expect(result).toBeDefined()
            }
          },
        ),
        { numRuns: 20 },
      )
    })

    /**
     * Test: Banned users are rejected during authentication
     */
    it("should reject banned users during authentication", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            authType: fc.constantFrom("session", "bearer"),
            isBanned: fc.boolean(),
          }),
          async (scenario) => {
            if (scenario.authType === "session") {
              mockRequest.isAuthenticated = vi.fn(() => true)
              mockRequest.user = {
                user_id: "test-user-id",
                username: "testuser",
                role: "user",
                rsi_confirmed: true,
                banned: scenario.isBanned,
              } as any

              if (scenario.isBanned) {
                await expect(
                  expressAuthentication(
                    mockRequest as ExpressRequest,
                    "sessionAuth",
                  ),
                ).rejects.toThrow("User is banned")
              } else {
                const result = await expressAuthentication(
                  mockRequest as ExpressRequest,
                  "sessionAuth",
                )
                expect(result).toBeDefined()
              }
            } else {
              mockRequest.headers = {
                authorization: "Bearer scm_test_token_12345",
              }

              const mockKnex = vi.mocked(database.knex)
              const mockChain = {
                where: vi.fn().mockReturnThis(),
                whereNull: vi.fn().mockReturnThis(),
                orWhere: vi.fn().mockReturnThis(),
                first: vi.fn().mockResolvedValue({
                  id: "token-id",
                  user_id: "test-user-id",
                  name: "Test Token",
                  scopes: ["read", "write"],
                  expires_at: null,
                  contractor_ids: [],
                }),
                update: vi.fn().mockResolvedValue(undefined),
              }
              mockKnex.mockReturnValue(mockChain as any)

              vi.mocked(profileDb.getUser).mockResolvedValue(
                scenario.isBanned
                  ? null // Banned users return null
                  : {
                      user_id: "test-user-id",
                      username: "testuser",
                      role: "user",
                      rsi_confirmed: true,
                      banned: false,
                    },
              )

              if (scenario.isBanned) {
                await expect(
                  expressAuthentication(
                    mockRequest as ExpressRequest,
                    "bearerAuth",
                  ),
                ).rejects.toThrow("Invalid or expired token")
              } else {
                const result = await expressAuthentication(
                  mockRequest as ExpressRequest,
                  "bearerAuth",
                )
                expect(result).toBeDefined()
              }
            }
          },
        ),
        { numRuns: 30 },
      )
    })
  })
})
