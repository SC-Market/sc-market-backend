import { NextFunction, Request, Response } from "express"
import { User } from "../routes/v1/api-models.js"
import crypto from "crypto"
import {
  createErrorResponse,
  createUnauthorizedErrorResponse,
  createForbiddenErrorResponse,
} from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import { database } from "../../clients/database/knex-db.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import logger from "../../logger/logger.js"

// Extended Request interface for token support
export interface AuthRequest extends Request {
  user?: User
  token?: {
    id: string
    name: string
    scopes: string[]
    expires_at?: Date
    contractor_ids?: string[]
  }
  authMethod?: "session" | "token"
}

// Token authentication helper - we'll import database dynamically to avoid circular deps
async function authenticateToken(
  token: string,
): Promise<{ user: User; tokenInfo: any } | null> {
  try {
    // Validate token format
    if (!token.startsWith("scm_")) {
      return null
    }

    // Hash the token for database lookup
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex")

    // Look up token in database
    const tokenRecord = await database
      .knex("api_tokens")
      .where("token_hash", tokenHash)
      .where(function (this: any) {
        this.whereNull("expires_at").orWhere("expires_at", ">", new Date())
      })
      .first()

    if (!tokenRecord) {
      return null
    }

    // Get user information using getUser to ensure correct User type (excludes discord_id)
    const user = await profileDb.getUser({ user_id: tokenRecord.user_id })

    if (!user || user.banned) {
      return null
    }

    // Update last used timestamp
    await database
      .knex("api_tokens")
      .where("id", tokenRecord.id)
      .update({ last_used_at: new Date() })

    return {
      user: user,
      tokenInfo: {
        id: tokenRecord.id,
        name: tokenRecord.name,
        scopes: tokenRecord.scopes,
        expires_at: tokenRecord.expires_at,
        contractor_ids: tokenRecord.contractor_ids || [],
      },
    }
  } catch (error) {
    logger.error("Token authentication error", { error })
    return null
  }
}

export function pageAuthentication(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.isAuthenticated()) {
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
  if (req.isAuthenticated()) {
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
  if (res.headersSent) {
    return next(err)
  }

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
  try {
    // Check for token authentication first
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7) // Remove 'Bearer ' prefix
      const authResult = await authenticateToken(token)

      if (authResult) {
        const authReq = req as AuthRequest
        authReq.user = authResult.user
        authReq.token = authResult.tokenInfo
        authReq.authMethod = "token"

        // Apply same user validation logic
        if (authResult.user.banned) {
          res
            .status(418)
            .json(createErrorResponse({ message: "Internal server error" }))
          return
        }
        if (
          authResult.user.role === "user" ||
          authResult.user.role === "admin"
        ) {
          next()
          return
        } else {
          res.status(403).json(createForbiddenErrorResponse())
          return
        }
      } else {
        res
          .status(401)
          .json(createUnauthorizedErrorResponse("Invalid or expired token"))
        return
      }
    }

    // Fall back to session authentication
    if (req.isAuthenticated()) {
      const user = req.user // Express.User now extends our User type
      const authReq = req as AuthRequest
      authReq.authMethod = "session"

      if (user.banned) {
        res
          .status(418)
          .json(createErrorResponse({ message: "Internal server error" }))
        return
      }
      if (user.role === "user" || user.role === "admin") {
        next()
        return
      } else {
        res.status(403).json(createForbiddenErrorResponse())
        return
      }
    } else {
      res.status(401).json(createUnauthorizedErrorResponse())
      return
    }
  } catch (e) {
    logger.error("Error in userAuthorized", { error: e })
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Bad request"))
    return
  }
}

