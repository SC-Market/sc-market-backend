/**
 * Buy now (POST /buy-orders) and the shop's stock subtraction timing
 * (services/allocation/stock-timing.service.ts): a direct purchase is
 * received and accepted at once, so the default and 'on_received' allocate
 * (strict) and 'dont_subtract' never takes stock, while the listed quantity
 * still caps the purchase.
 *
 * Runs the real handler against a small in-memory transaction (the harness
 * of fulfill-buy-order.test.ts). Named without "Controller" so the vitest
 * exclusion for DB-backed v2 controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request as ExpressRequest } from "express"

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  canManage: (_shop: Row, _userId: string) => true,
  mode: "auto" as string,
  /** The shop's stock_subtraction_timing row; null = none (the default). */
  timing: null as string | null,
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
        if (typeof a === "object")
          filters.push((r) => Object.entries(a).every(([k, v]) => r[k] === v))
        else if (val !== undefined && op === ">=")
          filters.push((r) => r[a] >= val)
        else filters.push((r) => r[a] === op)
        return b
      },
      first: async () => matches()[0],
      sum: (expr: string) => {
        const col = expr.split(" ")[0]
        return {
          first: async () => ({
            total: String(matches().reduce((s, r) => s + (r[col] ?? 0), 0)),
          }),
        }
      },
      decrement: async (col: string, n: number) => {
        matches().forEach((r) => (r[col] -= n))
      },
      update: async (patch: Row) => {
        matches().forEach((r) => Object.assign(r, patch))
      },
      insert(row: Row) {
        pendingInsert = { ...row }
        // orders' column defaults: the id, "timestamp" = now(), status = 'not-started'
        if (table === "orders") {
          pendingInsert = {
            order_id: `order-${nextId++}`,
            timestamp: new Date(),
            status: "not-started",
            ...pendingInsert,
          }
        }
        if (table === "order_market_items_v2")
          pendingInsert.order_item_id = `oi-${nextId++}`
        rows.push(pendingInsert)
        return b
      },
      returning: async () => [pendingInsert],
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        return Promise.resolve(
          pendingInsert ? [pendingInsert] : matches(),
        ).then(resolve, reject)
      },
    }
    return b
  }
  trx.schema = { hasColumn: async () => true }
  return trx
}

// Every party here is a real account (test-utils/isolation-noop.ts).
vi.mock(
  "../../../../services/test-accounts/isolation.js",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...(await import("../../../../test-utils/isolation-noop.js"))
      .allPartiesReal,
  }),
)
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
// The shop's stock subtraction timing (services/allocation/stock-timing.service.ts).
vi.mock("../../v1/orders/database.js", () => ({
  getOrderSetting: async (entityType: string, _id: string, type: string) =>
    entityType === "shop" && type === "stock_subtraction_timing" && h.timing
      ? { enabled: true, message_content: h.timing }
      : null,
}))
// What allocating does to the lots (locks, FIFO, the allocation rows) runs on
// real Postgres in orders/order-allocations.pg.test.ts; here only whether
// fulfilment asks for it.
const autoAllocateOrder = vi.hoisted(() =>
  vi.fn(async () => ({
    has_partial_allocations: false,
    total_requested: 0,
    total_allocated: 0,
  })),
)
vi.mock(
  "../../../../services/allocation/v2-order-allocation.service.js",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    autoAllocateOrder,
  }),
)
vi.mock("./fulfillment-rules.js", () => ({
  buyOrderFulfillmentProblem: async () => h.problem,
}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: {
    createNewOrderNotificationV2: vi.fn(async () => undefined),
  },
}))
// Self-purchase, blocklists, availability requirement, order limits: checkout-guards tests.
vi.mock("../../../../services/checkout/checkout-guards.js", () => ({
  assertBuyerMayCheckout: vi.fn(async () => undefined),
  CheckoutRejectedError: class extends Error {},
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({ cdn: {} }))

import { BuyOrdersV2Controller } from "./BuyOrdersV2Controller.js"
import { ValidationError } from "../../v1/util/errors.js"

const LISTING = "22222222-2222-4222-8222-222222222222"
const VARIANT = "33333333-3333-4333-8333-333333333333"

function seed() {
  h.tables = {
    listings: [{ listing_id: LISTING, shop_id: "shop-1", status: "active" }],
    shops: [
      {
        shop_id: "shop-1",
        owner_user_id: "seller",
        owner_contractor_id: null,
        status: "active",
      },
    ],
    listing_items: [
      {
        item_id: "item-1",
        listing_id: LISTING,
        game_item_id: "gi-1",
        pricing_mode: "unified",
        base_price: 50,
      },
    ],
    item_variants: [
      {
        variant_id: VARIANT,
        game_item_id: "gi-1",
        attributes: {},
        display_name: "Standard",
      },
    ],
    listing_item_lots: [
      {
        lot_id: "lot-1",
        item_id: "item-1",
        variant_id: VARIANT,
        listed: true,
        quantity_total: 5,
      },
    ],
  }
}

function buyNow(quantity: number) {
  const req = {
    user: { user_id: "buyer", username: "buyer", rsi_confirmed: true },
  } as unknown as ExpressRequest
  return new BuyOrdersV2Controller().createPurchase(
    { listing_id: LISTING, variant_id: VARIANT, quantity } as any,
    req,
  )
}

describe("Buy now and stock subtraction timing", () => {
  beforeEach(() => {
    seed()
    autoAllocateOrder.mockClear()
    h.mode = "auto"
    h.timing = null
  })

  it("default (never set): the whole order is allocated, strictly", async () => {
    const result = await buyNow(3)
    expect(autoAllocateOrder).toHaveBeenCalledWith(
      expect.anything(),
      result.order_id,
      { strict: true },
    )
  })

  it("'on_received': same as the default (received and accepted at once)", async () => {
    h.timing = "on_received"
    const result = await buyNow(3)
    expect(autoAllocateOrder).toHaveBeenCalledWith(
      expect.anything(),
      result.order_id,
      { strict: true },
    )
  })

  it("'dont_subtract': the order is created, no stock is taken, the lot keeps its quantity", async () => {
    h.timing = "dont_subtract"
    const result = await buyNow(3)
    expect(autoAllocateOrder).not.toHaveBeenCalled()
    expect(h.tables.listing_item_lots[0].quantity_total).toBe(5)
    expect(result.allocation_result).toEqual({
      has_partial_allocations: false,
      total_requested: 3,
      total_allocated: 0,
    })
    expect(h.tables.order_market_items_v2).toMatchObject([
      { quantity: 3, variant_id: VARIANT },
    ])
  })

  it("'dont_subtract': repeated purchases never run the listing out", async () => {
    h.timing = "dont_subtract"
    for (let i = 0; i < 4; i++) await buyNow(5)
    expect(h.tables.orders).toHaveLength(4)
    expect(h.tables.listing_item_lots[0].quantity_total).toBe(5)
  })

  it("'dont_subtract' still caps one purchase at the listed quantity", async () => {
    h.timing = "dont_subtract"
    await expect(buyNow(6)).rejects.toBeInstanceOf(ValidationError)
    expect(h.tables.orders ?? []).toEqual([])
  })

  it("manual allocation mode: no automatic allocation, whatever the timing", async () => {
    h.mode = "manual"
    h.timing = "on_received"
    await buyNow(2)
    expect(autoAllocateOrder).not.toHaveBeenCalled()
  })
})
