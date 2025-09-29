import { NextFunction, Request, Response } from "express"
import { User } from "../routes/v1/api-models.js"
import crypto from "crypto"

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
    // Dynamic import to avoid circular dependency
    const { database } = await import("../../clients/database/knex-db.js")

    // Validate token format
    if (!token.startsWith("scm_")) {
      return null
    }

    // Hash the token for database lookup
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex")

    // Look up token in database
    const tokenRecord = await database.knex("api_tokens")
      .where("token_hash", tokenHash)
      .where(function () {
        this.whereNull("expires_at").orWhere("expires_at", ">", new Date())
      })
      .first()

    if (!tokenRecord) {
      return null
    }

    // Get user information
    const user = await database.knex("accounts")
      .where("user_id", tokenRecord.user_id)
      .first()

    if (!user || user.banned) {
      return null
    }

    // Update last used timestamp
    await database.knex("api_tokens")
      .where("id", tokenRecord.id)
      .update({ last_used_at: new Date() })

    return {
      user: user as User,
      tokenInfo: {
        id: tokenRecord.id,
        name: tokenRecord.name,
        scopes: tokenRecord.scopes,
        expires_at: tokenRecord.expires_at,
        contractor_ids: tokenRecord.contractor_ids || [],
      },
    }
  } catch (error) {
    console.error("Token authentication error:", error)
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
          res.status(418).json({ error: "Internal server error" })
          return
        }
        if (
          authResult.user.role === "user" ||
          authResult.user.role === "admin"
        ) {
          next()
          return
        } else {
          res.status(403).json({ error: "Unauthorized" })
          return
        }
      } else {
        res.status(401).json({ error: "Invalid or expired token" })
        return
      }
    }

    // Fall back to session authentication
    if (req.isAuthenticated()) {
      const user = req.user as User
      const authReq = req as AuthRequest
      authReq.authMethod = "session"

      if (user.banned) {
        res.status(418).json({ error: "Internal server error" })
        return
      }
      if (user.role === "user" || user.role === "admin") {
        next()
        return
      } else {
        res.status(403).json({ error: "Unauthorized" })
        return
      }
    } else {
      res.status(401).json({ error: "Unauthenticated" })
      return
    }
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Bad request" })
    return
  }
}

export async function verifiedUser(
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

        // Apply same verification logic
        if (authResult.user.banned) {
          res.status(418).json({ error: "Internal server error" })
          return
        }
        if (!authResult.user.rsi_confirmed) {
          res.status(401).json({ error: "Your account is not verified." })
          return
        } else {
          next()
          return
        }
      } else {
        res.status(401).json({ error: "Invalid or expired token" })
        return
      }
    }

    // Fall back to session authentication
    if (req.isAuthenticated()) {
      const user = req.user as User
      const authReq = req as AuthRequest
      authReq.authMethod = "session"

      if (user.banned) {
        res.status(418).json({ error: "Internal server error" })
        return
      }
      if (!user.rsi_confirmed) {
        res.status(401).json({ error: "Your account is not verified." })
        return
      } else {
        next()
        return
      }
    } else {
      res.status(401).json({ error: "Unauthenticated" })
      return
    }
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Bad request" })
    return
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
          res.status(418).json({ error: "Internal server error" })
          return
        }
        if (authResult.user.role === "admin") {
          next()
          return
        } else {
          res.status(403).json({ error: "Unauthorized" })
          return
        }
      } else {
        res.status(401).json({ error: "Invalid or expired token" })
        return
      }
    }

    // Fall back to session authentication
    if (req.isAuthenticated()) {
      const user = req.user as User
      const authReq = req as AuthRequest
      authReq.authMethod = "session"

      if (user.banned) {
        res.status(418).json({ error: "Internal server error" })
        return
      }
      if (user.role === "admin") {
        next()
        return
      } else {
        res.status(403).json({ error: "Unauthorized" })
        return
      }
    } else {
      res.status(401).json({ error: "Unauthenticated" })
      return
    }
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Bad request" })
    return
  }
}

