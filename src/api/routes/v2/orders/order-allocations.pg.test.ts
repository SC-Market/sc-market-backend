/**
 * V2 order stock allocation on the FULL schema (src/test-utils/full-schema.ts):
 * allocation at order creation on every path, the seller's allocation
 * endpoints (/api/v2/orders/{id}/allocations), release on cancel, fulfilment,
 * authz, and concurrent orders competing for the same lot.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"

process.env.TZ = "UTC"

const DB = "pgtest_v2_order_allocations"
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
/** Side-effect services: every method is a no-op. */
function noopService() {
  return new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => {
      if (prop === "then") return undefined
      if (!(prop in target)) target[prop as string] = vi.fn(async () => ({ status: "skipped" }))
      return target[prop as string]
    },
  })
}
vi.mock("../../../../services/notifications/notification.service.js", () => ({ notificationService: noopService() }))
vi.mock("../../../../services/discord/discord.service.js", () => ({ discordService: noopService() }))
vi.mock("../../../../services/discord/order-alerts.js", () => ({
  postOfferAlert: vi.fn(async () => undefined),
  postOrderAlert: vi.fn(async () => undefined),
}))
vi.mock("../../../../services/chats/chat-participant.service.js", () => ({ chatParticipantService: noopService() }))
vi.mock("../../../../services/checkout/checkout-guards.js", () => ({
  assertBuyerMayCheckout: vi.fn(async () => undefined),
  CheckoutRejectedError: class extends Error {},
}))
// setupTests.ts mocks these V1 database modules with fake tables; the code
// under test needs the real ones (on the real schema).
vi.mock("../../v1/profiles/database.js", async (importActual) => importActual())
vi.mock("../../v1/contractors/database.js", async (importActual) => importActual())
vi.mock("../../v1/transactions/database.js", async (importActual) => importActual())
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { BuyOrdersV2Controller } = await import("../buy-orders/BuyOrdersV2Controller.js")
const { OrderAllocationsV2Controller } = await import("./OrderAllocationsV2Controller.js")
const { CartV2Controller } = await import("../cart/CartV2Controller.js")
const { StockLotsV2Controller } = await import("../stock-lots/StockLotsV2Controller.js")
const helpers = await import("../../v1/orders/helpers.js")
const { process_auction_v2 } = await import("../../../../tasks/timers.js")

const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const BUYER = uuid("b", 1)
const SELLER = uuid("b", 2)
const OUTSIDER = uuid("b", 3)
const BUYER2 = uuid("b", 4)
const SHOP_AUTO = uuid("c", 1)
const SHOP_MANUAL = uuid("c", 2)
const SHOP_NONE = uuid("c", 3)
const GAME_ITEM = uuid("8", 1)

type TestUser = { user_id: string; username: string; role: string; rsi_confirmed: boolean; banned: boolean }
const users: Record<string, TestUser> = {}
const req = (user_id: string) => ({ user: users[user_id] }) as never

let variantT3: string
let variantT5: string
let seq = 0

function db() {
  return state.db!
}

/** A listing in `shop` with one item and a lot per entry of `lots` (oldest first). */
async function listing(
  shop: string,
  lots: Array<{ qty: number; variant?: string; listed?: boolean }>,
  sale_type = "fixed",
) {
  seq++
  const listing_id = uuid("e", seq)
  const item_id = uuid("f", seq)
  await db()("listings").insert({
    listing_id,
    seller_id: SELLER,
    seller_type: "user",
    shop_id: shop,
    title: `Ore ${seq}`,
    status: "active",
    sale_type,
  })
  await db()("listing_items").insert({ item_id, listing_id, game_item_id: GAME_ITEM, pricing_mode: "unified", base_price: 100 })
  const lotIds: string[] = []
  for (const [i, l] of lots.entries()) {
    const [row] = await db()("listing_item_lots")
      .insert({
        item_id,
        variant_id: l.variant ?? variantT3,
        quantity_total: l.qty,
        owner_id: SELLER,
        listed: l.listed ?? true,
        created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })
      .returning("lot_id")
    lotIds.push(row.lot_id)
  }
  return { listing_id, item_id, lotIds }
}

async function lotQty(lotId: string): Promise<number> {
  return (await db()("listing_item_lots").where({ lot_id: lotId }).first("quantity_total")).quantity_total
}

async function allocations(orderId: string) {
  return db()("order_stock_allocations_v2").where({ order_id: orderId }).orderBy("created_at").select("*")
}

function buyNow(buyer: string, listing_id: string, quantity: number, variant_id = variantT3) {
  return new BuyOrdersV2Controller().createPurchase({ listing_id, variant_id, quantity }, req(buyer))
}

