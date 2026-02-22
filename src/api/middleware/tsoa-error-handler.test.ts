import { Request, Response, NextFunction } from "express"
import { ValidateError, FieldErrors } from "tsoa"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { ErrorCode } from "../routes/v1/util/response.js"

// Mock logger before imports
vi.mock("../../logger/logger.js", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import after mocks
import { tsoaErrorHandler } from "./tsoa-error-handler.js"
import logger from "../../logger/logger.js"

describe("tsoaErrorHandler", () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let jsonSpy: any
  let statusSpy: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Create mock request
    mockRequest = {
      path: "/api/v1/test",
      method: "POST",
      headers: {},
      isAuthenticated: vi.fn().mockReturnValue(false) as any,
    }

    // Create mock response with chainable methods
    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy })
    mockResponse = {
      headersSent: false,
      status: statusSpy,
      json: jsonSpy,
    }

    // Create mock next function
    mockNext = vi.fn()
  })

  describe("TSOA ValidateError transformation", () => {
    it("should transform ValidateError to legacy validation error format", () => {
      const fields: FieldErrors = {
        "body.email": {
          message: "Invalid email format",
          value: "not-an-email",
        },
        "body.age": {
          message: "Must be a positive number",
          value: -5,
        },
      }

      const error = new ValidateError(fields, "Validation failed")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          details: { fields },
        },
      })
      expect(logger.warn).toHaveBeenCalledWith("TSOA validation error", {
        fields,
        path: "/api/v1/test",
        method: "POST",
      })
    })

    it("should handle ValidateError with empty fields", () => {
      const fields: FieldErrors = {}
      const error = new ValidateError(fields, "Validation failed")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          details: { fields: {} },
        },
      })
    })
  })

  describe("Authentication error transformation", () => {
    it("should transform 'Not authenticated' error to 401", () => {
      const error = new Error("Not authenticated")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: "Not authenticated",
        },
      })
      expect(logger.warn).toHaveBeenCalledWith("TSOA authentication error", {
        message: "Not authenticated",
        path: "/api/v1/test",
        method: "POST",
        hasAuthHeader: false,
        isAuthenticated: false,
      })
    })

    it("should transform 'No bearer token provided' error to 401", () => {
      const error = new Error("No bearer token provided")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: "No bearer token provided",
        },
      })
    })

    it("should transform 'Invalid or expired token' error to 401", () => {
      const error = new Error("Invalid or expired token")
      mockRequest.headers = { authorization: "Bearer invalid_token" }

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: "Invalid or expired token",
        },
      })
      expect(logger.warn).toHaveBeenCalledWith("TSOA authentication error", {
        message: "Invalid or expired token",
        path: "/api/v1/test",
        method: "POST",
        hasAuthHeader: true,
        isAuthenticated: false,
      })
    })

    it("should transform 'User is banned' error to 401", () => {
      const error = new Error("User is banned")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: "User is banned",
        },
      })
    })
  })

  describe("Authorization error transformation", () => {
    it("should transform 'Admin access required' error to 403", () => {
      const error = new Error("Admin access required")
      mockRequest.user = { user_id: "user123", role: "user" } as any

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(403)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: "Admin access required",
        },
      })
      expect(logger.warn).toHaveBeenCalledWith("TSOA authorization error", {
        message: "Admin access required",
        path: "/api/v1/test",
        method: "POST",
        user: "user123",
      })
    })

    it("should transform 'Insufficient permissions' error to 403", () => {
      const error = new Error("Insufficient permissions")
      mockRequest.user = { user_id: "user456", role: "user" } as any

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(403)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: "Insufficient permissions",
        },
      })
    })

    it("should handle authorization error without user context", () => {
      const error = new Error("Admin access required")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(403)
      expect(logger.warn).toHaveBeenCalledWith("TSOA authorization error", {
        message: "Admin access required",
        path: "/api/v1/test",
        method: "POST",
        user: undefined,
      })
    })
  })

  describe("Custom error with status code transformation", () => {
    it("should handle custom error with status and code", () => {
      const error = {
        status: 404,
        code: ErrorCode.NOT_FOUND,
        message: "Resource not found",
      }

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(404)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Resource not found",
        },
      })
      expect(logger.warn).toHaveBeenCalledWith("TSOA custom error", {
        status: 404,
        code: ErrorCode.NOT_FOUND,
        message: "Resource not found",
        path: "/api/v1/test",
        method: "POST",
      })
    })

    it("should handle custom error with status, code, and details", () => {
      const error = {
        status: 409,
        code: ErrorCode.CONFLICT,
        message: "Resource already exists",
        details: { resource: "user", identifier: "email@example.com" },
      }

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(409)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.CONFLICT,
          message: "Resource already exists",
          details: { resource: "user", identifier: "email@example.com" },
        },
      })
    })

    it("should handle custom error with status but no code", () => {
      const error = {
        status: 400,
        message: "Bad request",
      }

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: "Bad request",
        },
      })
    })

    it("should handle custom error with status but no message", () => {
      const error = {
        status: 500,
        code: ErrorCode.DATABASE_ERROR,
      }

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.DATABASE_ERROR,
          message: "An error occurred",
        },
      })
    })
  })

  describe("Unknown security scheme error", () => {
    it("should handle unknown security scheme error", () => {
      const error = new Error("Unknown security scheme")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: "Authentication configuration error",
        },
      })
      expect(logger.error).toHaveBeenCalledWith("TSOA unknown security scheme", {
        message: "Unknown security scheme",
        path: "/api/v1/test",
        method: "POST",
      })
    })
  })

  describe("Unhandled error transformation", () => {
    it("should handle generic Error objects", () => {
      const error = new Error("Something went wrong")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: "Internal server error",
        },
      })
      expect(logger.error).toHaveBeenCalledWith("Unhandled error in TSOA route", {
        error: "Something went wrong",
        stack: expect.any(String),
        path: "/api/v1/test",
        method: "POST",
        user: undefined,
      })
    })

    it("should handle non-Error objects", () => {
      const error = "String error"

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: "Internal server error",
        },
      })
      expect(logger.error).toHaveBeenCalledWith("Unhandled error in TSOA route", {
        error: "String error",
        stack: undefined,
        path: "/api/v1/test",
        method: "POST",
        user: undefined,
      })
    })

    it("should include user context in unhandled errors when available", () => {
      const error = new Error("Database connection failed")
      mockRequest.user = { user_id: "user789", role: "admin" } as any

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(logger.error).toHaveBeenCalledWith("Unhandled error in TSOA route", {
        error: "Database connection failed",
        stack: expect.any(String),
        path: "/api/v1/test",
        method: "POST",
        user: "user789",
      })
    })
  })

  describe("Headers already sent", () => {
    it("should call next() if headers already sent", () => {
      mockResponse.headersSent = true
      const error = new Error("Test error")

      tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

      expect(mockNext).toHaveBeenCalledWith(error)
      expect(statusSpy).not.toHaveBeenCalled()
      expect(jsonSpy).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe("Error response format consistency", () => {
    it("should always return error responses with consistent structure", () => {
      const testCases = [
        {
          error: new ValidateError({ field: { message: "Invalid" } }, "Validation failed"),
          expectedStatus: 400,
        },
        {
          error: new Error("Not authenticated"),
          expectedStatus: 401,
        },
        {
          error: new Error("Admin access required"),
          expectedStatus: 403,
        },
        {
          error: { status: 404, code: ErrorCode.NOT_FOUND, message: "Not found" },
          expectedStatus: 404,
        },
        {
          error: new Error("Unhandled error"),
          expectedStatus: 500,
        },
      ]

      testCases.forEach(({ error, expectedStatus }) => {
        // Reset mocks
        vi.clearAllMocks()
        jsonSpy = vi.fn()
        statusSpy = vi.fn().mockReturnValue({ json: jsonSpy })
        mockResponse.status = statusSpy

        tsoaErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext)

        expect(statusSpy).toHaveBeenCalledWith(expectedStatus)
        
        const response = jsonSpy.mock.calls[0][0]
        expect(response).toHaveProperty("error")
        expect(response.error).toHaveProperty("code")
        expect(response.error).toHaveProperty("message")
        expect(typeof response.error.code).toBe("string")
        expect(typeof response.error.message).toBe("string")
      })
    })
  })
})
