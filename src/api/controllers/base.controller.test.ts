/**
 * Unit tests for BaseController
 *
 * Tests the common functionality provided by the base controller
 */

import { describe, it, expect, beforeEach } from "vitest"
import { Request } from "express"
import {
  BaseController,
  ValidationErrorClass,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "./base.controller.js"
import { User } from "../routes/v1/api-models.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"

// Test implementation of BaseController
class TestController extends BaseController {
  // Expose protected methods for testing
  public testGetUser(request: Request): User {
    return this.getUser(request)
  }

  public testGetUserId(request: Request): string {
    return this.getUserId(request)
  }

  public testIsAdmin(request: Request): boolean {
    return this.isAdmin(request)
  }

  public testIsVerified(request: Request): boolean {
    return this.isVerified(request)
  }

  public testGetClientIp(request: Request): string {
    return this.getClientIp(request)
  }

  public testGetAuthMethod(request: Request): "session" | "token" | undefined {
    return this.getAuthMethod(request)
  }

  public testGetTokenInfo(request: Request): any {
    return this.getTokenInfo(request)
  }

  public testHasScope(request: Request, scope: string): boolean {
    return this.hasScope(request, scope)
  }

  public testSuccess<T>(data: T): { data: T } {
    return this.success(data)
  }

  public testLogError(context: string, error: unknown, metadata?: any): void {
    return this.logError(context, error, metadata)
  }

  public testLogWarning(context: string, message: string, metadata?: any): void {
    return this.logWarning(context, message, metadata)
  }

  public testLogInfo(context: string, message: string, metadata?: any): void {
    return this.logInfo(context, message, metadata)
  }

  public testValidateRequired(
    body: any,
    fields: string[],
  ): { valid: boolean; missing: string[] } {
    return this.validateRequired(body, fields)
  }

  public testParsePagination(request: Request): {
    page: number
    limit: number
    offset: number
  } {
    return this.parsePagination(request)
  }

  public testParseSort(
    request: Request,
    allowedFields: string[],
  ): { field: string; order: "asc" | "desc" } | null {
    return this.parseSort(request, allowedFields)
  }

  public testParseArrayParam(
    param: string | string[] | undefined,
  ): string[] | undefined {
    return this.parseArrayParam(param)
  }

  public testParseBooleanParam(param: string | undefined): boolean {
    return this.parseBooleanParam(param)
  }

  public testHandleError(error: unknown, context: string): never {
    return this.handleError(error, context)
  }
}

describe("BaseController", () => {
  let controller: TestController
  let mockRequest: Partial<Request>
  let mockUser: User

  beforeEach(() => {
    controller = new TestController()
    mockUser = {
      user_id: "test-user-id",
      display_name: "Test User",
      profile_description: "Test description",
      role: "user",
      banned: false,
      username: "testuser",
      avatar: "avatar.png",
      banner: "banner.png",
      balance: "1000",
      created_at: new Date(),
      locale: "en",
      rsi_confirmed: true,
      spectrum_user_id: "spectrum-123",
      official_server_id: null,
      discord_thread_channel_id: null,
      market_order_template: "",
    }
    mockRequest = {
      user: mockUser,
      ip: "127.0.0.1",
      query: {},
    }
  })

  describe("User Authentication Helpers", () => {
    it("should get user from request", () => {
      const user = controller.testGetUser(mockRequest as Request)
      expect(user).toEqual(mockUser)
    })

    it("should get user ID from request", () => {
      const userId = controller.testGetUserId(mockRequest as Request)
      expect(userId).toBe("test-user-id")
    })

    it("should check if user is admin", () => {
      expect(controller.testIsAdmin(mockRequest as Request)).toBe(false)

      mockUser.role = "admin"
      expect(controller.testIsAdmin(mockRequest as Request)).toBe(true)
    })

    it("should check if user is verified", () => {
      expect(controller.testIsVerified(mockRequest as Request)).toBe(true)

      mockUser.rsi_confirmed = false
      expect(controller.testIsVerified(mockRequest as Request)).toBe(false)
    })

    it("should get client IP", () => {
      const ip = controller.testGetClientIp(mockRequest as Request)
      expect(ip).toBe("127.0.0.1")
    })

    it("should return unknown for missing IP", () => {
      const requestWithoutIp = { ...mockRequest, ip: undefined }
      const ip = controller.testGetClientIp(requestWithoutIp as Request)
      expect(ip).toBe("unknown")
    })
  })

  describe("Token/Scope Helpers", () => {
    it("should get auth method", () => {
      ;(mockRequest as any).authMethod = "session"
      expect(controller.testGetAuthMethod(mockRequest as Request)).toBe("session")
    })

    it("should get token info", () => {
      const tokenInfo = { scopes: ["read", "write"] }
      ;(mockRequest as any).token = tokenInfo
      expect(controller.testGetTokenInfo(mockRequest as Request)).toEqual(tokenInfo)
    })

    it("should check scope for session auth (always true)", () => {
      expect(controller.testHasScope(mockRequest as Request, "read")).toBe(true)
    })

    it("should check scope for token auth", () => {
      ;(mockRequest as any).token = { scopes: ["read", "write"] }
      expect(controller.testHasScope(mockRequest as Request, "read")).toBe(true)
      expect(controller.testHasScope(mockRequest as Request, "delete")).toBe(false)
    })

    it("should allow admin scope to access any scope", () => {
      ;(mockRequest as any).token = { scopes: ["admin"] }
      expect(controller.testHasScope(mockRequest as Request, "read")).toBe(true)
      expect(controller.testHasScope(mockRequest as Request, "delete")).toBe(true)
    })

    it("should allow full scope to access any scope", () => {
      ;(mockRequest as any).token = { scopes: ["full"] }
      expect(controller.testHasScope(mockRequest as Request, "read")).toBe(true)
      expect(controller.testHasScope(mockRequest as Request, "delete")).toBe(true)
    })
  })

  describe("Response Helpers", () => {
    it("should create success response", () => {
      const data = { message: "Success" }
      const response = controller.testSuccess(data)
      expect(response).toEqual({ data })
    })
  })

  describe("Validation Helpers", () => {
    it("should validate required fields - all present", () => {
      const body = { name: "Test", email: "test@example.com" }
      const result = controller.testValidateRequired(body, ["name", "email"])
      expect(result.valid).toBe(true)
      expect(result.missing).toEqual([])
    })

    it("should validate required fields - some missing", () => {
      const body = { name: "Test" }
      const result = controller.testValidateRequired(body, ["name", "email"])
      expect(result.valid).toBe(false)
      expect(result.missing).toEqual(["email"])
    })

    it("should parse pagination with defaults", () => {
      const result = controller.testParsePagination(mockRequest as Request)
      expect(result).toEqual({ page: 1, limit: 20, offset: 0 })
    })

    it("should parse pagination with custom values", () => {
      mockRequest.query = { page: "3", limit: "50" }
      const result = controller.testParsePagination(mockRequest as Request)
      expect(result).toEqual({ page: 3, limit: 50, offset: 100 })
    })

    it("should enforce pagination limits", () => {
      mockRequest.query = { page: "0", limit: "200" }
      const result = controller.testParsePagination(mockRequest as Request)
      expect(result.page).toBe(1) // Min 1
      expect(result.limit).toBe(100) // Max 100
    })

    it("should parse sort parameters", () => {
      mockRequest.query = { sort_by: "name", sort_order: "desc" }
      const result = controller.testParseSort(mockRequest as Request, ["name", "date"])
      expect(result).toEqual({ field: "name", order: "desc" })
    })

    it("should return null for invalid sort field", () => {
      mockRequest.query = { sort_by: "invalid", sort_order: "desc" }
      const result = controller.testParseSort(mockRequest as Request, ["name", "date"])
      expect(result).toBeNull()
    })

    it("should default to asc order", () => {
      mockRequest.query = { sort_by: "name" }
      const result = controller.testParseSort(mockRequest as Request, ["name"])
      expect(result?.order).toBe("asc")
    })
  })

  describe("Query Parameter Parsers", () => {
    it("should parse array param - undefined", () => {
      expect(controller.testParseArrayParam(undefined)).toBeUndefined()
    })

    it("should parse array param - single value", () => {
      expect(controller.testParseArrayParam("value")).toEqual(["value"])
    })

    it("should parse array param - array", () => {
      expect(controller.testParseArrayParam(["a", "b"])).toEqual(["a", "b"])
    })

    it("should parse boolean param - true", () => {
      expect(controller.testParseBooleanParam("true")).toBe(true)
    })

    it("should parse boolean param - false", () => {
      expect(controller.testParseBooleanParam("false")).toBe(false)
    })

    it("should parse boolean param - undefined", () => {
      expect(controller.testParseBooleanParam(undefined)).toBe(false)
    })
  })

  describe("Error Handling", () => {
    it("should handle ValidationError", () => {
      const error = new ValidationErrorClass("Invalid input", { email: "Invalid email" })
      expect(() => controller.testHandleError(error, "test")).toThrow()
      try {
        controller.testHandleError(error, "test")
      } catch (e: any) {
        expect(e.status).toBe(400)
        expect(e.code).toBe(ErrorCode.VALIDATION_ERROR)
        expect(e.fields).toEqual({ email: "Invalid email" })
      }
    })

    it("should handle UnauthorizedError", () => {
      const error = new UnauthorizedError("Not authenticated")
      try {
        controller.testHandleError(error, "test")
      } catch (e: any) {
        expect(e.status).toBe(401)
        expect(e.code).toBe(ErrorCode.UNAUTHORIZED)
      }
    })

    it("should handle ForbiddenError", () => {
      const error = new ForbiddenError("Access denied")
      try {
        controller.testHandleError(error, "test")
      } catch (e: any) {
        expect(e.status).toBe(403)
        expect(e.code).toBe(ErrorCode.FORBIDDEN)
      }
    })

    it("should handle NotFoundError", () => {
      const error = new NotFoundError("Resource not found")
      try {
        controller.testHandleError(error, "test")
      } catch (e: any) {
        expect(e.status).toBe(404)
        expect(e.code).toBe(ErrorCode.NOT_FOUND)
      }
    })

    it("should handle ConflictError", () => {
      const error = new ConflictError("Resource already exists")
      try {
        controller.testHandleError(error, "test")
      } catch (e: any) {
        expect(e.status).toBe(409)
        expect(e.code).toBe(ErrorCode.CONFLICT)
      }
    })

    it("should handle unknown errors as 500", () => {
      const error = new Error("Unknown error")
      try {
        controller.testHandleError(error, "test")
      } catch (e: any) {
        expect(e.status).toBe(500)
        expect(e.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR)
      }
    })
  })

  describe("Custom Error Classes", () => {
    it("should create ValidationError with fields", () => {
      const error = new ValidationErrorClass("Invalid", { field: "error" })
      expect(error.message).toBe("Invalid")
      expect(error.fields).toEqual({ field: "error" })
      expect(error.name).toBe("ValidationError")
    })

    it("should create UnauthorizedError with default message", () => {
      const error = new UnauthorizedError()
      expect(error.message).toBe("Unauthorized")
      expect(error.name).toBe("UnauthorizedError")
    })

    it("should create ForbiddenError with custom message", () => {
      const error = new ForbiddenError("Custom message")
      expect(error.message).toBe("Custom message")
      expect(error.name).toBe("ForbiddenError")
    })

    it("should create NotFoundError with default message", () => {
      const error = new NotFoundError()
      expect(error.message).toBe("Not found")
      expect(error.name).toBe("NotFoundError")
    })

    it("should create ConflictError with custom message", () => {
      const error = new ConflictError("Already exists")
      expect(error.message).toBe("Already exists")
      expect(error.name).toBe("ConflictError")
    })
  })
})
