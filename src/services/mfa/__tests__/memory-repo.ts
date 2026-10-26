import type { MfaRepo, MfaEventInput, RecoveryCodeRow } from "../repo.js"
import type { FactorRow } from "../types.js"
import crypto from "node:crypto"

/** In-memory MfaRepo with the same atomicity rules as the knex one. */
export function memoryRepo(now: () => Date = () => new Date()) {
  const factors: FactorRow[] = []
  const codes: RecoveryCodeRow[] = []
  const events: MfaEventInput[] = []
  const changedAt = new Map<string, Date>()

  const repo: MfaRepo = {
    async listFactors(userId) {
      return factors.filter((f) => f.user_id === userId).map((f) => ({ ...f }))
    },
    async getFactor(userId, id) {
      const f = factors.find((x) => x.user_id === userId && x.id === id)
      return f && { ...f }
    },
    async deletePendingFactors(userId) {
      for (let i = factors.length - 1; i >= 0; i--) {
        if (factors[i].user_id === userId && !factors[i].confirmed_at) factors.splice(i, 1)
      }
    },
    async insertFactor(f) {
      factors.push({
        ...f,
        last_used_counter: null,
        failed_attempts: 0,
        lockout_count: 0,
        locked_until: null,
        created_at: now(),
        confirmed_at: null,
        last_used_at: null,
      })
    },
    async confirmFactor(userId, id, type, step) {
      for (let i = factors.length - 1; i >= 0; i--) {
        const f = factors[i]
        if (f.user_id === userId && f.type === type && f.id !== id && f.confirmed_at) factors.splice(i, 1)
      }
      const f = factors.find((x) => x.id === id)!
      Object.assign(f, { confirmed_at: now(), last_used_counter: step, failed_attempts: 0, lockout_count: 0, locked_until: null })
    },
    async consumeStep(id, step) {
      const f = factors.find((x) => x.id === id)!
      if (f.last_used_counter !== null && Number(f.last_used_counter) >= step) return false
      f.last_used_counter = step
      f.last_used_at = now()
      return true
    },
    async clearFailures(id) {
      Object.assign(factors.find((x) => x.id === id)!, { failed_attempts: 0, lockout_count: 0, locked_until: null })
    },
    async recordFailure(id, lock) {
      const f = factors.find((x) => x.id === id)!
      Object.assign(f, lock({ ...f }))
      return { ...f }
    },
    async deleteFactor(userId, id) {
      const i = factors.findIndex((x) => x.user_id === userId && x.id === id)
      if (i >= 0) factors.splice(i, 1)
    },
    async unusedRecoveryCodes(userId) {
      return codes.filter((c) => c.user_id === userId && !c.used_at).map((c) => ({ ...c }))
    },
    async replaceRecoveryCodes(userId, batchId, hashes) {
      for (let i = codes.length - 1; i >= 0; i--) if (codes[i].user_id === userId) codes.splice(i, 1)
      for (const code_hash of hashes) {
        codes.push({ id: crypto.randomUUID(), user_id: userId, batch_id: batchId, code_hash, used_at: null })
      }
    },
    async useRecoveryCode(id) {
      const c = codes.find((x) => x.id === id)!
      if (c.used_at) return false
      c.used_at = now()
      return true
    },
    async getMfaChangedAt(userId) {
      return changedAt.get(userId) ?? null
    },
    async bumpMfaChangedAt(userId, at) {
      changedAt.set(userId, at)
    },
    async recordEvent(e) {
      events.push(e)
    },
    async resetUser(userId, at) {
      const before = factors.length
      for (let i = factors.length - 1; i >= 0; i--) if (factors[i].user_id === userId) factors.splice(i, 1)
      for (let i = codes.length - 1; i >= 0; i--) if (codes[i].user_id === userId) codes.splice(i, 1)
      changedAt.set(userId, at)
      return { factors: before - factors.length, sessions: 0, tokens: 0 }
    },
  }
  return { repo, factors, codes, events, changedAt }
}
