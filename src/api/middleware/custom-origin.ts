/**
 * Containment for requests made from a white-label shop custom domain.
 *
 * Custom domains are in the credentialed CORS allowlist so a shop's storefront
 * can use the visitor's SC Market session. The org controls that domain's DNS
 * and therefore what JavaScript runs on it, so a request from a custom origin
 * must not be able to do account-level or admin things with the visitor's
 * session (custom-domain-isolation-design.md, H1-H3):
 *
 * - QW3: a denylist of sensitive routes answers 403 when the request comes
 *   from any origin other than the main site, whatever the method.
 * - QW4: the site-admin role never takes effect on such a request
 *   (see applySiteRolePolicy in site-admin-policy.ts).
 *
 * "Custom origin" means: the request names an origin (Origin, or Referer when
 * Origin is absent) and it is not the main site. Requests that name no origin
 * (server-to-server, same-origin navigations without Referer) are not custom.
 * The storefront (browse, cart/checkout, offers, orders, chats, notifications,
 * the visitor's own profile and settings) is not on the list.
 */

import type { NextFunction, Request, Response } from "express"
import { isMainSiteOrigin } from "../util/allowed-origins.js"
import { requestOrigin } from "./csrf.js"
import { createErrorResponse } from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import logger from "../../logger/logger.js"

/** True when the request comes from an origin other than the main site. */
export function isCustomOriginRequest(req: Request): boolean {
  const origin = requestOrigin(req)
  return origin !== null && !isMainSiteOrigin(origin)
}

interface SensitiveRoute {
  pattern: RegExp
  /** Upper-case methods; all methods when omitted. */
  methods?: readonly string[]
  why: string
}

// v1 routers are mounted at both /api and /api/v1 (api-router.ts,
// api-v1-router.ts), hence the optional /v1.
const V1 = "^/api(?:/v1)?"

export const CUSTOM_ORIGIN_DENYLIST: readonly SensitiveRoute[] = [
  // POST returns a raw scm_ token; listing/reading exposes token metadata.
  { pattern: new RegExp(`${V1}/tokens(?:/|$)`), why: "api tokens" },
  // POST returns a raw scmp_ public API token.
  { pattern: /^\/api\/v2\/public-api-tokens(?:\/|$)/, why: "public api tokens" },
  { pattern: /^\/auth\/sessions(?:\/|$)/, why: "session management" },
  { pattern: /^\/api\/auth\/test-login$/, why: "test-account login" },
  { pattern: new RegExp(`${V1}/admin(?:/|$)`), why: "admin" },
  { pattern: /^\/api\/v2\/admin(?:\/|$)/, why: "admin" },
  {
    pattern: /^\/api\/v2\/debug(?:\/|$)/,
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    why: "debug overrides",
  },
  { pattern: /^\/api\/v2\/auth\/mfa(?:\/|$)/, why: "two-factor auth" },
  { pattern: /^\/api\/v2\/accounts(?:\/|$)/, why: "account deletion" },
  {
    pattern: new RegExp(
      `${V1}/profile/(?:email|links|auth|webhook|webhooks|my_data)(?:/|$)`,
    ),
    why: "email, linked accounts, webhooks, data export",
  },
  {
    // Reads stay open: the notification poller lists subscriptions on load.
    pattern: new RegExp(`${V1}/push(?:/|$)`),
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    why: "push subscriptions",
  },
  {
    pattern: /^\/api\/v2\/shops\/[^/]+\/(?:transfer|webhooks)(?:\/|$)/,
    why: "shop transfer and webhooks",
  },
  {
    pattern: new RegExp(
      `${V1}/contractors/[^/]+/(?:roles|transfer-ownership|webhooks)(?:/|$)`,
    ),
    why: "org roles, ownership transfer and webhooks",
  },
  {
    pattern: /^\/api\/v2\/integrations\/scmdb\/(?:status|connect|regenerate|disconnect)$/,
    why: "integration credentials",
  },
]

export function matchCustomOriginDenylist(
  method: string,
  path: string,
): SensitiveRoute | undefined {
  const m = method.toUpperCase()
  return CUSTOM_ORIGIN_DENYLIST.find(
    (route) =>
      route.pattern.test(path) && (!route.methods || route.methods.includes(m)),
  )
}

export function customOriginGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === "OPTIONS" || !isCustomOriginRequest(req)) return next()
  const hit = matchCustomOriginDenylist(req.method, req.path)
  if (!hit) return next()

  logger.warn("[custom-origin] blocked sensitive route", {
    method: req.method,
    path: req.path,
    origin: requestOrigin(req),
    why: hit.why,
  })
  res
    .status(403)
    .json(
      createErrorResponse(
        ErrorCode.FORBIDDEN,
        "This action is only available on sc-market.space",
        { reason: "custom_domain_restricted" },
      ),
    )
}
