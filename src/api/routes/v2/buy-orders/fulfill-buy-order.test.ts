/**
 * POST /buy-orders/{id}/fulfill contract: the seller names one of their
 * listings + variants, and the order created is linked to that listing's shop.
 *
 * Runs the real handler against a small in-memory transaction. Named without
 * "Controller" so it is not swept up by the vitest exclusion for DB-backed v2
 * controller tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request as ExpressRequest } from "express"

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  canManage: (_shop: Row, _userId: string) => true,
  mode: "auto" as string,
  problem: null as null | { field: string; message: string },
}))

function makeTrx() {
  let nextId = 1
  const trx: any = (table: string) => {
    const rows = (h.tables[table] ??= [])
    const filters: Array<(r: Row) => boolean> = []
    let pendingInsert: Row | null = null
    const matches = () => rows.filter((r) => filters.every((f) => f(r)))
    const b: any = {
      where(a: any, op?: any, val?: any) {
        if (typeof a === "object") filters.push((r) => Object.entries(a).every(([k, v]) => r[k] === v))
        else if (val !== undefined && op === ">=") filters.push((r) => r[a] >= val)
        else filters.push((r) => r[a] === op)
        return b
      },
      first: async () => matches()[0],
      sum: (expr: string) => {
        const col = expr.split(" ")[0]
        return { first: async () => ({ total: String(matches().reduce((s, r) => s + (r[col] ?? 0), 0)) }) }
      },
      decrement: async (col: string, n: number) => {
        matches().forEach((r) => (r[col] -= n))
      },
      update: async (patch: Row) => {
        matches().forEach((r) => Object.assign(r, patch))
      },
      insert(row: Row) {
        pendingInsert = { ...row }
        if (table === "orders") pendingInsert.order_id = `order-${nextId++}`
        if (table === "order_market_items_v2") pendingInsert.order_item_id = `oi-${nextId++}`
        rows.push(pendingInsert)
        return b
      },
      returning: async () => [pendingInsert],
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        return Promise.resolve(pendingInsert ? [pendingInsert] : matches()).then(resolve, reject)
      },
    }
    return b
  }
  trx.schema = { hasColumn: async () => true }
  return trx
}

// Every party here is a real account (test-utils/isolation-noop.ts).
vi.mock("../../../../services/test-accounts/isolation.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import("../../../../test-utils/isolation-noop.js")).allPartiesReal,
}))
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: (fn: (trx: unknown) => unknown) => fn(makeTrx()),
}))
// Every query must go through the transaction: the bare knex is a dead end.
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => () => {
    throw new Error("fulfill must use the transaction")
  },
}))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  canManageShop: async (shop: Row, userId: string) => h.canManage(shop, userId),
  getShopsForUser: async () => [],
}))
vi.mock("../../../../services/allocation/allocation-mode.service.js", () => ({
  getShopAllocationMode: async () => h.mode,
}))
// price_max / quality / targeting / self-fulfil rules: tested in fulfillment-rules.test.ts
vi.mock("./fulfillment-rules.js", () => ({
  buyOrderFulfillmentProblem: async () => h.problem,
}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: {},
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({ cdn: {} }))

import { BuyOrdersV2Controller } from "./BuyOrdersV2Controller.js"
import { NotFoundError, ValidationError } from "../../v1/util/errors.js"

const BUY_ORDER = "11111111-1111-4111-8111-111111111111"
const LISTING = "22222222-2222-4222-8222-222222222222"
const VARIANT = "33333333-3333-4333-8333-333333333333"
const OTHER_VARIANT = "44444444-4444-4444-8444-444444444444"

function seed() {
  h.tables = {
    buy_orders_v2: [
      {
        buy_order_id: BUY_ORDER,
        buyer_id: "buyer",
        game_item_id: "gi-1",
        quantity_desired: 10,
        quantity_fulfilled: 0,
        status: "active",
        quality_tier_min: 3,
        quality_tier_max: null,
        quality_value_min: null,
        quality_value_max: null,
      },
    ],
    listings: [{ listing_id: LISTING, shop_id: "shop-1", status: "active" }],
    shops: [{ shop_id: "shop-1", owner_user_id: "seller", owner_contractor_id: null, status: "active" }],
    listing_items: [
      { item_id: "item-1", listing_id: LISTING, game_item_id: "gi-1", pricing_mode: "unified", base_price: 200 },
    ],
    item_variants: [
      { variant_id: VARIANT, game_item_id: "gi-1", attributes: { quality_tier: 4 }, display_name: "T4" },
      { variant_id: OTHER_VARIANT, game_item_id: "gi-1", attributes: { quality_tier: 2 }, display_name: "T2" },
    ],
    listing_item_lots: [
      { lot_id: "lot-1", item_id: "item-1", variant_id: VARIANT, listed: true, quantity_total: 8 },
      { lot_id: "lot-2", item_id: "item-1", variant_id: OTHER_VARIANT, listed: true, quantity_total: 8 },
    ],
  }
}

function fulfill(userId: string, body: Row) {
  const req = { user: { user_id: userId, rsi_confirmed: true } } as unknown as ExpressRequest
  return new BuyOrdersV2Controller().fulfillBuyOrder(req, BUY_ORDER, body as any)
}

describe("POST /buy-orders/{id}/fulfill", () => {
  beforeEach(() => {
    seed()
    h.canManage = (shop, userId) => shop.owner_user_id === userId
    h.mode = "auto"
    h.problem = null
  })

  it("creates an order linked to the seller's shop, at the listing price", async () => {
    const result = await fulfill("seller", { listing_id: LISTING, variant_id: VARIANT, quantity: 4 })

    expect(result.shop_id).toBe("shop-1")
    expect(result.total_price).toBe(800)
    const [order] = h.tables.orders
    expect(order).toMatchObject({
      customer_id: "buyer",
      shop_id: "shop-1",
      assigned_id: "seller",
      contractor_id: null,
      cost: 800,
      status: "pending",
    })
    expect(h.tables.order_market_items_v2[0]).toMatchObject({
      order_id: order.order_id,
      listing_id: LISTING,
      variant_id: VARIANT,
      quantity: 4,
      price_per_unit: 200,
    })
    expect(h.tables.listing_item_lots[0].quantity_total).toBe(4)
    expect(h.tables.buy_orders_v2[0]).toMatchObject({ quantity_fulfilled: 4, status: "active" })
  })

  it("links an org shop's order to the shop and org, left unassigned", async () => {
    h.tables.shops[0] = { shop_id: "shop-1", owner_user_id: null, owner_contractor_id: "org-1", status: "active" }
    h.canManage = () => true // manage_market in org-1
    h.tables.listing_item_lots[0].quantity_total = 10
    await fulfill("member", { listing_id: LISTING, variant_id: VARIANT })
    expect(h.tables.orders[0]).toMatchObject({ shop_id: "shop-1", contractor_id: "org-1", assigned_id: null })
    // quantity defaults to the remaining 10, which fills the buy order
    expect(h.tables.buy_orders_v2[0]).toMatchObject({ quantity_fulfilled: 10, status: "fulfilled" })
  })

  it("leaves stock alone when the shop allocates manually", async () => {
    h.mode = "manual"
    await fulfill("seller", { listing_id: LISTING, variant_id: VARIANT, quantity: 2 })
    expect(h.tables.listing_item_lots[0].quantity_total).toBe(8)
  })

  it("rejects a listing in a shop the caller can't manage", async () => {
    await expect(
      fulfill("stranger", { listing_id: LISTING, variant_id: VARIANT }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(h.tables.orders ?? []).toEqual([])
  })

  it("creates no order when the fulfillment rules reject it", async () => {
    h.problem = { field: "listing_id", message: "Listing price 200 is above the buyer's maximum of 150" }
    await expect(
      fulfill("seller", { listing_id: LISTING, variant_id: VARIANT }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(h.tables.orders ?? []).toEqual([])
  })

  it("rejects more than the listed stock", async () => {
    await expect(
      fulfill("seller", { listing_id: LISTING, variant_id: VARIANT, quantity: 9 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
