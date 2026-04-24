/**
 * Early auth middleware — runs on every request to populate req.user.
 *
 * Order of precedence:
 *   1. Passport session (already set by passport.session())
 *   2. Bearer token (Authorization: Bearer scm_...)
 *   3. JWT cookie (scmarket.access)
 *
 * Never blocks — if auth fails, req.user stays undefined and the request
 * continues. Protected routes use @Security("loggedin") to gate access.
 */

import { Request, Response, NextFunction } from "express"
import crypto from "crypto"
import { database } from "../../clients/database/knex-db.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import {
  isJWTAuthEnabled,
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "../util/jwt.js"
import logger from "../../logger/logger.js"

export async function populateUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // 1. Session already populated by passport.session() — nothing to do
  if (req.user) return next()

  try {
    // 2. Bearer token
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7)
      if (token.startsWith("scm_")) {
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex")
        const tokenRecord = await database
          .knex("api_tokens")
          .where("token_hash", tokenHash)
          .whereNull("revoked_at")
          .where(function (this: any) {
            this.whereNull("expires_at").orWhere("expires_at", ">", new Date())
          })
          .first()

        if (tokenRecord) {
          const user = await profileDb.getUser({
            user_id: tokenRecord.user_id,
          })
          if (user && !user.banned) {
            req.user = user
            // Stash token metadata for scope checks downstream
            ;(req as any).__tokenInfo = {
              id: tokenRecord.id,
              name: tokenRecord.name,
              scopes: tokenRecord.scopes,
              expires_at: tokenRecord.expires_at,
              contractor_ids: tokenRecord.contractor_ids || [],
            }
            // Fire-and-forget last_used update
            database
              .knex("api_tokens")
              .where("id", tokenRecord.id)
              .update({ last_used_at: new Date() })
              .catch(() => {})
          }
        }
      }
    }

    // 3. JWT cookie
    if (!req.user && isJWTAuthEnabled()) {
      const accessToken = getAccessTokenFromRequest(req)
      if (accessToken) {
        const payload = verifyAccessToken(accessToken)
        if (payload) {
          try {
            const user = await profileDb.getUser({ user_id: payload.sub })
            if (user && !user.banned) {
              req.user = user
            }
          } catch {
            // user not found — continue unauthenticated
          }
        }
      }
    }
  } catch (err) {
    logger.error("[populateUser] unexpected error", { error: err })
  }

  next()
}
