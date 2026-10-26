/**
 * MfaService: every cross-cutting MFA rule (rate limits, lockout, replay,
 * audit, enrollment lifecycle, reset). Providers only do factor math; session
 * elevation (cookies, refresh rows) lives in session.ts.
 */

import crypto from "node:crypto"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import logger from "../../logger/logger.js"
import { getKeyring, type MfaKeyring } from "./config.js"
import {
  aadFor,
  generateRecoveryCode,
  hashRecoveryCode,
  open,
  seal,
  verifyRecoveryCode,
} from "./crypto.js"
import { getProvider, registerProvider } from "./registry.js"
import type { MfaRepo } from "./repo.js"
import { totpProvider } from "./providers/totp.js"
import type { FactorRow, FactorType, MfaEvent, UserRef } from "./types.js"

registerProvider(totpProvider)

export const MAX_FAILED_ATTEMPTS = 5
export const BASE_LOCKOUT_MS = 15 * 60_000
export const MAX_LOCKOUT_MS = 24 * 60 * 60_000
export const PENDING_ENROLLMENT_TTL_MS = 15 * 60_000
export const RECOVERY_CODE_COUNT = 10

export interface ReqCtx {
  ip: string | null
  userAgent: string | null
}

export interface Limiter {
  /** Rejects (any error) when the key is over its budget. */
  consume(key: string): Promise<unknown>
}

export interface MfaServiceDeps {
  repo: MfaRepo
  keyring?: () => MfaKeyring | null
  /** 20 attempts / 15 min, keyed per IP and per user. */
  verifyLimiter: Limiter
  /** 5 enrollments / hour per user. */
  enrollLimiter: Limiter
  now?: () => Date
}

export type VerifyInput = { code: string } | { recovery_code: string }

export interface VerifyOutcome {
  method: "totp" | "recovery_code"
  amr: string[]
  factorId: string
  recoveryCodesRemaining?: number
}

/** Lockout length after the n-th lockout (1-based): 15 min, doubling, max 24 h. */
export function lockoutDurationMs(lockoutCount: number): number {
  return Math.min(BASE_LOCKOUT_MS * 2 ** Math.max(0, lockoutCount - 1), MAX_LOCKOUT_MS)
}

function mfaError(code: ErrorCode, message: string, details?: Record<string, unknown>) {
  return new BusinessLogicError(code, message, details)
}

export class MfaService {
  private readonly repo: MfaRepo
  private readonly keyring: () => MfaKeyring | null
  private readonly now: () => Date

  constructor(private readonly deps: MfaServiceDeps) {
    this.repo = deps.repo
    this.keyring = deps.keyring ?? getKeyring
    this.now = deps.now ?? (() => new Date())
  }

  private requireKeyring(): MfaKeyring {
    const keyring = this.keyring()
    if (!keyring) {
      throw mfaError(
        ErrorCode.MFA_NOT_CONFIGURED,
        "Two-factor authentication is not configured on this server",
      )
    }
    return keyring
  }

  private async event(
    userId: string,
    event: MfaEvent,
    ctx: ReqCtx | null,
    extra: { factor?: FactorRow; actor?: string | null; metadata?: Record<string, unknown> } = {},
  ) {
    try {
      await this.repo.recordEvent({
        user_id: userId,
        actor_user_id: "actor" in extra ? (extra.actor ?? null) : userId,
        event,
        factor_id: extra.factor?.id ?? null,
        factor_type: extra.factor?.type ?? null,
        ip: ctx?.ip ?? null,
        user_agent: ctx?.userAgent ?? null,
        metadata: extra.metadata ?? {},
      })
    } catch (error) {
      logger.error("[mfa] failed to record event", { event, userId, error })
    }
  }

  mfaChangedAt(userId: string): Promise<Date | null> {
    return this.repo.getMfaChangedAt(userId)
  }

