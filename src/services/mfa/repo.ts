/**
 * Data access for MFA. MfaService depends on the MfaRepo interface so the
 * security rules (replay, lockout) can be tested against an in-memory repo;
 * the knex implementation keeps each rule in a single atomic statement.
 */

import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import type { FactorRow, FactorType, MfaEvent } from "./types.js"

export interface NewFactor {
  id: string
  user_id: string
  type: FactorType
  label: string
  secret_ciphertext: string | null
  secret_key_id: string | null
  public_data: Record<string, unknown>
}

export interface RecoveryCodeRow {
  id: string
  user_id: string
  batch_id: string
  code_hash: string
  used_at: Date | null
}

export interface MfaEventInput {
  user_id: string
  actor_user_id?: string | null
  event: MfaEvent
  factor_id?: string | null
  factor_type?: string | null
  ip?: string | null
  user_agent?: string | null
  metadata?: Record<string, unknown>
}

export interface MfaRepo {
  listFactors(userId: string): Promise<FactorRow[]>
  getFactor(userId: string, factorId: string): Promise<FactorRow | undefined>
  /** Delete the user's unconfirmed factors (expired or abandoned enrollments). */
  deletePendingFactors(userId: string): Promise<void>
  insertFactor(factor: NewFactor): Promise<void>
  /** Confirm `factorId`, deleting any other confirmed factor of the same type. */
  confirmFactor(userId: string, factorId: string, type: FactorType, step: number | null): Promise<void>
  /**
   * Record a successful use at `step`, only if `step` is newer than the last
   * accepted one (replay protection). Returns false for a replay.
   */
  consumeStep(factorId: string, step: number): Promise<boolean>
  /** Reset failure counters after a success. */
  clearFailures(factorId: string): Promise<void>
  /** Record a failure; returns the updated row. */
  recordFailure(
    factorId: string,
    lock: (row: FactorRow) => { failed_attempts: number; lockout_count: number; locked_until: Date | null },
  ): Promise<FactorRow>
  deleteFactor(userId: string, factorId: string): Promise<void>

  unusedRecoveryCodes(userId: string): Promise<RecoveryCodeRow[]>
  replaceRecoveryCodes(userId: string, batchId: string, hashes: string[]): Promise<void>
  /** Mark a code used; false if it was already used (concurrent use). */
  useRecoveryCode(codeId: string, ip: string | null): Promise<boolean>

  getMfaChangedAt(userId: string): Promise<Date | null>
  bumpMfaChangedAt(userId: string, at: Date): Promise<void>

  recordEvent(event: MfaEventInput): Promise<void>

  /** Delete every factor and recovery code, revoke sessions and admin tokens. */
  resetUser(userId: string, at: Date): Promise<{ factors: number; sessions: number; tokens: number }>
}

const ADMIN_ONLY_SCOPES = ["admin", "moderation:read", "moderation:write"]

