/**
 * GET /api/v2/orders/by-listing/{listingId} was a 500 for every seller who
 * opened their own listing: the pending-offers query joined a table named
 * "offers" (and a column offer_session_id on it). Neither exists; an offer
 * revision is a row of order_offers, tied to its session by session_id.
 * Postgres rejects the unknown relation while parsing, so no row data is
 * needed to hit it, and table-keyed fakes never noticed.
 *
 * These tests run the endpoint against knex-mock-client and check every query
 * it sends against the schema snapshot (config/postgres + migrations).
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"
import { loadSchemaSnapshot, schemaProblems } from "../../../../test-utils/schema-snapshot.js"

const h = vi.hoisted(() => ({ db: null as unknown, canModify: true }))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../util/listing-permissions.js", () => ({
  canModifyListing: vi.fn(async () => h.canModify),
}))

const { OrdersV2Controller } = await import("./OrdersV2Controller.js")

const LISTING = "f83a85b5-47ba-404b-aaf8-35931633064a"
const req = { user: { user_id: "seller", role: "user", rsi_confirmed: true } } as never
let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  h.canModify = true
  tracker = createTracker(db)
  tracker.on.any(/information_schema/).response([{ table_name: "offer_market_items_v2" }])
  tracker.on.select(/from "listings"/).response([{ listing_id: LISTING, shop_id: "shop-1" }])
  tracker.on.select(/from "order_market_items_v2"/).response([
    {
      order_id: "o1",
      status: "not-started",
      created_at: new Date("2026-11-01T00:00:00Z"),
      buyer_name: "buyer",
      quantity: 2,
      price_per_unit: "1500",
    },
  ])
  tracker.on.select(/from "offer_market_items_v2"/).response([
    {
      session_id: "s1",
      status: "active",
      created_at: new Date("2026-11-02T00:00:00Z"),
      buyer_name: "buyer2",
      quantity: 1,
      price_per_unit: "900",
    },
  ])
})

describe("schema snapshot", () => {
  it("knows the offer tables as production has them", () => {
    const snap = loadSchemaSnapshot()
    expect(snap.tables.has("offers")).toBe(false)
    expect([...snap.tables.get("order_offers")!]).toEqual(expect.arrayContaining(["id", "session_id", "status"]))
    expect([...snap.tables.get("offer_market_items_v2")!]).toEqual(
      expect.arrayContaining(["offer_id", "listing_id", "quantity", "price_per_unit"]),
    )
  })

  it("flags the query that was in production", () => {
    const pg = knexFactory({ client: "pg" })
    const broken = pg("offer_market_items_v2 as omi")
      .join("offers as off", "omi.offer_id", "off.id")
      .join("offer_sessions as os", "off.offer_session_id", "os.id")
      .select("os.id")
      .toSQL().sql
    expect(schemaProblems(broken)).toContain('relation "offers" does not exist')

    const wrongColumn = pg("offer_market_items_v2 as omi")
      .join("order_offers as off", "omi.offer_id", "off.id")
      .join("offer_sessions as os", "off.offer_session_id", "os.id")
      .select("os.id")
      .toSQL().sql
    expect(schemaProblems(wrongColumn)).toEqual([
      "column off.offer_session_id does not exist (table order_offers)",
    ])
  })
})

describe("GET /orders/by-listing/{listingId}", () => {
  it("every query names real tables and columns", async () => {
    await new OrdersV2Controller().getOrdersByListing(LISTING, req)
    const sqls = tracker.history.select.map((q) => q.sql).filter((s) => !s.includes("information_schema"))
    expect(sqls.length).toBeGreaterThanOrEqual(3)
    for (const sql of sqls) expect(schemaProblems(sql), sql).toEqual([])
  })

  it("lists the open revision of open offer sessions only", async () => {
    await new OrdersV2Controller().getOrdersByListing(LISTING, req)
    const q = tracker.history.select.find((x) => x.sql.includes('from "offer_market_items_v2"'))!
    expect(q.sql).toContain('inner join "order_offers" as "off" on "omi"."offer_id" = "off"."id"')
    expect(q.sql).toContain('inner join "offer_sessions" as "os" on "off"."session_id" = "os"."id"')
    expect(q.sql).toMatch(/"os"\."status" = \$\d+ and "off"\."status" = \$\d+/)
    expect(q.bindings).toEqual([LISTING, "active", "active", 20])
  })

  it("returns orders and offers", async () => {
    await expect(new OrdersV2Controller().getOrdersByListing(LISTING, req)).resolves.toEqual({
      orders: [
        {
          order_id: "o1",
          status: "not-started",
          created_at: "2026-11-01T00:00:00.000Z",
          buyer_name: "buyer",
          quantity: 2,
          price_per_unit: 1500,
        },
      ],
      offers: [
        {
          session_id: "s1",
          status: "active",
          created_at: "2026-11-02T00:00:00.000Z",
          buyer_name: "buyer2",
          quantity: 1,
          price_per_unit: 900,
        },
      ],
    })
  })

  it("is a 403 for someone who can't manage the listing", async () => {
    h.canModify = false
    await expect(new OrdersV2Controller().getOrdersByListing(LISTING, req)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })
})
