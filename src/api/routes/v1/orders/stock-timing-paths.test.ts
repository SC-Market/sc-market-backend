/**
 * Stock subtraction timing on the V2 offer paths (services/allocation/
 * stock-timing.service.ts): cart checkout (createOffer), acceptance
 * (initiateOrder) and rejection (rejectOfferSession), for each value of the
 * shop's setting, with the shop's allocation mode.
 *
 * The real handlers and the real hold service run against the in-memory
 * tables of test-utils/fake-knex-tables.ts (through mock-knex-db.ts), so the
 * lots' quantities are checked. The order allocation itself
 * (autoAllocateOrder) is a spy here: what it does to the lots is covered on
 * real Postgres by v2/orders/order-allocations.pg.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createFakeKnex,
  type FakeKnex,
} from "../../../../test-utils/fake-knex-tables.js"

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  db: null as unknown,
  settings: [] as Array<{
    entity_type: string
    entity_id: string
    setting_type: string
    message_content: string
  }>,
}))

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(
    () => h.db,
  ),
)
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: (fn: (trx: unknown) => unknown) => fn(h.db),
}))
vi.mock(
  "../../../../services/test-accounts/isolation.js",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...(await import("../../../../test-utils/isolation-noop.js"))
      .allPartiesReal,
  }),
)

const SHOP = "shop-1"
const SESSION = "session-1"
const OFFER = "offer-1"
const LISTING = "listing-1"
const ITEM = "item-1"
const VARIANT = "variant-1"
const ORDER = "order-1"

const SESSION_ROW = {
  id: SESSION,
  customer_id: "buyer",
  assigned_id: "seller",
  contractor_id: null,
  shop_id: SHOP,
  thread_id: null,
  status: "active",
  timestamp: new Date(),
  discord_invite: null,
}

vi.mock("./database.js", () => ({
  getOrderSetting: vi.fn(
    async (entityType: string, entityId: string, settingType: string) => {
      const row = h.settings.find(
        (s) =>
          s.entity_type === entityType &&
          s.entity_id === entityId &&
          s.setting_type === settingType,
      )
      return row ? { ...row, id: "setting", enabled: true } : null
    },
  ),
  createOrder: vi.fn(async (order: Row) => [
    { ...order, order_id: ORDER, shop_id: SHOP, status: "not-started" },
  ]),
}))
vi.mock("../offers/database.js", () => ({
  getMostRecentOrderOffer: vi.fn(async () => ({
    id: OFFER,
    session_id: SESSION,
    kind: "Delivery",
    cost: "100",
  })),
  createOrderOfferSession: vi.fn(async () => [{ ...SESSION_ROW }]),
  createOrderOffer: vi.fn(async (o: Row) => [{ ...o, id: OFFER }]),
  updateOfferSession: vi.fn(async () => []),
  updateOrderOffer: vi.fn(async () => []),
}))
vi.mock("../market/database.js", () => ({
  getOfferMarketListings: vi.fn(async () => []),
  insertMarketListingOrder: vi.fn(),
  insertOfferMarketListing: vi.fn(),
}))
vi.mock("../chats/database.js", () => ({
  insertChat: vi.fn(async () => []),
  getChat: vi.fn(async () => ({ chat_id: "chat-1" })),
  updateChat: vi.fn(),
}))
vi.mock("../chats/helpers.js", () => ({ sendSystemMessage: vi.fn() }))
function noopService() {
  return new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => {
      if (prop === "then") return undefined
      if (!(prop in target)) target[prop as string] = vi.fn(async () => null)
      return target[prop as string]
    },
  })
}
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: noopService(),
}))
vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: noopService(),
}))
vi.mock("../../../../services/chats/chat-participant.service.js", () => ({
  chatParticipantService: noopService(),
}))
vi.mock("../../../../services/discord/order-alerts.js", () => ({
  postOfferAlert: vi.fn(async () => undefined),
  postOrderAlert: vi.fn(async () => undefined),
}))
vi.mock("../../../../services/notify/offer-decisions.js", () => ({
  notifyOfferDecision: vi.fn(),
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
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

const helpers = await import("./helpers.js")
const { rejectOfferSession } = await import("../offers/controller.js")

let db: FakeKnex

function seed(lotQuantity = 10) {
  db = createFakeKnex({
    listing_items: [{ item_id: ITEM, listing_id: LISTING, base_price: 10 }],
    listing_item_lots: [
      {
        lot_id: "lot-1",
        item_id: ITEM,
        variant_id: VARIANT,
        quantity_total: lotQuantity,
        listed: true,
        created_at: new Date("2026-10-01"),
      },
    ],
    offer_sessions: [{ ...SESSION_ROW }],
    offer_market_items_v2: [],
    offer_stock_holds_v2: [],
    order_market_items_v2: [],
    variant_pricing: [],
  })
  Object.assign(db, {
    schema: { hasTable: async () => true },
    fn: { now: () => new Date() },
  })
  h.db = db
}

function shopSettings(timing: string | null, mode: string | null = null) {
  h.settings = []
  if (timing)
    h.settings.push({
      entity_type: "shop",
      entity_id: SHOP,
      setting_type: "stock_subtraction_timing",
      message_content: timing,
    })
  if (mode)
    h.settings.push({
      entity_type: "shop",
      entity_id: SHOP,
      setting_type: "allocation_mode",
      message_content: mode,
    })
}

const lotQty = () => db.tables.listing_item_lots[0].quantity_total
const activeHolds = () =>
  db.tables.offer_stock_holds_v2.filter((r) => r.status === "active")

/** Cart checkout: the offer arrives with V2 items. */
function checkout(quantity: number) {
  return helpers.createOffer(
    {
      customer_id: "buyer",
      assigned_id: "seller",
      contractor_id: null,
      shop_id: SHOP,
    },
    {
      actor_id: "buyer",
      kind: "Delivery",
      cost: "100",
      title: "Items",
      description: "",
    },
    [{ quantity, listing: { listing: { listing_id: LISTING } } }],
    [
      {
        listing_id: LISTING,
        variant_id: VARIANT,
        quantity,
        price_per_unit: 10,
      },
    ],
  )
}

