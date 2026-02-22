/**
 * Base Controller for TSOA Controllers
 *
 * Provides common functionality for all TSOA controllers including:
 * - User authentication helpers
 * - Token/scope helpers
 * - Response helpers
 * - Logging helpers
 * - Validation helpers
 * - Query parameter parsers
 * - Error handling
 */

import { Request } from "express"
import { User } from "../routes/v1/api-models.js"
import logger from "../../logger/logger.js"
import { createResponse, createErrorResponse, ErrorCode } from "../routes/v1/util/response.js"

/**
 * Base controller providing common functionality for all TSOA controllers
 */
export abstract class BaseController {
  // ============================================================================
  // User Authentication Helpers
  // ============================================================================

  /**
   * Get the authenticated user from the request
   * Available after authentication middleware runs
   */
  protected getUser(request: Request): User {
    return request.user as User
  }

  /**
   * Get the user ID from the authenticated request
   */
  protected getUserId(request: Request): string {
    const user = this.getUser(request)
    return user.user_id
  }

  /**
   * Check if the user is an admin
   */
  protected isAdmin(request: Request): boolean {
    const user = this.getUser(request)
    return user.role === "admin"
  }

  /**
   * Check if the user is verified (RSI confirmed)
   */
  protected isVerified(request: Request): boolean {
    const user = this.getUser(request)
    return user.rsi_confirmed
  }

  /**
   * Get the client IP address
   */
  protected getClientIp(request: Request): string {
    return request.ip || "unknown"
  }

  // ============================================================================
  // Token/Scope Helpers
  // ============================================================================

  /**
   * Get authentication method (session or token)
   */
  protected getAuthMethod(request: Request): "session" | "token" | undefined {
    return (request as any).authMethod
  }

  /**
   * Get token information (if using token auth)
   */
  protected getTokenInfo(request: Request): any {
    return (request as any).token
  }

  /**
   * Check if user has specific token scope
   */
  protected hasScope(request: Request, scope: string): boolean {
    const tokenInfo = this.getTokenInfo(request)
    if (!tokenInfo) return true // Session auth has all scopes

    return (
      tokenInfo.scopes.includes(scope) ||
      tokenInfo.scopes.includes("admin") ||
      tokenInfo.scopes.includes("full")
    )
  }

  // ============================================================================
  // Response Helpers
  // ============================================================================

  /**
   * Create a standard success response
   */
  protected success<T>(data: T): { data: T } {
    return createResponse(data)
  }

  // ============================================================================
  // Logging Helpers
  // ============================================================================

  /**
   * Log an error with context
   */
  protected logError(context: string, error: unknown, metadata?: any): void {
    logger.error(`Error in ${context}`, {
      error,
      ...metadata,
    })
  }

  /**
   * Log a warning with context
   */
  protected logWarning(context: string, message: string, metadata?: any): void {
    logger.warn(`Warning in ${context}: ${message}`, metadata)
  }

  /**
   * Log info with context
   */
  protected logInfo(context: string, message: string, metadata?: any): void {
    logger.info(`${context}: ${message}`, metadata)
  }

  // ============================================================================
  // Validation Helpers
  // ============================================================================

  /**
   * Validate required fields in request body
   */
  protected validateRequired(
    body: any,
    fields: string[],
  ): { valid: boolean; missing: string[] } {
    const missing = fields.filter((field) => !body[field])
    return {
      valid: missing.length === 0,
      missing,
    }
  }

  /**
   * Parse pagination parameters
   */
  protected parsePagination(request: Request): {
    page: number
    limit: number
    offset: number
  } {
    const page = Math.max(1, parseInt(request.query.page as string) || 1)
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.query.limit as string) || 20),
    )
    const offset = (page - 1) * limit

    return { page, limit, offset }
  }

  /**
   * Parse sort parameters
   */
  protected parseSort(
    request: Request,
    allowedFields: string[],
  ): {
    field: string
    order: "asc" | "desc"
  } | null {
    const sortBy = request.query.sort_by as string
    const sortOrder = (request.query.sort_order as string)?.toLowerCase()

    if (!sortBy || !allowedFields.includes(sortBy)) {
      return null
    }

    return {
      field: sortBy,
      order: sortOrder === "desc" ? "desc" : "asc",
    }
  }

  // ============================================================================
  // Query Parameter Parsers
  // ============================================================================

  /**
   * Parse array query parameter (handles both single value and array)
   */
  protected parseArrayParam(
    param: string | string[] | undefined,
  ): string[] | undefined {
    if (!param) return undefined
    return Array.isArray(param) ? param : [param]
  }

  /**
   * Parse boolean query parameter
   */
  protected parseBooleanParam(param: string | undefined): boolean {
    return param === "true"
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  /**
   * Handle errors consistently across all controllers
   */
  protected handleError(error: unknown, context: string): never {
    this.logError(context, error)

    if (error instanceof ValidationErrorClass) {
      throw {
        status: 400,
        message: error.message,
        code: ErrorCode.VALIDATION_ERROR,
        fields: error.fields,
      }
    }

    if (error instanceof UnauthorizedError) {
      throw {
        status: 401,
        message: error.message,
        code: ErrorCode.UNAUTHORIZED,
      }
    }

    if (error instanceof ForbiddenError) {
      throw {
        status: 403,
        message: error.message,
        code: ErrorCode.FORBIDDEN,
      }
    }

    if (error instanceof NotFoundError) {
      throw {
        status: 404,
        message: error.message,
        code: ErrorCode.NOT_FOUND,
      }
    }

    if (error instanceof ConflictError) {
      throw {
        status: 409,
        message: error.message,
        code: ErrorCode.CONFLICT,
      }
    }

    // Default to 500 for unknown errors
    throw {
      status: 500,
      message: "Internal server error",
      code: ErrorCode.INTERNAL_SERVER_ERROR,
    }
  }
}

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Validation error with optional field-level details
 */
export class ValidationErrorClass extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message)
    this.name = "ValidationError"
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends Error {
  constructor(message: string = "Forbidden") {
    super(message)
    this.name = "ForbiddenError"
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends Error {
  constructor(message: string = "Not found") {
    super(message)
    this.name = "NotFoundError"
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends Error {
  constructor(message: string = "Conflict") {
    super(message)
    this.name = "ConflictError"
  }
}
