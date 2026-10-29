/**
 * V1 Auth Middleware
 *
 * req.user is already populated by the early `populate-user` middleware
 * (Bearer token, JWT cookie, or Passport session). These helpers just
 * check that it exists and meets the required conditions.
 */

import { NextFunction, Request, Response } from "express"
import { effectiveTokenScopes } from "../util/token-scope-catalog.js"
import { User } from "../routes/v1/api-models.js"
import {
  createErrorResponse,
  createForbiddenErrorResponse,
  createUnauthorizedErrorResponse,
} from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import logger from "../../logger/logger.js"
import { isKnownSiteRole, isSiteAdmin } from "../util/site-role.js"
import { adminLockResponse } from "../util/site-admin-policy.js"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  assertTokenMayUseOrg,
  tokenAllowsOrg,
  tokenOrgScope,
  type TokenOrgScope,
} from "../routes/v2/middleware/token-org-access.js"

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: User
  token?: Request["__tokenInfo"]
  authMethod?: "session" | "token" | "jwt"
}

/**
 * Shape of the errors that reach this middleware: a plain `Error` optionally
 * decorated with an HTTP status and validation details by upstream libraries.
 */
interface HttpErrorLike extends Error {
  status?: number
  errors?: unknown
  validationErrors?: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getUser(req: Request): User | undefined {
  return req.user as User | undefined
}

function getTokenInfo(req: Request): AuthRequest["token"] | undefined {
  return req.__tokenInfo
}

function isTokenAuth(req: Request): boolean {
  return !!getTokenInfo(req)
}

// ── Core middleware ────────────────────────────────────────────────────────

export function pageAuthentication(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (getUser(req)) {
    next()
  } else {
    res.redirect("/auth/discord")
  }
}

export async function guestAuthorized(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (getUser(req)) {
    next()
  } else {
    res.status(401).json({ error: "Unauthenticated" })
  }
}

export function errorHandler(
  err: HttpErrorLike,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) return next(err)
  res.status(err.status || 500).json({
    message: err.message,
    errors: err.errors,
    validationErrors: err.validationErrors,
  })
}

export async function userAuthorized(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = getUser(req)
  if (!user) {
    res.status(401).json(createUnauthorizedErrorResponse())
    return
  }
  if (user.banned) {
    res.status(418).json(createErrorResponse({ message: "Internal server error" }))
    return
  }
  if (!isKnownSiteRole(user.role)) {
    res.status(403).json(createForbiddenErrorResponse())
    return
  }
  next()
}

/**
 * Check that the user is authenticated (and optionally RSI-verified).
 * Used as a gate inside route handlers, not as middleware.
 */
export async function verifiedUser(
  req: Request,
  res: Response,
  allowUnverified?: boolean,
): Promise<boolean> {
  const user = getUser(req)
  if (!user) {
    res.status(401).json(createErrorResponse({ message: "Unauthenticated" }))
    return false
  }
  if (user.banned) {
    res.status(418).json(createErrorResponse({ message: "Internal server error" }))
    return false
  }
  if (!allowUnverified && !user.rsi_confirmed) {
    res.status(401).json(createErrorResponse({ message: "Your account is not verified." }))
    return false
  }
  return true
}

export async function adminAuthorized(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = getUser(req)
  if (!user) {
    res.status(401).json(createErrorResponse({ message: "Unauthenticated" }))
    return
  }
  if (user.banned) {
    res.status(418).json(createErrorResponse({ message: "Internal server error" }))
    return
  }
  if (!isSiteAdmin(user)) {
    res
      .status(403)
      .json(adminLockResponse(req) ?? createErrorResponse({ message: "Unauthorized" }))
    return
  }
  // For token auth, also require admin scope
  const tokenInfo = getTokenInfo(req)
  if (tokenInfo && !(tokenInfo.scopes as string[]).includes("admin")) {
    res.status(403).json(
      createErrorResponse(ErrorCode.FORBIDDEN, "Token requires admin scope"),
    )
    return
  }
  next()
}

// ── Middleware wrappers ────────────────────────────────────────────────────

export async function requireVerifiedUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (await verifiedUser(req, res, false)) next()
}

