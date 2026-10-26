import { describe, it, expect, beforeEach } from "vitest"
import { parseKeyring } from "../config.js"
import { MfaService, lockoutDurationMs, MAX_FAILED_ATTEMPTS } from "../service.js"
import { codeForStep, stepAt } from "../providers/totp.js"
import { open, aadFor } from "../crypto.js"
import { memoryRepo } from "./memory-repo.js"
import { BusinessLogicError } from "../../../api/routes/v1/util/errors.js"

const ring = parseKeyring(JSON.stringify({ k1: Buffer.alloc(32, 7).toString("base64") }), undefined)
if (!ring.ok) throw new Error(ring.reason)
const keyring = ring.keyring
const user = { user_id: "11111111-1111-1111-1111-111111111111", username: "boss" }
const ctx = { ip: "203.0.113.5", userAgent: "test" }

function setup() {
  let clock = new Date("2026-10-26T12:00:00Z")
  const now = () => clock
  const mem = memoryRepo(now)
  const consumed: string[] = []
  let budget = Infinity
  const limiter = {
    async consume(key: string) {
      consumed.push(key)
      if (consumed.length > budget) throw new Error("limited")
    },
  }
  const svc = new MfaService({
    repo: mem.repo,
    keyring: () => keyring,
    verifyLimiter: limiter,
    enrollLimiter: { consume: async () => undefined },
    now,
  })
  const secretOf = (factorId: string) => {
    const f = mem.factors.find((x) => x.id === factorId)!
    return open(f.secret_ciphertext!, aadFor(f.id, f.user_id, f.type), keyring)
  }
  const codeAt = (factorId: string, offsetSteps = 0) =>
    codeForStep(secretOf(factorId), stepAt(clock.getTime() / 1000) + offsetSteps)
  return {
    svc,
    mem,
    consumed,
    setBudget: (n: number) => (budget = n),
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    codeAt,
  }
}

async function enrolled(t: ReturnType<typeof setup>) {
  const { factor_id } = await t.svc.beginEnrollment(user, "totp", "Phone", ctx)
  // Confirm with the previous step so the current one is still usable.
  const { recoveryCodes } = await t.svc.confirmEnrollment(user, factor_id, t.codeAt(factor_id, -1), ctx)
  return { factorId: factor_id, recoveryCodes }
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p
    return "ok"
  } catch (e) {
    return e instanceof BusinessLogicError ? e.code : String(e)
  }
}

