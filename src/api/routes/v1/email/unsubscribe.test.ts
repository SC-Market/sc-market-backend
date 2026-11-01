/**
 * One-click unsubscribe through the real email router, logged out (no
 * session, no cookie, no bearer token): a signed link turns its category off
 * under the email's scope; RFC 8058 posts (form body) work; repeats succeed;
 * a forged or unknown token changes nothing; a GET only redirects to the
 * confirmation page; old stored tokens still work and can be reused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"

const h = vi.hoisted(() => ({
  applied: [] as unknown[][],
  appliedAll: [] as string[],
  legacy: new Map<string, { user_id: string; used_at: Date | null }>(),
}))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => () => ({}),
  database: { setStrategy: () => {} },
}))
vi.mock("../../../../services/email/unsubscribe.js", () => ({
  applyUnsubscribe: async (...args: unknown[]) => {
    h.applied.push(args)
    return { turnedOff: 6, label: "order updates" }
  },
  applyUnsubscribeAll: async (userId: string) => {
    h.appliedAll.push(userId)
    return { turnedOff: 20, label: "all notification emails" }
  },
}))
vi.mock("./unsubscribe-database.js", () => ({
  getUnsubscribeToken: async (token: string) => h.legacy.get(token) ?? null,
  markUnsubscribeTokenAsUsed: async (record: { used_at: Date | null }) => {
    record.used_at = new Date()
    return record
  },
}))
vi.mock("../../../../services/email/email.service.js", () => ({ emailService: {} }))
vi.mock("../contractors/database.js", () => ({}))
vi.mock("../notifications/database.js", () => ({}))
// The other email routes' middleware (Postgres-backed rate limits, auth):
// pass-through here. The unsubscribe routes use neither.
vi.mock("../../../middleware/enhanced-ratelimiting.js", () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next()
  return { readRateLimit: pass, commonWriteRateLimit: pass }
})
vi.mock("../../../middleware/auth.js", () => {
  const deny = (_req: unknown, res: { status: (n: number) => { end: () => void } }) => res.status(401).end()
  return { userAuthorized: deny, requireProfileRead: deny, requireProfileWrite: deny }
})
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

process.env.SESSION_SECRET = "unit-test-secret"
process.env.FRONTEND_URL = "https://sc-market.space"

const { emailRouter } = await import("./routes.js")
const { createUnsubscribeToken } = await import("../../../../services/email/unsubscribe-token.js")

const USER = "11111111-2222-4333-8444-555555555555"
const ORG = "99999999-2222-4333-8444-555555555555"

function app() {
  const a = express()
  a.use(express.json())
  a.use("/api/v1/email", emailRouter)
  return a
}

describe("POST /api/v1/email/unsubscribe/:token (no login)", () => {
  beforeEach(() => {
    h.applied = []
    h.appliedAll = []
    h.legacy.clear()
  })

  it("turns the link's category off under the email's scope, without a session", async () => {
    const token = createUnsubscribeToken({
      userId: USER,
      scope: { kind: "category", category: "orders" },
      contractorId: ORG,
    })
    const res = await request(app()).post(`/api/v1/email/unsubscribe/${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ success: true, scope: "orders", label: "order updates" })
    expect(h.applied).toEqual([[USER, { kind: "category", category: "orders" }, ORG]])
  })

  it("accepts an RFC 8058 one-click post and repeated clicks", async () => {
    const token = createUnsubscribeToken({ userId: USER, scope: { kind: "key_defaults" }, contractorId: null })
    for (let i = 0; i < 2; i++) {
      const res = await request(app())
        .post(`/api/v1/email/unsubscribe/${token}`)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send("List-Unsubscribe=One-Click")
      expect(res.status).toBe(200)
    }
    expect(h.applied).toHaveLength(2)
  })

  it("all=true turns off every email that can be turned off", async () => {
    const token = createUnsubscribeToken({
      userId: USER,
      scope: { kind: "category", category: "offers" },
      contractorId: null,
    })
    const res = await request(app()).post(`/api/v1/email/unsubscribe/${token}?all=true`)
    expect(res.status).toBe(200)
    expect(res.body.data.scope).toBe("all")
    expect(h.appliedAll).toEqual([USER])
    expect(h.applied).toEqual([])
  })

  it("rejects a forged or unknown token and changes nothing", async () => {
    const token = createUnsubscribeToken(
      { userId: USER, scope: { kind: "category", category: "orders" }, contractorId: null },
      "another-secret",
    )
    for (const t of [token, "u1.e30.AAAA", "nonsense", "a".repeat(64)]) {
      const res = await request(app()).post(`/api/v1/email/unsubscribe/${t}`)
      expect(res.status).toBe(400)
    }
    expect(h.applied).toEqual([])
    expect(h.appliedAll).toEqual([])
  })

  it("keeps old stored links working, any number of times (they meant 'all')", async () => {
    const old = "ab".repeat(32)
    h.legacy.set(old, { user_id: USER, used_at: null })
    expect((await request(app()).post(`/api/v1/email/unsubscribe/${old}`)).status).toBe(200)
    expect((await request(app()).post(`/api/v1/email/unsubscribe/${old}`)).status).toBe(200)
    expect(h.appliedAll).toEqual([USER, USER])
  })
})

describe("GET /api/v1/email/unsubscribe/:token", () => {
  it("only redirects to the confirmation page (link scanners must not unsubscribe)", async () => {
    h.applied = []
    const res = await request(app()).get("/api/v1/email/unsubscribe/u1.abc.def")
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe("https://sc-market.space/email/unsubscribe/u1.abc.def")
    expect(h.applied).toEqual([])
  })
})
