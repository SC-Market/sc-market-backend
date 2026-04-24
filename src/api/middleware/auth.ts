/**
 * V1 Auth Middleware
 *
 * req.user is already populated by the early `populate-user` middleware
 * (Bearer token, JWT cookie, or Passport session). These helpers just
 * check that it exists and meets the required conditions.
 */

import { NextFunction, Request, Response } from "express"
import { User } from "../routes/v1/api-models.js"
import {
  createErrorResponse,
  createForbiddenErrorResponse,
  createUnauthorizedErrorResponse,
} from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import logger from "../../logger/logger.js"

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: User
  token?: {
    id: string
    name: string
    scopes: string[]
    expires_at?: Date
    contractor_ids?: string[]
  }
  authMethod?: "session" | "token" | "jwt"
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getUser(req: Request): User | undefined {
  return req.user as User | undefined
}

function getTokenInfo(req: Request): AuthRequest["token"] | undefined {
  return (req as any).__tokenInfo
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
  err: any,
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
  if (user.role !== "user" && user.role !== "admin") {
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
  if (user.role !== "admin") {
    res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
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

export function requireScopes(...requiredScopes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const isReadOnly = requiredScopes.every((s) => s.endsWith(":read"))
    if (!(await verifiedUser(req, res, isReadOnly))) return

    // Session / JWT cookie auth → full access, no scope check
    if (!isTokenAuth(req)) return next()

    const tokenInfo = getTokenInfo(req)!
    const userScopes = tokenInfo.scopes

    const isAdminScope = (s: string) =>
      s.startsWith("admin:") || s === "admin" ||
      s === "moderation:read" || s === "moderation:write"

    const ok = requiredScopes.every((scope) => {
      if (userScopes.includes(scope)) return true
      if (userScopes.includes("admin")) return true
      if (userScopes.includes("full") && !isAdminScope(scope)) return true
      if (userScopes.includes("readonly") && scope.endsWith(":read") && !isAdminScope(scope)) return true
      return false
    })

    if (!ok) {
      res.status(403).json(
        createErrorResponse(ErrorCode.FORBIDDEN, "Insufficient token permissions"),
      )
      return
    }
    next()
  }
}

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
