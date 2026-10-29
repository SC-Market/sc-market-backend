/**
 * Authentication for /api/public/v1: public API tokens only.
 *
 * - Reads only `Authorization: Bearer scmp_…`. The router is mounted before
 *   the session, cookie and passport middleware, and this middleware ignores
 *   any req.user that might exist: a browser session or JWT cookie never
 *   authenticates here (401).
 * - A legacy `scm_` token is refused with 401 INVALID_TOKEN: legacy tokens
 *   work only on the old routes, public tokens only here (server.ts refuses
 *   `scmp_` everywhere else).
 * - An unknown, revoked or expired token is a 401 INVALID_TOKEN, never an
 *   anonymous fallback. 20 such attempts per IP per 15 minutes, then 429.
 * - The request then acts as the token's user, with the site-admin role
 *   masked: a token never carries admin power. req.__tokenInfo carries the
 *   token's scopes and org grant, so the shared permission helpers
 *   (has_permission / is_member, token-org-access.ts) apply the grant, and
 *   every check reads the user's CURRENT org permissions. Effective access is
 *   token scopes ∩ the user's current permissions ∩ the org grant.
 * - Per-route scopes: expressAuthentication (TSOA @Security("apiToken",
 *   [...])) refuses a token missing any required scope with 403
 *   INSUFFICIENT_SCOPE. Unknown security names fail closed.
 */

import type { NextFunction, Request, Response } from "express"
import * as profileDb from "../../v1/profiles/database.js"
import type { User } from "../../v1/api-models.js"
import { isSiteAdmin, SiteRole } from "../../../util/site-role.js"
import { runInRequestContext } from "../../../util/request-context.js"
import { withPoolOverride } from "../../../../clients/database/knex-db.js"
import {
  findActivePublicToken,
  isPublicTokenString,
} from "../../../../services/public-api/tokens.service.js"
import { tokenUsage } from "../../../../services/public-api/usage-recorder.js"
import { PublicApiError } from "./errors.js"
import { isPublicScope, PUBLIC_SECURITY_SCHEME } from "./scope-catalog.js"
import {
  acquireSlot,
  assertIpMayTryTokens,
  chargeRequest,
  publicPool,
  recordInvalidToken,
} from "./limits.js"

function bearer(req: Request): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return m ? m[1] : ""
}

function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown"
}

/** Resolve the token and the acting user; throws a PublicApiError. */
async function authenticate(req: Request, res: Response): Promise<void> {
  // Whatever an earlier middleware may have put here, only the token counts.
  req.user = undefined
  req.__tokenInfo = undefined
  req.publicApiToken = undefined
  req.auth = undefined

  const raw = bearer(req)
  if (raw === null) {
    throw new PublicApiError(
      401,
      "UNAUTHORIZED",
      "An API token is required: Authorization: Bearer scmp_…",
    )
  }
  if (raw.startsWith("scm_")) {
    throw new PublicApiError(
      401,
      "INVALID_TOKEN",
      "Legacy API tokens don't work on the public API. Create a new token in your account settings.",
    )
  }

  const ip = clientIp(req)
  await assertIpMayTryTokens(ip)
  const token = isPublicTokenString(raw)
    ? await findActivePublicToken(raw)
    : null
  if (!token) {
    await recordInvalidToken(ip)
    throw new PublicApiError(
      401,
      "INVALID_TOKEN",
      "The API token is invalid, expired or revoked",
    )
  }

  let user: User
  try {
    user = await profileDb.getUser({ user_id: token.user_id })
  } catch {
    throw new PublicApiError(
      401,
      "INVALID_TOKEN",
      "The API token is invalid, expired or revoked",
    )
  }
  if (user.is_tombstone) {
    throw new PublicApiError(
      401,
      "INVALID_TOKEN",
      "The API token is invalid, expired or revoked",
    )
  }
  if (user.banned)
    throw new PublicApiError(403, "ACCOUNT_BANNED", "This account is banned")
  if (user.deleted_at)
    throw new PublicApiError(
      403,
      "FORBIDDEN",
      "This account is pending deletion",
    )

  req.user = isSiteAdmin(user) ? { ...user, role: SiteRole.User } : user
  req.publicApiToken = token
  req.__tokenInfo = {
    id: token.id,
    name: token.name,
    scopes: token.scopes,
    expires_at: token.expires_at,
    contractor_ids: token.contractor_ids ?? [],
  }
  req.auth = {
    method: "token",
    tokenKind: "public",
    tokenScopes: token.scopes,
    tokenMfaAt: null,
  }

  await chargeRequest(res, token.id, user.user_id, req.method)
  acquireSlot(res)
  tokenUsage.record("public", token.id, user.user_id, req.originalUrl)
}

/**
 * Router middleware: authenticate, then run the rest of the request in its
 * request context (has_permission sees this request's user and grant) and on
 * the public pool.
 */
export function authenticatePublicRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  authenticate(req, res).then(
    () =>
      withPoolOverride(publicPool(), () => runInRequestContext(req, res, next)),
    (err) => next(err),
  )
}

/** TSOA authentication module for the public spec (tsoa.public.json). */
export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes: string[] = [],
): Promise<User> {
  if (securityName !== PUBLIC_SECURITY_SCHEME) {
    throw new PublicApiError(401, "UNAUTHORIZED", "Unsupported authentication")
  }
  const token = request.publicApiToken
  const user = request.user as User | undefined
  if (!token || !user) {
    throw new PublicApiError(401, "UNAUTHORIZED", "An API token is required")
  }
  const granted = token.scopes ?? []
  const missing = scopes.filter(
    (s) => !isPublicScope(s) || !granted.includes(s),
  )
  if (missing.length) {
    throw new PublicApiError(
      403,
      "INSUFFICIENT_SCOPE",
      `This token lacks the scope ${missing.join(", ")}`,
      {
        required: scopes,
        granted,
      },
    )
  }
  return user
}

/**
 * For every route OUTSIDE /api/public/v1: refuse public API tokens (401), so
 * they can never authenticate a site route. Mounted in server.ts before the
 * session and populateUser.
 */
export function refusePublicTokensElsewhere(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = bearer(req)
  if (raw && isPublicTokenString(raw)) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="sc-market-public-api"')
    res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "This API token works only on /api/public/v1",
      },
    })
    return
  }
  next()
}
