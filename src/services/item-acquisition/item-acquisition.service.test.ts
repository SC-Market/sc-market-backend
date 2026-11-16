import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => {
    throw new Error("no DB in this test")
  },
  database: {},
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const svc = await import("./item-acquisition.service.js")

const L = (n: number) =>
  `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const row = (
  n: number,
  price: number | null,
  opts: { sale_type?: string; seller?: string; qty?: number } = {},
) => ({
  listing_id: L(n),
  title: `Rifle ${n}`,
  sale_type: opts.sale_type ?? "fixed",
  seller_key: opts.seller ?? `s${n}`,
  price: price === null ? null : String(price),
  quantity: String(opts.qty ?? 1),
})

/** The total_* columns liveListingsSql adds, as Postgres computes them over every live listing. */
const withTotals = (rows: ReturnType<typeof row>[], all = rows) => {
  const fixed = all
    .filter(
      (r) => r.sale_type === "fixed" && r.price !== null && Number(r.price) > 1,
    )
    .map((r) => Number(r.price))
  return rows.map((r) => ({
    ...r,
    total_count: String(all.length),
    total_sellers: String(new Set(all.map((x) => x.seller_key)).size),
    total_quantity: String(all.reduce((s, x) => s + Number(x.quantity), 0)),
    total_lowest_ask: fixed.length ? String(Math.min(...fixed)) : null,
  }))
}

describe("summarizeListings", () => {
  it("counts listings and sellers; lowest ask is fixed-price above the placeholder", () => {
    const s = svc.summarizeListings(
      withTotals([
        row(1, 1), // WTB placeholder
        row(2, 900, { sale_type: "auction" }),
        row(3, 5000, { seller: "a", qty: 2 }),
        row(4, 4000, { seller: "a" }),
        row(5, null, { sale_type: "auction" }),
      ]),
      "https://sc-market.space/market/aggregate/x",
    )
    expect(s).toMatchObject({
      count: 5,
      seller_count: 4,
      quantity_available: 6,
      lowest_ask: 4000,
      page: "https://sc-market.space/market/aggregate/x",
    })
    // Real asks cheapest first, then placeholders and price-less listings.
    expect(s.top.map((l) => l.listing_id)).toEqual([
      L(2),
      L(4),
      L(3),
      L(1),
      L(5),
    ])
    expect(s.top[0]).toEqual({
      listing_id: L(2),
      slug: "e0000000--rifle-2",
      title: "Rifle 2",
      price: 900,
      quantity_available: 1,
      sale_type: "auction",
    })
    // Seller keys are only counted, never returned.
    expect(JSON.stringify(s)).not.toMatch(/"s\d"|seller_key/)
  })

  // Regression: the totals were counted over the rows read (LIMIT 500, no
  // order), so an item with more live listings than that undercounted its
  // listings and sellers and could miss its lowest ask.
  it("counts every live listing, not only the rows read", () => {
    const all = Array.from({ length: 700 }, (_, i) =>
      row(i + 1, 1000 + i, { seller: `s${i % 300}` }),
    )
    const read = all.slice(0, svc.ACQUISITION_LIMITS.listingRows)
    const s = svc.summarizeListings(withTotals(read, all), "p")
    expect(s).toMatchObject({
      count: 700,
      seller_count: 300,
      quantity_available: 700,
      lowest_ask: 1000,
    })
  })

  it("no live listings: zero counts", () => {
    expect(svc.summarizeListings([], "p")).toMatchObject({
      count: 0,
      seller_count: 0,
      quantity_available: 0,
      lowest_ask: null,
      top: [],
    })
  })

  it("the SQL reads totals over every live listing before the row cap", () => {
    const sql = svc.liveListingsSql()
    expect(sql).toContain("COUNT(*) OVER ()")
    expect(sql).toContain("(SELECT COUNT(DISTINCT seller_key) FROM live)")
    expect(sql).toMatch(/ORDER BY[\s\S]*LIMIT 500\s*$/)
  })

  it("keeps the top 5 and has no lowest ask without a real fixed-price ask", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(i + 1, 1))
    const s = svc.summarizeListings(withTotals(rows), "p")
    expect(s.count).toBe(8)
    expect(s.top).toHaveLength(svc.ACQUISITION_LIMITS.listings)
    expect(s.lowest_ask).toBeNull()
  })
})

describe("toPublicDocument", () => {
  it("drops the listing references, keeps the summary", () => {
    const doc = {
      feed: svc.ITEMS_FEED_INFO,
      listings: {
        count: 1,
        seller_count: 1,
        quantity_available: 1,
        lowest_ask: 5,
        page: "p",
        top: [
          {
            listing_id: L(1),
            slug: "e0000000--x",
            title: "x",
            price: 5,
            quantity_available: 1,
            sale_type: "fixed",
          },
        ],
      },
    } as never
    const pub = svc.toPublicDocument(doc)
    expect(pub.listings).toEqual({
      count: 1,
      seller_count: 1,
      quantity_available: 1,
      lowest_ask: 5,
      page: "p",
    })
    expect(JSON.stringify(pub)).not.toContain(L(1))
  })

  it("the feed envelope is the shared one (CC BY 4.0)", () => {
    expect(svc.ITEMS_FEED_INFO).toMatchObject({
      dataset: "items",
      version: 1,
      license: {
        license: "CC-BY-4.0",
        url: "https://creativecommons.org/licenses/by/4.0/",
      },
    })
    expect(svc.acquisitionLinks("1a2b3c4d--gun")).toEqual({
      wiki: "https://sc-market.space/wiki/items/1a2b3c4d--gun",
      market: "https://sc-market.space/market/aggregate/1a2b3c4d--gun",
      json: "https://api.sc-market.space/api/public/items/1a2b3c4d--gun.json",
    })
  })
})
