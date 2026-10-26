/**
 * When does an account's site-admin role actually take effect?
 *
 * `accounts.role` says who is an admin; this module decides whether a given
 * request gets to use it. When it must not, the request's user is replaced by
 * a copy whose role is "user". Every admin check (isSiteAdmin(req.user), the
 * v1/v2 admin gates, the ~50 inline bypasses, has_permission via the request
 * context, the Socket.IO handshake) then sees a regular user, with no
 * per-call-site changes. Regular users are never touched.
 *
 * Rules:
 * - Requests from a custom-domain origin never get admin power
 *   (custom-domain-isolation-design.md QW4): the org controls the JavaScript
 *   on that origin.
 * - With admin MFA enforcement on (ADMIN_MFA_ENFORCE, see
 *   services/mfa/config.ts), the session needs an MFA within 24 h that is
 *   newer than the account's mfa_changed_at; an API token needs an
 *   admin-only scope minted under a step-up (services/mfa/policy.ts).
 */

import type { Request } from "express"
import { SiteRole, isSiteAdmin } from "./site-role.js"
import { isCustomOriginRequest } from "../middleware/custom-origin.js"
import { getMfaEnforcement } from "../../services/mfa/config.js"
import { adminMfaSatisfied } from "../../services/mfa/policy.js"
import { getMfaService } from "../../services/mfa/instance.js"
import { createErrorResponse } from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import { BusinessLogicError } from "../routes/v1/util/errors.js"

export type AdminLockReason = "custom_origin" | "mfa_enrollment" | "mfa_required"

function mask(req: Request, reason: AdminLockReason): void {
  req.user = { ...req.user!, role: SiteRole.User }
  req.adminLocked = reason
}

/** Mask the site-admin role on `req.user` when this request may not use it. */
export async function applySiteRolePolicy(req: Request): Promise<void> {
  const user = req.user
  if (!user || !isSiteAdmin(user)) return

  if (isCustomOriginRequest(req)) return mask(req, "custom_origin")

  if (getMfaEnforcement() !== "enforce") return
  const mfa = getMfaService()
  const changedAt = await mfa.mfaChangedAt(user.user_id)
  if (adminMfaSatisfied(req.auth, changedAt)) return

  // Tokens can never satisfy MFA interactively; report them as "required".
  const enrolled =
    req.auth?.method === "token" ? true : await mfa.isEnrolled(user.user_id)
  mask(req, enrolled ? "mfa_required" : "mfa_enrollment")
}

/** Whether the account behind this request is a site admin, masked or not. */
export function isAdminAccount(req: Request): boolean {
  return isSiteAdmin(req.user) || req.adminLocked !== undefined
}

const LOCK_ERRORS: Record<
  Exclude<AdminLockReason, "custom_origin">,
  { code: ErrorCode; message: string }
> = {
  mfa_enrollment: {
    code: ErrorCode.MFA_ENROLLMENT_REQUIRED,
    message: "Set up two-factor authentication to use admin features",
  },
  mfa_required: {
    code: ErrorCode.MFA_REQUIRED,
    message: "Verify with two-factor authentication to use admin features",
  },
}

/**
 * For an admin gate that is about to refuse a non-admin: the MFA error to
 * return instead of a bare 403, if the account is an admin held back by MFA.
 */
export function adminLockError(req: Request): BusinessLogicError | null {
  const reason = req.adminLocked
  if (!reason || reason === "custom_origin") return null
  const { code, message } = LOCK_ERRORS[reason]
  return new BusinessLogicError(code, message)
}

export function adminLockResponse(req: Request) {
  const err = adminLockError(req)
  return err ? createErrorResponse(err.code, err.message) : null
}
