/**
 * Price oracle service: eligibility SQL (public, non-test, aged listings),
 * the daily rows of the snapshot job, and the public documents: aggregates
 * only, no seller / buyer / listing identifiers (design:
 * drafts/price-oracle-design.md).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const svc = await import("./price-oracle.service.js")

const ITEM = "1a2b3c4d-2222-4333-8444-555555555555"
const SHOP_NAME = "Secret Shop Name"
const SHOP_ID = "99999999-8888-4777-8666-555555555555"
const SELLER_ID = "77777777-8888-4777-8666-555555555555"
const LISTING_ID = "66666666-8888-4777-8666-555555555555"

describe("eligibility SQL", () => {
  const sql = svc.eligibleSellerAsksSql("")

  it("only counts active, public listings of non-test shops", () => {
    expect(sql).toContain("l.status = 'active' AND l.visibility = 'public'")
    expect(sql).toContain("_ts.shop_id = l.shop_id AND _ts.is_test")
  })

  it("only fixed-price, per-unit, non-bundle, unexpired, aged, in-stock asks above placeholders", () => {
    expect(sql).toContain("l.sale_type = 'fixed'")
    expect(sql).toContain("l.listing_type IN ('single', 'bulk')")
    expect(sql).toContain("l.quantity_unit = 'unit'")
    expect(sql).toContain("l.expires_at IS NULL OR l.expires_at > now()")
    expect(sql).toContain("l.created_at <= now() - interval '24 hours'")
    expect(sql).toContain("lil.listed = true AND lil.quantity_total > 0")
    expect(sql).toContain("x.price > 1")
  })

  it("one row per item and seller, selecting no seller or listing identifier", () => {
    expect(sql).toMatch(
      /GROUP BY li\.game_item_id, COALESCE\(l\.shop_id::text, l\.seller_id::text\)/,
    )
    const selectList = sql.slice(
      sql.indexOf("SELECT"),
      sql.indexOf("FROM listings l"),
    )
    expect(selectList).not.toMatch(
      /shop_id|seller_id|AS listing_id|l\.listing_id,/,
    )
  })

  it("sales: public, non-test listings' completed sales in 30 days", () => {
    const s = svc.salesSql()
    expect(s).toContain("ph.event_type = 'sale_completed'")
    expect(s).toContain("l.visibility = 'public'")
    expect(s).toContain("_ts.shop_id = l.shop_id AND _ts.is_test")
    expect(s).toContain("interval '30 days'")
  })
})

describe("buildDailyRows", () => {
  it("computes per-item stats, the trend from prior days and sale medians from 3 sales", () => {
    const prior = Array.from({ length: 7 }, (_, i) => ({
      game_item_id: ITEM,
      day: `2026-10-${String(20 + i).padStart(2, "0")}`,
      median_ask: "10000",
    }))
    const rows = svc.buildDailyRows(
      "2026-10-31",
      [
        { game_item_id: ITEM, price: "11000", listing_count: 2, quantity: "5" },
        { game_item_id: ITEM, price: "12000", listing_count: 1, quantity: "1" },
        {
          game_item_id: ITEM,
          price: "13000",
          listing_count: 1,
          quantity: null,
        },
      ],
      [{ game_item_id: ITEM, sale_count: 3, sale_median: "10500.0" }],
      prior,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      game_item_id: ITEM,
      day: "2026-10-31",
      ask_count: 4,
      seller_count: 3,
      quantity_available: 6,
      lowest_ask: 11000,
      median_ask: 12000,
      highest_ask: 13000,
      sale_count_30d: 3,
      sale_median_30d: 10500,
      days_with_median_30d: 8,
      median_30d: 10000,
      change_pct_30d: 20,
    })
  })

  it("no sale median below 3 sales; a zero row for an item that had history but no asks today", () => {
    const rows = svc.buildDailyRows(
      "2026-10-31",
      [],
      [{ game_item_id: ITEM, sale_count: 2, sale_median: "500" }],
      [{ game_item_id: ITEM, day: "2026-10-30", median_ask: "900" }],
    )
    expect(rows[0]).toMatchObject({
      ask_count: 0,
      seller_count: 0,
      lowest_ask: null,
      median_ask: null,
      sale_count_30d: 2,
      sale_median_30d: null,
      median_30d: null,
    })
  })
})

describe("summarySentence", () => {
  const current = {
    ask_count: 6,
    seller_count: 4,
    quantity_available: 9,
    lowest_ask: 12500,
    median_ask: 15000,
    highest_ask: 20000,
    outliers_excluded: 0,
  }
  it("states the facts with thousands separators", () => {
    expect(
      svc.summarySentence("P4-AR Rifle", "2026-10-31", current, -8.2),
    ).toBe(
      "As of 2026-10-31, SC Market player listings for P4-AR Rifle: lowest ask 12,500 aUEC, median ask 15,000 aUEC, based on 6 listings from 4 sellers (medium confidence); 30-day change in the median -8.2%. aUEC is Star Citizen's in-game currency.",
    )
  })
  it("says high confidence from 6 sellers", () => {
    expect(
      svc.summarySentence(
        "Y",
        "2026-10-31",
        { ...current, seller_count: 6, ask_count: 9 },
        null,
      ),
    ).toBe(
      "As of 2026-10-31, SC Market player listings for Y: lowest ask 12,500 aUEC, median ask 15,000 aUEC, based on 9 listings from 6 sellers (high confidence). aUEC is Star Citizen's in-game currency.",
    )
  })
  it("below the median minimum: the lowest ask only, low confidence, never a typical price", () => {
    expect(
      svc.summarySentence(
        "X",
        "2026-10-31",
        { ...current, seller_count: 1, ask_count: 1, median_ask: null },
        null,
      ),
    ).toBe(
      "As of 2026-10-31, the lowest asking price in SC Market player listings for X is 12,500 aUEC, based on 1 listing from 1 seller. Too few sellers for a typical price (low confidence). aUEC is Star Citizen's in-game currency.",
    )
    expect(
      svc.summarySentence(
        "X",
        "2026-10-31",
        { ...current, seller_count: 0, lowest_ask: null },
        null,
      ),
    ).toBe(
      "As of 2026-10-31, there are no qualifying SC Market player listings for X.",
    )
  })
})

/** Every key path of a JSON value, arrays collapsed to []. */
function keyPaths(v: unknown, prefix = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => keyPaths(x, `${prefix}[]`))
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => [
      `${prefix}.${k}`,
      ...keyPaths(x, `${prefix}.${k}`),
    ])
  }
  return []
}

