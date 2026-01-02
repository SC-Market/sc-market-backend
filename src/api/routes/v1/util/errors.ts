/**
 * Custom Error Classes
 * 
 * Custom error classes for different error types.
 * These can be thrown in route handlers and will be automatically
 * handled by the error handler middleware.
 */

import { ErrorCode } from "./error-codes.js"
import { ValidationError as ValidationErrorType } from "./response.js"

/**
 * Validation error for input validation failures
 */
export class ValidationError extends Error {
  constructor(
    public message: string,
    public validationErrors: ValidationErrorType[]
  ) {
    super(message)
    this.name = "ValidationError"
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends Error {
  constructor(
    public resource: string,
    public identifier?: string
  ) {
    super(`${resource} not found${identifier ? `: ${identifier}` : ""}`)
    this.name = "NotFoundError"
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

/**
 * Business logic error for domain-specific errors
 */
export class BusinessLogicError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = "BusinessLogicError"
    Object.setPrototypeOf(this, BusinessLogicError.prototype)
  }
}
