/**
 * MfaController wiring (the v2 *Controller*.test.ts glob is excluded from
 * vitest, so this lives with the service). Service and DB are faked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request } from "express"

const calls = vi.hoisted(() => ({ elevated: [] as unknown[], cookies: [] as string[] }))

vi.mock("../instance.js", () => ({
  getMfaService: () => ({
    confirmedFactors: async () => [],
    recoveryCodesRemaining: async () => 0,
    mfaChangedAt: async () => null,
    isEnrolled: async () => false,
    beginEnrollment: async () => ({
      factor_id: "f1",
      display: { otpauth_uri: "otpauth://x", qr_data_url: "data:x", manual_key: "AAAA" },
    }),
    verify: async () => ({ method: "totp", amr: ["oauth", "otp"], factorId: "f1" }),
  }),
}))
vi.mock("../../../api/util/jwt.js", async (orig) => ({
  ...(await orig<object>()),
  elevateRefreshSession: async (...args: unknown[]) => {
    calls.elevated.push(args)
    return true
  },
  setAccessCookie: (_res: unknown, token: string) => calls.cookies.push(token),
}))
vi.mock("../../../api/routes/v1/profiles/database.js", () => ({
  getUser: async ({ user_id }: { user_id: string }) => ({ user_id, role: "admin", username: "boss" }),
}))

import { MfaController } from "../../../api/routes/v2/mfa/MfaController.js"

process.env.JWT_SECRET ||= "test-jwt-secret"

function req(user: object, auth: object, extra: object = {}) {
  return { user, auth, headers: {}, ip: "127.0.0.1", res: {}, ...extra } as unknown as Request
}
const admin = { user_id: "a1", role: "admin", username: "boss" }
const user = { user_id: "u1", role: "user", username: "pleb" }

async function code(p: Promise<unknown>) {
  try {
    await p
    return "ok"
  } catch (e) {
    return (e as { code?: string }).code
  }
}

beforeEach(() => {
  calls.elevated.length = 0
  calls.cookies.length = 0
  process.env.ADMIN_MFA_ENFORCE = "true"
  process.env.MFA_ENC_KEYS = JSON.stringify({ k: Buffer.alloc(32, 1).toString("base64") })
})

describe("MfaController", () => {
  it("status: not required for regular users", async () => {
    const r = req(user, { method: "jwt", sid: "s" })
    const s = await new MfaController().getMfaStatus(r)
    expect(s).toMatchObject({ enforcement: "enforce", required: false, enrolled: false, admin_locked: null })
  })

  it("status: required for a masked admin, and reports the lock", async () => {
    const r = req({ ...admin, role: "user" }, { method: "jwt", sid: "s" }, { adminLocked: "mfa_enrollment" })
    const s = await new MfaController().getMfaStatus(r)
    expect(s).toMatchObject({ required: true, admin_locked: "mfa_enrollment", elevated_until: null })
  })

  it("enrollment is reachable by a masked admin, refused to regular users", async () => {
    const masked = req({ ...admin, role: "user" }, { method: "jwt", sid: "s" }, { adminLocked: "mfa_enrollment" })
    await expect(new MfaController().startTotpEnrollment(masked, {})).resolves.toMatchObject({ factor_id: "f1" })
    expect(await code(new MfaController().startTotpEnrollment(req(user, { method: "jwt", sid: "s" }), {}))).toBe("FORBIDDEN")
  })

  it("verification elevates the session row and re-issues the access cookie", async () => {
    const r = req({ ...admin, role: "user" }, { method: "jwt", sid: "sid-9" }, { adminLocked: "mfa_required" })
    const out = await new MfaController().verifyMfa(r, { code: "123456" })
    expect(out.method).toBe("totp")
    expect(calls.elevated[0]).toEqual(["sid-9", "a1", expect.any(Date), ["oauth", "otp"]])
    expect(calls.cookies).toHaveLength(1)
    expect(Date.parse(out.elevated_until) - Date.now()).toBeGreaterThan(23 * 3600 * 1000)
  })

  it("refuses legacy sessions and API tokens", async () => {
    expect(await code(new MfaController().verifyMfa(req(admin, { method: "session" }), { code: "123456" }))).toBe(
      "MFA_SESSION_UNSUPPORTED",
    )
    expect(await code(new MfaController().verifyMfa(req(admin, { method: "token" }), { code: "123456" }))).toBe("FORBIDDEN")
  })

  it("needs exactly one of code / recovery_code", async () => {
    const r = req(admin, { method: "jwt", sid: "s" })
    expect(await code(new MfaController().verifyMfa(r, {}))).toBe("VALIDATION_ERROR")
    expect(await code(new MfaController().verifyMfa(r, { code: "1", recovery_code: "2" }))).toBe("VALIDATION_ERROR")
  })

  it("regenerating recovery codes needs a fresh step-up", async () => {
    const r = req(admin, { method: "jwt", sid: "s", mfaAt: Date.now() / 1000 - 3600 })
    expect(await code(new MfaController().regenerateMfaRecoveryCodes(r))).toBe("MFA_STEP_UP_REQUIRED")
  })
})