export async function verifiedUser(
  req: Request,
  res: Response,
  allowUnverified?: boolean,
): Promise<boolean> {
  try {
    if (req.isAuthenticated()) {
      const user = req.user as User
      const authReq = req as AuthRequest
      authReq.authMethod = "session"

      if (user.banned) {
        res
          .status(418)
          .json(createErrorResponse({ message: "Internal server error" }))
        return false
      }

      if (!allowUnverified && !user.rsi_confirmed) {
        res
          .status(401)
          .json(
            createErrorResponse({ message: "Your account is not verified." }),
          )
        return false
      }

      return true
    }

    // Check for token authentication first
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7) // Remove 'Bearer ' prefix
      const authResult = await authenticateToken(token)

      if (authResult) {
        const authReq = req as AuthRequest
        authReq.user = authResult.user
        authReq.token = authResult.tokenInfo
        authReq.authMethod = "token"

        // Apply same verification logic
        if (authResult.user.banned) {
          res
            .status(418)
            .json(createErrorResponse({ message: "Internal server error" }))
          return false
        }
        if (!allowUnverified && !authResult.user.rsi_confirmed) {
          res
            .status(401)
            .json(
              createErrorResponse({ message: "Your account is not verified." }),
            )
          return false
        }
        return true
      } else {
        res
          .status(401)
          .json(createErrorResponse({ message: "Invalid or expired token" }))
        return false
      }
    } else {
      res.status(401).json(createErrorResponse({ message: "Unauthenticated" }))
      return false
    }
  } catch (e) {
    logger.error("Error in verifiedUser", { error: e })
    res.status(400).json(createErrorResponse({ message: "Bad request" }))
    return false
  }
}

export async function adminAuthorized(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Check for token authentication first
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7) // Remove 'Bearer ' prefix
      const authResult = await authenticateToken(token)

      if (authResult) {
        const authReq = req as AuthRequest
        authReq.user = authResult.user
        authReq.token = authResult.tokenInfo
        authReq.authMethod = "token"

        // Apply same admin validation logic
        if (authResult.user.banned) {
          res
            .status(418)
            .json(createErrorResponse({ message: "Internal server error" }))
          return
        }
        if (authResult.user.role === "admin") {
          next()
          return
        } else {
          res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
          return
        }
      } else {
        res
          .status(401)
          .json(createErrorResponse({ message: "Invalid or expired token" }))
        return
      }
    }

    // Fall back to session authentication
    if (req.isAuthenticated()) {
      const user = req.user // Express.User now extends our User type
      const authReq = req as AuthRequest
      authReq.authMethod = "session"

      if (user.banned) {
        res
          .status(418)
          .json(createErrorResponse({ message: "Internal server error" }))
        return
      }
      if (user.role === "admin") {
        next()
        return
      } else {
        res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
        return
      }
    } else {
      res.status(401).json(createErrorResponse({ message: "Unauthenticated" }))
      return
    }
  } catch (e) {
    logger.error("Error in verifiedUser", { error: e })
    res.status(400).json(createErrorResponse({ message: "Bad request" }))
    return
  }
}

// Middleware wrapper for verifiedUser that can be used in routes
// This is the default middleware that requires verification
export async function requireVerifiedUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (await verifiedUser(req, res, false)) {
    next()
  }
}

// Alias for backward compatibility - verifiedUser can be used as middleware
export const verifiedUserMiddleware = requireVerifiedUser

// Enhanced scope validation middleware
// This middleware should ONLY be used on private/authenticated endpoints
// Public endpoints should remain public regardless of token permissions
export function requireScopes(...requiredScopes: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Allow unverified users for read-only scopes (they can view their own data)
    const isReadOnly = requiredScopes.every((scope) => scope.endsWith(":read"))
    if (!(await verifiedUser(req, res, isReadOnly))) {
      return
    }
    const authReq = req as AuthRequest

    // Skip validation for session-based auth (full access)
    if (authReq.authMethod === "session") {
      return next()
    }

    // Token-based auth requires scope validation
    if (!authReq.token) {
      res.status(500).json({
        error: "Scope middleware used without token authentication",
      })
      return
    }

    const userScopes = authReq.token.scopes

    // Check if user has all required scopes
    const hasAllScopes = requiredScopes.every(
      (scope) =>
        userScopes.includes(scope) ||
        userScopes.includes("admin") || // Admin has all scopes
        userScopes.includes("full"), // Full access has all non-admin scopes
    )

    if (!hasAllScopes) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: requiredScopes,
        granted: userScopes,
        endpoint: req.path,
        method: req.method,
        token_id: authReq.token.id,
      })
      return
    }

    next()
  }
}

