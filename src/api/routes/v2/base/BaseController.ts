/**
 * Base Controller for v2 API
 *
 * All v2 TSOA controllers should extend this base class.
 * Provides common helper methods for authentication, authorization, and error handling.
 */

import { Controller } from "tsoa"
import type { assertBuyerMayCheckout } from "../../../../services/checkout/checkout-guards.js"
import { Request } from "express"
import { User } from "../../v1/api-models.js"
import {
  NotFoundError,
  BusinessLogicError,
  ValidationError,
} from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { ValidationError as ValidationErrorType } from "../../v1/util/response.js"
import { isSiteAdmin } from "../../../util/site-role.js"
import { adminLockError } from "../../../util/site-admin-policy.js"
import { assertStepUp, stepUpError } from "../../../util/step-up.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  assertTokenMayUseOrg,
  tokenAllowsOrg,
  tokenOrgScope,
  type TokenOrgScope,
} from "../middleware/token-org-access.js"

/**
 * Base controller class with common functionality
 */
export abstract class BaseController extends Controller {
  protected request?: Request

  constructor(request?: Request) {
    super()
    this.request = request
  }

  /**
   * Get the current user ID
   * @throws {BusinessLogicError} If user is not authenticated
   */
  protected getUserId(): string {
    const user = this.request?.user as User | undefined
    if (!user?.user_id) {
      throw new BusinessLogicError(
        ErrorCode.UNAUTHORIZED,
        "User not authenticated",
      )
    }
    return user.user_id
  }

  /**
   * Try to get the current user ID without throwing.
   * Returns undefined if not authenticated.
   */
  protected tryGetUserId(): string | undefined {
    const user = this.request?.user as User | undefined
    return user?.user_id
  }

  /**
   * Get the current user object
   * @throws {BusinessLogicError} If user is not authenticated
   */
  protected getUser(): User {
    const user = this.request?.user as User | undefined
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
    if (!this.request?.user) {
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
    const user = this.request?.user as User | undefined
    return isSiteAdmin(user)
  }

  /**
   * Require admin role
   * @throws {BusinessLogicError} If user is not an admin
   */
  protected requireAdmin(): void {
    this.requireAuth()
    if (!this.isAdmin()) {
      const locked = this.request ? adminLockError(this.request) : null
      if (locked) throw locked
      throw new BusinessLogicError(
        ErrorCode.FORBIDDEN,
        "Admin access required",
      )
    }
  }

  /**
   * The orgs this request's API token may act for (its contractor_ids), or
   * null when unrestricted: browser sessions, JWT cookies, and full/admin
   * tokens. Lists that include org data because the user belongs to the org
   * filter it to these orgs (token-org-access.ts).
   */
  protected tokenOrgScope(): TokenOrgScope {
    return tokenOrgScope(this.request?.__tokenInfo)
  }

  /**
   * 403 when this request's API token may not act for `contractorId` (an org
   * the user belongs to that the token wasn't granted). No-op for sessions
   * and for personal resources (no org).
   */
  protected async requireTokenOrgAccess(
    contractorId: string | null | undefined,
  ): Promise<void> {
    const user = this.request?.user as User | undefined
    if (!user) return
    if (tokenAllowsOrg(this.tokenOrgScope(), contractorId)) return
    try {
      await assertTokenMayUseOrg(getKnex(), this.request?.__tokenInfo, contractorId, user.user_id)
    } catch (error) {
      if ((error as { status?: number }).status !== 403) throw error
      throw new BusinessLogicError(
        ErrorCode.FORBIDDEN,
        "Token does not have access to this contractor",
      )
    }
  }

  /**
   * Require a fresh MFA step-up for a sensitive action
   * (src/api/util/step-up.ts). No-op while admin MFA enforcement is off.
   */
  protected async requireStepUp(): Promise<void> {
    if (!this.request) throw stepUpError()
    await assertStepUp(this.request)
  }

  /**
   * Check if the current user owns a resource
   */
  protected isOwner(resourceUserId: string): boolean {
    const user = this.request?.user as User | undefined
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
    details?: Record<string, unknown>,
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
  /**
   * Run the shared checkout guards (self-purchase, blocklists, availability,
   * order limits) and report a rejection as a 400 validation error.
   */
  protected async assertBuyerMayCheckout(
    ...args: Parameters<typeof assertBuyerMayCheckout>
  ): Promise<void> {
    // Imported lazily: the guards pull in the v1 order helpers, which every
    // controller would otherwise load (and risk an import cycle) at startup.
    const guards = await import("../../../../services/checkout/checkout-guards.js")
    try {
      await guards.assertBuyerMayCheckout(...args)
    } catch (error) {
      if (error instanceof guards.CheckoutRejectedError) {
        this.throwValidationError(error.message, [
          { field: error.field, message: error.message },
        ])
      }
      throw error
    }
  }

  protected throwForbidden(
    message: string = "You do not have permission to perform this action",
  ): never {
    throw new BusinessLogicError(ErrorCode.FORBIDDEN, message)
  }

  /**
   * Throw a conflict error
   */
  protected throwConflict(message: string, details?: Record<string, unknown>): never {
    throw new BusinessLogicError(ErrorCode.CONFLICT, message, details)
  }
}