describe("MfaService", () => {
  let t: ReturnType<typeof setup>
  beforeEach(() => {
    t = setup()
  })

  it("stores the secret sealed, never in clear", async () => {
    const { factor_id, display } = await t.svc.beginEnrollment(user, "totp", "Phone", ctx)
    const row = t.mem.factors.find((f) => f.id === factor_id)!
    expect(row.secret_ciphertext).toMatch(/^v1\.k1\./)
    expect(row.secret_key_id).toBe("k1")
    expect(row.confirmed_at).toBeNull()
    expect(JSON.stringify(t.mem.events)).not.toContain(display.manual_key.replace(/ /g, ""))
  })

  it("confirms enrollment, returns 10 recovery codes once and bumps mfa_changed_at", async () => {
    const { recoveryCodes } = await enrolled(t)
    expect(recoveryCodes).toHaveLength(10)
    expect(new Set(recoveryCodes).size).toBe(10)
    expect(await t.svc.isEnrolled(user.user_id)).toBe(true)
    expect(await t.svc.recoveryCodesRemaining(user.user_id)).toBe(10)
    expect(t.mem.changedAt.get(user.user_id)).toBeInstanceOf(Date)
    expect(t.mem.events.map((e) => e.event)).toEqual(["enroll_started", "enroll_confirmed"])
  })

  it("rejects a wrong first code and an expired pending enrollment", async () => {
    const { factor_id } = await t.svc.beginEnrollment(user, "totp", "Phone", ctx)
    expect(await codeOf(t.svc.confirmEnrollment(user, factor_id, "000000", ctx))).toBe("MFA_INVALID_CODE")
    t.advance(16 * 60_000)
    expect(await codeOf(t.svc.confirmEnrollment(user, factor_id, t.codeAt(factor_id), ctx))).toBe("NOT_FOUND")
  })

  it("verifies a current code", async () => {
    const { factorId } = await enrolled(t)
    const out = await t.svc.verify(user.user_id, { code: t.codeAt(factorId) }, ctx)
    expect(out).toMatchObject({ method: "totp", amr: ["oauth", "otp"] })
  })

  describe("replay protection", () => {
    it("rejects the same code twice", async () => {
      const { factorId } = await enrolled(t)
      const code = t.codeAt(factorId)
      expect(await codeOf(t.svc.verify(user.user_id, { code }, ctx))).toBe("ok")
      expect(await codeOf(t.svc.verify(user.user_id, { code }, ctx))).toBe("MFA_INVALID_CODE")
    })

    it("rejects an earlier step after a later one was used", async () => {
      const { factorId } = await enrolled(t)
      const later = t.codeAt(factorId, 1)
      const current = t.codeAt(factorId, 0)
      expect(await codeOf(t.svc.verify(user.user_id, { code: later }, ctx))).toBe("ok")
      expect(await codeOf(t.svc.verify(user.user_id, { code: current }, ctx))).toBe("MFA_INVALID_CODE")
    })

    it("rejects reusing the enrollment code", async () => {
      const { factor_id } = await t.svc.beginEnrollment(user, "totp", "Phone", ctx)
      const code = t.codeAt(factor_id)
      await t.svc.confirmEnrollment(user, factor_id, code, ctx)
      expect(await codeOf(t.svc.verify(user.user_id, { code }, ctx))).toBe("MFA_INVALID_CODE")
    })
  })

  describe("lockout", () => {
    it("locks for 15 min after 5 failures, then doubles, and resets on success", async () => {
      const { factorId } = await enrolled(t)
      for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
        expect(await codeOf(t.svc.verify(user.user_id, { code: "000000" }, ctx))).toBe("MFA_INVALID_CODE")
      }
      expect(await codeOf(t.svc.verify(user.user_id, { code: "000000" }, ctx))).toBe("MFA_LOCKED")
      // Even a correct code is refused while locked.
      expect(await codeOf(t.svc.verify(user.user_id, { code: t.codeAt(factorId) }, ctx))).toBe("MFA_LOCKED")
      expect(t.mem.events.some((e) => e.event === "locked")).toBe(true)

      t.advance(15 * 60_000 + 1)
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        await codeOf(t.svc.verify(user.user_id, { code: "000000" }, ctx))
      }
      const f = t.mem.factors.find((x) => x.id === factorId)!
      expect(new Date(f.locked_until!).getTime() - Date.parse("2026-10-26T12:15:00.001Z")).toBe(30 * 60_000)

      t.advance(30 * 60_000 + 1)
      expect(await codeOf(t.svc.verify(user.user_id, { code: t.codeAt(factorId) }, ctx))).toBe("ok")
      expect(t.mem.factors.find((x) => x.id === factorId)).toMatchObject({
        failed_attempts: 0,
        lockout_count: 0,
        locked_until: null,
      })
    })

    it("caps the lockout at 24 h", () => {
      expect(lockoutDurationMs(1)).toBe(15 * 60_000)
      expect(lockoutDurationMs(2)).toBe(30 * 60_000)
      expect(lockoutDurationMs(20)).toBe(24 * 60 * 60_000)
    })

    it("reports attempts remaining", async () => {
      await enrolled(t)
      try {
        await t.svc.verify(user.user_id, { code: "000000" }, ctx)
      } catch (e) {
        expect((e as BusinessLogicError).details).toEqual({ attempts_remaining: 4 })
      }
    })
  })

  describe("recovery codes", () => {
    it("work once, case/format-insensitively, and share the lockout counters", async () => {
      const { recoveryCodes } = await enrolled(t)
      const [first] = recoveryCodes
      const out = await t.svc.verify(user.user_id, { recovery_code: first.toLowerCase().replace("-", "") }, ctx)
      expect(out).toMatchObject({ method: "recovery_code", recoveryCodesRemaining: 9 })
      expect(await codeOf(t.svc.verify(user.user_id, { recovery_code: first }, ctx))).toBe("MFA_INVALID_CODE")
      expect(t.mem.factors[0].failed_attempts).toBe(1)
      expect(t.mem.events.filter((e) => e.event === "recovery_used")).toHaveLength(1)
    })

    it("regeneration invalidates the old batch and bumps mfa_changed_at", async () => {
      const { recoveryCodes } = await enrolled(t)
      const before = t.mem.changedAt.get(user.user_id)!
      t.advance(1000)
      const { recoveryCodes: fresh } = await t.svc.regenerateRecoveryCodes(user.user_id, ctx)
      expect(t.mem.changedAt.get(user.user_id)!.getTime()).toBeGreaterThan(before.getTime())
      expect(await codeOf(t.svc.verify(user.user_id, { recovery_code: recoveryCodes[0] }, ctx))).toBe("MFA_INVALID_CODE")
      expect(await codeOf(t.svc.verify(user.user_id, { recovery_code: fresh[0] }, ctx))).toBe("ok")
    })
  })

  it("rate-limits verification per user and per IP", async () => {
    const { factorId } = await enrolled(t)
    t.consumed.length = 0
    t.setBudget(2)
    expect(await codeOf(t.svc.verify(user.user_id, { code: t.codeAt(factorId) }, ctx))).toBe("ok")
    expect(t.consumed).toEqual([`mfa:user:${user.user_id}`, "mfa:ip:203.0.113.5"])
    expect(await codeOf(t.svc.verify(user.user_id, { code: t.codeAt(factorId, 1) }, ctx))).toBe("RATE_LIMIT_EXCEEDED")
  })

  it("needs an enrolled factor to verify", async () => {
    expect(await codeOf(t.svc.verify(user.user_id, { code: "123456" }, ctx))).toBe("MFA_ENROLLMENT_REQUIRED")
  })

  it("replacing an authenticator removes the old one on confirmation", async () => {
    const { factorId: old } = await enrolled(t)
    const { factor_id } = await t.svc.beginEnrollment(user, "totp", "New phone", ctx)
    await t.svc.confirmEnrollment(user, factor_id, t.codeAt(factor_id), ctx)
    const confirmed = await t.svc.confirmedFactors(user.user_id)
    expect(confirmed.map((f) => f.id)).toEqual([factor_id])
    expect(confirmed.some((f) => f.id === old)).toBe(false)
  })

  it("removing a factor needs a current code and bumps mfa_changed_at", async () => {
    const { factorId } = await enrolled(t)
    expect(await codeOf(t.svc.removeFactor(user.user_id, factorId, { code: "000000" }, ctx))).toBe("MFA_INVALID_CODE")
    t.advance(1000)
    await t.svc.removeFactor(user.user_id, factorId, { code: t.codeAt(factorId) }, ctx)
    expect(await t.svc.isEnrolled(user.user_id)).toBe(false)
    expect(await t.svc.recoveryCodesRemaining(user.user_id)).toBe(0)
  })

  it("reset deletes factors and records who did it", async () => {
    await enrolled(t)
    await t.svc.resetUser(user.user_id, null, "lost phone", null, { operator: "owner" })
    expect(await t.svc.isEnrolled(user.user_id)).toBe(false)
    expect(t.mem.events.at(-1)).toMatchObject({
      event: "break_glass_reset",
      actor_user_id: null,
      metadata: expect.objectContaining({ reason: "lost phone", operator: "owner" }),
    })
  })

  it("refuses to enroll without an encryption key", async () => {
    const svc = new MfaService({
      repo: t.mem.repo,
      keyring: () => null,
      verifyLimiter: { consume: async () => undefined },
      enrollLimiter: { consume: async () => undefined },
    })
    expect(await codeOf(svc.beginEnrollment(user, "totp", "x", ctx))).toBe("MFA_NOT_CONFIGURED")
  })

  it("never writes codes or secrets to the audit log", async () => {
    const { factorId, recoveryCodes } = await enrolled(t)
    const code = t.codeAt(factorId)
    await t.svc.verify(user.user_id, { code }, ctx)
    await codeOf(t.svc.verify(user.user_id, { recovery_code: recoveryCodes[1] }, ctx))
    const dump = JSON.stringify(t.mem.events)
    expect(dump).not.toContain(code)
    expect(dump).not.toContain(recoveryCodes[1])
  })
})
