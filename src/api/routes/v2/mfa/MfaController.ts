/**
 * Two-factor authentication endpoints (admin-2fa-design.md section 4).
 *
 * Browser sessions only (tsoa-auth rejects API tokens on auth/mfa/* and
 * admin/mfa/*), main site only (custom-origin denylist). They work for an
 * admin whose role is currently masked for lack of MFA, so the owner can
 * always reach enrollment and verification.
 */

import { Body, Delete, Get, Path, Post, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { BusinessLogicError } from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { getMfaEnforcement, ADMIN_MFA_MAX_AGE_SECONDS, STEP_UP_MAX_AGE_SECONDS } from "../../../../services/mfa/config.js"
import { getMfaService } from "../../../../services/mfa/instance.js"
import { windowEndsAt } from "../../../../services/mfa/policy.js"
import { assertElevatableSession, elevateSession } from "../../../../services/mfa/session.js"
import type { ReqCtx, VerifyInput } from "../../../../services/mfa/service.js"
import { isAdminAccount } from "../../../util/site-admin-policy.js"
import { assertStepUp } from "../../../util/step-up.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"
import * as profileDb from "../../v1/profiles/database.js"

export interface MfaFactorSummary {
  id: string
  type: string
  label: string
  created_at: string
  last_used_at: string | null
}

export interface MfaStatusResponse {
  /** "enforce": admin MFA is required; "off": rolled back; "unconfigured": on, but the server has no encryption key yet. */
  enforcement: "enforce" | "off" | "unconfigured"
  /** Whether this account must use two-factor authentication for admin features. */
  required: boolean
  enrolled: boolean
  factors: MfaFactorSummary[]
  recovery_codes_remaining: number
  /** When this session's admin verification lapses (ISO), or null if not verified. */
  elevated_until: string | null
  /** When this session's step-up lapses (ISO), or null. */
  stepup_until: string | null
  /** Why admin features are held back on this request, if they are. */
  admin_locked: string | null
}

export interface TotpEnrollRequest {
  /** @maxLength 60 */
  label?: string
}

export interface TotpEnrollResponse {
  factor_id: string
  otpauth_uri: string
  /** data: URL of an SVG QR code for otpauth_uri. */
  qr_data_url: string
  /** The secret in base32, grouped by 4 for manual entry. */
  manual_key: string
}

export interface TotpConfirmRequest {
  factor_id: string
  /** @pattern ^\d{6}$ */
  code: string
}

export interface RecoveryCodesResponse {
  /** Shown once. */
  recovery_codes: string[]
  elevated_until: string | null
}

export interface MfaVerifyRequest {
  /** 6-digit authenticator code. */
  code?: string
  /** One of the recovery codes (XXXXX-XXXXX). */
  recovery_code?: string
}

export interface MfaVerifyResponse {
  method: "totp" | "recovery_code"
  elevated_until: string
  stepup_until: string
  /** Present after a recovery code was used. */
  recovery_codes_remaining?: number
}

export interface MfaReauthRequest {
  code?: string
  recovery_code?: string
}

export interface MfaResetRequest {
  /** @minLength 3 @maxLength 500 */
  reason: string
}

export interface MfaResetResponse {
  factors: number
  sessions: number
  tokens: number
}

function ctxOf(req: ExpressRequest): ReqCtx {
  return { ip: req.ip || null, userAgent: req.headers["user-agent"]?.toString() || null }
}

function verifyInput(body: MfaVerifyRequest): VerifyInput {
  if (body.code && !body.recovery_code) return { code: body.code }
  if (body.recovery_code && !body.code) return { recovery_code: body.recovery_code }
  throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "Send either code or recovery_code")
}

const iso = (seconds: number | null) => (seconds === null ? null : new Date(seconds * 1000).toISOString())

