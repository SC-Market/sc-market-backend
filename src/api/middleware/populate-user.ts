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
import { Knex } from "knex"
import crypto from "crypto"
import { database } from "../../clients/database/knex-db.js"
import { DBApiToken } from "../../clients/database/db-models.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import {
  isJWTAuthEnabled,
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "../util/jwt.js"
import logger from "../../logger/logger.js"
import { applySiteRolePolicy } from "../util/site-admin-policy.js"
import { runInRequestContext } from "../util/request-context.js"
import type { RequestAuth } from "../../services/mfa/policy.js"
import { tokenUsage } from "../../services/public-api/usage-recorder.js"
import { applyLegacyTokenDeprecation } from "../../services/public-api/legacy-deprecation.js"

export async function populateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolveUser(req, res)
  // Decide whether a site admin may use the role on this request, then run
  // the rest of the chain in a request context so has_permission() sees the
  // same effective user as req.user.
  await applySiteRolePolicy(req)
  runInRequestContext(req, res, next)
}

/** MFA claims of a valid JWT access cookie, if it belongs to `userId`. */
export function jwtAuthFor(req: Request, userId: string): RequestAuth | null {
  if (!isJWTAuthEnabled()) return null
  const accessToken = getAccessTokenFromRequest(req)
  const payload = accessToken ? verifyAccessToken(accessToken) : null
  if (!payload || payload.sub !== userId) return null
  return { method: "jwt", sid: payload.sid, mfaAt: payload.mfa_at, amr: payload.amr }
}

async function resolveUser(req: Request, res: Response): Promise<void> {
  // 1. Session already populated by passport.session(). Legacy passport
  // sessions carry no MFA; a JWT cookie for the same user (set by every login
  // since JWT auth shipped) supplies the session's MFA claims.
  if (req.user) {
    req.auth = jwtAuthFor(req, req.user.user_id) ?? { method: "session" }
    return
  }

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
        const tokenRecord: DBApiToken | undefined = await database
          .knex<DBApiToken>("api_tokens")
          .where("token_hash", tokenHash)
          .whereNull("revoked_at")
          .where(function (this: Knex.QueryBuilder<DBApiToken>) {
            this.whereNull("expires_at").orWhere("expires_at", ">", new Date())
          })
          .first()

        if (tokenRecord) {
          const user = await profileDb.getUser({
            user_id: tokenRecord.user_id,
          })
          if (user && !user.banned && !user.is_tombstone) {
            req.user = user
            // Stash token metadata for scope checks downstream
            req.__tokenInfo = {
              id: tokenRecord.id,
              name: tokenRecord.name,
              scopes: tokenRecord.scopes,
              expires_at: tokenRecord.expires_at,
              contractor_ids: tokenRecord.contractor_ids || [],
            }
            req.auth = {
              method: "token",
              tokenKind: "legacy",
              tokenMfaAt: tokenRecord.mfa_at ?? null,
              tokenScopes: tokenRecord.scopes,
            }
            // last_used_at (at most once a minute) and the hourly usage
            // rollup, batched by the recorder.
            tokenUsage.record("legacy", tokenRecord.id, user.user_id, req.originalUrl)
            // Deprecation headers, once LEGACY_API_TOKEN_SUNSET is set.
            applyLegacyTokenDeprecation(res)
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
            if (user && !user.banned && !user.is_tombstone) {
              req.user = user
              req.auth = {
                method: "jwt",
                sid: payload.sid,
                mfaAt: payload.mfa_at,
                amr: payload.amr,
              }
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
}