const ALLOWED_DOC_KEYS = new Set([
  ".feed",
  ".feed.dataset",
  ".feed.version",
  ".feed.terms",
  ".feed.license",
  ".feed.license.license",
  ".feed.license.url",
  ".feed.license.attribution",
  ".feed.license.notice",
  ".item",
  ".item.id",
  ".item.slug",
  ".item.name",
  ".item.type",
  ".currency",
  ".unit_note",
  ".as_of",
  ".current",
  ".current.ask_count",
  ".current.seller_count",
  ".current.quantity_available",
  ".current.lowest_ask",
  ".current.median_ask",
  ".current.highest_ask",
  ".current.outliers_excluded",
  ".current.confidence",
  ".current.sample_note",
  ".trend_30d",
  ".trend_30d.days_with_data",
  ".trend_30d.median_30d",
  ".trend_30d.change_pct",
  ".trend_30d.daily",
  ".trend_30d.daily[].date",
  ".trend_30d.daily[].median_ask",
  ".trend_30d.daily[].lowest_ask",
  ".trend_30d.daily[].ask_count",
  ".trend_30d.daily[].seller_count",
  ".sales_30d",
  ".sales_30d.count",
  ".sales_30d.median_price",
  ".summary",
  ".attribution",
  ".methodology",
  ".methodology.text",
  ".methodology.rules",
  ...Object.keys(svc.METHODOLOGY.rules).map((k) => `.methodology.rules.${k}`),
  ".links",
  ".links.page",
  ".links.json",
  ".links.index",
])