  async confirmedFactors(userId: string): Promise<FactorRow[]> {
    return (await this.repo.listFactors(userId)).filter((f) => f.confirmed_at)
  }

  async isEnrolled(userId: string): Promise<boolean> {
    return (await this.confirmedFactors(userId)).length > 0
  }

  async recoveryCodesRemaining(userId: string): Promise<number> {
    return (await this.repo.unusedRecoveryCodes(userId)).length
  }

  private openSecret(factor: FactorRow): Buffer | null {
    if (!factor.secret_ciphertext) return null
    return open(
      factor.secret_ciphertext,
      aadFor(factor.id, factor.user_id, factor.type),
      this.requireKeyring(),
    )
  }

  // ── Enrollment ───────────────────────────────────────────────────────────

  async beginEnrollment(
    user: UserRef,
    type: FactorType,
    label: string,
    ctx: ReqCtx,
  ): Promise<{ factor_id: string; display: Record<string, string> }> {
    const keyring = this.requireKeyring()
    try {
      await this.deps.enrollLimiter.consume(`mfa:enroll:${user.user_id}`)
    } catch {
      throw mfaError(ErrorCode.RATE_LIMIT_EXCEEDED, "Too many enrollment attempts, try again later")
    }
    const provider = getProvider(type)
    await this.repo.deletePendingFactors(user.user_id)
    const material = await provider.beginEnrollment(user, label)
    const id = crypto.randomUUID()
    const sealed = material.secret
      ? seal(material.secret, aadFor(id, user.user_id, type), keyring)
      : null
    await this.repo.insertFactor({
      id,
      user_id: user.user_id,
      type,
      label,
      secret_ciphertext: sealed?.ciphertext ?? null,
      secret_key_id: sealed?.kid ?? null,
      public_data: material.publicData,
    })
    await this.event(user.user_id, "enroll_started", ctx, { metadata: { type } })
    return { factor_id: id, display: material.display }
  }

  /**
   * Confirm a pending factor with its first code. Replaces any existing
   * confirmed factor of the same type, issues a fresh batch of recovery codes
   * (returned once) and bumps mfa_changed_at. Returns that timestamp; the
   * caller elevates the session after it.
   */
  async confirmEnrollment(
    user: UserRef,
    factorId: string,
    code: string,
    ctx: ReqCtx,
  ): Promise<{ recoveryCodes: string[]; changedAt: Date }> {
    await this.consumeVerifyBudget(user.user_id, ctx)
    const factor = await this.repo.getFactor(user.user_id, factorId)
    if (
      !factor ||
      factor.confirmed_at ||
      this.now().getTime() - new Date(factor.created_at).getTime() > PENDING_ENROLLMENT_TTL_MS
    ) {
      throw mfaError(ErrorCode.NOT_FOUND, "Enrollment not found or expired; start again")
    }
    const result = await getProvider(factor.type).verify(factor, this.openSecret(factor), code, this.now().getTime() / 1000)
    if (!result.ok) {
      await this.event(user.user_id, "verify_failed", ctx, { factor, metadata: { stage: "enroll" } })
      throw mfaError(ErrorCode.MFA_INVALID_CODE, "That code is not valid")
    }
    await this.repo.confirmFactor(user.user_id, factor.id, factor.type, result.counter ?? null)
    const recoveryCodes = await this.issueRecoveryCodes(user.user_id)
    const changedAt = this.now()
    await this.repo.bumpMfaChangedAt(user.user_id, changedAt)
    await this.event(user.user_id, "enroll_confirmed", ctx, { factor })
    return { recoveryCodes, changedAt }
  }

