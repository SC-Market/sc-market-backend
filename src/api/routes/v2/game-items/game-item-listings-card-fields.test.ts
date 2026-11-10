/**
 * GET /api/v2/game-items/{id}/listings rows feed the seller rows of a grouped
 * market card, which show what a top-level listing card shows: the listing's
 * photo, seller activity (last seen / reply time), bulk discount, visibility,
 * quantity unit and updated time.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))

const { GameItemsV2Controller } = await import("./GameItemsV2Controller.js")

const ITEM = "11111111-1111-4111-8111-111111111111"
const SHOP = "22222222-2222-4222-8222-222222222222"
const created = new Date("2026-10-01T00:00:00Z")
const updated = new Date("2026-11-01T00:00:00Z")
let tracker: Tracker

function row(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: "l1",
    variant_id: "v1",
    title: "Fang",
    shop_id: SHOP,
    shop_name: "Phal's",
    shop_slug: "phals",
    created_at: created,
    updated_at: updated,
    visibility: "private",
    quantity_unit: "scu",
    quality_tier: 3,
    quality_value: null,
    quantity_available: 4,
    price: "1000",
    shop_rating: "4.5",
    shop_rating_count: 10,
    shop_badge_ids: ["fast"],
    photo: "https://cdn.sc-market.space/fang.png",
    has_bulk_discount: true,
    ...overrides,
  }
}

function setup(rows: Record<string, unknown>[]) {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.select(/^SELECT COUNT\(\*\)/).response({ rows: [{ count: 1 }] })
  tracker.on
    .select(/from "game_items"/)
    .response({ id: ITEM, name: "Fang", type: "Weapon" })
  tracker.on
    .select(
      (q) => q.sql.includes("listing_item_lots") && q.sql.includes("photo"),
    )
    .response(rows)
  tracker.on
    .select(/from "shops" as "s" left join "shop_activity_stats"/)
    .response([
      {
        shop_id: SHOP,
        total_completed: 12,
        last_active_at: new Date(),
        reply_median_minutes: 30,
        reply_sample_size: 20,
      },
    ])
  tracker.on.select(() => true).response([])
}

const fetchListings = () =>
  new GameItemsV2Controller().getListings(
    ITEM,
    undefined,
    undefined,
    undefined,
    1,
    20,
    {
      user: undefined,
    } as never,
  )

describe("game item listing rows carry the listing card's fields", () => {
  beforeEach(() => setup([row()]))

  it("selects the photo and bulk discount with the search card's rules", async () => {
    await fetchListings()
    const q = tracker.history.select.find(
      (x) => x.sql.includes("listing_item_lots") && x.sql.includes("photo"),
    )
    expect(q?.sql).toContain("listing_photos_v2")
    expect(q?.sql).toContain("ORDER BY lp.display_order ASC LIMIT 1")
    expect(q?.sql).toContain("BOOL_OR(li.bulk_discount_tiers IS NOT NULL")
  })

  it("maps photo, activity, bulk discount, visibility, unit and updated time", async () => {
    const res = await fetchListings()
    expect(res.listings).toHaveLength(1)
    const l = res.listings[0]
    expect(l.photo).toBe("https://cdn.sc-market.space/fang.png")
    expect(l.has_bulk_discount).toBe(true)
    expect(l.visibility).toBe("private")
    expect(l.quantity_unit).toBe("scu")
    expect(l.updated_at).toBe(updated.toISOString())
    expect(l.shop_activity).toEqual({
      last_seen: "today",
      reply_time: "within_hour",
      reply_sample_size: 20,
      completed_orders: 12,
    })
  })

  it("defaults a listing without photo or update time", async () => {
    setup([
      row({
        photo: null,
        updated_at: null,
        has_bulk_discount: null,
        visibility: null,
        quantity_unit: null,
      }),
    ])
    const l = (await fetchListings()).listings[0]
    expect(l.photo).toBeUndefined()
    expect(l.updated_at).toBe(created.toISOString())
    expect(l.has_bulk_discount).toBe(false)
    expect(l.visibility).toBe("public")
    expect(l.quantity_unit).toBe("unit")
  })
})