@Route("auth/mfa")
@Tags("Two-factor auth")
export class MfaController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  private requireAdminAccount() {
    if (!this.request || !isAdminAccount(this.request)) {
      throw new BusinessLogicError(
        ErrorCode.FORBIDDEN,
        "Two-factor authentication is currently available to site admins only",
      )
    }
  }

  private async userRef() {
    const user = this.getUser()
    return { user_id: user.user_id, username: user.username }
  }

  /**
   * Two-factor status for the current session.
   * @summary Get two-factor status
   */
  @Security("loggedin")
  @Get("status")
  public async getMfaStatus(@Request() request: ExpressRequest): Promise<MfaStatusResponse> {
    this.request = request
    const userId = this.getUserId()
    const mfa = getMfaService()
    const enforcement = getMfaEnforcement()
    const [factors, remaining, changedAt] = await Promise.all([
      mfa.confirmedFactors(userId),
      mfa.recoveryCodesRemaining(userId),
      mfa.mfaChangedAt(userId),
    ])
    this.setHeader("Cache-Control", "no-store")
    return {
      enforcement,
      required: enforcement === "enforce" && isAdminAccount(request),
      enrolled: factors.length > 0,
      factors: factors.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        created_at: new Date(f.created_at).toISOString(),
        last_used_at: f.last_used_at ? new Date(f.last_used_at).toISOString() : null,
      })),
      recovery_codes_remaining: remaining,
      elevated_until: iso(windowEndsAt(request.auth, changedAt, ADMIN_MFA_MAX_AGE_SECONDS)),
      stepup_until: iso(windowEndsAt(request.auth, changedAt, STEP_UP_MAX_AGE_SECONDS)),
      admin_locked: request.adminLocked ?? null,
    }
  }

  /**
   * Start enrolling an authenticator app. Replacing an existing one needs a
   * fresh step-up. The secret is only ever returned here.
   * @summary Start authenticator enrollment
   */
  @Security("loggedin")
  @Post("totp/enroll")
  public async startTotpEnrollment(
    @Request() request: ExpressRequest,
    @Body() body: TotpEnrollRequest,
  ): Promise<TotpEnrollResponse> {
    this.request = request
    this.requireAdminAccount()
    assertElevatableSession(request)
    const mfa = getMfaService()
    const user = await this.userRef()
    if (await mfa.isEnrolled(user.user_id)) await assertStepUp(request)
    const label = body.label?.trim() || "Authenticator app"
    const { factor_id, display } = await mfa.beginEnrollment(user, "totp", label, ctxOf(request))
    this.setHeader("Cache-Control", "no-store")
    return {
      factor_id,
      otpauth_uri: display.otpauth_uri,
      qr_data_url: display.qr_data_url,
      manual_key: display.manual_key,
    }
  }

  /**
   * Confirm enrollment with the first code. Verifies this session and returns
   * the recovery codes once.
   * @summary Confirm authenticator enrollment
   */
  @Security("loggedin")
  @Post("totp/confirm")
  public async confirmTotpEnrollment(
    @Request() request: ExpressRequest,
    @Body() body: TotpConfirmRequest,
  ): Promise<RecoveryCodesResponse> {
    this.request = request
    this.requireAdminAccount()
    assertElevatableSession(request)
    const user = await this.userRef()
    const { recoveryCodes, changedAt } = await getMfaService().confirmEnrollment(
      user,
      body.factor_id,
      body.code,
      ctxOf(request),
    )
    const at = await elevateSession(request, this.response(), ["oauth", "otp"], changedAt)
    this.setHeader("Cache-Control", "no-store")
    return {
      recovery_codes: recoveryCodes,
      elevated_until: new Date(at.getTime() + ADMIN_MFA_MAX_AGE_SECONDS * 1000).toISOString(),
    }
  }

  /**
   * Verify (or step up) this session with an authenticator or recovery code.
   * @summary Verify two-factor code
   */
  @Security("loggedin")
  @Post("verify")
  public async verifyMfa(
    @Request() request: ExpressRequest,
    @Body() body: MfaVerifyRequest,
  ): Promise<MfaVerifyResponse> {
    this.request = request
    assertElevatableSession(request)
    const userId = this.getUserId()
    const outcome = await getMfaService().verify(userId, verifyInput(body), ctxOf(request), "verify")
    const at = await elevateSession(request, this.response(), outcome.amr)
    return {
      method: outcome.method,
      elevated_until: new Date(at.getTime() + ADMIN_MFA_MAX_AGE_SECONDS * 1000).toISOString(),
      stepup_until: new Date(at.getTime() + STEP_UP_MAX_AGE_SECONDS * 1000).toISOString(),
      ...(outcome.recoveryCodesRemaining !== undefined && {
        recovery_codes_remaining: outcome.recoveryCodesRemaining,
      }),
    }
  }

  /**
   * Replace the recovery codes (the old ones stop working). Needs a fresh
   * step-up.
   * @summary Regenerate recovery codes
   */
  @Security("loggedin")
  @Post("recovery-codes/regenerate")
  public async regenerateMfaRecoveryCodes(
    @Request() request: ExpressRequest,
  ): Promise<RecoveryCodesResponse> {
    this.request = request
    assertElevatableSession(request)
    await assertStepUp(request)
    const userId = this.getUserId()
    const { recoveryCodes, changedAt } = await getMfaService().regenerateRecoveryCodes(
      userId,
      ctxOf(request),
    )
    // Regeneration invalidates every session's verification; keep this one.
    const at = await elevateSession(request, this.response(), request.auth?.amr ?? ["oauth", "otp"], changedAt)
    this.setHeader("Cache-Control", "no-store")
    return {
      recovery_codes: recoveryCodes,
      elevated_until: new Date(at.getTime() + ADMIN_MFA_MAX_AGE_SECONDS * 1000).toISOString(),
    }
  }

  /**
   * Remove a factor. Needs a current code and a fresh step-up. While admin
   * MFA is enforced, an admin cannot remove their last factor (enroll the
   * replacement first; it replaces the old one on confirmation).
   * @summary Remove a two-factor method
   */
  @Security("loggedin")
  @Delete("factors/{factorId}")
  public async removeMfaFactor(
    @Request() request: ExpressRequest,
    @Path() factorId: string,
    @Body() body: MfaReauthRequest,
  ): Promise<{ removed: boolean }> {
    this.request = request
    assertElevatableSession(request)
    await assertStepUp(request)
    const userId = this.getUserId()
    const mfa = getMfaService()
    const confirmed = await mfa.confirmedFactors(userId)
    if (
      getMfaEnforcement() === "enforce" &&
      isAdminAccount(request) &&
      confirmed.length === 1 &&
      confirmed[0].id === factorId
    ) {
      throw new BusinessLogicError(
        ErrorCode.CONFLICT,
        "Admins must keep two-factor authentication. Set up a new authenticator to replace this one.",
      )
    }
    await mfa.removeFactor(userId, factorId, verifyInput(body), ctxOf(request))
    return { removed: true }
  }

  private response() {
    const res = this.request?.res
    if (!res) throw new Error("No response object on request")
    return res
  }
}

@Route("admin/mfa")
@Tags("Two-factor auth")
export class AdminMfaController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Reset another admin's or user's two-factor authentication: deletes their
   * factors and recovery codes, revokes their sessions and admin-scoped API
   * tokens. Needs a fresh step-up; not allowed on yourself (use the
   * break-glass script).
   * @summary Reset a user's two-factor authentication
   */
  @Security("loggedin")
  @Post("users/{username}/reset")
  public async resetUserMfa(
    @Request() request: ExpressRequest,
    @Path() username: string,
    @Body() body: MfaResetRequest,
  ): Promise<MfaResetResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const actor = this.getUser()
    let target
    try {
      target = await profileDb.getUser({ username })
    } catch {
      this.throwNotFound("User", username)
    }
    if (target.user_id === actor.user_id) {
      throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "You cannot reset your own two-factor authentication")
    }
    const result = await getMfaService().resetUser(target.user_id, actor.user_id, body.reason, ctxOf(request))
    await auditLogService.record({
      action: "mfa_reset_by_admin",
      actorId: actor.user_id,
      subjectType: "user",
      subjectId: target.user_id,
      metadata: { reason: body.reason, ...result },
    })
    return result
  }
}