/**
 * An order with one V2 line and nothing allocated, as a manual-mode shop gets
 * it. Written directly so it can ask for more than is listed.
 */
async function manualOrder(listing_id: string, quantity: number) {
  const item = await db()("listing_items").where({ listing_id }).first("item_id")
  const lst = await db()("listings").where({ listing_id }).first("shop_id")
  const [order] = await db()("orders")
    .insert({
      kind: "Delivery",
      cost: 100 * quantity,
      title: "Manual order",
      description: "",
      customer_id: BUYER,
      assigned_id: SELLER,
      shop_id: lst.shop_id,
    })
    .returning("order_id")
  await db()("order_market_items_v2").insert({
    order_id: order.order_id,
    listing_id,
    item_id: item.item_id,
    variant_id: variantT3,
    quantity,
    price_per_unit: 100,
  })
  return order.order_id as string
}

const ctl = () => new OrderAllocationsV2Controller()

function fakeRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(b: unknown) {
      res.body = b
      res.headersSent = true
      return res
    },
  }
  return res
}

async function setStatus(orderId: string, actor: string, status: string) {
  const order = await db()("orders").where({ order_id: orderId }).first()
  const res = fakeRes()
  await helpers.handleStatusUpdate({ order, user: users[actor] }, res, status)
  return res
}

/** Accepting an offer: initiateOrder in the accepting transaction. */
async function acceptSession(sessionId: string): Promise<string> {
  const session = await db()("offer_sessions").where({ id: sessionId }).first()
  const order = await db().transaction((trx) => helpers.initiateOrder(session, trx))
  return order.order_id
}