/** The offer's V2 items, as createOffer would have stored them. */
function offerItems(quantity: number) {
  db.tables.offer_market_items_v2.push({
    offer_id: OFFER,
    listing_id: LISTING,
    variant_id: VARIANT,
    quantity,
    price_per_unit: 10,
  })
}

function accept() {
  return helpers.initiateOrder({ ...SESSION_ROW } as never, db as never)
}

beforeEach(() => {
  autoAllocateOrder.mockClear()
  seed()
})

describe("cart checkout (the offer is received)", () => {
  it("default (never set): nothing leaves the lots until the seller accepts", async () => {
    shopSettings(null)
    await checkout(4)
    expect(lotQty()).toBe(10)
    expect(activeHolds()).toEqual([])
    expect(db.tables.offer_market_items_v2).toHaveLength(1)
  })

  it("'on_received': the offer's units are held at once", async () => {
    shopSettings("on_received")
    await checkout(4)
    expect(lotQty()).toBe(6)
    expect(activeHolds()).toMatchObject([
      { session_id: SESSION, offer_id: OFFER, lot_id: "lot-1", quantity: 4 },
    ])
  })

  it("'on_received' with manual or no allocation: nothing is taken automatically", async () => {
    for (const mode of ["manual", "none"]) {
      seed()
      shopSettings("on_received", mode)
      await checkout(4)
      expect(lotQty()).toBe(10)
      expect(activeHolds()).toEqual([])
    }
  })

  it("'dont_subtract': nothing is held", async () => {
    shopSettings("dont_subtract")
    await checkout(4)
    expect(lotQty()).toBe(10)
    expect(activeHolds()).toEqual([])
  })
})

describe("acceptance (the order is created)", () => {
  it("default: the order's stock is allocated (today's V2 behaviour, unchanged)", async () => {
    shopSettings(null)
    offerItems(4)
    await accept()
    expect(autoAllocateOrder).toHaveBeenCalledWith(db, ORDER, { strict: false })
    expect(db.tables.order_market_items_v2).toMatchObject([
      { order_id: ORDER, item_id: ITEM, variant_id: VARIANT, quantity: 4 },
    ])
  })

  it("'on_accepted' saved explicitly behaves as the default", async () => {
    shopSettings("on_accepted")
    offerItems(4)
    await accept()
    expect(autoAllocateOrder).toHaveBeenCalledTimes(1)
  })

  it("'on_received': the held units go back and the order's allocation takes them, in one transaction", async () => {
    shopSettings("on_received")
    await checkout(4)
    expect(lotQty()).toBe(6)
    let qtyWhenAllocating: number | null = null
    autoAllocateOrder.mockImplementationOnce(async () => {
      qtyWhenAllocating = lotQty()
      return {
        has_partial_allocations: false,
        total_requested: 4,
        total_allocated: 4,
      }
    })

    await accept()

    expect(qtyWhenAllocating).toBe(10)
    expect(autoAllocateOrder).toHaveBeenCalledWith(db, ORDER, { strict: false })
    expect(activeHolds()).toEqual([])
    expect(db.tables.offer_stock_holds_v2.map((r) => r.status)).toEqual([
      "converted",
    ])
  })

  it("'dont_subtract': no allocation, even in auto mode; the lots keep their quantity", async () => {
    shopSettings("dont_subtract", "auto")
    offerItems(4)
    await accept()
    expect(autoAllocateOrder).not.toHaveBeenCalled()
    expect(lotQty()).toBe(10)
    expect(db.tables.order_market_items_v2).toHaveLength(1)
  })

  it("manual / none allocation modes: no automatic allocation, whatever the timing", async () => {
    for (const [timing, mode] of [
      [null, "manual"],
      ["on_received", "none"],
      ["on_accepted", "manual"],
    ] as const) {
      seed()
      autoAllocateOrder.mockClear()
      shopSettings(timing, mode)
      offerItems(2)
      await accept()
      expect(autoAllocateOrder).not.toHaveBeenCalled()
    }
  })

  it("holds left from before the shop switched away from 'on_received' still pass to the order", async () => {
    shopSettings("on_received")
    await checkout(3)
    shopSettings("dont_subtract")
    await accept()
    expect(lotQty()).toBe(10)
    expect(activeHolds()).toEqual([])
    expect(autoAllocateOrder).not.toHaveBeenCalled()
  })
})

describe("rejection / withdrawal", () => {
  it("'on_received': the held units go back to the lot", async () => {
    shopSettings("on_received")
    await checkout(4)
    expect(lotQty()).toBe(6)

    await rejectOfferSession(
      { ...SESSION_ROW } as never,
      { id: OFFER } as never,
      { user_id: "seller", username: "seller" } as never,
      false,
    )

    expect(lotQty()).toBe(10)
    expect(activeHolds()).toEqual([])
  })

  it("without holds (default timing) rejection leaves the lots alone", async () => {
    shopSettings(null)
    await checkout(4)
    await rejectOfferSession(
      { ...SESSION_ROW } as never,
      { id: OFFER } as never,
      { user_id: "buyer", username: "buyer" } as never,
      true,
    )
    expect(lotQty()).toBe(10)
  })
})
