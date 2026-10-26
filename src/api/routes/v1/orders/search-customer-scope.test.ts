/**
 * GET /api/orders/search?customer=<user> and /api/offers/search?customer=<user>
 * returned anyone's orders/offers: a customer filter alone was enough to pass
 * the "has a scope" check. A bare customer filter must now be the caller.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

const h = vi.hoisted(() => ({ args: {} as Record<string, unknown> }))

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
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

function res() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}
const me = { user: { user_id: "me", role: "user" } } as unknown as Request

describe.each([
  ["orders", () => search_orders, () => orderHelpers.search_orders_optimized],
  [
    "offers",
    () => get_search,
    () => offerHelpers.search_offer_sessions_optimized,
  ],
])("%s search ?customer=", (_name, handler, searchFn) => {
  beforeEach(() => vi.clearAllMocks())

  it("refuses another user's customer filter without an org/shop scope", async () => {
    h.args = { customer_id: "victim" }
    const r = res()
    await handler()(me, r, vi.fn())
    expect(r.status).toHaveBeenCalledWith(403)
    expect(searchFn() as Mock).not.toHaveBeenCalled()
  })

  it("allows the caller's own purchases", async () => {
    h.args = { customer_id: "me" }
    const r = res()
    await handler()(me, r, vi.fn())
    expect(r.status).not.toHaveBeenCalled()
    expect(searchFn() as Mock).toHaveBeenCalled()
  })

  it("allows narrowing the caller's own sales by customer", async () => {
    h.args = { customer_id: "buyer", assigned_id: "me" }
    const r = res()
    await handler()(me, r, vi.fn())
    expect(r.status).not.toHaveBeenCalled()
  })
})
