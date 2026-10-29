/**
 * Step-up: sensitive actions need an MFA on this session within the last
 * 10 minutes (STEP_UP_MAX_AGE_SECONDS), even for an elevated admin.
 * A no-op unless admin MFA enforcement is on, so the env switch rolls it back.
 * API tokens can never step up.
 *
 * The list of step-up actions lives at the call sites (route files), not in
 * a table: search for requireStepUp / assertStepUp.
 */

import type { NextFunction, Request, Response } from "express"
import { getKeyring, getMfaEnforcement } from "../../services/mfa/config.js"
import { stepUpSatisfied } from "../../services/mfa/policy.js"
import { getMfaService } from "../../services/mfa/instance.js"
import { BusinessLogicError } from "../routes/v1/util/errors.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import { createErrorResponse } from "../routes/v1/util/response.js"

export async function isStepUpFresh(req: Request): Promise<boolean> {
  if (getMfaEnforcement() !== "enforce") return true
  const userId = req.user?.user_id
  if (!userId) return false
  const changedAt = await getMfaService().mfaChangedAt(userId)
  return stepUpSatisfied(req.auth, changedAt)
}

export function stepUpError(): BusinessLogicError {
  return new BusinessLogicError(
    ErrorCode.MFA_STEP_UP_REQUIRED,
    "Confirm with your authenticator code to continue",
  )
}

/** Throws MFA_STEP_UP_REQUIRED (403) unless the session stepped up recently. */
export async function assertStepUp(req: Request): Promise<void> {
  if (!(await isStepUpFresh(req))) throw stepUpError()
}

/** v1 middleware form of assertStepUp. */
export async function requireStepUp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (await isStepUpFresh(req)) return next()
  const err = stepUpError()
  res.status(403).json(createErrorResponse(err.code, err.message))
}

/**
 * Step-up that does not depend on ADMIN_MFA_ENFORCE, for the most sensitive
 * admin actions (test accounts, identity changes): the server must have the
 * MFA key, the admin an authenticator, and this session a code from the last
 * 10 minutes.
 */
export async function assertStrictStepUp(
  req: Request,
  enrollmentMessage: string,
): Promise<void> {
  if (!getKeyring()) {
    throw new BusinessLogicError(
      ErrorCode.MFA_NOT_CONFIGURED,
      "Two-factor authentication is not configured on this server",
    )
  }
  const userId = req.user?.user_id
  if (!userId) throw stepUpError()
  const mfa = getMfaService()
  if (!(await mfa.isEnrolled(userId))) {
    throw new BusinessLogicError(ErrorCode.MFA_ENROLLMENT_REQUIRED, enrollmentMessage)
  }
  if (!stepUpSatisfied(req.auth, await mfa.mfaChangedAt(userId))) throw stepUpError()
}
