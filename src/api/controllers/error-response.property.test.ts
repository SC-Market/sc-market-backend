/**
 * Property-Based Tests for Error Response Format Consistency
 *
 * These tests verify that all error conditions (validation, authentication,
 * authorization, server errors, custom errors) produce error responses that
 * match the legacy system's error format exactly.
 *
 * Testing Framework: fast-check
 * Feature: tsoa-migration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { Request as ExpressRequest, Response, NextFunction } from "express"
import { tsoaErrorHandler } from "../middleware/tsoa-error-handler.js"
import { BaseController, ValidationErrorClass, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } from "./base.controller.js"
import { ErrorCode } from "../routes/v1/util/response.js"
import { ValidateError } from "tsoa"

// Mock logger
vi.mock("../../logger/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import logger from "../../logger/logger.js"

/**
 * Test controller to verify BaseController.handleError behavior
 */
class TestController extends BaseController {
  public testHandleError(error: unknown, context: string): never {
    return this.handleError(error, context)
  }
}

describe("Error Response Format - Property-Based Tests", () => {
  let mockRequest: Partial<ExpressRequest>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let testController: TestController

  beforeEach(() => {
    mockRequest = {
      path: "/api/v1/test",
      method: "GET",
      headers: {},
      query: {},
      body: {},
      user: undefined,
    }
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      headersSent: false,
    }
    mockNext = vi.fn()
    testController = new TestController()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Property 11: Error Response Format Consistency
   * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**
   *
   * For any error condition (validation, authentication, authorization,
   * server error, custom error), the error response format should match
   * the legacy system's error format exactly.
   *
   * Legacy error format:
   * {
   *   error: {
   *     code: string,
   *     message: string,
   *     details?: any
   *   }
   * }
   *
   * This property verifies that:
   * 1. All errors produce responses with the correct structure
   * 2. Error codes are consistent with ErrorCode enum
   * 3. Error messages are descriptive strings
   * 4. HTTP status codes match error types
   * 5. Optional details field is included when appropriate
   * 6. No unexpected fields are present in error responses
   */
  describe("Feature: tsoa-migration, Property 11: Error Response Format Consistency", () => {
    /**
     * Test: All error types produce consistent response structure
     */
    it("should produce consistent error response structure for all error types", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            // Validation errors (400)
            {
              type: "tsoa_validation",
              error: new ValidateError(
                {
                  field1: { message: "field1 is required", value: undefined },
                  field2: { message: "field2 must be a string", value: 123 },
                },
                "Validation failed",
              ),
              expectedStatus: 400,
              expectedCode: ErrorCode.VALIDATION_ERROR,
              shouldHaveDetails: true,
            },
            // Note: ValidationError must be transformed by BaseController.handleError
            {
              type: "controller_validation_transformed",
              error: {
                status: 400,
                code: ErrorCode.VALIDATION_ERROR,
                message: "Invalid input",
                fields: {
                  email: "Invalid email format",
                  age: "Must be a positive number",
                },
              },
              expectedStatus: 400,
              expectedCode: ErrorCode.VALIDATION_ERROR,
              shouldHaveDetails: true,
            },
            // Authentication errors (401)
            {
              type: "not_authenticated",
              error: new Error("Not authenticated"),
              expectedStatus: 401,
              expectedCode: ErrorCode.UNAUTHORIZED,
              shouldHaveDetails: false,
            },
            {
              type: "no_bearer_token",
              error: new Error("No bearer token provided"),
              expectedStatus: 401,
              expectedCode: ErrorCode.UNAUTHORIZED,
              shouldHaveDetails: false,
            },
            {
              type: "invalid_token",
              error: new Error("Invalid or expired token"),
              expectedStatus: 401,
              expectedCode: ErrorCode.UNAUTHORIZED,
              shouldHaveDetails: false,
            },
            {
              type: "user_banned",
              error: new Error("User is banned"),
              expectedStatus: 401,
              expectedCode: ErrorCode.UNAUTHORIZED,
              shouldHaveDetails: false,
            },
            // Note: UnauthorizedError must be transformed by BaseController.handleError
            {
              type: "controller_unauthorized_transformed",
              error: {
                status: 401,
                code: ErrorCode.UNAUTHORIZED,
                message: "Authentication required",
              },
              expectedStatus: 401,
              expectedCode: ErrorCode.UNAUTHORIZED,
              shouldHaveDetails: false,
            },
            // Authorization errors (403)
            {
              type: "admin_required",
              error: new Error("Admin access required"),
              expectedStatus: 403,
              expectedCode: ErrorCode.FORBIDDEN,
              shouldHaveDetails: false,
            },
            {
              type: "insufficient_permissions",
              error: new Error("Insufficient permissions"),
              expectedStatus: 403,
              expectedCode: ErrorCode.FORBIDDEN,
              shouldHaveDetails: false,
            },
            // Note: ForbiddenError must be transformed by BaseController.handleError
            {
              type: "controller_forbidden_transformed",
              error: {
                status: 403,
                code: ErrorCode.FORBIDDEN,
                message: "Access denied",
              },
              expectedStatus: 403,
              expectedCode: ErrorCode.FORBIDDEN,
              shouldHaveDetails: false,
            },
            // Not found errors (404)
            // Note: NotFoundError must be transformed by BaseController.handleError
            {
              type: "controller_not_found_transformed",
              error: {
                status: 404,
                code: ErrorCode.NOT_FOUND,
                message: "Resource not found",
              },
              expectedStatus: 404,
              expectedCode: ErrorCode.NOT_FOUND,
              shouldHaveDetails: false,
            },
            // Conflict errors (409)
            // Note: ConflictError must be transformed by BaseController.handleError
            // to have status property, otherwise it's treated as unhandled (500)
            {
              type: "controller_conflict_transformed",
              error: {
                status: 409,
                code: ErrorCode.CONFLICT,
                message: "Resource already exists",
              },
              expectedStatus: 409,
              expectedCode: ErrorCode.CONFLICT,
              shouldHaveDetails: false,
            },
            // Custom errors with status codes
            {
              type: "custom_400",
              error: {
                status: 400,
                code: ErrorCode.VALIDATION_ERROR,
                message: "Custom validation error",
                details: { field: "value" },
              },
              expectedStatus: 400,
              expectedCode: ErrorCode.VALIDATION_ERROR,
              shouldHaveDetails: true,
            },
            {
              type: "custom_404",
              error: {
                status: 404,
                code: ErrorCode.NOT_FOUND,
                message: "Custom not found error",
              },
              expectedStatus: 404,
              expectedCode: ErrorCode.NOT_FOUND,
              shouldHaveDetails: false,
            },
            {
              type: "custom_409",
              error: {
                status: 409,
                code: ErrorCode.CONFLICT,
                message: "Custom conflict error",
                details: { conflictingId: "123" },
              },
              expectedStatus: 409,
              expectedCode: ErrorCode.CONFLICT,
              shouldHaveDetails: true,
            },
            // Server errors (500)
            {
              type: "unhandled_error",
              error: new Error("Unexpected error occurred"),
              expectedStatus: 500,
              expectedCode: ErrorCode.INTERNAL_SERVER_ERROR,
              shouldHaveDetails: false,
            },
            {
              type: "unknown_security_scheme",
              error: new Error("Unknown security scheme"),
              expectedStatus: 500,
              expectedCode: ErrorCode.INTERNAL_SERVER_ERROR,
              shouldHaveDetails: false,
            },
            {
              type: "generic_error",
              error: new Error("Something went wrong"),
              expectedStatus: 500,
              expectedCode: ErrorCode.INTERNAL_SERVER_ERROR,
              shouldHaveDetails: false,
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

            // Verify HTTP status code
            expect(mockResponse.status).toHaveBeenCalledWith(
              testCase.expectedStatus,
            )

            // Verify response was sent
            expect(mockResponse.json).toHaveBeenCalled()

            // Get the response body
            const responseBody = vi.mocked(mockResponse.json).mock.calls[0][0]

            // Verify response structure matches legacy format
            expect(responseBody).toBeDefined()
            expect(responseBody).toHaveProperty("error")
            expect(typeof responseBody.error).toBe("object")

            // Verify error object has required fields
            expect(responseBody.error).toHaveProperty("code")
            expect(responseBody.error).toHaveProperty("message")

            // Verify error code matches expected
            expect(responseBody.error.code).toBe(testCase.expectedCode)

            // Verify error message is a non-empty string
            expect(typeof responseBody.error.message).toBe("string")
            expect(responseBody.error.message.length).toBeGreaterThan(0)

            // Verify details field presence
            if (testCase.shouldHaveDetails) {
              expect(responseBody.error).toHaveProperty("details")
            }

            // Verify no unexpected top-level fields
            const allowedTopLevelFields = ["error"]
            const topLevelFields = Object.keys(responseBody)
            topLevelFields.forEach((field) => {
              expect(allowedTopLevelFields).toContain(field)
            })

            // Verify no unexpected error fields
            const allowedErrorFields = ["code", "message", "details"]
            const errorFields = Object.keys(responseBody.error)
            errorFields.forEach((field) => {
              expect(allowedErrorFields).toContain(field)
            })
          },
        ),
        { numRuns: 50 },
      )
    })

    /**
     * Test: BaseController.handleError produces consistent error structure
     */
    it("should produce consistent error structure from BaseController.handleError", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            {
              error: new ValidationErrorClass("Validation failed", {
                field: "error",
              }),
              expectedStatus: 400,
              expectedCode: ErrorCode.VALIDATION_ERROR,
            },
            {
              error: new UnauthorizedError("Not authorized"),
              expectedStatus: 401,
              expectedCode: ErrorCode.UNAUTHORIZED,
            },
            {
              error: new ForbiddenError("Access forbidden"),
              expectedStatus: 403,
              expectedCode: ErrorCode.FORBIDDEN,
            },
            {
              error: new NotFoundError("Not found"),
              expectedStatus: 404,
              expectedCode: ErrorCode.NOT_FOUND,
            },
            {
              error: new ConflictError("Conflict"),
              expectedStatus: 409,
              expectedCode: ErrorCode.CONFLICT,
            },
            {
              error: new Error("Unknown error"),
              expectedStatus: 500,
              expectedCode: ErrorCode.INTERNAL_SERVER_ERROR,
            },
          ),
          async (testCase) => {
            try {
              testController.testHandleError(testCase.error, "test context")
              expect.fail("Expected error to be thrown")
            } catch (thrownError: any) {
              // Verify thrown error has correct structure for middleware
              expect(thrownError).toBeDefined()
              expect(thrownError).toHaveProperty("status")
              expect(thrownError).toHaveProperty("code")
              expect(thrownError).toHaveProperty("message")

              // Verify values match expected
              expect(thrownError.status).toBe(testCase.expectedStatus)
              expect(thrownError.code).toBe(testCase.expectedCode)
              expect(typeof thrownError.message).toBe("string")
              expect(thrownError.message.length).toBeGreaterThan(0)
            }
          },
        ),
        { numRuns: 30 },
      )
    })

    /**
     * Test: Error codes are always from ErrorCode enum
     */
    it("should only use error codes from ErrorCode enum", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            new ValidateError({}, "Validation failed"),
            new Error("Not authenticated"),
            new Error("Admin access required"),
            new UnauthorizedError(),
            new ForbiddenError(),
            new NotFoundError(),
            new ConflictError(),
            new Error("Unexpected error"),
            { status: 400, code: ErrorCode.VALIDATION_ERROR, message: "Test" },
            { status: 404, code: ErrorCode.NOT_FOUND, message: "Test" },
          ),
          async (error) => {
            vi.clearAllMocks()

            tsoaErrorHandler(
              error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            const responseBody = vi.mocked(mockResponse.json).mock.calls[0][0]

            // Verify error code is from ErrorCode enum
            const validErrorCodes = Object.values(ErrorCode)
            expect(validErrorCodes).toContain(responseBody.error.code)
          },
        ),
        { numRuns: 40 },
      )
    })

    /**
     * Test: HTTP status codes match error types consistently
     */
    it("should use correct HTTP status codes for each error type", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorCode: fc.constantFrom(
              ErrorCode.VALIDATION_ERROR,
              ErrorCode.UNAUTHORIZED,
              ErrorCode.FORBIDDEN,
              ErrorCode.NOT_FOUND,
              ErrorCode.CONFLICT,
              ErrorCode.INTERNAL_SERVER_ERROR,
            ),
          }),
          async (params) => {
            // Map error codes to expected status codes
            const statusCodeMap: Record<string, number> = {
              [ErrorCode.VALIDATION_ERROR]: 400,
              [ErrorCode.UNAUTHORIZED]: 401,
              [ErrorCode.FORBIDDEN]: 403,
              [ErrorCode.NOT_FOUND]: 404,
              [ErrorCode.CONFLICT]: 409,
              [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
            }

            const expectedStatus = statusCodeMap[params.errorCode]

            // Create custom error with the error code
            const error = {
              status: expectedStatus,
              code: params.errorCode,
              message: "Test error",
            }

            vi.clearAllMocks()

            tsoaErrorHandler(
              error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            // Verify status code matches
            expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus)

            const responseBody = vi.mocked(mockResponse.json).mock.calls[0][0]
            expect(responseBody.error.code).toBe(params.errorCode)
          },
        ),
        { numRuns: 30 },
      )
    })

    /**
     * Test: Validation errors include field details
     */
    it("should include field details for validation errors", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate random field names and error messages
            fields: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.string({ minLength: 5, maxLength: 50 }),
              { minKeys: 1, maxKeys: 5 },
            ),
          }),
          async (params) => {
            // Create TSOA ValidateError with generated fields
            const tsoaFields: Record<string, any> = {}
            for (const [field, message] of Object.entries(params.fields)) {
              tsoaFields[field] = { message, value: undefined }
            }

            const error = new ValidateError(tsoaFields, "Validation failed")

            vi.clearAllMocks()

            tsoaErrorHandler(
              error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            const responseBody = vi.mocked(mockResponse.json).mock.calls[0][0]

            // Verify details field exists and contains fields
            expect(responseBody.error).toHaveProperty("details")
            expect(responseBody.error.details).toHaveProperty("fields")
            expect(typeof responseBody.error.details.fields).toBe("object")

            // Verify all fields are present
            for (const field of Object.keys(params.fields)) {
              expect(responseBody.error.details.fields).toHaveProperty(field)
            }
          },
        ),
        { numRuns: 25 },
      )
    })

    /**
     * Test: Error messages are descriptive and non-empty
     */
    it("should provide descriptive non-empty error messages", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            new ValidateError({}, "Validation failed"),
            new Error("Not authenticated"),
            new Error("Admin access required"),
            new UnauthorizedError("Custom auth message"),
            new ForbiddenError("Custom forbidden message"),
            new NotFoundError("Custom not found message"),
            new ConflictError("Custom conflict message"),
            new Error("Unexpected error"),
          ),
          async (error) => {
            vi.clearAllMocks()

            tsoaErrorHandler(
              error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            const responseBody = vi.mocked(mockResponse.json).mock.calls[0][0]

            // Verify message is a non-empty string
            expect(typeof responseBody.error.message).toBe("string")
            expect(responseBody.error.message.length).toBeGreaterThan(0)

            // Verify message is descriptive (more than just "error")
            expect(responseBody.error.message.toLowerCase()).not.toBe("error")
            expect(responseBody.error.message.length).toBeGreaterThan(3)
          },
        ),
        { numRuns: 30 },
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
            new UnauthorizedError(),
            { status: 400, message: "Bad request" },
          ),
          async (error) => {
            vi.clearAllMocks()

            // Set headersSent to true
            mockResponse.headersSent = true

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
        { numRuns: 20 },
      )
    })

    /**
     * Test: All errors are logged appropriately
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
            {
              error: new Error("Unknown security scheme"),
              expectedLogLevel: "error",
            },
          ),
          async (testCase) => {
            vi.clearAllMocks()

            tsoaErrorHandler(
              testCase.error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            // Verify logging occurred
            if (testCase.expectedLogLevel === "warn") {
              expect(logger.warn).toHaveBeenCalled()
            } else if (testCase.expectedLogLevel === "error") {
              expect(logger.error).toHaveBeenCalled()
            }

            // Verify log includes context
            const logCalls =
              testCase.expectedLogLevel === "warn"
                ? vi.mocked(logger.warn).mock.calls
                : vi.mocked(logger.error).mock.calls

            expect(logCalls.length).toBeGreaterThan(0)
            expect(logCalls[0][1]).toHaveProperty("path")
            expect(logCalls[0][1]).toHaveProperty("method")
          },
        ),
        { numRuns: 30 },
      )
    })

    /**
     * Test: Custom error details are preserved
     */
    it("should preserve custom error details in response", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate random details objects
            details: fc.oneof(
              fc.record({
                field: fc.string(),
                value: fc.anything(),
              }),
              fc.record({
                conflictingId: fc.string(),
                existingValue: fc.string(),
              }),
              fc.record({
                resource: fc.string(),
                identifier: fc.string(),
              }),
            ),
          }),
          async (params) => {
            const error = {
              status: 400,
              code: ErrorCode.VALIDATION_ERROR,
              message: "Test error",
              details: params.details,
            }

            vi.clearAllMocks()

            tsoaErrorHandler(
              error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            const responseBody = vi.mocked(mockResponse.json).mock.calls[0][0]

            // Verify details are preserved
            expect(responseBody.error).toHaveProperty("details")
            expect(responseBody.error.details).toEqual(params.details)
          },
        ),
        { numRuns: 25 },
      )
    })

    /**
     * Test: Error response format is consistent across different request paths
     */
    it("should produce consistent error format regardless of request path", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            path: fc.constantFrom(
              "/api/v1/attributes/definitions",
              "/api/v1/market/listings",
              "/api/v1/profile",
              "/api/v1/orders",
              "/api/v1/admin/users",
            ),
            method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
            error: fc.constantFrom(
              new ValidateError({}, "Validation failed"),
              new Error("Not authenticated"),
              new Error("Admin access required"),
              new NotFoundError(),
            ),
          }),
          async (params) => {
            mockRequest.path = params.path
            mockRequest.method = params.method

            vi.clearAllMocks()

            tsoaErrorHandler(
              params.error,
              mockRequest as ExpressRequest,
              mockResponse as Response,
              mockNext,
            )

            const responseBody = vi.mocked(mockResponse.json).mock.calls[0][0]

            // Verify consistent structure regardless of path/method
            expect(responseBody).toHaveProperty("error")
            expect(responseBody.error).toHaveProperty("code")
            expect(responseBody.error).toHaveProperty("message")
            expect(typeof responseBody.error.code).toBe("string")
            expect(typeof responseBody.error.message).toBe("string")
          },
        ),
        { numRuns: 40 },
      )
    })
  })
})
