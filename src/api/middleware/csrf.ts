/**
 * CSRF protection for the public API app (src/server.ts).
 *
 * Every auth cookie is SameSite=None (the frontend and the API are on different
 * sites, and white-label shop domains are on different sites again), so the
 * browser attaches them to cross-site requests. Two checks stop a foreign page
 * from making a state-changing request with those cookies:
 *
 * 1. Origin check. For unsafe methods the request's `Origin` (or, only when
 *    Origin is absent, the origin of `Referer`) must be on the same allowlist
 *    CORS uses: the static origins plus the https custom domains registered in
 *    org_premium_tiers. A request that carries an auth cookie but neither
 *    header is rejected: browsers always send Origin on cross-origin POSTs, so
 *    a missing one on a cookie-bearing request is not a request our frontend
 *    made.
 * 2. JSON-only bodies. A non-empty body must be `application/json`. HTML forms
 *    can only produce urlencoded, multipart or text/plain, and none of those
 *    can be sent cross-origin with a JSON content type without a preflight.
 *    The upload routes are the only exception: they take multipart, and they
 *    still need a valid Origin.
 *
 * Not checked, because there is no ambient credential to abuse:
 * - Safe methods (GET/HEAD/OPTIONS). OAuth callbacks are GETs with a signed
 *   state token.
 * - Bearer API-token requests that carry no auth cookie. The token has to be
 *   attached explicitly, which a cross-site page cannot do for the victim.
 *   (populateUser prefers a session cookie over the Bearer header, so a request
 *   with both is treated as cookie-authenticated and checked.)
 * - Cookieless requests without Origin/Referer (server-to-server callers).
 *   They authenticate as nobody.
 * - Explicitly exempted paths that authenticate by a secret in the URL and
 *   are called cross-origin by design (the SCMDB ingest webhook).
 *
 * The Discord bot talks to discord_app on localhost:8081, a separate Express
 * app this middleware is not mounted on.
 */

import type { NextFunction, Request, Response } from "express"
import { createErrorResponse } from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import logger from "../../logger/logger.js"

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** Cookies that authenticate a request (see jwt.ts and server.ts). */
export const CREDENTIAL_COOKIES = [
  "scmarket.access",
  "scmarket.refresh",
  "scmarket.sid",
] as const

/**
 * Routes that accept multipart/form-data (multer). Paths are matched against
 * the full request path, under /api, /api/v1 and /api/v2 as mounted in
 * server.ts.
 */
export const MULTIPART_UPLOAD_PATHS: readonly RegExp[] = [
  // v1 (mounted at both /api and /api/v1)
  /^\/api(?:\/v1)?\/profile\/(?:avatar|banner)$/,
  /^\/api(?:\/v1)?\/contractors\/[^/]+\/(?:avatar|banner)$/,
  /^\/api(?:\/v1)?\/market\/listing\/[^/]+\/photos$/,
  /^\/api(?:\/v1)?\/services\/[^/]+\/photos$/,
  // v2 (src/api/routes/v2/api-router.ts)
  /^\/api\/v2\/admin\/import-game-data$/,
  /^\/api\/v2\/listings\/[^/]+\/photos$/,
  /^\/api\/v2\/images\/upload$/,
]

/**
 * Routes outside the check entirely. Each one must authenticate with a secret
 * that is not a cookie.
 */
export const CSRF_EXEMPT_PATHS: readonly RegExp[] = [
  // SCMDB posts text/plain from https://scmdb.net; the sync token in the path
  // is the credential (ScmdbSyncController.ingestWebhook).
  /^\/api\/v2\/integrations\/scmdb\/ingest\/[^/]+$/,
]

export interface CsrfOptions {
  /** Same predicate CORS uses (static allowlist + registered custom domains). */
  isOriginAllowed: (origin: string) => boolean | Promise<boolean>
  multipartPaths?: readonly RegExp[]
  exemptPaths?: readonly RegExp[]
}

function cookieNames(req: Request): Set<string> {
  const header = req.headers.cookie
  if (!header) return new Set()
  return new Set(
    header.split(";").map((part) => part.split("=")[0].trim()),
  )
}

export function hasCredentialCookie(req: Request): boolean {
  const names = cookieNames(req)
  return CREDENTIAL_COOKIES.some((name) => names.has(name))
}

function hasBearerToken(req: Request): boolean {
  return /^Bearer\s+\S/i.test(req.headers.authorization || "")
}

/** `Origin`, or the origin of `Referer` when Origin is absent. */
export function requestOrigin(req: Request): string | null {
  const origin = req.headers.origin
  if (typeof origin === "string" && origin !== "") return origin
  const referer = req.headers.referer
  if (typeof referer === "string" && referer !== "") {
    try {
      return new URL(referer).origin
    } catch {
      return "null"
    }
  }
  return null
}

function hasBody(req: Request): boolean {
  const length = req.headers["content-length"]
  if (length !== undefined) return Number(length) > 0
  return req.headers["transfer-encoding"] !== undefined
}

function mediaType(req: Request): string {
  return (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase()
}

function reject(
  req: Request,
  res: Response,
  status: 403 | 415,
  reason: string,
  origin: string | null,
): void {
  logger.warn("[csrf] rejected request", {
    reason,
    method: req.method,
    path: req.path,
    origin,
    contentType: mediaType(req) || undefined,
  })
  res
    .status(status)
    .json(
      createErrorResponse(
        status === 403 ? ErrorCode.FORBIDDEN : ErrorCode.VALIDATION_ERROR,
        status === 403
          ? "Cross-site request rejected"
          : "Request body must be application/json",
        { reason },
      ),
    )
}

export function csrfProtection(options: CsrfOptions) {
  const multipartPaths = options.multipartPaths ?? MULTIPART_UPLOAD_PATHS
  const exemptPaths = options.exemptPaths ?? CSRF_EXEMPT_PATHS

  return async function csrfGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return next()

    const path = req.path
    if (exemptPaths.some((re) => re.test(path))) return next()

    const withCookie = hasCredentialCookie(req)
    if (!withCookie && hasBearerToken(req)) return next()

    const origin = requestOrigin(req)
    if (origin === null) {
      if (withCookie) {
        return reject(req, res, 403, "missing_origin", origin)
      }
      // No cookie, no Origin: a non-browser caller with no ambient
      // credentials. Nothing to forge.
    } else {
      let allowed = false
      try {
        allowed = await options.isOriginAllowed(origin)
      } catch (error) {
        logger.error("[csrf] origin check failed", { error })
      }
      if (!allowed) return reject(req, res, 403, "origin_not_allowed", origin)
    }

    if (hasBody(req)) {
      const type = mediaType(req)
      const isJson = type === "application/json"
      const isAllowedMultipart =
        type === "multipart/form-data" &&
        multipartPaths.some((re) => re.test(path))
      if (!isJson && !isAllowedMultipart) {
        return reject(req, res, 415, "unsupported_content_type", origin)
      }
    }

    next()
  }
}