export const verifiedUserMiddleware = requireVerifiedUser

// ── Scope validation ───────────────────────────────────────────────────────

/**
 * Marks a middleware as a token scope (or session-only) check, so tests can
 * verify that every authenticated v1 route has one.
 */
export const TOKEN_SCOPE_CHECK = Symbol("tokenScopeCheck")
type ScopeChecked<T> = T & { [TOKEN_SCOPE_CHECK]: readonly string[] }
function markScopeCheck<T extends object>(fn: T, scopes: readonly string[]): ScopeChecked<T> {
  return Object.assign(fn, { [TOKEN_SCOPE_CHECK]: scopes })
}

export function requireScopes(...requiredScopes: string[]) {
  return markScopeCheck(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const isReadOnly = requiredScopes.every((s) => s.endsWith(":read"))
    if (!(await verifiedUser(req, res, isReadOnly))) return

    // Session / JWT cookie auth → full access, no scope check
    if (!isTokenAuth(req)) return next()

    if (!tokenGrantsScopes(req, requiredScopes)) {
      res.status(403).json(
        createErrorResponse(ErrorCode.FORBIDDEN, "Insufficient token permissions"),
      )
      return
    }
    next()
  }, requiredScopes)
}

/** Whether the request's API token grants every one of `requiredScopes`. */
function tokenGrantsScopes(req: Request, requiredScopes: string[]): boolean {
  const tokenInfo = getTokenInfo(req)
  if (!tokenInfo) return true
  // Retired scopes (token-scope-catalog.ts) count for nothing.
  const userScopes = effectiveTokenScopes(tokenInfo.scopes)

  const isAdminScope = (s: string) =>
    s.startsWith("admin:") || s === "admin" ||
    s === "moderation:read" || s === "moderation:write"

  return requiredScopes.every((scope) => {
    if (userScopes.includes(scope)) return true
    if (userScopes.includes("admin")) return true
    if (userScopes.includes("full") && !isAdminScope(scope)) return true
    if (userScopes.includes("readonly") && scope.endsWith(":read") && !isAdminScope(scope)) return true
    return false
  })
}

/**
 * Token scope check alone, for routes whose authentication middleware
 * (userAuthorized, requireVerifiedUser, ...) already decides who may call them.
 * Unlike requireScopes it adds no RSI-verification requirement, so session
 * users see no change; an API token without the scopes gets a 403.
 */
export function requireTokenScopes(...requiredScopes: string[]) {
  return markScopeCheck((req: Request, res: Response, next: NextFunction): void => {
    if (!tokenGrantsScopes(req, requiredScopes)) {
      res.status(403).json(
        createErrorResponse(ErrorCode.FORBIDDEN, "Insufficient token permissions"),
      )
      return
    }
    next()
  }, requiredScopes)
}

/**
 * Browser sessions only: an API token is refused with 403. For calls no token
 * should make (account identity, email, the full data export), whatever its
 * scopes. A Bearer `scm_` header counts even when the token is invalid, so a
 * bad token can't be mistaken for a session.
 */
export const requireSessionAuth = markScopeCheck(function requireSessionAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization
  if (isTokenAuth(req) || (authHeader && authHeader.startsWith("Bearer scm_"))) {
    res.status(403).json(
      createErrorResponse(ErrorCode.FORBIDDEN, "API tokens cannot use this endpoint"),
    )
    return
  }
  next()
}, ["session-only"])

/**
 * Identity: who the token (or session) belongs to. Deliberately readable with
 * any valid token, whatever its scopes: the API token guide tells token users
 * to check a token with GET /api/v1/profile. Only authentication is required.
 */
export const anyTokenIdentity = markScopeCheck(
  (req: Request, res: Response, next: NextFunction) => userAuthorized(req, res, next),
  ["any-token"],
)

// ── Convenience scope middleware ────────────────────────────────────────────

