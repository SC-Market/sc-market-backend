/**
 * When does an account's site-admin role actually take effect?
 *
 * `accounts.role` says who is an admin; this module decides whether a given
 * request gets to use it. When it must not, the request's user is replaced by
 * a copy whose role is "user". Every admin check (isSiteAdmin(req.user), the
 * v1/v2 admin gates, the ~50 inline bypasses, has_permission via the request
 * context) then sees a regular user, with no per-call-site changes.
 *
 * Rules:
 * - Requests from a custom-domain origin never get admin power
 *   (custom-domain-isolation-design.md QW4): the org controls the JavaScript
 *   on that origin.
 */

import type { Request } from "express"
import { SiteRole, isSiteAdmin } from "./site-role.js"
import { isCustomOriginRequest } from "../middleware/custom-origin.js"

export type AdminLockReason = "custom_origin"

/** Mask the site-admin role on `req.user` when this request may not use it. */
export function applySiteRolePolicy(req: Request): void {
  const user = req.user
  if (!user || !isSiteAdmin(user)) return

  if (isCustomOriginRequest(req)) {
    req.user = { ...user, role: SiteRole.User }
    req.adminLocked = "custom_origin"
  }
}
