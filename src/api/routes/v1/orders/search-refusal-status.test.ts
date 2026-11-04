/**
 * GET /api/orders/search and GET /api/offers/search refuse a search the
 * caller may not run with 403 (an authorization refusal) on both routes.
 * The orders route used to answer 400 where the offers route answered 403,
 * e.g. for a shop whose orders the caller doesn't handle.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({
  args: {} as Record<string, unknown>,
  db: null as unknown,
}))

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(
    () => h.db,
  ),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(async () => false),
}))
vi.mock("./helpers.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  convert_order_search_query: vi.fn(async () => h.args),
  search_orders_optimized: vi.fn(async () => ({ item_counts: {}, items: [] })),
}))
vi.mock("../offers/helpers.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  convert_offer_search_query: vi.fn(async () => h.args),
  search_offer_sessions_optimized: vi.fn(async () => ({
    item_counts: {},
    items: [],
  })),
}))

const orderHelpers = await import("./helpers.js")
const offerHelpers = await import("../offers/helpers.js")
const { search_orders } = await import("./controller.js")
const { get_search } = await import("../offers/controller.js")

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { status: Mock; json: Mock }
}
const me = { user: { user_id: "me", role: "user" } } as unknown as Request

beforeEach(() => {
  vi.clearAllMocks()
  h.db = createFakeKnex({
    shops: [
      {
        shop_id: "shop-user",
        owner_user_id: "owner",
        owner_contractor_id: null,
      },
      {
        shop_id: "shop-org",
        owner_user_id: null,
        owner_contractor_id: "org-1",
      },
    ],
  })
})

describe.each([
  ["orders", () => search_orders, () => orderHelpers.search_orders_optimized],
  [
    "offers",
    () => get_search,
    () => offerHelpers.search_offer_sessions_optimized,
  ],
])("%s search refusals", (_name, handler, searchFn) => {
  it.each([
    ["someone else's personal shop", { shop_id: "shop-user" }],
    ["an org's shop the caller isn't a member of", { shop_id: "shop-org" }],
    ["an org the caller isn't a member of", { contractor_id: "org-1" }],
    ["another user's assigned orders", { assigned_id: "someone" }],
    ["no scope at all", {}],
  ])("%s: 403", async (_case, args) => {
    h.args = args
    const res = mockRes()
    await handler()(me, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "FORBIDDEN" }),
      }),
    )
    expect(searchFn() as Mock).not.toHaveBeenCalled()
  })
})
