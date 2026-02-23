/**
 * Base Controller for v2 API
 *
 * All v2 TSOA controllers should extend this base class.
 * Provides common helper methods for authentication, authorization, and error handling.
 */

import { Controller } from "tsoa"
import { Request } from "express"
import { User } from "../../v1/api-models.js"
import {
  NotFoundError,
  BusinessLogicError,
  ValidationError,
} from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { ValidationError as ValidationErrorType } from "../../v1/util/response.js"

/**
 * Base controller class with common functionality
 */
export abstract class BaseController extends Controller {
  protected request: Request

  constructor(request: Request) {
    super()
    this.request = request
  }

  /**
   * Get the current user ID
   * @throws {BusinessLogicError} If user is not authenticated
   */
  protected getUserId(): string {
    const user = this.request.user as User | undefined
    if (!user?.user_id) {
      throw new BusinessLogicError(
        ErrorCode.UNAUTHORIZED,
        "User not authenticated",
      )
    }
    return user.user_id
  }

  /**
   * Get the current user object
   * @throws {BusinessLogicError} If user is not authenticated
   */
  protected getUser(): User {
    const user = this.request.user as User | undefined
    if (!user) {
      throw new BusinessLogicError(
        ErrorCode.UNAUTHORIZED,
        "User not authenticated",
      )
    }
    return user
  }

  /**
   * Require authentication - throws if user is not authenticated
   * @throws {BusinessLogicError} If user is not authenticated
   */
  protected requireAuth(): void {
    if (!this.request.user) {
      throw new BusinessLogicError(
        ErrorCode.UNAUTHORIZED,
        "Authentication required",
      )
    }
  }

  /**
   * Check if the current user is an admin
   */
  protected isAdmin(): boolean {
    const user = this.request.user as User | undefined
    return user?.role === "admin"
  }

  /**
   * Require admin role
   * @throws {BusinessLogicError} If user is not an admin
   */
  protected requireAdmin(): void {
    this.requireAuth()
    if (!this.isAdmin()) {
      throw new BusinessLogicError(
        ErrorCode.FORBIDDEN,
        "Admin access required",
      )
    }
  }

  /**
   * Check if the current user owns a resource
   */
  protected isOwner(resourceUserId: string): boolean {
    const user = this.request.user as User | undefined
    return user?.user_id === resourceUserId
  }

  /**
   * Require ownership of a resource
   * @throws {BusinessLogicError} If user doesn't own the resource
   */
  protected requireOwnership(resourceUserId: string): void {
    this.requireAuth()
    if (!this.isOwner(resourceUserId) && !this.isAdmin()) {
      throw new BusinessLogicError(
        ErrorCode.FORBIDDEN,
        "You do not have permission to access this resource",
      )
    }
  }

  /**
   * Throw a not found error
   */
  protected throwNotFound(resource: string, identifier?: string): never {
    throw new NotFoundError(resource, identifier)
  }

  /**
   * Throw a validation error
   */
  protected throwValidationError(
    message: string,
    validationErrors: ValidationErrorType[],
  ): never {
    throw new ValidationError(message, validationErrors)
  }

  /**
   * Throw a business logic error
   */
  protected throwBusinessError(
    code: ErrorCode,
    message: string,
    details?: Record<string, any>,
  ): never {
    throw new BusinessLogicError(code, message, details)
  }

  /**
   * Throw an unauthorized error
   */
  protected throwUnauthorized(message: string = "Authentication required"): never {
    throw new BusinessLogicError(ErrorCode.UNAUTHORIZED, message)
  }

  /**
   * Throw a forbidden error
   */
  protected throwForbidden(
    message: string = "You do not have permission to perform this action",
  ): never {
    throw new BusinessLogicError(ErrorCode.FORBIDDEN, message)
  }

  /**
   * Throw a conflict error
   */
  protected throwConflict(message: string, details?: Record<string, any>): never {
    throw new BusinessLogicError(ErrorCode.CONFLICT, message, details)
  }
}