// Convenience middleware for common scope patterns
export const requireProfileRead = requireScopes("profile:read")
export const requireProfileWrite = requireScopes("profile:write")
export const requireMarketRead = requireScopes("market:read")
export const requireMarketWrite = requireScopes("market:write")
export const requireMarketAdmin = requireScopes("market:admin")
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
export const requireRecruitingRead = requireScopes("recruiting:read")
export const requireRecruitingWrite = requireScopes("recruiting:write")
export const requireCommentsRead = requireScopes("comments:read")
export const requireCommentsWrite = requireScopes("comments:write")
export const requireAdmin = requireScopes("admin")

// Contractor access control middleware
export function requireContractorAccess(contractorId: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!(await verifiedUser(req, res))) {
      return
    }
    const authReq = req as AuthRequest

    // Skip validation for session-based auth (full access)
    if (authReq.authMethod === "session") {
      return next()
    }

    // For token auth, check contractor access
    if (authReq.token) {
      const hasAccess =
        authReq.token.contractor_ids?.includes(contractorId) ||
        authReq.token.scopes.includes("admin") ||
        authReq.token.scopes.includes("full")

      if (!hasAccess) {
        res.status(403).json({
          error: "Token does not have access to this contractor",
          contractor_id: contractorId,
          granted_contractors: authReq.token.contractor_ids || [],
          token_id: authReq.token.id,
        })
        return
      }
    }

    next()
  }
}

// Dynamic contractor access middleware (for route parameters)
export function requireContractorAccessFromParam(
  paramName: string = "spectrum_id",
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!(await verifiedUser(req, res))) {
      return
    }
    const contractorParam = req.params[paramName]
    if (!contractorParam) {
      res.status(400).json({
        error: `Missing ${paramName} parameter`,
      })
      return
    }

    // For spectrum_id, we need to get the contractor ID from the spectrum_id
    // This will be handled by the contractor middleware that runs before this
    return requireContractorAccess(contractorParam)(req, res, next)
  }
}

// Contractor access middleware that works with spectrum_id
export function requireContractorAccessFromSpectrumId() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const authReq = req as AuthRequest
    const spectrum_id = req.params["spectrum_id"]

    if (!spectrum_id) {
      res.status(400).json({
        error: "Missing spectrum_id parameter",
      })
      return
    }

    // Skip validation for session-based auth (full access)
    if (authReq.authMethod === "session") {
      return next()
    }

    // For token auth, we need to get the contractor ID from spectrum_id
    if (authReq.token) {
      try {
        let contractor
        try {
          contractor = await contractorDb.getContractor({ spectrum_id })
        } catch (error) {
          res.status(404).json({
            error: "Contractor not found",
          })
          return
        }

        const hasAccess =
          authReq.token.contractor_ids?.includes(contractor.contractor_id) ||
          authReq.token.scopes.includes("admin") ||
          authReq.token.scopes.includes("full")

        if (!hasAccess) {
          res.status(403).json({
            error: "Token does not have access to this contractor",
            contractor_id: contractor.contractor_id,
            spectrum_id: spectrum_id,
            contractor_name: contractor.name,
            granted_contractors: authReq.token.contractor_ids || [],
            token_id: authReq.token.id,
          })
          return
        }
      } catch (error) {
        logger.error("Contractor access validation error", { error })
        res.status(500).json({
          error: "Failed to validate contractor access",
        })
        return
      }
    }

    next()
  }
}

export function sessionCleanupMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const rawCookie = req.headers.cookie || ""
  const matches = rawCookie.match(/connect\.sid=/g) || []

  // If multiple session cookies exist, force cleanup once
  if (matches.length > 1 && req.cookies?.session_cleanup !== "1") {
    const paths = ["/", "/api"]

    for (const path of paths) {
      res.clearCookie("connect.sid", { path })
      res.clearCookie("connect.sid", { path, secure: true })
    }

    res.cookie("session_cleanup", "1", {
      maxAge: 60 * 1000, // 1 minute
      path: "/",
      httpOnly: true,
    })

    return res.redirect("/login?reason=session_reset")
  }

  next()
}

// Don't try to make this file depend on `database` or everything will break
