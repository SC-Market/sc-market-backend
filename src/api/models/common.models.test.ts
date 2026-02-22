/**
 * Tests for Common Request/Response Models
 *
 * Validates that TSOA model types match the legacy response format
 */

import { describe, it, expect } from "vitest"
import {
  ApiResponse,
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "./common.models.js"
import {
  createResponse,
  createErrorResponse,
  createValidationErrorResponse,
  createUnauthorizedErrorResponse,
  createForbiddenErrorResponse,
  createNotFoundErrorResponse,
  createConflictErrorResponse,
  ErrorCode,
} from "../routes/v1/util/response.js"

describe("Common Models - Legacy Format Compatibility", () => {
  describe("ApiResponse", () => {
    it("should match legacy success response format", () => {
      const legacyResponse = createResponse({ id: 1, name: "Test" })
      const tsoaResponse: ApiResponse<{ id: number; name: string }> = {
        data: { id: 1, name: "Test" },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse).toHaveProperty("data")
      expect(tsoaResponse.data).toEqual({ id: 1, name: "Test" })
    })

    it("should support nested data structures", () => {
      const complexData = {
        items: [{ id: 1 }, { id: 2 }],
        pagination: { page: 1, total: 2 },
      }
      const legacyResponse = createResponse(complexData)
      const tsoaResponse: ApiResponse<typeof complexData> = {
        data: complexData,
      }

      expect(tsoaResponse).toEqual(legacyResponse)
    })
  })

  describe("ErrorResponse", () => {
    it("should match legacy error response format", () => {
      const legacyResponse = createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Something went wrong",
      )
      const tsoaResponse: ErrorResponse = {
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: "Something went wrong",
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse).toHaveProperty("error")
      expect(tsoaResponse.error).toHaveProperty("code")
      expect(tsoaResponse.error).toHaveProperty("message")
    })

    it("should support optional details field", () => {
      const details = { field: "email", reason: "invalid format" }
      const legacyResponse = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Validation failed",
        details,
      )
      const tsoaResponse: ErrorResponse = {
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          details,
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse.error.details).toEqual(details)
    })
  })

  describe("ValidationErrorResponse", () => {
    it("should match legacy validation error format", () => {
      const validationErrors: ValidationError[] = [
        { field: "email", message: "Invalid email format" },
        { field: "password", message: "Password too short" },
      ]
      const legacyResponse = createValidationErrorResponse(
        "Validation failed",
        validationErrors,
      )
      const tsoaResponse: ValidationErrorResponse = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          validationErrors,
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse.error.code).toBe("VALIDATION_ERROR")
      expect(tsoaResponse.error.validationErrors).toEqual(validationErrors)
    })

    it("should support validation errors with codes", () => {
      const validationErrors: ValidationError[] = [
        { field: "email", message: "Invalid email", code: "INVALID_FORMAT" },
      ]
      const tsoaResponse: ValidationErrorResponse = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          validationErrors,
        },
      }

      expect(tsoaResponse.error.validationErrors?.[0].code).toBe(
        "INVALID_FORMAT",
      )
    })
  })

  describe("Unauthorized", () => {
    it("should match legacy unauthorized error format", () => {
      const legacyResponse = createUnauthorizedErrorResponse(
        "Authentication required",
      )
      const tsoaResponse: Unauthorized = {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse.error.code).toBe("UNAUTHORIZED")
    })

    it("should support custom unauthorized messages", () => {
      const legacyResponse = createUnauthorizedErrorResponse(
        "Invalid or expired token",
      )
      const tsoaResponse: Unauthorized = {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token",
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
    })
  })

  describe("Forbidden", () => {
    it("should match legacy forbidden error format", () => {
      const legacyResponse = createForbiddenErrorResponse("Admin access required")
      const tsoaResponse: Forbidden = {
        error: {
          code: "FORBIDDEN",
          message: "Admin access required",
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse.error.code).toBe("FORBIDDEN")
    })

    it("should support default forbidden message", () => {
      const legacyResponse = createForbiddenErrorResponse()
      const tsoaResponse: Forbidden = {
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action",
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
    })
  })

  describe("NotFound", () => {
    it("should match legacy not found error format", () => {
      const legacyResponse = createNotFoundErrorResponse("User", "123")
      const tsoaResponse: NotFound = {
        error: {
          code: "NOT_FOUND",
          message: "User not found: 123",
          details: {
            resource: "User",
            identifier: "123",
          },
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse.error.code).toBe("NOT_FOUND")
      expect(tsoaResponse.error.details?.resource).toBe("User")
      expect(tsoaResponse.error.details?.identifier).toBe("123")
    })

    it("should support not found without identifier", () => {
      const legacyResponse = createNotFoundErrorResponse("Resource")
      const tsoaResponse: NotFound = {
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
          details: {
            resource: "Resource",
            identifier: undefined,
          },
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
    })
  })

  describe("Conflict", () => {
    it("should match legacy conflict error format", () => {
      const details = { field: "email", value: "test@example.com" }
      const legacyResponse = createConflictErrorResponse(
        "Email already exists",
        details,
      )
      const tsoaResponse: Conflict = {
        error: {
          code: "CONFLICT",
          message: "Email already exists",
          details,
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
      expect(tsoaResponse.error.code).toBe("CONFLICT")
      expect(tsoaResponse.error.details).toEqual(details)
    })

    it("should support conflict without details", () => {
      const legacyResponse = createConflictErrorResponse("Resource conflict")
      const tsoaResponse: Conflict = {
        error: {
          code: "CONFLICT",
          message: "Resource conflict",
        },
      }

      expect(tsoaResponse).toEqual(legacyResponse)
    })
  })

  describe("Type Safety", () => {
    it("should enforce correct ApiResponse structure", () => {
      // This test validates TypeScript type checking at compile time
      const response: ApiResponse<{ id: number }> = {
        data: { id: 1 },
      }

      expect(response.data.id).toBe(1)
    })

    it("should enforce correct ErrorResponse structure", () => {
      const response: ErrorResponse = {
        error: {
          code: "TEST_ERROR",
          message: "Test message",
        },
      }

      expect(response.error.code).toBe("TEST_ERROR")
      expect(response.error.message).toBe("Test message")
    })

    it("should enforce ValidationError structure", () => {
      const error: ValidationError = {
        field: "email",
        message: "Invalid email",
      }

      expect(error.field).toBe("email")
      expect(error.message).toBe("Invalid email")
    })
  })
})
