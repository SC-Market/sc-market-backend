import { Request } from "express"
import { User } from "../routes/v1/api-models.js"
import crypto from "crypto"
import { database } from "../../clients/database/knex-db.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import logger from "../../logger/logger.js"

/**
 * Extended Request interface for token support
 */
interface AuthRequest extends Request {
  token?: {
    id: string
    name: string
    scopes: string[]
    expires_at?: Date
    contractor_ids?: string[]
  }
  authMethod?: "session" | "token"
}

/**
 * Token authentication helper
 * Validates bearer tokens and returns user information
 */
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

    // Get user information
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

/**
 * TSOA authentication handler
 * Called by TSOA-generated routes to validate authentication
 * 
 * Supports two authentication methods:
 * 1. sessionAuth - Passport.js session-based authentication
 * 2. bearerAuth - Bearer token authentication
 * 
 * @param request - Express request object
 * @param securityName - Security scheme name (sessionAuth or bearerAuth)
 * @param scopes - Optional array of required scopes for authorization
 * @returns Authenticated user object
 * @throws Error if authentication fails
 */
export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<User> {
  if (securityName === "sessionAuth") {
    // Session-based authentication using Passport.js
    if (request.isAuthenticated()) {
      const user = request.user as User
      const authReq = request as AuthRequest

      // Check if user is banned
      if (user.banned) {
        throw new Error("User is banned")
      }

      // Attach auth method for later use
      authReq.authMethod = "session"

      // Check scopes if provided
      if (scopes && scopes.length > 0) {
        // Admin scope check
        if (scopes.includes("admin") && user.role !== "admin") {
          throw new Error("Admin access required")
        }
      }

      return user
    }
    throw new Error("Not authenticated")
  }

  if (securityName === "bearerAuth") {
    // Token-based authentication
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("No bearer token provided")
    }

    const token = authHeader.substring(7)
    const authResult = await authenticateToken(token)

    if (!authResult) {
      throw new Error("Invalid or expired token")
    }

    const authReq = request as AuthRequest

    // Attach token info and auth method to request for later use
    authReq.token = authResult.tokenInfo
    authReq.authMethod = "token"

    // Check scopes if provided
    if (scopes && scopes.length > 0) {
      const userScopes = authResult.tokenInfo.scopes

      // Check if user has all required scopes
      const hasAllScopes = scopes.every(
        (scope) =>
          userScopes.includes(scope) ||
          userScopes.includes("admin") || // Admin has all scopes
          userScopes.includes("full"), // Full access has all non-admin scopes
      )

      if (!hasAllScopes) {
        throw new Error("Insufficient permissions")
      }
    }

    return authResult.user
  }

  throw new Error("Unknown security scheme")
}
