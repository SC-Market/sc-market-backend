/**
 * Backend half of the white-label "Internal" site gate.
 *
 * An org can set its white-label site to Internal (login required) and, on
 * top of that, Require membership. The frontend (WhiteLabelAuthGate.tsx)
 * then renders only a sign-in / "members only" screen on that org's custom
 * domain. This middleware applies the same rule to API requests that come
 * from that custom domain, so the site's data isn't served there either:
 *
 * - Internal site, no user: 401 (reason whitelabel_login_required)
 * - Internal + Require membership, user not an org member: 403
 *   (reason whitelabel_membership_required)
 *
 * Scope matches the frontend exactly: the gate applies only on the org's own
 * custom domain. The same org's pages on sc-market.space stay public (the
 * main-site frontend shows them to everyone), and so do requests that name
 * no origin (the bridge/SSR, the sitemap, server-to-server).
 *
 * What the gate screen itself needs stays open on the custom domain: auth
 * (session check, refresh, MFA login), the visitor's own profile, domain
 * resolution, and the org theme / white-label config used to style it.
 */

import type { NextFunction, Request, Response } from "express"
import { getKnex } from "../../clients/database/knex-db.js"
import { requestOrigin } from "./csrf.js"
import { isCustomOriginRequest } from "./custom-origin.js"
import { is_member } from "../routes/v1/util/permissions.js"
import { effectiveRequireMembership } from "../routes/v1/contractors/whitelabel-rules.js"
import { createErrorResponse } from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"

export interface WhiteLabelSiteAccess {
  contractor_id: string
  focus_mode: string | null
  require_membership: boolean | null
}

export type WhiteLabelGateDecision = "allow" | "login_required" | "membership_required"

const V1 = "^/api(?:/v1)?"

/** Routes the gate screen needs; open to everyone on a gated custom domain. */
const GATE_EXEMPT: readonly { pattern: RegExp; methods?: readonly string[] }[] = [
  // Session check, refresh, MFA login (the /auth/* sign-in routes aren't under /api).
  { pattern: /^\/api(?:\/v1|\/v2)?\/auth(?:\/|$)/ },
  // The visitor's own profile: tells the gate who is signed in and their orgs.
  { pattern: new RegExp(`${V1}/profile/?$`), methods: ["GET"] },
  { pattern: new RegExp(`${V1}/domain/[^/]+$`), methods: ["GET"] },
  // Theme and site config style the gate screen.
  { pattern: new RegExp(`${V1}/contractors/[^/]+/(?:theme|whitelabel)/?$`), methods: ["GET"] },
  { pattern: new RegExp(`${V1}/csp-report$`), methods: ["POST"] },
]

export function isGateExempt(method: string, path: string): boolean {
  const m = method.toUpperCase()
  return GATE_EXEMPT.some(
    (r) => r.pattern.test(path) && (!r.methods || r.methods.includes(m)),
  )
}

/** Same rule as WhiteLabelAuthGate.tsx. */
export async function decideWhiteLabelAccess(
  site: WhiteLabelSiteAccess | null,
  userId: string | undefined,
  isMember: (contractorId: string, userId: string) => Promise<boolean>,
): Promise<WhiteLabelGateDecision> {
  if (!site || site.focus_mode !== "internal") return "allow"
  if (!userId) return "login_required"
  if (!effectiveRequireMembership(site.focus_mode, !!site.require_membership)) return "allow"
  return (await isMember(site.contractor_id, userId)) ? "allow" : "membership_required"
}

// hostname → site access (null: not a white-label domain). Short TTL so a
// settings change or revoke takes effect quickly.
const CACHE_TTL = 30_000
const siteCache = new Map<string, { site: WhiteLabelSiteAccess | null; expires: number }>()

async function loadSiteAccess(hostname: string): Promise<WhiteLabelSiteAccess | null> {
  const row = await getKnex()("org_premium_tiers as t")
    .leftJoin("org_whitelabel_config as w", "w.contractor_id", "t.contractor_id")
    .whereRaw("lower(t.custom_domain) = ?", [hostname.toLowerCase()])
    .whereNull("t.revoked_at")
    .select("t.contractor_id", "w.focus_mode", "w.require_membership")
    .first()
  return row ?? null
}

export async function getSiteAccessForHostname(
  hostname: string,
): Promise<WhiteLabelSiteAccess | null> {
  const key = hostname.toLowerCase()
  const hit = siteCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.site
  const site = await loadSiteAccess(key)
  siteCache.set(key, { site, expires: Date.now() + CACHE_TTL })
  return site
}

export function clearWhiteLabelSiteCache(): void {
  siteCache.clear()
}

function originHostname(req: Request): string | null {
  const origin = requestOrigin(req)
  if (!origin) return null
  try {
    return new URL(origin).hostname
  } catch {
    return null
  }
}

export function whiteLabelMembershipGate(
  deps: {
    siteFor?: (hostname: string) => Promise<WhiteLabelSiteAccess | null>
    isMember?: (contractorId: string, userId: string) => Promise<boolean>
  } = {},
) {
  const siteFor = deps.siteFor ?? getSiteAccessForHostname
  const isMember = deps.isMember ?? is_member
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method === "OPTIONS" || !isCustomOriginRequest(req)) return next()
      const path = req.baseUrl + req.path
      if (isGateExempt(req.method, path)) return next()
      const hostname = originHostname(req)
      if (!hostname) return next()

      const site = await siteFor(hostname)
      const decision = await decideWhiteLabelAccess(site, req.user?.user_id, isMember)
      if (decision === "allow") return next()
      if (decision === "login_required") {
        res.status(401).json(
          createErrorResponse(
            ErrorCode.UNAUTHORIZED,
            "Sign in to access this workspace",
            { reason: "whitelabel_login_required" },
          ),
        )
        return
      }
      res.status(403).json(
        createErrorResponse(
          ErrorCode.FORBIDDEN,
          "You must be a member of this organization to access this workspace",
          { reason: "whitelabel_membership_required" },
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}
