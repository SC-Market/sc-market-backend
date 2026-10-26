/**
 * TSOA Authentication Handler
 *
 * Called by TSOA when a route has @Security("loggedin").
 * req.user is already populated by the early populate-user middleware,
 * so this just checks it exists.
 */

import { NextFunction, Request, RequestHandler, Response } from "express"
import { User } from "../../v1/api-models.js"
import { enforceTokenScopes, isAdminPath, TokenInfo } from "./token-scopes.js"
import { isSiteAdmin } from "../../../util/site-role.js"
import { adminLockError } from "../../../util/site-admin-policy.js"
import { enforceTokenOrgAccess } from "./token-org-access.js"
import { getKnex } from "../../../../clients/database/knex-db.js"

const SESSION_ONLY_PREFIXES = ["auth/mfa", "admin/mfa"]

export function isSessionOnlyPath(path: string): boolean {
  const clean = path.replace(/^\/+/, "").toLowerCase()
  return SESSION_ONLY_PREFIXES.some((p) => clean === p || clean.startsWith(p + "/"))
}

export async function expressAuthentication(
  request: Request,
  securityName: string,
  _scopes?: string[],
): Promise<User> {
  if (securityName === "loggedin" || securityName === "verified") {
    const user = request.user as User | undefined
    if (!user) throw new Error("Authentication required")
    if (user.banned) throw new Error("User is banned")
    if (user.is_tombstone) throw new Error("Account has been deleted")
    if (user.deleted_at) {
      // Grace-period: only allow access to deletion management endpoints
      const path = request.path
      if (
        !path.includes("/accounts/deletion-status") &&
        !path.includes("/accounts/cancel-deletion")
      ) {
        throw new Error(
          "Account is pending deletion. Cancel deletion to regain access.",
        )
      }
    }
    if (securityName === "verified" && !user.rsi_confirmed) {
      throw new Error("Your account is not verified.")
    }

    // Admin routes MUST be executed by an admin user, regardless of token
    // scope. This is enforced centrally here — not just in-controller via
    // requireAdmin() — so a demoted user whose token still carries the `admin`
    // scope is rejected, and a future admin controller that forgets its guard
    // is still protected. The token scope check below is a second gate.
    if (isAdminPath(request.path) && !isSiteAdmin(user)) {
      const locked = adminLockError(request)
      if (locked) throw locked
      const err = new Error("Admin access required") as Error & {
        status: number
      }
      err.status = 403
      throw err
    }

    // Two-factor endpoints are browser-session only: an API token can never
    // enroll, verify or step up.
    if (isSessionOnlyPath(request.path) && request.__tokenInfo) {
      const err = new Error("API tokens cannot use this endpoint") as Error & {
        status: number
      }
      err.status = 403
      throw err
    }

    // Constrain Bearer API tokens to their granted scopes. No-op for
    // session/JWT requests (no __tokenInfo), so browser users are unaffected.
    // Throws a 403 (mapped by tsoa-error-handler) when the token's scopes do
    // not cover this method+path. `request.path` is router-relative here (the
    // router is mounted at /api/v2), matching the deletion-status check above.
    const tokenInfo = (request as { __tokenInfo?: TokenInfo }).__tokenInfo
    enforceTokenScopes(tokenInfo, request.method, request.path)
    // ...and to the orgs the token was granted (contractor_ids).
    await enforceTokenOrgAccess(getKnex(), tokenInfo, request, user.user_id)

    return user
  }

  throw new Error(`Unknown security name: ${securityName}`)
}

/**
 * Run the @Security(securityName) check as plain Express middleware.
 *
 * For routes whose body must not be parsed before the caller is authenticated
 * (multer uploads, which parse multipart and write to disk). TSOA only runs its
 * @Security check inside the generated route, i.e. after any middleware
 * registered ahead of RegisterRoutes(), so those routes put this in front of
 * the parser instead.
 *
 * This is not a second auth policy: it calls expressAuthentication exactly as
 * TSOA's generated authenticateMiddleware does, including defaulting a thrown
 * error's status to 401, and hands the error to next() so tsoaErrorHandler
 * renders the same 401/403 body a TSOA route would. Must be registered on the
 * v2 router with the full route path (not via .use(path)), so request.path
 * matches what the TSOA route sees.
 */
export function requireSecurity(
  securityName: "loggedin" | "verified",
): RequestHandler {
  return async function runSecurityCheck(
    request: Request,
    _response: Response,
    next: NextFunction,
  ) {
    try {
      await expressAuthentication(request, securityName)
    } catch (err) {
      const error = err as Error & { status?: number }
      error.status = error.status || 401
      next(error)
      return
    }
    next()
  }
}
