/**
 * v1 org routes ignored an API token's contractor_ids: PUT /api/v1/orders/{id}
 * (order status), GET /orders/{id}, /orders/search and every
 * /contractors/{spectrum_id}/... route behind org_permission let a token act
 * for any org its user manages, even one the token wasn't granted.
 *
 * A token now needs the org (unless the user is only the order's customer, not
 * a member of the org); a granted token and browser sessions work as before.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: (t: string) => (h.db as (t: string) => unknown)(t) },
}))
vi.mock("./database.js", () => ({ getOrder: vi.fn() }))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => true),
  is_member: vi.fn(async () => true),
}))
vi.mock("../contractors/database.js", () => ({
  getContractor: vi.fn(async () => ({ contractor_id: "org-1", spectrum_id: "ORG1", archived: false })),
}))
vi.mock("./helpers.js", () => ({
  convert_order_search_query: vi.fn(),
  search_orders_optimized: vi.fn(async () => ({ items: [], item_counts: {} })),
  createOffer: vi.fn(),
  getContractorOrderData: vi.fn(),
  getContractorOrderMetrics: vi.fn(),
  handleAssignedUpdate: vi.fn(),
  handleStatusUpdate: vi.fn(),
  is_related_to_order: vi.fn(async () => true),
}))
vi.mock("./serializers.js", () => ({ serializeOrderDetails: vi.fn(async () => ({})) }))
vi.mock("../util/formatting.js", () => ({ formatOrderStubOptimized: vi.fn() }))
vi.mock("../../../../services/discord/discord.service.js", () => ({ discordService: {} }))

const { related_to_order } = await import("./middleware.js")
const { get_order_id, search_orders } = await import("./controller.js")
const { org_permission } = await import("../contractors/middleware.js")
const orderDb = await import("./database.js")
const helpers = await import("./helpers.js")

const ORG_ORDER = {
  order_id: "order-1",
  customer_id: "customer",
  assigned_id: "member",
  contractor_id: "org-1",
}

type Who = "session" | "no-org" | "org-1" | "full"
function makeReq(userId: string, who: Who, extra: object = {}) {
  return {
    user: { user_id: userId, role: "user", rsi_confirmed: true },
    __tokenInfo:
      who === "session"
        ? undefined
        : { id: "t", name: "t", scopes: who === "full" ? ["full"] : ["orders:write"], contractor_ids: who === "org-1" ? ["org-1"] : [] },
    params: { order_id: "order-1", spectrum_id: "ORG1" },
    query: {},
    isAuthenticated: () => true,
    ...extra,
  } as unknown as Request
}
function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { status: Mock; json: Mock }
}
const tokenRefusal = expect.objectContaining({
  error: expect.objectContaining({ message: "Token does not have access to this contractor" }),
})

beforeEach(() => {
  vi.clearAllMocks()
  h.db = createFakeKnex({
    contractor_members: [{ contractor_id: "org-1", user_id: "member" }],
    shops: [{ shop_id: "org-shop", owner_contractor_id: "org-1" }],
  })
  ;(orderDb.getOrder as Mock).mockResolvedValue(ORG_ORDER)
})

describe("PUT /api/v1/orders/{id} (related_to_order)", () => {
  async function run(userId: string, who: Who) {
    const res = makeRes()
    const next = vi.fn()
    await related_to_order(makeReq(userId, who), res, next)
    return { res, next }
  }

  it("refuses a token not granted the order's org", async () => {
    const { res, next } = await run("member", "no-org")
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(tokenRefusal)
  })

  it("lets a token granted the org (or a full token) through", async () => {
    expect((await run("member", "org-1")).next).toHaveBeenCalled()
    expect((await run("member", "full")).next).toHaveBeenCalled()
  })

  it("leaves sessions alone", async () => {
    expect((await run("member", "session")).next).toHaveBeenCalled()
  })

  it("lets the customer (not an org member) act on their own order with any token", async () => {
    expect((await run("customer", "no-org")).next).toHaveBeenCalled()
  })
})

describe("GET /api/v1/orders/{id}", () => {
  it("refuses a token not granted the org, serves granted tokens and sessions", async () => {
    let res = makeRes()
    await get_order_id(makeReq("member", "no-org"), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
    for (const who of ["org-1", "session"] as const) {
      res = makeRes()
      await get_order_id(makeReq("member", who), res, vi.fn())
      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalled()
    }
  })
})

describe("GET /api/v1/orders/search", () => {
  const convert = helpers.convert_order_search_query as Mock
  const search = helpers.search_orders_optimized as Mock

  it("refuses ?contractor= for a token not granted it", async () => {
    convert.mockResolvedValue({ contractor_id: "org-1" })
    const res = makeRes()
    await search_orders(makeReq("member", "no-org"), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
    expect(search).not.toHaveBeenCalled()
  })

  it("refuses ?shop_id= of an org's shop for a token not granted it", async () => {
    convert.mockResolvedValue({ shop_id: "org-shop" })
    const res = makeRes()
    await search_orders(makeReq("member", "no-org"), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("narrows ?assigned=me to the token's orgs", async () => {
    convert.mockResolvedValue({ assigned_id: "member" })
    await search_orders(makeReq("member", "no-org"), makeRes(), vi.fn())
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ org_scope: [], viewer_id: "member" }))
  })

  it("keeps a granted org and sessions", async () => {
    convert.mockResolvedValue({ contractor_id: "org-1" })
    await search_orders(makeReq("member", "org-1"), makeRes(), vi.fn())
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ org_scope: ["org-1"] }))
    convert.mockResolvedValue({ contractor_id: "org-1" })
    await search_orders(makeReq("member", "session"), makeRes(), vi.fn())
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ org_scope: null }))
  })
})

describe("org_permission (every /contractors/{spectrum_id}/... org route)", () => {
  async function run(who: Who) {
    const res = makeRes()
    const next = vi.fn()
    await org_permission("manage_orders")(makeReq("member", who), res, next)
    return { res, next }
  }

  it("refuses a token not granted the org", async () => {
    const { res, next } = await run("no-org")
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(tokenRefusal)
  })

  it("lets a granted token and sessions through", async () => {
    expect((await run("org-1")).next).toHaveBeenCalled()
    expect((await run("session")).next).toHaveBeenCalled()
  })
})
