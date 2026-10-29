/**
 * Authorization of /api/public/v1 (design doc §2-§5), through the real router,
 * TSOA routes and auth module, on an in-memory database:
 * - sessions and anonymous requests are refused (401);
 * - legacy scm_ tokens are refused here (401), public tokens everywhere else;
 * - invalid, revoked and expired tokens are 401, and repeated attempts 429;
 * - per-route scopes fail closed (403 INSUFFICIENT_SCOPE);
 * - the token's org grant is enforced (404 outside it);
 * - the minter's CURRENT org permissions apply (a lost permission denies).
 *
 * The reused site read handlers are stubbed (their own rules have their own
 * tests); the gates in front of them and the order status change are real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import {
  createFakeKnex,
  type FakeKnex,
} from "../../../../test-utils/fake-knex-tables.js"

const state: {
  db: FakeKnex | null
  roles: Record<string, Record<string, boolean>[]>
} = {
  db: null,
  roles: {},
}

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
    get serverKnex() {
      return state.db
    },
  },
  withPoolOverride: (_k: unknown, fn: () => unknown) => fn(),
  createDedicatedKnex: () => state.db,
}))

vi.mock("../../../../clients/cdn/cdn.js", () => ({ cdn: {} }))

vi.mock("../../v1/profiles/database.js", () => ({
  getUser: async ({ user_id }: { user_id: string }) => {
    const row = state.db!.tables.accounts.find((a) => a.user_id === user_id)
    if (!row) throw new Error("Invalid user!")
    return { ...row }
  },
}))

vi.mock("../../v1/contractors/database.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMemberRoles: async (contractor_id: string, user_id: string) =>
    state.roles[`${contractor_id}:${user_id}`] ?? [],
}))

vi.mock("../../v1/orders/database.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  updateOrder: vi.fn(async () => []),
  trackOrderResponse: vi.fn(async () => undefined),
}))

// The reused site read handlers: stubs that report they were reached.
vi.mock("../../v2/orders/OrdersV2Controller.js", () => ({
  OrdersV2Controller: class {
    async getOrderDetail(orderId: string) {
      return { order_id: orderId, reached: true }
    }
    async getOrders() {
      return { orders: [], total: 0, page: 1, page_size: 25 }
    }
  },
}))
vi.mock("../../v2/offers/OffersV2Controller.js", () => ({
  OffersV2Controller: class {
    async getOfferSession(sessionId: string) {
      return { session_id: sessionId, reached: true }
    }
    async searchOffers() {
      return { offers: [], total: 0, page: 1, page_size: 25 }
    }
  },
}))

const { publicApiV1Router } = await import("./router.js")
const { refusePublicTokensElsewhere } = await import("./auth.js")
const { hashPublicToken, clearPublicTokenCache } =
  await import("../../../../services/public-api/tokens.service.js")
const { resetPublicRateLimits } = await import("./limits.js")
const { discordService } =
  await import("../../../../services/discord/discord.service.js")
const { notificationService } =
  await import("../../../../services/notifications/notification.service.js")
const { auditLogService } =
  await import("../../../../services/audit-log/audit-log.service.js")
const { tokenUsage } =
  await import("../../../../services/public-api/usage-recorder.js")

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const ORDER_A = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a"
const ORDER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
const ORDER_MINE_B = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c"
const OFFER_B = "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d"

const tok = (n: number) => `scmp_live_${String(n).repeat(64).slice(0, 64)}`
const ORDER_DESK_PERSONAL = tok(1)
const ORDER_DESK_ORG_A = tok(2)
const SHOP_SYNC = tok(3)
const REVOKED = tok(4)
const EXPIRED = tok(5)
const ORDER_DESK_ORG_B = tok(6)

const future = new Date(Date.now() + 86_400_000)
const past = new Date(Date.now() - 86_400_000)

function tokenRow(
  id: string,
  token: string,
  scopes: string[],
  contractor_ids: string[],
  extra = {},
) {
  return {
    id,
    user_id: ME,
    name: id,
    description: null,
    token_hash: hashPublicToken(token),
    token_hint: token.slice(-4),
    preset: "order_desk",
    scopes,
    contractor_ids,
    expires_at: future,
    last_used_at: null,
    revoked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...extra,
  }
}

const ORDER_DESK = [
  "shops:read",
  "orders:read",
  "orders:write",
  "offers:read",
  "offers:write",
]

function app() {
  const a = express()
  // Stands in for passport/session: a logged-in browser user.
  a.use((req, _res, next) => {
    if (req.headers["x-test-session"]) {
      req.user = { user_id: ME, username: "me", role: "user" } as Express.User
    }
    next()
  })
  a.use("/api/public/v1", publicApiV1Router)
  a.use(refusePublicTokensElsewhere)
  a.get("/api/v2/listings/mine", (_req, res) => {
    res.json({ served: true })
  })
  return a
}

beforeEach(() => {
  clearPublicTokenCache()
  resetPublicRateLimits()
  tokenUsage.stop()
  state.roles = {}
  state.db = createFakeKnex({
    accounts: [
      {
        user_id: ME,
        username: "me",
        display_name: "Me",
        role: "user",
        banned: false,
      },
      {
        user_id: OTHER,
        username: "other",
        display_name: "Other",
        role: "user",
        banned: false,
      },
    ],
    public_api_tokens: [
      tokenRow("t-personal", ORDER_DESK_PERSONAL, ORDER_DESK, []),
      tokenRow("t-org-a", ORDER_DESK_ORG_A, ORDER_DESK, [ORG_A]),
      tokenRow("t-org-b", ORDER_DESK_ORG_B, ORDER_DESK, [ORG_B]),
      tokenRow(
        "t-sync",
        SHOP_SYNC,
        ["shops:read", "listings:read", "stock:read"],
        [],
        { preset: "shop_sync" },
      ),
      tokenRow("t-revoked", REVOKED, ORDER_DESK, [], { revoked_at: past }),
      tokenRow("t-expired", EXPIRED, ORDER_DESK, [], { expires_at: past }),
    ],
    contractors: [
      { contractor_id: ORG_A, spectrum_id: "ORGA", name: "Org A" },
      { contractor_id: ORG_B, spectrum_id: "ORGB", name: "Org B" },
    ],
    contractor_members: [
      { contractor_id: ORG_A, user_id: ME },
      { contractor_id: ORG_B, user_id: ME },
    ],
    shops: [
      {
        shop_id: "shop-a",
        slug: "orga",
        owner_contractor_id: ORG_A,
        owner_user_id: null,
      },
      {
        shop_id: "shop-b",
        slug: "orgb",
        owner_contractor_id: ORG_B,
        owner_user_id: null,
      },
    ],
    orders: [
      {
        order_id: ORDER_A,
        contractor_id: ORG_A,
        shop_id: "shop-a",
        customer_id: OTHER,
        assigned_id: null,
        status: "not-started",
        thread_id: null,
      },
      {
        order_id: ORDER_B,
        contractor_id: ORG_B,
        shop_id: "shop-b",
        customer_id: OTHER,
        assigned_id: null,
        status: "not-started",
      },
      {
        order_id: ORDER_MINE_B,
        contractor_id: ORG_B,
        shop_id: "shop-b",
        customer_id: ME,
        assigned_id: null,
        status: "not-started",
      },
    ],
    offer_sessions: [
      {
        id: OFFER_B,
        contractor_id: ORG_B,
        shop_id: "shop-b",
        customer_id: OTHER,
        assigned_id: null,
        status: "active",
      },
    ],
    order_offers: [
      {
        id: "offer-1",
        session_id: OFFER_B,
        actor_id: OTHER,
        timestamp: new Date(),
      },
    ],
    chats: [],
  })
  vi.spyOn(discordService, "assignUserToThread").mockResolvedValue(
    undefined as never,
  )
  vi.spyOn(discordService, "sendOrderStatusUpdate").mockResolvedValue(
    undefined as never,
  )
  vi.spyOn(
    notificationService,
    "createOrderStatusNotification",
  ).mockResolvedValue(undefined as never)
  vi.spyOn(auditLogService, "record").mockResolvedValue(undefined)
})

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })

describe("public API authentication", () => {
  it("refuses a request without a token, even with a browser session", async () => {
    const anon = await request(app()).get("/api/public/v1/me")
    expect(anon.status).toBe(401)
    expect(anon.body.error.code).toBe("UNAUTHORIZED")

    const session = await request(app())
      .get("/api/public/v1/orders")
      .set("x-test-session", "1")
    expect(session.status).toBe(401)
    expect(session.body.error.code).toBe("UNAUTHORIZED")
  })

  it("refuses a legacy scm_ token", async () => {
    const res = await request(app())
      .get("/api/public/v1/me")
      .set(bearer(`scm_live_${"a".repeat(64)}`))
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe("INVALID_TOKEN")
    expect(res.body.error.message).toMatch(/Legacy API tokens/)
  })

  it("refuses a public token on internal routes", async () => {
    const res = await request(app())
      .get("/api/v2/listings/mine")
      .set(bearer(ORDER_DESK_PERSONAL))
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe("INVALID_TOKEN")
    expect(res.body.served).toBeUndefined()
    // Without the token the internal route is untouched.
    expect((await request(app()).get("/api/v2/listings/mine")).body).toEqual({
      served: true,
    })
  })

  it("answers 401 for unknown, revoked and expired tokens, then 429 per IP", async () => {
    for (const t of [tok(9), REVOKED, EXPIRED]) {
      const res = await request(app()).get("/api/public/v1/me").set(bearer(t))
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("INVALID_TOKEN")
    }
    let last = 0
    for (let i = 0; i < 20; i++) {
      last = (
        await request(app())
          .get("/api/public/v1/me")
          .set(bearer(tok(8)))
      ).status
    }
    expect(last).toBe(429)
    // A valid token from the same IP is held back too.
    expect(
      (
        await request(app())
          .get("/api/public/v1/me")
          .set(bearer(ORDER_DESK_PERSONAL))
      ).status,
    ).toBe(429)
  })

  it("serves token introspection with the token alone", async () => {
    const res = await request(app())
      .get("/api/public/v1/me")
      .set(bearer(ORDER_DESK_ORG_A))
    expect(res.status).toBe(200)
    expect(res.body.data.user.user_id).toBe(ME)
    expect(res.body.data.token.scopes).toEqual(ORDER_DESK)
    expect(res.body.data.token.orgs).toEqual([
      { contractor_id: ORG_A, spectrum_id: "ORGA", name: "Org A" },
    ])
    expect(res.headers["x-ratelimit-limit"]).toBe("120")
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })
})

describe("public API scopes", () => {
  it("refuses a token without the route's scope", async () => {
    const res = await request(app())
      .get(`/api/public/v1/orders/${ORDER_MINE_B}`)
      .set(bearer(SHOP_SYNC))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("INSUFFICIENT_SCOPE")
    expect(res.body.error.details.required).toEqual(["orders:read"])

    const write = await request(app())
      .post(`/api/public/v1/offers/${OFFER_B}/accept`)
      .set(bearer(SHOP_SYNC))
    expect(write.status).toBe(403)
    expect(write.body.error.code).toBe("INSUFFICIENT_SCOPE")
  })

  it("answers 404 in the public envelope for routes that don't exist", async () => {
    const res = await request(app())
      .get("/api/public/v1/admin/users")
      .set(bearer(ORDER_DESK_PERSONAL))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })
})

describe("public API org grant", () => {
  it("hides an org's order from a token not granted that org", async () => {
    const personal = await request(app())
      .get(`/api/public/v1/orders/${ORDER_B}`)
      .set(bearer(ORDER_DESK_PERSONAL))
    expect(personal.status).toBe(404)
    const otherOrg = await request(app())
      .get(`/api/public/v1/orders/${ORDER_B}`)
      .set(bearer(ORDER_DESK_ORG_A))
    expect(otherOrg.status).toBe(404)

    const granted = await request(app())
      .get(`/api/public/v1/orders/${ORDER_B}`)
      .set(bearer(ORDER_DESK_ORG_B))
    expect(granted.status).toBe(200)
    expect(granted.body.data).toEqual({ order_id: ORDER_B, reached: true })
  })

  it("hides an org's offer from a token not granted that org", async () => {
    expect(
      (
        await request(app())
          .get(`/api/public/v1/offers/${OFFER_B}`)
          .set(bearer(ORDER_DESK_ORG_A))
      ).status,
    ).toBe(404)
    const granted = await request(app())
      .get(`/api/public/v1/offers/${OFFER_B}`)
      .set(bearer(ORDER_DESK_ORG_B))
    expect(granted.status).toBe(200)
    expect(granted.body.data).toEqual({ session_id: OFFER_B, reached: true })
  })

  it("keeps the user's own orders as customer visible without a grant", async () => {
    const res = await request(app())
      .get(`/api/public/v1/orders/${ORDER_MINE_B}`)
      .set(bearer(ORDER_DESK_PERSONAL))
    expect(res.status).toBe(200)
  })

  it("hides an org's offer from a token not granted that org, for reads and answers", async () => {
    expect(
      (
        await request(app())
          .get(`/api/public/v1/offers/${OFFER_B}`)
          .set(bearer(ORDER_DESK_ORG_A))
      ).status,
    ).toBe(404)
    state.roles[`${ORG_B}:${ME}`] = [{ manage_orders: true }]
    const accept = await request(app())
      .post(`/api/public/v1/offers/${OFFER_B}/accept`)
      .set(bearer(ORDER_DESK_ORG_A))
    expect(accept.status).toBe(404)
  })

  it("refuses an org order status change for a token not granted the org, despite the user's role", async () => {
    state.roles[`${ORG_B}:${ME}`] = [{ manage_orders: true }]
    const res = await request(app())
      .post(`/api/public/v1/orders/${ORDER_B}/status`)
      .set(bearer(ORDER_DESK_ORG_A))
      .send({ status: "in-progress" })
    expect(res.status).toBe(404)
  })
})

describe("public API uses the minter's current permissions", () => {
  it("allows a status change while the user holds manage_orders in the granted org", async () => {
    state.roles[`${ORG_A}:${ME}`] = [{ manage_orders: true }]
    const res = await request(app())
      .post(`/api/public/v1/orders/${ORDER_A}/status`)
      .set(bearer(ORDER_DESK_ORG_A))
      .send({ status: "in-progress" })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ order_id: ORDER_A, status: "in-progress" })
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "public_api.order_status_changed",
        metadata: expect.objectContaining({ via_api_token_id: "t-org-a" }),
      }),
    )
  })

  it("refuses it once the user has lost manage_orders (still claim_orders)", async () => {
    state.roles[`${ORG_A}:${ME}`] = [{ claim_orders: true }]
    const res = await request(app())
      .post(`/api/public/v1/orders/${ORDER_A}/status`)
      .set(bearer(ORDER_DESK_ORG_A))
      .send({ status: "in-progress" })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("FORBIDDEN")
  })

  it("hides the order once the user holds no order role there at all", async () => {
    const res = await request(app())
      .post(`/api/public/v1/orders/${ORDER_A}/status`)
      .set(bearer(ORDER_DESK_ORG_A))
      .send({ status: "in-progress" })
    expect(res.status).toBe(404)
  })

  it("never lends a site admin's role to a token", async () => {
    state.db!.tables.accounts[0].role = "admin"
    const res = await request(app())
      .post(`/api/public/v1/orders/${ORDER_A}/status`)
      .set(bearer(ORDER_DESK_ORG_A))
      .send({ status: "in-progress" })
    expect(res.status).toBe(404)
  })

  it("validates the body against the spec", async () => {
    state.roles[`${ORG_A}:${ME}`] = [{ manage_orders: true }]
    const res = await request(app())
      .post(`/api/public/v1/orders/${ORDER_A}/status`)
      .set(bearer(ORDER_DESK_ORG_A))
      .send({ status: "not-started" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })
})