  /**
   * Create an already-confirmed factor for `user` on behalf of `actorId`
   * (test accounts: an admin creates the account and its authenticator in
   * one step, src/services/test-accounts/admin.ts). Returns the display
   * material once; the secret is only stored sealed. No recovery codes.
   */
  async enrollConfirmedFactor(
    user: UserRef,
    type: FactorType,
    label: string,
    actorId: string,
    ctx: ReqCtx,
  ): Promise<{ factor_id: string; display: Record<string, string> }> {
    const keyring = this.requireKeyring()
    const provider = getProvider(type)
    const material = await provider.beginEnrollment(user, label)
    const id = crypto.randomUUID()
    const sealed = material.secret
      ? seal(material.secret, aadFor(id, user.user_id, type), keyring)
      : null
    await this.repo.insertFactor({
      id,
      user_id: user.user_id,
      type,
      label,
      secret_ciphertext: sealed?.ciphertext ?? null,
      secret_key_id: sealed?.kid ?? null,
      public_data: material.publicData,
    })
    await this.repo.confirmFactor(user.user_id, id, type, null)
    await this.repo.bumpMfaChangedAt(user.user_id, this.now())
    await this.event(user.user_id, "enroll_confirmed", ctx, {
      actor: actorId,
      metadata: { type, by_admin: true },
    })
    return { factor_id: id, display: material.display }
  }