describe("public documents carry no PII", () => {
  let tracker: Tracker
  let db: ReturnType<typeof knexFactory>

  beforeEach(() => {
    db = knexFactory({ client: MockClient, dialect: "pg" })
    tracker = createTracker(db)
    tracker.on
      .select(/from "game_items"/)
      .response({ id: ITEM, name: "P4-AR Rifle", type: "Weapon" })
    // Rows deliberately carry identifying columns a careless query might
    // return: none of them may reach the document.
    tracker.on.select(/from "game_item_price_daily"/).response([
      {
        day: "2026-10-30",
        median_ask: "12000",
        lowest_ask: "11000",
        ask_count: 4,
        seller_count: 3,
        median_30d: null,
        change_pct_30d: null,
        days_with_median_30d: 1,
        sale_count_30d: 1,
        sale_median_30d: null,
        shop_name: SHOP_NAME,
        seller_id: SELLER_ID,
        buyer_id: SELLER_ID,
      },
    ])
    tracker.on.any(/SET LOCAL statement_timeout/).response(undefined)
    tracker.on.any(/FROM listings l/).response({
      rows: [
        {
          game_item_id: ITEM,
          price: "11000",
          listing_count: 1,
          quantity: "2",
          shop_id: SHOP_ID,
          shop_name: SHOP_NAME,
          listing_id: LISTING_ID,
        },
        {
          game_item_id: ITEM,
          price: "12000",
          listing_count: 2,
          quantity: "1",
          shop_id: SHOP_ID,
          seller_id: SELLER_ID,
        },
      ],
    })
  })

  it("the item document has only aggregate fields", async () => {
    // Sample size and confidence travel with the numbers.
    const doc = await svc.getPriceDocument(
      "1a2b3c4d--p4-ar-rifle",
      db,
      new Date("2026-10-31T12:00:00Z"),
    )
    expect(doc).not.toBeNull()
    for (const k of keyPaths(doc))
      expect(ALLOWED_DOC_KEYS, `unexpected key ${k}`).toContain(k)
    const text = JSON.stringify(doc)
    for (const secret of [SHOP_NAME, SHOP_ID, SELLER_ID, LISTING_ID])
      expect(text).not.toContain(secret)
    expect(doc!.current).toMatchObject({
      seller_count: 2,
      ask_count: 3,
      lowest_ask: 11000,
      median_ask: null,
      confidence: "low",
      sample_note: "Based on 3 listings from 2 sellers on SC Market.",
    })
    expect(doc!.summary).toContain("based on 3 listings from 2 sellers")
    expect(doc!.summary).toContain("low confidence")
    expect(doc!.item.slug).toBe("1a2b3c4d--p4-ar-rifle")
    expect(doc!.links.json).toBe(
      "https://api.sc-market.space/api/public/prices/1a2b3c4d--p4-ar-rifle.json",
    )
  })

  it("the current-ask query runs under a short statement timeout", async () => {
    await svc.getPriceDocument(ITEM, db, new Date("2026-10-31T12:00:00Z"))
    const sqls = tracker.history.any.map((q) => q.sql)
    const t = sqls.findIndex((s) =>
      s.includes("SET LOCAL statement_timeout = '2s'"),
    )
    const q = sqls.findIndex((s) => s.includes("FROM listings l"))
    expect(t).toBeGreaterThanOrEqual(0)
    expect(q).toBeGreaterThan(t)
    expect(tracker.history.any[q].bindings).toEqual([ITEM])
  })

  it("an unknown or malformed slug resolves to null without a listings query", async () => {
    tracker.reset()
    tracker.on.select(/from "game_items"/).response(undefined)
    expect(await svc.getPriceDocument("zzzz", db)).toBeNull()
    expect(await svc.getPriceDocument("deadbeef--nothing", db)).toBeNull()
    expect(
      tracker.history.any.some((q) => q.sql.includes("FROM listings l")),
    ).toBe(false)
  })

  it("the index, CSV and Markdown carry only aggregates", async () => {
    tracker.reset()
    tracker.on
      .select(/max\("?day"?\)|MAX\(day\)/i)
      .response({ day: "2026-10-31" })
    tracker.on.select(/from "game_item_price_daily" as "d"/).response([
      {
        id: ITEM,
        name: 'P4-AR Rifle, "Black" | =cmd',
        type: "Weapon",
        ask_count: 3,
        seller_count: 3,
        lowest_ask: "10000",
        median_ask: "11000",
        median_30d: "10500",
        change_pct_30d: "-4.5",
        computed_at: "2026-10-31T06:00:00Z",
        shop_name: SHOP_NAME,
      },
    ])
    const index = await svc.getPriceIndex(db)
    expect(index.date).toBe("2026-10-31")
    expect(index.as_of).toBe("2026-10-31T06:00:00.000Z")
    expect(index.feed).toEqual(svc.PRICE_FEED_INFO)
    expect(svc.PRICE_FEED_INFO.terms).toMatch(/^Free to use/)
    expect(svc.PRICE_FEED_INFO.license).toEqual({
      license: "CC-BY-4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Data: SC Market (sc-market.space)",
      notice:
        "Game data © Cloud Imperium Games; aggregation and price data by SC Market, CC BY 4.0.",
    })
    expect(index.coverage).toEqual({ none: 0, low: 0, medium: 1, high: 0 })
    expect(index.items[0]).toEqual({
      slug: "1a2b3c4d--p4-ar-rifle-black-cmd",
      name: 'P4-AR Rifle, "Black" | =cmd',
      type: "Weapon",
      page: "https://sc-market.space/market/aggregate/1a2b3c4d--p4-ar-rifle-black-cmd",
      json: "https://api.sc-market.space/api/public/prices/1a2b3c4d--p4-ar-rifle-black-cmd.json",
      ask_count: 3,
      seller_count: 3,
      confidence: "medium",
      lowest_ask: 10000,
      median_ask: 11000,
      median_30d: 10500,
      change_pct_30d: -4.5,
    })
    const csv = svc.priceIndexCsv(index)
    expect(csv.split("\n")[1]).toBe(
      '1a2b3c4d--p4-ar-rifle-black-cmd,"P4-AR Rifle, ""Black"" | =cmd",Weapon,10000,11000,10500,-4.5,3,3,medium,https://sc-market.space/market/aggregate/1a2b3c4d--p4-ar-rifle-black-cmd,"Data: SC Market (sc-market.space), CC BY 4.0"',
    )
    expect(csv.split("\n")[0]).toBe(
      "slug,name,type,lowest_ask,median_ask,median_30d,change_pct_30d,ask_count,seller_count,confidence,page,attribution",
    )
    expect(index.unit_note).toContain("aUEC, Star Citizen's in-game currency")
    const md = svc.priceIndexMarkdown(index)
    expect(md).toContain("aUEC, Star Citizen's in-game currency")
    expect(md).toContain(
      'License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Attribution: "Data: SC Market (sc-market.space)". Game data © Cloud Imperium Games; aggregation and price data by SC Market, CC BY 4.0.',
    )
    expect(md).toContain(
      '| [P4-AR Rifle, "Black" \\| =cmd](https://sc-market.space/market/aggregate/1a2b3c4d--p4-ar-rifle-black-cmd) | Weapon | 10,000 | 11,000 | 10,500 | -4.5% | 3 | 3 | medium |',
    )
    for (const out of [JSON.stringify(index), csv, md])
      expect(out).not.toContain(SHOP_NAME)
  })

  it("an empty index before the first snapshot", async () => {
    tracker.reset()
    tracker.on.select(/max/i).response({ day: null })
    const index = await svc.getPriceIndex(db)
    expect(index).toMatchObject({
      date: null,
      as_of: null,
      count: 0,
      items: [],
    })
  })
})