describe.skipIf(!PG_TEST_URL)("V2 order stock allocation on the full schema", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 12 } })
    for (const [user_id, username] of [
      [BUYER, "alloc_buyer"],
      [SELLER, "alloc_seller"],
      [OUTSIDER, "alloc_outsider"],
      [BUYER2, "alloc_buyer2"],
    ]) {
      await db()("accounts").insert({ user_id, username, display_name: username })
      users[user_id] = { user_id, username, role: "user", rsi_confirmed: true, banned: false }
    }
    await db()("shops").insert([
      { shop_id: SHOP_AUTO, slug: "alloc-auto", name: "Auto Shop", owner_user_id: SELLER },
      { shop_id: SHOP_MANUAL, slug: "alloc-manual", name: "Manual Shop", owner_user_id: SELLER },
      { shop_id: SHOP_NONE, slug: "alloc-none", name: "None Shop", owner_user_id: SELLER },
    ])
    await db()("order_settings").insert([
      { entity_type: "shop", entity_id: SHOP_MANUAL, setting_type: "allocation_mode", message_content: "manual", enabled: true },
      { entity_type: "shop", entity_id: SHOP_NONE, setting_type: "allocation_mode", message_content: "none", enabled: true },
    ])
    await db()("game_items").insert({ id: GAME_ITEM, name: "Alloc Test Ore", type: "Other" })
    const variants = await db()("item_variants")
      .insert([
        { game_item_id: GAME_ITEM, attributes: { quality_tier: 3 } },
        { game_item_id: GAME_ITEM, attributes: { quality_tier: 5 } },
      ])
      .returning(["variant_id", "attributes"])
    variantT3 = variants.find((v) => v.attributes.quality_tier === 3).variant_id
    variantT5 = variants.find((v) => v.attributes.quality_tier === 5).variant_id
  }, 240_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  describe("allocation at order creation (auto mode)", () => {
    it("Buy now takes the units from the oldest lots first, across lots", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 2 }, { qty: 5 }, { qty: 1, variant: variantT5 }])
      const res = await buyNow(BUYER, l.listing_id, 4)
      expect(res.allocation_result).toEqual({ has_partial_allocations: false, total_requested: 4, total_allocated: 4 })
      expect([await lotQty(l.lotIds[0]), await lotQty(l.lotIds[1]), await lotQty(l.lotIds[2])]).toEqual([0, 3, 1])
      const rows = await allocations(res.order_id)
      expect(rows.map((r) => [r.lot_id, r.quantity, r.status])).toEqual([
        [l.lotIds[0], 2, "active"],
        [l.lotIds[1], 2, "active"],
      ])
      // The listing's public availability follows (trigger on the lots).
      const item = await db()("listing_items").where({ item_id: l.item_id }).first("quantity_available")
      expect(item.quantity_available).toBe(4)
    })

    it("Buy now fails, creating nothing, when the lots can't cover it", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 2 }])
      const before = await db()("orders").count("* as n").first()
      await expect(buyNow(BUYER, l.listing_id, 3)).rejects.toThrow()
      expect(await lotQty(l.lotIds[0])).toBe(2)
      expect(await db()("orders").count("* as n").first()).toEqual(before)
    })

    it("buy-order fulfilment allocates the fulfilled quantity", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 1 }, { qty: 4 }])
      const buyOrderId = uuid("7", 1)
      await db()("buy_orders_v2").insert({
        buy_order_id: buyOrderId,
        buyer_id: BUYER,
        game_item_id: GAME_ITEM,
        quantity_desired: 3,
        price_max: 5000,
      })
      const res = await new BuyOrdersV2Controller().fulfillBuyOrder(req(SELLER), buyOrderId, {
        listing_id: l.listing_id,
        variant_id: variantT3,
      })
      expect([await lotQty(l.lotIds[0]), await lotQty(l.lotIds[1])]).toEqual([0, 2])
      expect((await allocations(res.order_id)).reduce((s, r) => s + r.quantity, 0)).toBe(3)
    })

    it("accepting an offer allocates what is listed and leaves the rest (partial)", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 3 }])
      const sessionId = uuid("5", 1)
      await db()("offer_sessions").insert({ id: sessionId, customer_id: BUYER, assigned_id: SELLER, shop_id: SHOP_AUTO })
      const offerId = uuid("6", 1)
      await db()("order_offers").insert({
        id: offerId,
        session_id: sessionId,
        kind: "Delivery",
        cost: 500,
        title: "Offer",
        description: "",
        actor_id: BUYER,
      })
      await db()("offer_market_items_v2").insert({
        offer_id: offerId,
        listing_id: l.listing_id,
        variant_id: variantT3,
        quantity: 5,
        price_per_unit: 100,
      })
      const orderId = await acceptSession(sessionId)
      expect(await lotQty(l.lotIds[0])).toBe(0)
      expect((await allocations(orderId)).map((r) => r.quantity)).toEqual([3])
    })

    it("cart checkout, once accepted, allocates the cart's lines", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 6 }, { qty: 2, variant: variantT5 }])
      await db()("cart_items_v2").insert([
        { user_id: BUYER2, listing_id: l.listing_id, item_id: l.item_id, variant_id: variantT3, quantity: 2, price_per_unit: 100 },
        { user_id: BUYER2, listing_id: l.listing_id, item_id: l.item_id, variant_id: variantT5, quantity: 1, price_per_unit: 100 },
      ])
      const checkout = await new CartV2Controller().checkoutCart({}, req(BUYER2))
      // Nothing is allocated for an offer; only the accepted order holds stock.
      expect([await lotQty(l.lotIds[0]), await lotQty(l.lotIds[1])]).toEqual([6, 2])
      const orderId = await acceptSession(checkout.session_id)
      expect([await lotQty(l.lotIds[0]), await lotQty(l.lotIds[1])]).toEqual([4, 1])
      expect((await allocations(orderId)).map((r) => [r.lot_id, r.quantity])).toEqual(
        expect.arrayContaining([
          [l.lotIds[0], 2],
          [l.lotIds[1], 1],
        ]),
      )
    })

    it("an auction win, once accepted, allocates the won unit", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 1 }], "auction")
      await db()("auction_details_v2").insert({ listing_id: l.listing_id, end_time: new Date(Date.now() - 1000) })
      await db()("bids_v2").insert({ listing_id: l.listing_id, bidder_id: BUYER2, amount: 900 })
      await process_auction_v2(l.listing_id)
      const offerItem = await db()("offer_market_items_v2").where({ listing_id: l.listing_id }).first()
      expect(offerItem).toBeTruthy()
      const offer = await db()("order_offers").where({ id: offerItem.offer_id }).first("session_id")
      const orderId = await acceptSession(offer.session_id)
      expect(await lotQty(l.lotIds[0])).toBe(0)
      expect((await allocations(orderId)).map((r) => r.quantity)).toEqual([1])
    })

    it("manual and none modes allocate nothing at creation", async () => {
      const m = await listing(SHOP_MANUAL, [{ qty: 5 }])
      const n = await listing(SHOP_NONE, [{ qty: 5 }])
      const a = await buyNow(BUYER, m.listing_id, 2)
      const b = await buyNow(BUYER, n.listing_id, 2)
      expect([await lotQty(m.lotIds[0]), await lotQty(n.lotIds[0])]).toEqual([5, 5])
      expect(await allocations(a.order_id)).toEqual([])
      expect(await allocations(b.order_id)).toEqual([])
    })
  })

  describe("seller allocation endpoints", () => {
    it("lists lines, allocations and candidate lots; auto-allocates; sets and releases by hand", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 4 }, { qty: 4, listed: false }, { qty: 9, variant: variantT5 }])
      const orderId = await manualOrder(l.listing_id, 6)

      const initial = await ctl().getOrderAllocations(orderId, req(SELLER))
      expect(initial).toMatchObject({ order_status: "not-started", allocation_mode: "manual", editable: true, total_requested: 6, total_allocated: 0 })
      expect(initial.lines).toHaveLength(1)
      // Same item and variant only (the T5 lot is not a candidate), listed or not.
      expect(initial.lines[0].available_lots.map((x) => [x.lot_id, x.quantity_available, x.listed])).toEqual([
        [l.lotIds[0], 4, true],
        [l.lotIds[1], 4, false],
      ])

      // Auto takes listed lots only: 4 of 6.
      const auto = await ctl().autoAllocateOrderStock(orderId, req(SELLER))
      expect(auto.total_allocated).toBe(4)
      expect(await lotQty(l.lotIds[0])).toBe(0)

      // By hand from the unlisted lot: hold 2 of it.
      const manual = await ctl().manualAllocateOrderStock(orderId, { allocations: [{ lot_id: l.lotIds[1], quantity: 2 }] }, req(SELLER))
      expect(manual.total_allocated).toBe(6)
      expect(await lotQty(l.lotIds[1])).toBe(2)

      // Lower the first lot's hold to 1 (3 go back), then release the rest of it.
      await ctl().manualAllocateOrderStock(orderId, { allocations: [{ lot_id: l.lotIds[0], quantity: 1 }] }, req(SELLER))
      expect(await lotQty(l.lotIds[0])).toBe(3)
      const current = await ctl().getOrderAllocations(orderId, req(SELLER))
      const first = current.lines[0].allocations.find((a) => a.lot_id === l.lotIds[0])!
      expect(first.quantity).toBe(1)
      const released = await ctl().releaseOrderStock(orderId, { allocation_ids: [first.allocation_id] }, req(SELLER))
      expect(released.total_allocated).toBe(2)
      expect(await lotQty(l.lotIds[0])).toBe(4)

      // Release everything.
      const none = await ctl().releaseOrderStock(orderId, {}, req(SELLER))
      expect(none.total_allocated).toBe(0)
      expect([await lotQty(l.lotIds[0]), await lotQty(l.lotIds[1])]).toEqual([4, 4])
      expect((await allocations(orderId)).every((r) => r.status === "released")).toBe(true)
    })

    it("rejects lots of another variant or listing, more than the line needs, and more than the lot has", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 3 }, { qty: 9, variant: variantT5 }])
      const other = await listing(SHOP_MANUAL, [{ qty: 9 }])
      const orderId = await manualOrder(l.listing_id, 5)
      const set = (lot_id: string, quantity: number) =>
        ctl().manualAllocateOrderStock(orderId, { allocations: [{ lot_id, quantity }] }, req(SELLER))

      await expect(set(l.lotIds[1], 1)).rejects.toThrow(/item and variant/)
      await expect(set(other.lotIds[0], 1)).rejects.toThrow(/item and variant/)
      await expect(set(l.lotIds[0], 4)).rejects.toThrow(/Only 3 available/)
      await set(l.lotIds[0], 3)
      const extra = await db()("listing_item_lots")
        .insert({ item_id: l.item_id, variant_id: variantT3, quantity_total: 9, owner_id: SELLER })
        .returning("lot_id")
      await expect(set(extra[0].lot_id, 3)).rejects.toThrow(/only requires 5/)
      expect(await lotQty(extra[0].lot_id)).toBe(9)
      expect(await lotQty(l.lotIds[0])).toBe(0)
    })

    it("the buyer and outsiders are denied, reading and writing", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 5 }])
      const orderId = await manualOrder(l.listing_id, 2)
      for (const who of [BUYER, OUTSIDER]) {
        await expect(ctl().getOrderAllocations(orderId, req(who))).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(ctl().autoAllocateOrderStock(orderId, req(who))).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(
          ctl().manualAllocateOrderStock(orderId, { allocations: [{ lot_id: l.lotIds[0], quantity: 1 }] }, req(who)),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(ctl().releaseOrderStock(orderId, {}, req(who))).rejects.toMatchObject({ code: "FORBIDDEN" })
      }
      expect(await lotQty(l.lotIds[0])).toBe(5)
      expect(await allocations(orderId)).toEqual([])
    })

    it("a site admin may manage them", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 5 }])
      const orderId = await manualOrder(l.listing_id, 2)
      const admin = { ...users[OUTSIDER], role: "admin" }
      const res = await ctl().autoAllocateOrderStock(orderId, { user: admin } as never)
      expect(res.total_allocated).toBe(2)
    })

    it("a deleted lot's units can't be held: deleting an allocated lot is refused", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 5 }])
      const orderId = await manualOrder(l.listing_id, 5)
      await ctl().autoAllocateOrderStock(orderId, req(SELLER))
      await expect(new StockLotsV2Controller().deleteStockLot(l.lotIds[0], req(SELLER))).rejects.toThrow(/allocated/)
    })
  })

  describe("order lifecycle", () => {
    it("cancelling puts the allocated units back in their lots", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 2 }, { qty: 5 }])
      const res = await buyNow(BUYER, l.listing_id, 4)
      expect([await lotQty(l.lotIds[0]), await lotQty(l.lotIds[1])]).toEqual([0, 3])
      const r = await setStatus(res.order_id, SELLER, "cancelled")
      expect(r.statusCode).toBe(200)
      expect((await db()("orders").where({ order_id: res.order_id }).first()).status).toBe("cancelled")
      expect([await lotQty(l.lotIds[0]), await lotQty(l.lotIds[1])]).toEqual([2, 5])
      expect((await allocations(res.order_id)).map((a) => a.status)).toEqual(["released", "released"])
      // Closed: allocations can't change any more.
      await expect(ctl().autoAllocateOrderStock(res.order_id, req(SELLER))).rejects.toMatchObject({ code: "CONFLICT" })
    })

    it("cancelling an order that never allocated adds no stock", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 5 }])
      const orderId = await manualOrder(l.listing_id, 3)
      await setStatus(orderId, BUYER, "cancelled")
      expect(await lotQty(l.lotIds[0])).toBe(5)
    })

    it("fulfilling marks the allocations fulfilled; the units stay out of the lots", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 5 }])
      const res = await buyNow(BUYER, l.listing_id, 2)
      const r = await setStatus(res.order_id, SELLER, "fulfilled")
      expect(r.statusCode).toBe(200)
      expect(await lotQty(l.lotIds[0])).toBe(3)
      expect((await allocations(res.order_id)).map((a) => a.status)).toEqual(["fulfilled"])
      // Fulfilled allocations don't block deleting the lot.
      await new StockLotsV2Controller().deleteStockLot(l.lotIds[0], req(SELLER))
      expect((await allocations(res.order_id))[0].lot_id).toBeNull()
    })
  })

  describe("concurrency", () => {
    it("concurrent Buy nows never take more than the lot has", async () => {
      const l = await listing(SHOP_AUTO, [{ qty: 5 }])
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) => buyNow(i % 2 ? BUYER : BUYER2, l.listing_id, 1)),
      )
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5)
      expect(await lotQty(l.lotIds[0])).toBe(0)
      const held = await db()("order_stock_allocations_v2").whereIn("lot_id", l.lotIds).sum("quantity as n").first()
      expect(Number(held?.n)).toBe(5)
    })

    it("two orders allocating the same lot by hand: one wins, the other is refused", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 10 }])
      const a = await manualOrder(l.listing_id, 6)
      const b = await manualOrder(l.listing_id, 6)
      const results = await Promise.allSettled(
        [a, b].map((orderId) =>
          ctl().manualAllocateOrderStock(orderId, { allocations: [{ lot_id: l.lotIds[0], quantity: 6 }] }, req(SELLER)),
        ),
      )
      expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"])
      expect(await lotQty(l.lotIds[0])).toBe(4)
    })

    it("auto-allocating competing orders at once splits the lot without going negative", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 7 }])
      const orders = [await manualOrder(l.listing_id, 3), await manualOrder(l.listing_id, 3), await manualOrder(l.listing_id, 3)]
      const results = await Promise.all(orders.map((o) => ctl().autoAllocateOrderStock(o, req(SELLER))))
      expect(results.map((r) => r.total_allocated).sort()).toEqual([1, 3, 3])
      expect(await lotQty(l.lotIds[0])).toBe(0)
    })

    it("the database refuses a negative lot quantity", async () => {
      const l = await listing(SHOP_MANUAL, [{ qty: 1 }])
      await expect(
        db()("listing_item_lots").where({ lot_id: l.lotIds[0] }).update({ quantity_total: -1 }),
      ).rejects.toThrow(/chk_listing_item_lots_quantity_total/)
    })
  })
})