  private async issueRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
    const hashes = await Promise.all(codes.map(hashRecoveryCode))
    await this.repo.replaceRecoveryCodes(userId, crypto.randomUUID(), hashes)
    return codes
  }

  // ── Verification ─────────────────────────────────────────────────────────

  private async consumeVerifyBudget(userId: string, ctx: ReqCtx) {
    try {
      await this.deps.verifyLimiter.consume(`mfa:user:${userId}`)
      if (ctx.ip) await this.deps.verifyLimiter.consume(`mfa:ip:${ctx.ip}`)
    } catch {
      throw mfaError(ErrorCode.RATE_LIMIT_EXCEEDED, "Too many attempts, try again later")
    }
  }

  private assertNotLocked(factor: FactorRow) {
    if (factor.locked_until && new Date(factor.locked_until).getTime() > this.now().getTime()) {
      throw mfaError(ErrorCode.MFA_LOCKED, "Too many failed attempts", {
        locked_until: new Date(factor.locked_until).toISOString(),
      })
    }
  }

  private async fail(userId: string, factor: FactorRow, ctx: ReqCtx, method: string): Promise<never> {
    const now = this.now()
    const updated = await this.repo.recordFailure(factor.id, (row) => {
      const attempts = row.failed_attempts + 1
      if (attempts < MAX_FAILED_ATTEMPTS) {
        return { failed_attempts: attempts, lockout_count: row.lockout_count, locked_until: row.locked_until }
      }
      const lockouts = row.lockout_count + 1
      return {
        failed_attempts: 0,
        lockout_count: lockouts,
        locked_until: new Date(now.getTime() + lockoutDurationMs(lockouts)),
      }
    })
    await this.event(userId, "verify_failed", ctx, { factor, metadata: { method } })
    if (updated.failed_attempts === 0 && updated.locked_until) {
      await this.event(userId, "locked", ctx, {
        factor,
        metadata: { locked_until: new Date(updated.locked_until).toISOString() },
      })
      throw mfaError(ErrorCode.MFA_LOCKED, "Too many failed attempts", {
        locked_until: new Date(updated.locked_until).toISOString(),
      })
    }
    throw mfaError(ErrorCode.MFA_INVALID_CODE, "That code is not valid", {
      attempts_remaining: MAX_FAILED_ATTEMPTS - updated.failed_attempts,
    })
  }

  /**
   * Check a TOTP code or a recovery code against the user's confirmed factor.
   * Throws MFA_INVALID_CODE / MFA_LOCKED / RATE_LIMIT_EXCEEDED. Does not touch
   * the session.
   */
  async verify(userId: string, input: VerifyInput, ctx: ReqCtx, purpose: "verify" | "stepup" | "remove" = "verify"): Promise<VerifyOutcome> {
    await this.consumeVerifyBudget(userId, ctx)
    const [factor] = await this.confirmedFactors(userId)
    if (!factor) {
      throw mfaError(ErrorCode.MFA_ENROLLMENT_REQUIRED, "Set up two-factor authentication first")
    }
    this.assertNotLocked(factor)
    const provider = getProvider(factor.type)

    if ("recovery_code" in input) {
      const codes = await this.repo.unusedRecoveryCodes(userId)
      let match: string | null = null
      // Check every unused code so timing does not reveal which one matched.
      for (const row of codes) {
        if (await verifyRecoveryCode(input.recovery_code, row.code_hash)) match = row.id
      }
      if (!match || !(await this.repo.useRecoveryCode(match, ctx.ip))) {
        return this.fail(userId, factor, ctx, "recovery_code")
      }
      await this.repo.clearFailures(factor.id)
      const remaining = codes.length - 1
      await this.event(userId, "recovery_used", ctx, { factor, metadata: { remaining_codes: remaining } })
      return { method: "recovery_code", amr: ["oauth", "otp"], factorId: factor.id, recoveryCodesRemaining: remaining }
    }

    const result = await provider.verify(factor, this.openSecret(factor), input.code, this.now().getTime() / 1000)
    if (!result.ok || result.counter === undefined || !(await this.repo.consumeStep(factor.id, result.counter))) {
      return this.fail(userId, factor, ctx, "totp")
    }
    await this.repo.clearFailures(factor.id)
    await this.event(userId, purpose === "stepup" ? "stepup_ok" : "verify_ok", ctx, { factor })
    return { method: "totp", amr: ["oauth", provider.amr], factorId: factor.id }
  }

  // ── Management ───────────────────────────────────────────────────────────

  /** New batch of recovery codes (old ones stop working). Caller enforces step-up. */
  async regenerateRecoveryCodes(userId: string, ctx: ReqCtx): Promise<{ recoveryCodes: string[]; changedAt: Date }> {
    if (!(await this.isEnrolled(userId))) {
      throw mfaError(ErrorCode.MFA_ENROLLMENT_REQUIRED, "Set up two-factor authentication first")
    }
    const recoveryCodes = await this.issueRecoveryCodes(userId)
    const changedAt = this.now()
    await this.repo.bumpMfaChangedAt(userId, changedAt)
    await this.event(userId, "codes_regenerated", ctx)
    return { recoveryCodes, changedAt }
  }

  /**
   * Remove a factor after checking a current code. Caller enforces step-up
   * and the "admins keep at least one factor" rule.
   */
  async removeFactor(userId: string, factorId: string, input: VerifyInput, ctx: ReqCtx): Promise<void> {
    const factor = await this.repo.getFactor(userId, factorId)
    if (!factor) throw mfaError(ErrorCode.NOT_FOUND, "Factor not found")
    if (factor.confirmed_at) {
      await this.verify(userId, input, ctx, "remove")
    }
    await this.repo.deleteFactor(userId, factorId)
    if (factor.confirmed_at && !(await this.isEnrolled(userId))) {
      await this.repo.replaceRecoveryCodes(userId, crypto.randomUUID(), [])
    }
    await this.repo.bumpMfaChangedAt(userId, this.now())
    await this.event(userId, "factor_removed", ctx, { factor })
  }

  /**
   * Delete all factors and recovery codes, revoke the user's sessions and
   * admin-scoped tokens. `actorId` null means break-glass (operator script).
   */
  async resetUser(
    userId: string,
    actorId: string | null,
    reason: string,
    ctx: ReqCtx | null,
    metadata: Record<string, unknown> = {},
  ) {
    const result = await this.repo.resetUser(userId, this.now())
    await this.event(userId, actorId ? "reset_by_admin" : "break_glass_reset", ctx, {
      actor: actorId,
      metadata: { reason, ...metadata, ...result },
    })
    return result
  }

  async recordAdminTokenEvent(userId: string, ctx: ReqCtx, metadata: Record<string, unknown>) {
    await this.event(userId, "admin_token_created", ctx, { metadata })
  }
}
