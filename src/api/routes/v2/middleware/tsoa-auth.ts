/**
 * TSOA Authentication Handler
 *
 * Called by TSOA when a route has @Security("loggedin").
 * req.user is already populated by the early populate-user middleware,
 * so this just checks it exists.
 */

import { Request } from "express"
import { User } from "../../v1/api-models.js"

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
    return user
  }

  throw new Error(`Unknown security name: ${securityName}`)
}