// Enhanced scope validation middleware
// This middleware should ONLY be used on private/authenticated endpoints
// Public endpoints should remain public regardless of token permissions
export function requireScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest
    
    // Skip validation for session-based auth (full access)
    if (authReq.authMethod === 'session') {
      return next()
    }
    
    // Token-based auth requires scope validation
    if (!authReq.token) {
      res.status(500).json({ 
        error: "Scope middleware used without token authentication" 
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
        method: req.method
      })
      return
    }

    next()
  }
}

// Convenience middleware for common scope patterns
export const requireProfileRead = requireScopes('profile:read')
export const requireProfileWrite = requireScopes('profile:write')
export const requireMarketRead = requireScopes('market:read')
export const requireMarketWrite = requireScopes('market:write')
export const requireMarketAdmin = requireScopes('market:admin')
export const requireOrdersRead = requireScopes('orders:read')
export const requireOrdersWrite = requireScopes('orders:write')
export const requireContractorsRead = requireScopes('contractors:read')
export const requireContractorsWrite = requireScopes('contractors:write')
export const requireServicesRead = requireScopes('services:read')
export const requireServicesWrite = requireScopes('services:write')
export const requireOffersRead = requireScopes('offers:read')
export const requireOffersWrite = requireScopes('offers:write')
export const requireChatsRead = requireScopes('chats:read')
export const requireChatsWrite = requireScopes('chats:write')
export const requireNotificationsRead = requireScopes('notifications:read')
export const requireNotificationsWrite = requireScopes('notifications:write')
export const requireModerationRead = requireScopes('moderation:read')
export const requireModerationWrite = requireScopes('moderation:write')
export const requireRecruitingRead = requireScopes('recruiting:read')
export const requireRecruitingWrite = requireScopes('recruiting:write')
export const requireCommentsRead = requireScopes('comments:read')
export const requireCommentsWrite = requireScopes('comments:write')
export const requireAdmin = requireScopes('admin')

// Contractor access control middleware
export function requireContractorAccess(contractorId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest
    
    // Skip validation for session-based auth (full access)
    if (authReq.authMethod === 'session') {
      return next()
    }
    
    // For token auth, check contractor access
    if (authReq.token) {
      const hasAccess = authReq.token.contractor_ids?.includes(contractorId) ||
                       authReq.token.scopes.includes('admin') ||
                       authReq.token.scopes.includes('full')
      
      if (!hasAccess) {
        res.status(403).json({
          error: "Token does not have access to this contractor",
          contractor_id: contractorId,
          granted_contractors: authReq.token.contractor_ids || []
        })
        return
      }
    }
    
    next()
  }
}

// Dynamic contractor access middleware (for route parameters)
export function requireContractorAccessFromParam(paramName: string = 'spectrum_id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contractorParam = req.params[paramName]
    if (!contractorParam) {
      res.status(400).json({
        error: `Missing ${paramName} parameter`
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
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthRequest
    const spectrum_id = req.params['spectrum_id']
    
    if (!spectrum_id) {
      res.status(400).json({
        error: 'Missing spectrum_id parameter'
      })
      return
    }
    
    // Skip validation for session-based auth (full access)
    if (authReq.authMethod === 'session') {
      return next()
    }
    
    // For token auth, we need to get the contractor ID from spectrum_id
    if (authReq.token) {
      try {
        // Dynamic import to avoid circular dependency
        const { database } = await import("../../clients/database/knex-db.js")
        const contractor = await database.getContractor({ spectrum_id })
        
        if (!contractor) {
          res.status(404).json({
            error: "Contractor not found"
          })
          return
        }
        
        const hasAccess = authReq.token.contractor_ids?.includes(contractor.contractor_id) ||
                         authReq.token.scopes.includes('admin') ||
                         authReq.token.scopes.includes('full')
        
        if (!hasAccess) {
          res.status(403).json({
            error: "Token does not have access to this contractor",
            contractor_id: contractor.contractor_id,
            spectrum_id: spectrum_id,
            granted_contractors: authReq.token.contractor_ids || []
          })
          return
        }
      } catch (error) {
        console.error('Contractor access validation error:', error)
        res.status(500).json({
          error: "Failed to validate contractor access"
        })
        return
      }
    }
    
    next()
  }
}


// Don't try to make this file depend on `database` or everything will break
