/**
 * Admin MFA enforcement end to end through the request pipeline pieces:
 * populate-user's policy, the v1/v2 admin gates, has_permission, step-up,
 * refresh rotation and the JWT claims. Normal users must be untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Request, Response } from "express"

const state = vi.hoisted(() => ({
  enrolled: new Set<string>(),
  changedAt: new Map<string, Date>(),
}))

vi.mock("../instance.js", () => ({
  getMfaService: () => ({
    isEnrolled: async (id: string) => state.enrolled.has(id),
    mfaChangedAt: async (id: string) => state.changedAt.get(id) ?? null,
  }),
}))
vi.mock("rate-limiter-flexible", () => {
  class FakeLimiter {
    consume() {
      return Promise.resolve()
    }
  }
  return { RateLimiterPostgres: FakeLimiter, RateLimiterMemory: FakeLimiter }
})

import { applySiteRolePolicy } from "../../../api/util/site-admin-policy.js"
import { adminAuthorized } from "../../../api/middleware/auth.js"
import { expressAuthentication } from "../../../api/routes/v2/middleware/tsoa-auth.js"
import { isStepUpFresh } from "../../../api/util/step-up.js"
import { adminMfaSatisfied, stepUpSatisfied, type RequestAuth } from "../policy.js"
import { isSiteAdmin } from "../../../api/util/site-role.js"

process.env.JWT_SECRET ||= "test-jwt-secret"
const KEYS = JSON.stringify({ k1: Buffer.alloc(32, 3).toString("base64") })
const now = () => Date.now() / 1000
const ADMIN = { user_id: "admin-1", role: "admin" as const, username: "boss" }
const USER = { user_id: "user-1", role: "user" as const, username: "pleb" }

function req(user: object | undefined, auth?: RequestAuth, extra: Partial<Request> = {}) {
  return { headers: {}, user: user && { ...user }, auth, path: "/admin/imports", method: "GET", ...extra } as unknown as Request
}

function setEnv(enforce: string | undefined, keys: string | null = KEYS) {
  if (enforce === undefined) delete process.env.ADMIN_MFA_ENFORCE
  else process.env.ADMIN_MFA_ENFORCE = enforce
  if (keys === null) delete process.env.MFA_ENC_KEYS
  else process.env.MFA_ENC_KEYS = keys
}

function mockRes() {
  const out: { status: number; body: any } = { status: 200, body: null }
  const res = {
    status(c: number) {
      out.status = c
      return res
    },
    json(b: unknown) {
      out.body = b
      return res
    },
  } as unknown as Response
  return { res, out }
}

async function v1Admin(r: Request) {
  const { res, out } = mockRes()
  let passed = false
  await adminAuthorized(r, res, () => {
    passed = true
  })
  const code: string | undefined = out.body?.error?.code
  return passed ? "pass" : code?.startsWith("MFA_") ? code : out.status
}

async function v2Admin(r: Request) {
  try {
    await expressAuthentication(r, "loggedin")
    return "pass"
  } catch (e) {
    return (e as { code?: string }).code ?? (e as { status?: number }).status
  }
}

const saved = { ...process.env }
beforeEach(() => {
  state.enrolled.clear()
  state.changedAt.clear()
})
afterEach(() => {
  process.env.ADMIN_MFA_ENFORCE = saved.ADMIN_MFA_ENFORCE
  process.env.MFA_ENC_KEYS = saved.MFA_ENC_KEYS
  if (saved.ADMIN_MFA_ENFORCE === undefined) delete process.env.ADMIN_MFA_ENFORCE
  if (saved.MFA_ENC_KEYS === undefined) delete process.env.MFA_ENC_KEYS
})

describe("policy windows", () => {
  const t = 1_800_000_000
  const jwt = (mfaAt?: number): RequestAuth => ({ method: "jwt", sid: "s", mfaAt })

  it("admin window is 24 h, step-up 10 min", () => {
    expect(adminMfaSatisfied(jwt(t - 23 * 3600), null, t)).toBe(true)
    expect(adminMfaSatisfied(jwt(t - 24 * 3600 - 1), null, t)).toBe(false)
    expect(stepUpSatisfied(jwt(t - 599), null, t)).toBe(true)
    expect(stepUpSatisfied(jwt(t - 601), null, t)).toBe(false)
    expect(adminMfaSatisfied(jwt(undefined), null, t)).toBe(false)
  })

  it("an MFA older than mfa_changed_at does not count", () => {
    const changed = new Date((t - 60) * 1000)
    expect(adminMfaSatisfied(jwt(t - 120), changed, t)).toBe(false)
    expect(adminMfaSatisfied(jwt(t - 30), changed, t)).toBe(true)
  })

  it("tokens need an admin-only scope minted under a step-up newer than mfa_changed_at", () => {
    const tok = (scopes: string[], at: Date | null): RequestAuth => ({ method: "token", tokenScopes: scopes, tokenMfaAt: at })
    const at = new Date((t - 100) * 1000)
    expect(adminMfaSatisfied(tok(["admin"], at), null, t)).toBe(true)
    expect(adminMfaSatisfied(tok(["admin"], null), null, t)).toBe(false)
    expect(adminMfaSatisfied(tok(["full"], at), null, t)).toBe(false)
    expect(adminMfaSatisfied(tok(["admin"], at), new Date((t - 50) * 1000), t)).toBe(false)
    // Tokens can never step up.
    expect(stepUpSatisfied(tok(["admin"], new Date(t * 1000)), null, t)).toBe(false)
  })
})

describe("enforcement OFF (rollback)", () => {
  beforeEach(() => setEnv("false"))

  it("admins keep admin power without MFA; step-up is a no-op", async () => {
    const r = req(ADMIN, { method: "jwt", sid: "s" })
    await applySiteRolePolicy(r)
    expect(isSiteAdmin(r.user)).toBe(true)
    expect(r.adminLocked).toBeUndefined()
    expect(await v1Admin(r)).toBe("pass")
    expect(await v2Admin(r)).toBe("pass")
    expect(await isStepUpFresh(r)).toBe(true)
  })
})

describe("enforcement ON but MFA_ENC_KEYS missing", () => {
  beforeEach(() => setEnv("true", null))

  it("does not lock admins out of features they could not unlock", async () => {
    const r = req(ADMIN, { method: "jwt", sid: "s" })
    await applySiteRolePolicy(r)
    expect(isSiteAdmin(r.user)).toBe(true)
  })
})

describe("enforcement ON", () => {
  beforeEach(() => setEnv("true"))

  it("an admin without a factor is masked and told to enroll", async () => {
    const r = req(ADMIN, { method: "jwt", sid: "s" })
    await applySiteRolePolicy(r)
    expect(isSiteAdmin(r.user)).toBe(false)
    expect(r.adminLocked).toBe("mfa_enrollment")
    expect(await v1Admin(r)).toBe("MFA_ENROLLMENT_REQUIRED")
    expect(await v2Admin(r)).toBe("MFA_ENROLLMENT_REQUIRED")
  })

  it("an enrolled admin with a stale or missing verification gets MFA_REQUIRED", async () => {
    state.enrolled.add(ADMIN.user_id)
    for (const auth of [
      { method: "jwt", sid: "s" },
      { method: "jwt", sid: "s", mfaAt: now() - 25 * 3600 },
      { method: "session" },
    ] as RequestAuth[]) {
      const r = req(ADMIN, auth)
      await applySiteRolePolicy(r)
      expect(r.adminLocked).toBe("mfa_required")
      expect(await v1Admin(r)).toBe("MFA_REQUIRED")
      expect(await v2Admin(r)).toBe("MFA_REQUIRED")
    }
  })

  it("an admin verified within 24 h keeps admin power; step-up needs 10 min", async () => {
    state.enrolled.add(ADMIN.user_id)
    const r = req(ADMIN, { method: "jwt", sid: "s", mfaAt: now() - 3600 })
    await applySiteRolePolicy(r)
    expect(isSiteAdmin(r.user)).toBe(true)
    expect(await v1Admin(r)).toBe("pass")
    expect(await v2Admin(r)).toBe("pass")
    expect(await isStepUpFresh(r)).toBe(false)
    r.auth = { method: "jwt", sid: "s", mfaAt: now() - 60 }
    expect(await isStepUpFresh(r)).toBe(true)
  })

  it("removing a factor (mfa_changed_at bump) invalidates still-valid access tokens", async () => {
    state.enrolled.add(ADMIN.user_id)
    state.changedAt.set(ADMIN.user_id, new Date())
    const r = req(ADMIN, { method: "jwt", sid: "s", mfaAt: now() - 60 })
    await applySiteRolePolicy(r)
    expect(r.adminLocked).toBe("mfa_required")
  })

  it("a masked admin gets no has_permission bypass", async () => {
    vi.resetModules()
    vi.doMock("../../../api/routes/v1/contractors/database.js", () => ({
      getMemberRoles: async () => [],
      getContractorMembers: async () => [],
    }))
    const { has_permission } = await import("../../../api/routes/v1/util/permissions.js")
    const ctx = await import("../../../api/util/request-context.js")
    const r = req(ADMIN, { method: "jwt", sid: "s" })
    await applySiteRolePolicy(r)
    expect(
      await ctx.withRequestContext(r, () => has_permission("c1", ADMIN.user_id, "manage_orders")),
    ).toBe(false)
    vi.doUnmock("../../../api/routes/v1/contractors/database.js")
  })

  it("admin API tokens need an MFA-backed admin scope", async () => {
    const minted = req(ADMIN, { method: "token", tokenScopes: ["admin"], tokenMfaAt: new Date() }, {
      __tokenInfo: { id: "t", name: "t", scopes: ["admin"] },
    } as Partial<Request>)
    await applySiteRolePolicy(minted)
    expect(isSiteAdmin(minted.user)).toBe(true)

    const legacy = req(ADMIN, { method: "token", tokenScopes: ["admin", "full"], tokenMfaAt: null })
    await applySiteRolePolicy(legacy)
    expect(isSiteAdmin(legacy.user)).toBe(false)
    expect(legacy.adminLocked).toBe("mfa_required")
  })

  it("normal users are never touched", async () => {
    for (const auth of [undefined, { method: "jwt", sid: "s" }, { method: "token", tokenScopes: ["full"] }] as Array<RequestAuth | undefined>) {
      const r = req(USER, auth, { path: "/listings" } as Partial<Request>)
      const before = r.user
      await applySiteRolePolicy(r)
      expect(r.user).toBe(before)
      expect(r.adminLocked).toBeUndefined()
      expect(await v2Admin(r)).toBe("pass")
    }
    // and they still get the plain 403 on admin routes, not an MFA prompt
    const r = req(USER, { method: "jwt", sid: "s" })
    await applySiteRolePolicy(r)
    expect(await v2Admin(r)).toBe(403)
    expect(await v1Admin(r)).toBe(403)
  })

  it("anonymous requests are untouched", async () => {
    const r = req(undefined)
    await applySiteRolePolicy(r)
    expect(r.user).toBeUndefined()
  })

  it("API tokens cannot reach the two-factor endpoints", async () => {
    const r = req(USER, { method: "token" }, {
      path: "/auth/mfa/verify",
      method: "POST",
      __tokenInfo: { id: "t", name: "t", scopes: ["full"] },
    } as Partial<Request>)
    expect(await v2Admin(r)).toBe(403)
  })
})

describe("JWT and refresh rotation carry mfa_at", () => {
  it("access tokens carry sid, mfa_at and amr", async () => {
    const { generateAccessToken, verifyAccessToken } = await import("../../../api/util/jwt.js")
    const at = new Date("2026-10-26T12:00:00.123Z")
    const token = generateAccessToken(ADMIN, { sid: "sid-1", mfaAt: at, amr: ["oauth", "otp"] })
    expect(verifyAccessToken(token)).toMatchObject({
      sub: ADMIN.user_id,
      sid: "sid-1",
      mfa_at: at.getTime() / 1000,
      amr: ["oauth", "otp"],
    })
    const plain = verifyAccessToken(generateAccessToken(ADMIN, { sid: "sid-2" }))
    expect(plain?.mfa_at).toBeUndefined()
    expect(plain?.sid).toBe("sid-2")
  })

  it("rotation copies mfa_at/amr into the new row and returns its token_id", async () => {
    const rows: Record<string, any>[] = []
    const mfaAt = new Date("2026-10-26T11:00:00Z")
    vi.resetModules()
    vi.doMock("../../../clients/database/knex-db.js", () => {
      const knex = (table: string) => {
        expect(table).toBe("refresh_tokens")
        const q: any = {
          where: () => q,
          whereNull: () => q,
          update: () => ({
            returning: async () => [{ user_id: ADMIN.user_id, mfa_at: mfaAt, amr: ["oauth", "otp"] }],
          }),
          insert: (row: object) => {
            rows.push(row)
            return { returning: async () => [{ token_id: "new-sid" }] }
          },
        }
        return q
      }
      return { getKnex: () => knex, database: { knex } }
    })
    const { rotateRefreshToken } = await import("../../../api/util/jwt.js")
    const rotated = await rotateRefreshToken("old", { headers: {}, ip: "1.2.3.4" } as Request)
    expect(rotated).toMatchObject({ userId: ADMIN.user_id, tokenId: "new-sid", mfaAt, amr: ["oauth", "otp"] })
    expect(rows[0]).toMatchObject({ user_id: ADMIN.user_id, mfa_at: mfaAt, amr: ["oauth", "otp"] })
    vi.doUnmock("../../../clients/database/knex-db.js")
  })
})