describe("snapshotGameItemPrices", () => {
  it("excludes the test realm and upserts today's rows idempotently", async () => {
    const db = knexFactory({ client: MockClient, dialect: "pg" })
    const tracker = createTracker(db)
    tracker.on
      .select(/information_schema|to_regclass|pg_tables/i)
      .response([{ table_name: "x" }])
    tracker.on.select(/from "game_item_price_daily"/).response([])
    tracker.on.any(/SET LOCAL/).response(undefined)
    tracker.on.any(/FROM listings l\s+JOIN listing_items/).response({
      rows: [
        { game_item_id: ITEM, price: "10000", listing_count: 1, quantity: "1" },
        { game_item_id: ITEM, price: "11000", listing_count: 1, quantity: "1" },
        { game_item_id: ITEM, price: "12000", listing_count: 1, quantity: "1" },
      ],
    })
    tracker.on.any(/FROM price_history_v2/).response({ rows: [] })
    tracker.on.insert(/game_item_price_daily/).response([])
    tracker.on.any(() => true).response({ rows: [{ exists: true }] })

    const n = await svc.snapshotGameItemPrices(
      db,
      new Date("2026-10-31T03:00:00Z"),
    )
    expect(n).toBe(1)
    const asks = tracker.history.any.find((q) =>
      q.sql.includes("FROM listings l"),
    )
    expect(asks?.sql).toContain("_ts.is_test")
    expect(asks?.sql).toContain("l.visibility = 'public'")
    const ins = tracker.history.insert[0]
    expect(ins.sql).toMatch(/on conflict \("game_item_id", "day"\) do update/i)
    expect(ins.bindings).toEqual(
      expect.arrayContaining([ITEM, "2026-10-31", 11000]),
    )
    expect(ins.sql).not.toMatch(/shop|seller_id|listing_id|buyer/i)
  })
})
