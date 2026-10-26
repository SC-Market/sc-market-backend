/**
 * Buy now (POST /api/v2/buy-orders) and buy-order fulfilment
 * (POST /api/v2/buy-orders/{id}/fulfill) against the FULL schema, built from
 * empty by the migrations (src/test-utils/full-schema.ts).
 *
 * Both wrote orders.created_at/updated_at, which the table does not have,
 * and left out the required kind (Buy now also cost), so every purchase
 * failed. Buy now also wrote a market_orders row whose listing_id references
 * V1 market_listings, and fulfilment wrote order_market_items_v2 columns that
 * do not exist. Mocked knex never notices any of that; a real schema does.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"

process.env.TZ = "UTC"

const DB = "pgtest_v2_direct_orders"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: (cb: (trx: Knex.Transaction) => Promise<unknown>) => state.db!.transaction(cb),
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async (id: string) => `https://cdn.test/${id}`) },
}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { createNewOrderNotificationV2: vi.fn(), createBuyOrderFulfilledNotification: vi.fn() },
}))
vi.mock("../../../../services/allocation/allocation-mode.service.js", () => ({
  getShopAllocationMode: vi.fn(async () => "manual"),
}))
// The guards (blocklists, availability, limits) have their own tests and pull
// in the V1 order helpers; this file is about the rows the purchase writes.
vi.mock("../../../../services/checkout/checkout-guards.js", () => ({
  assertBuyerMayCheckout: vi.fn(async () => undefined),
  CheckoutRejectedError: class extends Error {},
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { BuyOrdersV2Controller } = await import("./BuyOrdersV2Controller.js")
const { OrdersV2Controller } = await import("../orders/OrdersV2Controller.js")

const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const BUYER = uuid("b", 1)
const SELLER = uuid("b", 2)
const SHOP = uuid("c", 1)
const GAME_ITEM = uuid("8", 1)
const LISTING = uuid("e", 1)
const ITEM = uuid("f", 1)
const BUY_ORDER = uuid("7", 1)

const asUser = (user_id: string, username: string) =>
  ({ user: { user_id, username, role: "user", rsi_confirmed: true, banned: false } }) as never

let variantId: string

describe.skipIf(!PG_TEST_URL)("Buy now and buy-order fulfilment on the full schema", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 4 } })
    const db = state.db
    await db("accounts").insert([
      // The legacy SQL seeds a sample account; keep these names unique.
      { user_id: BUYER, username: "directorders_buyer", display_name: "Buyer" },
      { user_id: SELLER, username: "directorders_seller", display_name: "Seller" },
    ])
    await db("shops").insert({ shop_id: SHOP, slug: "directorders-shop", name: "Seller Shop", owner_user_id: SELLER })
    await db("game_items").insert({ id: GAME_ITEM, name: "DirectOrders Test Ore", type: "Other" })
    const [variant] = await db("item_variants")
      .insert({ game_item_id: GAME_ITEM, attributes: { quality_tier: 3 } })
      .returning("variant_id")
    variantId = variant.variant_id
    await db("listings").insert({
      listing_id: LISTING,
      seller_id: SELLER,
      seller_type: "user",
      shop_id: SHOP,
      title: "Test Ore",
      status: "active",
    })
    await db("listing_items").insert({
      item_id: ITEM,
      listing_id: LISTING,
      game_item_id: GAME_ITEM,
      pricing_mode: "unified",
      base_price: 1000,
    })
    await db("listing_item_lots").insert({
      item_id: ITEM,
      variant_id: variantId,
      quantity_total: 10,
      owner_id: SELLER,
      listed: true,
    })
    await db("buy_orders_v2").insert({
      buy_order_id: BUY_ORDER,
      buyer_id: BUYER,
      game_item_id: GAME_ITEM,
      quantity_desired: 3,
      price_max: 5000,
    })
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("Buy now creates a valid order for the shop", async () => {
    const res = await new BuyOrdersV2Controller().createPurchase(
      { listing_id: LISTING, variant_id: variantId, quantity: 2 },
      asUser(BUYER, "directorders_buyer"),
    )
    expect(res).toMatchObject({ buyer_id: BUYER, shop_id: SHOP, total_price: 2000, status: "not-started" })
    expect(Date.parse(res.created_at)).not.toBeNaN()

    const order = await state.db!("orders").where({ order_id: res.order_id }).first()
    expect(order).toMatchObject({
      kind: "Delivery",
      cost: "2000",
      title: "Items Sold to directorders_buyer",
      customer_id: BUYER,
      shop_id: SHOP,
      assigned_id: SELLER,
      contractor_id: null,
      status: "not-started",
    })
    const lines = await state.db!("order_market_items_v2").where({ order_id: res.order_id })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ listing_id: LISTING, variant_id: variantId, quantity: 2 })
  })

  it("fulfilling a buy order creates a valid order for the selling shop", async () => {
    const res = await new BuyOrdersV2Controller().fulfillBuyOrder(asUser(SELLER, "directorders_seller"), BUY_ORDER, {
      listing_id: LISTING,
      variant_id: variantId,
    })
    expect(res).toMatchObject({ buyer_id: BUYER, shop_id: SHOP, total_price: 3000, status: "not-started" })

    const order = await state.db!("orders").where({ order_id: res.order_id }).first()
    expect(order).toMatchObject({ kind: "Delivery", cost: "3000", customer_id: BUYER, shop_id: SHOP })
    const buyOrder = await state.db!("buy_orders_v2").where({ buy_order_id: BUY_ORDER }).first()
    expect(buyOrder).toMatchObject({ status: "fulfilled", quantity_fulfilled: 3 })
  })

  it("the seller's V2 order list shows both", async () => {
    const res = await new OrdersV2Controller().getOrders(
      undefined, "seller", undefined, undefined, undefined, undefined, undefined, undefined,
      asUser(SELLER, "directorders_seller"),
    )
    expect(res.total).toBe(2)
    expect(res.orders.map((o) => o.total_price).sort()).toEqual([2000, 3000])
    expect(res.orders.every((o) => o.shop_name === "Seller Shop")).toBe(true)
  })
})