export const requireProfileRead = requireScopes("profile:read")
export const requireProfileWrite = requireScopes("profile:write")
export const requireMarketRead = requireScopes("market:read")
export const requireMarketWrite = requireScopes("market:write")
export const requireOrdersRead = requireScopes("orders:read")
export const requireOrdersWrite = requireScopes("orders:write")
export const requireContractorsRead = requireScopes("contractors:read")
export const requireContractorsWrite = requireScopes("contractors:write")
export const requireServicesRead = requireScopes("services:read")
export const requireServicesWrite = requireScopes("services:write")
export const requireOffersRead = requireScopes("offers:read")
export const requireOffersWrite = requireScopes("offers:write")
export const requireChatsRead = requireScopes("chats:read")
export const requireChatsWrite = requireScopes("chats:write")
export const requireNotificationsRead = requireScopes("notifications:read")
export const requireNotificationsWrite = requireScopes("notifications:write")
export const requireModerationRead = requireScopes("moderation:read")
export const requireModerationWrite = requireScopes("moderation:write")
export const requireCommentsRead = requireScopes("comments:read")
export const requireCommentsWrite = requireScopes("comments:write")
export const requireRecruitingRead = requireScopes("recruiting:read")
export const requireRecruitingWrite = requireScopes("recruiting:write")
export const requireMarketAdmin = requireScopes("admin")
export const requireAdmin = requireScopes("admin")

// ── Contractor access control ──────────────────────────────────────────────

/** The orgs this request's API token may act for; null when unrestricted. */
export function requestTokenOrgScope(req: Request): TokenOrgScope {
  return tokenOrgScope(getTokenInfo(req))
}

/**
 * For handlers and middleware that already resolved the org a request acts
 * for: answers 403 and returns false when the request's API token wasn't
 * granted that org and the user is a member of it (the v2 rule,
 * token-org-access.ts). Sessions, full/admin tokens and personal resources
 * (no org) pass.
 */
export async function tokenMayUseOrg(
  req: Request,
  res: Response,
  contractorId: string | null | undefined,
): Promise<boolean> {
  const user = getUser(req)
  if (!user) return true
  if (tokenAllowsOrg(tokenOrgScope(getTokenInfo(req)), contractorId)) return true
  try {
    await assertTokenMayUseOrg(getKnex(), getTokenInfo(req), contractorId, user.user_id)
    return true
  } catch (error) {
    if ((error as { status?: number }).status !== 403) throw error
    res.status(403).json(
      createErrorResponse(ErrorCode.FORBIDDEN, "Token does not have access to this contractor"),
    )
    return false
  }
}

export function requireContractorAccess(contractorId: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!(await verifiedUser(req, res))) return

    const tokenInfo = getTokenInfo(req)
    if (tokenInfo) {
      const hasAccess =
        tokenInfo.contractor_ids?.includes(contractorId) ||
        tokenInfo.scopes.includes("admin") ||
        tokenInfo.scopes.includes("full")
      if (!hasAccess) {
        res.status(403).json(
          createErrorResponse(ErrorCode.FORBIDDEN, "Token does not have access to this contractor"),
        )
        return
      }
    }
    next()
  }
}

export function requireContractorAccessFromParam(paramName: string = "spectrum_id") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!(await verifiedUser(req, res))) return
    const param = req.params[paramName]
    if (!param) {
      res.status(400).json({ error: `Missing ${paramName} parameter` })
      return
    }
    return requireContractorAccess(param)(req, res, next)
  }
}

export function requireContractorAccessFromSpectrumId() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!(await verifiedUser(req, res))) return
    const spectrum_id = req.params["spectrum_id"]
    if (!spectrum_id) {
      res.status(400).json({ error: "Missing spectrum_id parameter" })
      return
    }

    const tokenInfo = getTokenInfo(req)
    if (!tokenInfo) return next() // session/JWT → full access

    try {
      const contractor = await contractorDb.getContractor({ spectrum_id })
      const hasAccess =
        tokenInfo.contractor_ids?.includes(contractor.contractor_id) ||
        tokenInfo.scopes.includes("admin") ||
        tokenInfo.scopes.includes("full")
      if (!hasAccess) {
        res.status(403).json(
          createErrorResponse(ErrorCode.FORBIDDEN, "Token does not have access to this contractor"),
        )
        return
      }
    } catch {
      res.status(404).json({ error: "Contractor not found" })
      return
    }
    next()
  }
}
