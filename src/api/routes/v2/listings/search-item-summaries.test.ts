/**
 * Search item summaries: a grouped market card ("across N sellers", "from
 * <price>", quality, stock, bulk discount) counts every matching listing of
 * its item, not only the ones on the loaded result page.
 *
 * Regression: "UEE 6th Platoon Medal (Pristine)" read "across 2 sellers" on
 * the market grid while its expanded list showed 4: the card grouped and
 * counted the 48 listings of the page only.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"
import {
  summarizeSearchItems,
  type SearchItemSummaryRow,
} from "./search-item-summaries.js"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const row = (
  n: number,
  opts: Partial<SearchItemSummaryRow> = {},
): SearchItemSummaryRow => ({
  game_item_id: "medal",
  listing_id: `l${n}`,
  shop_id: `s${n}`,
  price_min: "1000",
  price_max: "1000",
  quantity_available: 1,
  quality_tier_min: null,
  quality_tier_max: null,
  quality_value_min: null,
  quality_value_max: null,
  has_bulk_discount: false,
  ...opts,
})

describe("summarizeSearchItems", () => {
  it("counts distinct in-stock shops, like the expanded seller list", () => {
    const [s] = summarizeSearchItems([
      row(1, { shop_id: "a", quantity_available: 3 }),
      row(2, { shop_id: "a", quantity_available: 2 }), // same shop again
      row(3, { shop_id: "b" }),
      row(4, { shop_id: "c" }),
      row(5, { shop_id: "d" }),
      row(6, { shop_id: "e", quantity_available: 0 }), // no stock: not a seller
    ])
    expect(s).toMatchObject({
      game_item_id: "medal",
      listing_count: 6,
      seller_count: 4,
      quantity_available: 8,
    })
  })

  it("prices, quality and bulk discount come from the in-stock listings", () => {
    const [s] = summarizeSearchItems([
      row(1, {
        price_min: 500,
        price_max: 500,
        quantity_available: 0,
        has_bulk_discount: true,
        quality_value_min: 10,
        quality_value_max: 10,
      }),
      row(2, {
        price_min: 900,
        price_max: 1200,
        quality_tier_min: 2,
        quality_tier_max: 3,
        quality_value_min: 400,
        quality_value_max: 700,
      }),
      row(3, {
        price_min: 800,
        price_max: null,
        quality_tier_min: 4,
        quality_tier_max: 4,
        quality_value_min: 800,
        quality_value_max: 800,
      }),
    ])
    expect(s).toMatchObject({
      price_min: 800,
      price_max: 1200,
      quality_tier_min: 2,
      quality_tier_max: 4,
      quality_value_min: 400,
      quality_value_max: 800,
      has_bulk_discount: false,
    })
  })

  it("an in-stock listing with bulk tiers shows the discount", () => {
    const [s] = summarizeSearchItems([
      row(1),
      row(2, { has_bulk_discount: true }),
    ])
    expect(s.has_bulk_discount).toBe(true)
  })

  it("with nothing in stock, prices come from every listing and no seller counts", () => {
    const [s] = summarizeSearchItems([
      row(1, { price_min: 700, price_max: 700, quantity_available: 0 }),
      row(2, { price_min: 300, price_max: 300, quantity_available: null }),
    ])
    expect(s).toMatchObject({
      listing_count: 2,
      seller_count: 0,
      quantity_available: 0,
      price_min: 300,
      price_max: 700,
    })
    expect(s.quality_tier_min).toBeUndefined()
    expect(s.quality_value_max).toBeUndefined()
  })

  it("one summary per item, in first-seen order; a listing counts once", () => {
    const out = summarizeSearchItems([
      row(1, { game_item_id: "b" }),
      row(2, { game_item_id: "a" }),
      row(1, { game_item_id: "b" }), // bundle: same listing, another row
      row(3, { game_item_id: "b", shop_id: "s1" }),
    ])
    expect(
      out.map((s) => [s.game_item_id, s.listing_count, s.seller_count]),
    ).toEqual([
      ["b", 2, 1],
      ["a", 1, 1],
    ])
  })

  it("no rows, no summaries", () => {
    expect(summarizeSearchItems([])).toEqual([])
  })
})

describe("GET /listings/search item_summaries", () => {
  let tracker: Tracker

  beforeEach(() => {
    const db = knexFactory({ client: MockClient, dialect: "pg" })
    h.db = db
    tracker = createTracker(db)
  })

  async function search(text: string) {
    const { ListingsV2Controller } = await import("./ListingsV2Controller.js")
    type Args = Parameters<
      InstanceType<typeof ListingsV2Controller>["searchListings"]
    >
    const args = new Array(24).fill(undefined) as Args
    args[0] = text
    args[8] = 1 // page
    args[9] = 2 // page_size
    args[23] = { user: undefined } as never // request
    return new ListingsV2Controller().searchListings(...args)
  }

  const pageRow = (n: number, game_item_id: string, shop_id: string) => ({
    listing_id: `l${n}`,
    title: "Medal",
    shop_id,
    created_at: new Date("2026-11-01T00:00:00Z"),
    updated_at: new Date("2026-11-01T00:00:00Z"),
    price_min: "1000",
    price_max: "1000",
    quantity_available: 1,
    game_item_id,
    has_bulk_discount: true,
  })

  it("summarizes the page's items over every matching listing, with the same filters", async () => {
    tracker.on.select(/^select count\(\*\)/i).response([{ count: 6 }])
    tracker.on
      .select((q) => q.sql.includes("limit"))
      .response([pageRow(1, "medal", "a"), pageRow(2, "medal", "b")])
    tracker.on
      .select((q) => q.sql.includes("listing_search"))
      .response([
        row(1, { shop_id: "a" }),
        row(2, { shop_id: "b" }),
        row(3, { shop_id: "c" }),
        row(4, { shop_id: "d" }),
      ])
    tracker.on.select(() => true).response([])

    const res = await search("platoon")

    expect(res.listings.map((l) => l.has_bulk_discount)).toEqual([true, true])
    expect(res.item_summaries).toEqual([
      expect.objectContaining({
        game_item_id: "medal",
        seller_count: 4,
        listing_count: 4,
      }),
    ])

    const summaryQuery = tracker.history.select.find(
      (q) =>
        q.sql.includes("listing_search") && !/limit|count\(\*\)/i.test(q.sql),
    )!
    expect(summaryQuery).toBeDefined()
    // Same filters as the page: text, active status, public visibility.
    expect(summaryQuery.sql).toContain("plainto_tsquery")
    expect(summaryQuery.bindings).toEqual(
      expect.arrayContaining(["platoon", "medal", "active", "public"]),
    )
    expect(summaryQuery.sql).toMatch(/"ls"\."game_item_id" in/)
    expect(summaryQuery.sql).not.toMatch(/order by|offset/i)
  })

  it("an empty page reads no summaries", async () => {
    tracker.on.select(/^select count\(\*\)/i).response([{ count: 0 }])
    tracker.on.select(() => true).response([])
    const res = await search("nothing")
    expect(res.item_summaries).toEqual([])
    expect(
      tracker.history.select.filter((q) => q.sql.includes("listing_search")),
    ).toHaveLength(2) // count + page
  })
})
