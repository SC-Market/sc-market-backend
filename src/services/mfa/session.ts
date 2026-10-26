/**
 * Session elevation: record a successful MFA on this browser session.
 *
 * JWT sessions only. The access token's `sid` names the refresh-token row;
 * the row's mfa_at is set and copied on every rotation (jwt.ts), and a new
 * access cookie carrying mfa_at is issued right away. The refresh cookie is
 * path-scoped to /api/auth, so the row is found by sid, not by cookie.
 * Legacy passport sessions cannot be elevated: the user logs in again.
 */

import type { Request, Response } from "express"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import {
  elevateRefreshSession,
  generateAccessToken,
  setAccessCookie,
} from "../../api/util/jwt.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"

export function assertElevatableSession(req: Request): { sid: string } {
  const auth = req.auth
  if (auth?.method === "token") {
    throw new BusinessLogicError(ErrorCode.FORBIDDEN, "API tokens cannot use two-factor endpoints")
  }
  if (auth?.method !== "jwt" || !auth.sid) {
    throw new BusinessLogicError(
      ErrorCode.MFA_SESSION_UNSUPPORTED,
      "This session predates two-factor support. Log out and log in again.",
    )
  }
  return { sid: auth.sid }
}

/**
 * Mark the session MFA-verified now (strictly after `notBefore`, e.g. the
 * mfa_changed_at just written) and re-issue the access cookie. Returns the
 * elevation time.
 */
export async function elevateSession(
  req: Request,
  res: Response,
  amr: string[],
  notBefore?: Date,
): Promise<Date> {
  const { sid } = assertElevatableSession(req)
  const userId = req.user!.user_id
  const at = new Date(Math.max(Date.now(), (notBefore?.getTime() ?? 0) + 1))
  if (!(await elevateRefreshSession(sid, userId, at, amr))) {
    throw new BusinessLogicError(ErrorCode.UNAUTHORIZED, "Session expired, log in again")
  }
  // The JWT role claim is informational (populateUser reloads the account),
  // but use the stored account, not the request's possibly masked copy.
  const account = await profileDb.getUser({ user_id: userId })
  setAccessCookie(res, generateAccessToken(account, { sid, mfaAt: at, amr }))
  req.auth = { ...req.auth!, mfaAt: at.getTime() / 1000, amr }
  return at
}
