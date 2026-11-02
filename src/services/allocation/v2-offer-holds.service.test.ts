/**
 * Offer stock holds ('on_received' timing, v2-offer-holds.service.ts), run
 * against the in-memory tables of test-utils/fake-knex-tables.ts (through
 * mock-knex-db.ts), so these check what happens to the lots' quantities and
 * the hold rows, not just the queries. Locking itself is exercised on real
 * Postgres by orders/order-allocations.pg.test.ts for the allocation side.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createFakeKnex,
  type FakeKnex,
} from "../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

const holds = await import("./v2-offer-holds.service.js")
const allocation = await import("./v2-order-allocation.service.js")

const LISTING = "listing-1"
const ITEM = "item-1"
const T4 = "variant-t4"
const T2 = "variant-t2"
const SESSION = "session-1"

type Row = Record<string, any>
let db: FakeKnex
const trx = () => db as never

function lot(lot_id: string, quantity_total: number, extra: Row = {}): Row {
  return {
    lot_id,
    item_id: ITEM,
    variant_id: T4,
    quantity_total,
    listed: true,
    created_at: new Date("2026-10-01T00:00:00Z"),
    ...extra,
  }
}

function seed(
  lots: Row[],
  sessions: Row[] = [{ id: SESSION, status: "active" }],
) {
  db = createFakeKnex({
    listing_items: [{ item_id: ITEM, listing_id: LISTING }],
    listing_item_lots: lots,
    offer_sessions: sessions,
    offer_stock_holds_v2: [],
    order_stock_allocations_v2: [],
  })
  h.db = db
}

const qty = (id: string) =>
  db.tables.listing_item_lots.find((l) => l.lot_id === id)!.quantity_total
const active = () =>
  db.tables.offer_stock_holds_v2.filter((r) => r.status === "active")
const item = (quantity: number, variant_id = T4) => ({
  listing_id: LISTING,
  variant_id,
  quantity,
})

describe("holdOfferStock", () => {
  it("takes the units from the listed lots, oldest first, and records where they came from", async () => {
    seed([
      lot("lot-b", 5, { created_at: new Date("2026-10-02T00:00:00Z") }),
      lot("lot-a", 3, { created_at: new Date("2026-10-01T00:00:00Z") }),
    ])
    const result = await holds.holdOfferStock(trx(), SESSION, "offer-1", [
      item(6),
    ])

    expect(result).toEqual({ requested: 6, held: 6 })
    expect(qty("lot-a")).toBe(0)
    expect(qty("lot-b")).toBe(2)
    expect(
      active().map((r) => [
        r.lot_id,
        r.quantity,
        r.session_id,
        r.offer_id,
        r.item_id,
        r.variant_id,
      ]),
    ).toEqual([
      ["lot-a", 3, SESSION, "offer-1", ITEM, T4],
      ["lot-b", 3, SESSION, "offer-1", ITEM, T4],
    ])
  })

  it("only takes the item's variant, and never from unlisted lots", async () => {
    seed([
      lot("lot-t2", 10, { variant_id: T2 }),
      lot("lot-hidden", 10, { listed: false }),
      lot("lot-t4", 4),
    ])
    const result = await holds.holdOfferStock(trx(), SESSION, "offer-1", [
      item(2),
    ])

    expect(result.held).toBe(2)
    expect(qty("lot-t4")).toBe(2)
    expect(qty("lot-t2")).toBe(10)
    expect(qty("lot-hidden")).toBe(10)
  })

  it("is not strict: holds what is left when a concurrent sale got there first", async () => {
    seed([lot("lot-a", 2)])
    const result = await holds.holdOfferStock(trx(), SESSION, "offer-1", [
      item(5),
    ])
    expect(result).toEqual({ requested: 5, held: 2 })
    expect(qty("lot-a")).toBe(0)
    expect(active()).toHaveLength(1)
  })

  it("holds several lines (variants) of one offer, and nothing for an empty offer", async () => {
    seed([lot("lot-t4", 5), lot("lot-t2", 5, { variant_id: T2 })])
    expect(await holds.holdOfferStock(trx(), SESSION, "offer-1", [])).toEqual({
      requested: 0,
      held: 0,
    })
    const result = await holds.holdOfferStock(trx(), SESSION, "offer-1", [
      item(1),
      item(4, T2),
    ])
    expect(result).toEqual({ requested: 5, held: 5 })
    expect(qty("lot-t4")).toBe(4)
    expect(qty("lot-t2")).toBe(1)
  })

  it("never takes a lot below zero, even when two lines want the same lot", async () => {
    seed([lot("lot-a", 3)])
    const result = await holds.holdOfferStock(trx(), SESSION, "offer-1", [
      item(2),
      item(2),
    ])
    expect(result).toEqual({ requested: 4, held: 3 })
    expect(qty("lot-a")).toBe(0)
  })

  it("ignores an item whose listing has no listing item", async () => {
    seed([lot("lot-a", 3)])
    const result = await holds.holdOfferStock(trx(), SESSION, "offer-1", [
      { listing_id: "gone", variant_id: T4, quantity: 2 },
    ])
    expect(result).toEqual({ requested: 2, held: 0 })
    expect(qty("lot-a")).toBe(3)
  })
})

describe("releaseOfferHolds", () => {
  it("puts every held unit back in the lot it came from and closes the holds", async () => {
    seed([
      lot("lot-a", 3),
      lot("lot-b", 5, { created_at: new Date("2026-10-05T00:00:00Z") }),
    ])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(6)])

    const returned = await holds.releaseOfferHolds(trx(), SESSION)

    expect(returned).toBe(6)
    expect(qty("lot-a")).toBe(3)
    expect(qty("lot-b")).toBe(5)
    expect(active()).toEqual([])
    expect(
      db.tables.offer_stock_holds_v2.every(
        (r) => r.status === "released" && r.released_at,
      ),
    ).toBe(true)
  })

  it("on acceptance marks them converted (the order's allocation takes the units next)", async () => {
    seed([lot("lot-a", 3)])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(2)])
    expect(await holds.releaseOfferHolds(trx(), SESSION, "converted")).toBe(2)
    expect(db.tables.offer_stock_holds_v2.map((r) => r.status)).toEqual([
      "converted",
    ])
    expect(qty("lot-a")).toBe(3)
  })

  it("is idempotent: a second release returns nothing", async () => {
    seed([lot("lot-a", 3)])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(2)])
    await holds.releaseOfferHolds(trx(), SESSION)
    expect(await holds.releaseOfferHolds(trx(), SESSION)).toBe(0)
    expect(qty("lot-a")).toBe(3)
  })

  it("only touches the given session's holds", async () => {
    seed(
      [lot("lot-a", 10)],
      [
        { id: SESSION, status: "active" },
        { id: "session-2", status: "active" },
      ],
    )
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(2)])
    await holds.holdOfferStock(trx(), "session-2", "offer-2", [item(3)])
    expect(qty("lot-a")).toBe(5)

    await holds.releaseOfferHolds(trx(), SESSION)

    expect(qty("lot-a")).toBe(7)
    expect(active().map((r) => r.session_id)).toEqual(["session-2"])
  })

  it("a hold whose lot was deleted (lot_id NULL) is closed with nothing to put back", async () => {
    seed([lot("lot-a", 3)])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(2)])
    db.tables.offer_stock_holds_v2[0].lot_id = null
    expect(await holds.releaseOfferHolds(trx(), SESSION)).toBe(0)
    expect(active()).toEqual([])
  })
})

describe("replaceOfferHolds (counter-offers)", () => {
  it("puts the old offer's units back and holds the counter-offer's", async () => {
    seed([lot("lot-a", 10)])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(6)])
    expect(qty("lot-a")).toBe(4)

    const result = await holds.replaceOfferHolds(
      trx(),
      SESSION,
      "offer-2",
      [item(2)],
      true,
    )

    expect(result).toEqual({ requested: 2, held: 2 })
    expect(qty("lot-a")).toBe(8)
    expect(active().map((r) => [r.offer_id, r.quantity])).toEqual([
      ["offer-2", 2],
    ])
  })

  it("a counter-offer can take more than the old offer held, up to what is listed", async () => {
    seed([lot("lot-a", 10)])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(6)])
    await holds.replaceOfferHolds(trx(), SESSION, "offer-2", [item(10)], true)
    expect(qty("lot-a")).toBe(0)
    expect(active().reduce((s, r) => s + r.quantity, 0)).toBe(10)
  })

  it("when the shop no longer holds on offer, or the counter has no V2 items, only puts back", async () => {
    seed([lot("lot-a", 10)])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(6)])
    expect(
      await holds.replaceOfferHolds(
        trx(),
        SESSION,
        "offer-2",
        [item(3)],
        false,
      ),
    ).toEqual({ requested: 3, held: 0 })
    expect(qty("lot-a")).toBe(10)
    await holds.holdOfferStock(trx(), SESSION, "offer-2", [item(1)])
    await holds.replaceOfferHolds(trx(), SESSION, "offer-3", [], true)
    expect(qty("lot-a")).toBe(10)
    expect(active()).toEqual([])
  })
})

describe("activeHeldByLot / activeAllocatedByLot", () => {
  it("sums active holds per lot; the lot views count them with order allocations", async () => {
    seed([
      lot("lot-a", 10),
      lot("lot-b", 10, { created_at: new Date("2026-10-09T00:00:00Z") }),
    ])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(12)])
    db.tables.offer_stock_holds_v2.push({
      hold_id: "old",
      lot_id: "lot-a",
      quantity: 50,
      status: "released",
    })

    const held = await holds.activeHeldByLot(trx(), ["lot-a", "lot-b", "lot-c"])
    expect(Object.fromEntries(held)).toEqual({ "lot-a": 10, "lot-b": 2 })
    expect(await holds.activeHeldByLot(trx(), [])).toEqual(new Map())
  })

  it("activeAllocatedByLot adds offer holds to order allocations", async () => {
    seed([lot("lot-a", 10)])
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(3)])
    // The fake has no GROUP BY: give the allocation query its answer.
    const real = db
    const wrapped = ((table: string) => {
      const b = real(table)
      if (table !== allocation.V2_ALLOCATIONS_TABLE) return b
      return {
        whereIn: () => ({
          where: () => ({
            groupBy: () => ({
              select: async () => [{ lot_id: "lot-a", allocated: 4 }],
            }),
          }),
        }),
      }
    }) as unknown as FakeKnex
    Object.assign(wrapped, { raw: (sql: string) => sql, tables: real.tables })

    const map = await allocation.activeAllocatedByLot(wrapped as never, [
      "lot-a",
    ])
    expect(map.get("lot-a")).toBe(7)
  })
})

describe("releaseHoldsOfClosedSessions (sweeper)", () => {
  it("puts back the holds of sessions that are closed, rejected or gone; leaves active ones", async () => {
    seed(
      [lot("lot-a", 20)],
      [
        { id: "open", status: "active" },
        { id: "closed", status: "closed" },
        { id: "rejected", status: "rejected" },
      ],
    )
    for (const [s, n] of [
      ["open", 1],
      ["closed", 2],
      ["rejected", 3],
      ["deleted", 4],
    ] as const) {
      await holds.holdOfferStock(trx(), s, null, [item(n)])
    }
    expect(qty("lot-a")).toBe(10)

    const returned = await holds.releaseHoldsOfClosedSessions(
      db as never,
      (fn) => fn(db as never),
    )

    expect(returned).toBe(9)
    expect(qty("lot-a")).toBe(19)
    expect(active().map((r) => r.session_id)).toEqual(["open"])
  })

  it("does nothing without active holds", async () => {
    seed([lot("lot-a", 20)])
    expect(
      await holds.releaseHoldsOfClosedSessions(db as never, (fn) =>
        fn(db as never),
      ),
    ).toBe(0)
  })

  it("re-checks the session under its lock: one reopened meanwhile keeps its holds", async () => {
    seed([lot("lot-a", 20)], [{ id: SESSION, status: "closed" }])
    await holds.holdOfferStock(trx(), SESSION, null, [item(2)])
    const returned = await holds.releaseHoldsOfClosedSessions(
      db as never,
      async (fn) => {
        db.tables.offer_sessions[0].status = "active"
        return fn(db as never)
      },
    )
    expect(returned).toBe(0)
    expect(qty("lot-a")).toBe(18)
  })
})

describe("a whole 'on_received' offer, end to end on the lots", () => {
  it("received: held; countered: re-held; accepted: converted and back for the order; rejected: back", async () => {
    seed([lot("lot-a", 10)])
    // received
    await holds.holdOfferStock(trx(), SESSION, "offer-1", [item(4)])
    expect(qty("lot-a")).toBe(6)
    // countered
    await holds.replaceOfferHolds(trx(), SESSION, "offer-2", [item(5)], true)
    expect(qty("lot-a")).toBe(5)
    // accepted: initiateOrder converts, then the order's allocation takes them
    expect(await holds.releaseOfferHolds(trx(), SESSION, "converted")).toBe(5)
    expect(qty("lot-a")).toBe(10)
    // a second offer, rejected
    await holds.holdOfferStock(trx(), "session-2", "offer-9", [item(3)])
    expect(qty("lot-a")).toBe(7)
    await holds.releaseOfferHolds(trx(), "session-2")
    expect(qty("lot-a")).toBe(10)
  })
})