export function knexMfaRepo(knex: () => Knex = getKnex): MfaRepo {
  return {
    async listFactors(userId) {
      return knex()<FactorRow>("user_mfa_factors")
        .where({ user_id: userId })
        .orderBy("created_at", "asc")
    },
    async getFactor(userId, factorId) {
      return knex()<FactorRow>("user_mfa_factors")
        .where({ user_id: userId, id: factorId })
        .first()
    },
    async deletePendingFactors(userId) {
      await knex()("user_mfa_factors").where({ user_id: userId }).whereNull("confirmed_at").del()
    },
    async insertFactor(factor) {
      await knex()("user_mfa_factors").insert({
        ...factor,
        public_data: JSON.stringify(factor.public_data),
      })
    },
    async confirmFactor(userId, factorId, type, step) {
      await knex().transaction(async (trx) => {
        await trx("user_mfa_factors")
          .where({ user_id: userId, type })
          .whereNot({ id: factorId })
          .whereNotNull("confirmed_at")
          .del()
        await trx("user_mfa_factors")
          .where({ user_id: userId, id: factorId })
          .update({
            confirmed_at: trx.fn.now(),
            last_used_at: trx.fn.now(),
            last_used_counter: step,
            failed_attempts: 0,
            lockout_count: 0,
            locked_until: null,
          })
      })
    },
    async consumeStep(factorId, step) {
      const updated = await knex()("user_mfa_factors")
        .where({ id: factorId })
        .where((q) => q.whereNull("last_used_counter").orWhere("last_used_counter", "<", step))
        .update({ last_used_counter: step, last_used_at: knex().fn.now() })
      return updated > 0
    },
    async clearFailures(factorId) {
      await knex()("user_mfa_factors")
        .where({ id: factorId })
        .update({ failed_attempts: 0, lockout_count: 0, locked_until: null, last_used_at: knex().fn.now() })
    },
    async recordFailure(factorId, lock) {
      return knex().transaction(async (trx) => {
        const row = await trx<FactorRow>("user_mfa_factors")
          .where({ id: factorId })
          .forUpdate()
          .first()
        if (!row) throw new Error("MFA factor not found")
        const next = lock(row)
        await trx("user_mfa_factors").where({ id: factorId }).update(next)
        return { ...row, ...next }
      })
    },
    async deleteFactor(userId, factorId) {
      await knex()("user_mfa_factors").where({ user_id: userId, id: factorId }).del()
    },

    async unusedRecoveryCodes(userId) {
      return knex()<RecoveryCodeRow>("user_mfa_recovery_codes")
        .where({ user_id: userId })
        .whereNull("used_at")
    },
    async replaceRecoveryCodes(userId, batchId, hashes) {
      await knex().transaction(async (trx) => {
        await trx("user_mfa_recovery_codes").where({ user_id: userId }).del()
        if (hashes.length) {
          await trx("user_mfa_recovery_codes").insert(
            hashes.map((code_hash) => ({ user_id: userId, batch_id: batchId, code_hash })),
          )
        }
      })
    },
    async useRecoveryCode(codeId, ip) {
      const updated = await knex()("user_mfa_recovery_codes")
        .where({ id: codeId })
        .whereNull("used_at")
        .update({ used_at: knex().fn.now(), used_ip: ip })
      return updated > 0
    },

    async getMfaChangedAt(userId) {
      const row = await knex()("accounts").where({ user_id: userId }).first("mfa_changed_at")
      return row?.mfa_changed_at ?? null
    },
    async bumpMfaChangedAt(userId, at) {
      await knex()("accounts").where({ user_id: userId }).update({ mfa_changed_at: at })
    },

    async recordEvent(e) {
      await knex()("user_mfa_events").insert({
        user_id: e.user_id,
        actor_user_id: e.actor_user_id ?? null,
        event: e.event,
        factor_id: e.factor_id ?? null,
        factor_type: e.factor_type ?? null,
        ip: e.ip ?? null,
        user_agent: e.user_agent?.slice(0, 500) ?? null,
        metadata: JSON.stringify(e.metadata ?? {}),
      })
    },

    async resetUser(userId, at) {
      return knex().transaction(async (trx) => {
        const factors = await trx("user_mfa_factors").where({ user_id: userId }).del()
        await trx("user_mfa_recovery_codes").where({ user_id: userId }).del()
        await trx("accounts").where({ user_id: userId }).update({ mfa_changed_at: at })
        const sessions = await trx("refresh_tokens")
          .where({ user_id: userId })
          .whereNull("revoked_at")
          .update({ revoked_at: at })
        // Legacy passport sessions (connect-pg-simple, sess is json).
        const legacy = await trx.raw(
          `DELETE FROM login_sessions WHERE sess -> 'passport' ->> 'user' = ?`,
          [userId],
        )
        const tokens = await trx("api_tokens")
          .where({ user_id: userId })
          .whereNull("revoked_at")
          .whereRaw("scopes && ?::text[]", [ADMIN_ONLY_SCOPES])
          .update({ revoked_at: at })
        return {
          factors,
          sessions: sessions + ((legacy as { rowCount?: number }).rowCount ?? 0),
          tokens,
        }
      })
    },
  }
}
