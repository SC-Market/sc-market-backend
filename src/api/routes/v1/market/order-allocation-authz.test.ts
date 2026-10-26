/**
 * V1 order allocation endpoints (still used by the order page's Stock
 * Allocation tab) had no authorization: any logged-in user could read an
 * order's allocations and allocate or deallocate arbitrary lots.
 *
 * Now: seller side only (assigned seller, manage_orders in the org, shop
 * managers, site admins), and every lot must belong to a listing in the order.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"
import {
  createFakeKnex,
  type FakeKnex,
} from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown as FakeKnex }))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: (t: string) => h.db(t) },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../util/permissions.js", () => ({ has_permission: vi.fn() }))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  canManageShop: vi.fn(),
}))
vi.mock("../../../../services/allocation/allocation.service.js", () => ({
  AllocationService: class {
    manualAllocate = vi.fn(async () => [])
    getAllocations = vi.fn(async () => [])
  },
}))

const { has_permission } = await import("../util/permissions.js")
const { canManageShop } =
  await import("../../../../services/shops/shop-permissions.service.js")
const { getOrderAllocations, manualAllocateOrder } =
  await import("./stock-lots.controller.js")

function res() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}

const order = {
  order_id: "o1",
  customer_id: "buyer",
  assigned_id: null,
  contractor_id: "org1",
  shop_id: "shop1",
}

beforeEach(() => {
  vi.clearAllMocks()
  h.db = createFakeKnex({
    orders: [{ ...order }],
    shops: [
      { shop_id: "shop1", owner_user_id: null, owner_contractor_id: "org1" },
    ],
    market_orders: [],
    order_market_items_v2: [{ order_id: "o1", listing_id: "L-order" }],
    stock_lots: [
      { lot_id: "lot-mine", listing_id: "L-order" },
      { lot_id: "lot-victim", listing_id: "L-victim" },
    ],
  })
  ;(has_permission as Mock).mockResolvedValue(false)
  ;(canManageShop as Mock).mockResolvedValue(false)
})

describe("GET /orders/:order_id/allocations", () => {
  it("refuses an unrelated user", async () => {
    const r = res()
    await getOrderAllocations(
      {
        params: { order_id: "o1" },
        user: { user_id: "stranger" },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
  })

  it("refuses the customer (allocations expose the seller's lots)", async () => {
    const r = res()
    await getOrderAllocations(
      {
        params: { order_id: "o1" },
        user: { user_id: "buyer" },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
  })
})

describe("POST /orders/:order_id/allocations/manual", () => {
  const body = (lot_id: string) => ({ allocations: [{ lot_id, quantity: 1 }] })

  it("refuses an unrelated user", async () => {
    const r = res()
    await manualAllocateOrder(
      {
        params: { order_id: "o1" },
        user: { user_id: "stranger" },
        body: body("lot-mine"),
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
  })

  it("refuses a seller allocating a lot from a listing outside the order", async () => {
    ;(has_permission as Mock).mockResolvedValue(true) // manage_orders in org1
    const r = res()
    await manualAllocateOrder(
      {
        params: { order_id: "o1" },
        user: { user_id: "seller" },
        body: body("lot-victim"),
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(400)
  })

  it("allows the seller to allocate a lot of an ordered listing", async () => {
    ;(has_permission as Mock).mockResolvedValue(true)
    const r = res()
    await manualAllocateOrder(
      {
        params: { order_id: "o1" },
        user: { user_id: "seller" },
        body: body("lot-mine"),
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).not.toHaveBeenCalled()
    expect(r.json).toHaveBeenCalled()
  })

  it("rejects negative quantities", async () => {
    ;(has_permission as Mock).mockResolvedValue(true)
    const r = res()
    await manualAllocateOrder(
      {
        params: { order_id: "o1" },
        user: { user_id: "seller" },
        body: { allocations: [{ lot_id: "lot-mine", quantity: -5 }] },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(400)
  })
})
