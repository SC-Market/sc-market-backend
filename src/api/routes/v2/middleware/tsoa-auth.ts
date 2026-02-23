/**
 * TSOA Authentication Handler
 *
 * Provides authentication for TSOA @Security decorator.
 * Integrates with existing Passport.js session authentication and JWT token authentication.
 */

import { Request } from "express"
import { User } from "../../v1/api-models.js"
import crypto from "crypto"
import { database } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../../v1/profiles/database.js"
import logger from "../../../../logger/logger.js"

/**
 * Authenticate token from Authorization header
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
 * TSOA authentication function
 *
 * This function is called by TSOA when a route has @Security("jwt") decorator.
 * It should return the authenticated user or throw an error.
 *
 * @param request - Express request object
 * @param securityName - The security name from @Security decorator (e.g., "jwt")
 * @param scopes - Optional scopes from @Security decorator
 */
export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<User> {
  if (securityName === "jwt") {
    // Check for Bearer token authentication
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7) // Remove 'Bearer ' prefix
      const authResult = await authenticateToken(token)

      if (authResult) {
        // Attach user to request for controller access
        request.user = authResult.user

        // Validate user is not banned
        if (authResult.user.banned) {
          throw new Error("User is banned")
        }

        // Validate scopes if provided
        if (scopes && scopes.length > 0) {
          const userScopes = authResult.tokenInfo.scopes
          const hasAllScopes = scopes.every(
            (scope) =>
              userScopes.includes(scope) ||
              userScopes.includes("admin") ||
              userScopes.includes("full"),
          )

          if (!hasAllScopes) {
            throw new Error(
              `Insufficient permissions. Required: ${scopes.join(", ")}`,
            )
          }
        }

        return authResult.user
      } else {
        throw new Error("Invalid or expired token")
      }
    }

    // Fall back to session authentication
    if (request.isAuthenticated && request.isAuthenticated()) {
      const user = request.user as User

      // Validate user is not banned
      if (user.banned) {
        throw new Error("User is banned")
      }

      // Session auth has full access, no scope validation needed
      return user
    }

    // No valid authentication found
    throw new Error("Authentication required")
  }

  // Unknown security name
  throw new Error(`Unknown security name: ${securityName}`)
}
