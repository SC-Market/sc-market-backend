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
import { matchV2Route, v2RouteTable, type V2Route } from "./v2-route-table.js"

type TokenCheckedRequest = Request & {
  __tokenInfo?: TokenInfo
  /** Set once the token's scope and org checks passed for this request. */
  __v2TokenChecked?: boolean
}

/**
 * Browser-session only: an API token is refused with 403 on every route here,
 * public ones included (it is not served as anonymous either).
 * - auth/mfa, admin/mfa: two-factor state and enrollment/verification.
 * - admin/test-accounts: test-account management.
 * - admin/identity: account identity fixes (services/identity-admin).
 * - debug: the viewer's resolved feature flags and per-user overrides
 *   (GET/POST debug/feature-flag, which the site uses for every user).
 * - public-api-tokens: public API token management (tokens can't mint or
 *   revoke tokens).
 */
const SESSION_ONLY_PREFIXES = [
  "auth/mfa",
  "admin/mfa",
  "admin/test-accounts",
  "admin/identity",
  "debug",
  "public-api-tokens",
]

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
    const tokenRequest = request as TokenCheckedRequest
    const tokenInfo = tokenRequest.__tokenInfo
    if (!tokenRequest.__v2TokenChecked) {
      enforceTokenScopes(tokenInfo, request.method, request.path)
      // ...and to the orgs the token was granted (contractor_ids).
      await enforceTokenOrgAccess(getKnex(), tokenInfo, request, user.user_id)
      if (tokenInfo) tokenRequest.__v2TokenChecked = true
    }

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

/**
 * Token checks for EVERY v2 route, not just @Security ones.
 *
 * populateUser fills req.user from a Bearer token on every request, and
 * TSOA only calls expressAuthentication (scopes, contractor_ids) for routes
 * that declare @Security. Public routes that read req.user (shop pages,
 * listing search and detail, buy orders, ...) therefore served a token's
 * identity with no scope or org check: e.g. a token restricted to other
 * orgs read its user's private org listings through GET /listings/{id}.
 *
 * Registered on the v2 router before RegisterRoutes. For a token request:
 * - @Security routes: the same checks expressAuthentication runs, here with
 *   the route's real path params (matched from the spec), answered 403;
 *   expressAuthentication then doesn't repeat them.
 * - public routes: the same checks; when they fail the request is served as
 *   anonymous (req.user and the token are dropped), so a token never lends
 *   its identity to a route its scopes or org grant don't cover, while public
 *   data stays readable.
 * Session and cookie requests are untouched.
 */
export function tokenRequestGuard(
  table: () => V2Route[] = v2RouteTable,
): RequestHandler {
  return async function guardTokenRequest(
    request: Request,
    _response: Response,
    next: NextFunction,
  ) {
    const req = request as TokenCheckedRequest
    const tokenInfo = req.__tokenInfo
    const user = req.user as User | undefined
    if (!tokenInfo || !user) return next()

    // Session-only routes refuse tokens outright, public ones included.
    if (isSessionOnlyPath(req.path)) {
      const err = new Error("API tokens cannot use this endpoint") as Error & {
        status: number
      }
      err.status = 403
      return next(err)
    }

    const match = matchV2Route(table(), req.method, req.path)
    const secured = match?.route.secured ?? true
    try {
      enforceTokenScopes(tokenInfo, req.method, req.path)
      await enforceTokenOrgAccess(
        getKnex(),
        tokenInfo,
        { path: req.path, params: match?.params ?? {}, query: req.query, body: req.body },
        user.user_id,
      )
      req.__v2TokenChecked = true
      next()
    } catch (err) {
      const error = err as Error & { status?: number }
      // Not a refusal (e.g. a DB error), or a refusal on a @Security route.
      if (error.status !== 403 || secured) return next(error)
      // A refusal on a public route: serve it as anonymous.
      req.user = undefined
      req.__tokenInfo = undefined
      ;(req as { auth?: unknown }).auth = undefined
      next()
    }
  }
}
