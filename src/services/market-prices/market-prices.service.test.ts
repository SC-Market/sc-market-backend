import { afterEach, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => {
    throw new Error("no DB in this test")
  },
  database: {},
}))

const svc = await import("./market-prices.service.js")

const ITEM_A = "a0000000-0000-4000-8000-000000000001"
const ITEM_B = "b0000000-0000-4000-8000-000000000002"
const ITEM_C = "c0000000-0000-4000-8000-000000000003"

let listingSeq = 0
const row = (
  game_item_id: string,
  shop_id: string,
  price: number | null,
  sale_type = "fixed",
) => ({
  game_item_id,
  listing_id: `listing-${++listingSeq}`,
  shop_id,
  sale_type,
  price: price === null ? null : String(price),
})

describe("summarizeMarketPrices", () => {
  it("counts sellers by distinct shop, not by listing", () => {
    const out = svc.summarizeMarketPrices([
      row(ITEM_A, "shop-1", 5000),
      row(ITEM_A, "shop-1", 4500),
      row(ITEM_A, "shop-1", 6000),
      row(ITEM_A, "shop-2", 7000),
    ])
    expect(out.get(ITEM_A)).toEqual({
      game_item_id: ITEM_A,
      lowest_price: 4500,
      seller_count: 2,
      listing_count: 4,
    })
  })

  it("lowest price is the lowest fixed-price ask above the placeholder", () => {
    const out = svc.summarizeMarketPrices([
      row(ITEM_A, "shop-1", 1), // "contact me" placeholder
      row(ITEM_A, "shop-2", 900, "auction"),
      row(ITEM_A, "shop-3", null, "auction"),
      row(ITEM_A, "shop-4", 2500),
    ])
    expect(out.get(ITEM_A)?.lowest_price).toBe(2500)
    // Auction and placeholder sellers still sell the item.
    expect(out.get(ITEM_A)?.seller_count).toBe(4)
  })

  it("lowest price is null when only placeholders and auctions are listed", () => {
    const out = svc.summarizeMarketPrices([
      row(ITEM_A, "shop-1", 1),
      row(ITEM_A, "shop-2", 900, "auction"),
    ])
    expect(out.get(ITEM_A)).toMatchObject({
      lowest_price: null,
      seller_count: 2,
    })
  })

  it("an item without live listings has no entry (hidden when zero)", () => {
    const out = svc.summarizeMarketPrices([row(ITEM_A, "shop-1", 100)])
    expect(out.has(ITEM_B)).toBe(false)
    expect(svc.summarizeMarketPrices([]).size).toBe(0)
  })

  it("keeps items apart", () => {
    const out = svc.summarizeMarketPrices([
      row(ITEM_A, "shop-1", 100),
      row(ITEM_B, "shop-1", 300),
      row(ITEM_B, "shop-2", 200),
    ])
    expect(out.get(ITEM_A)?.seller_count).toBe(1)
    expect(out.get(ITEM_B)).toMatchObject({
      lowest_price: 200,
      seller_count: 2,
    })
  })
})

describe("liveListingRowsQuery", () => {
  const knex = knexFactory({ client: "pg" })

  it("uses the market's public-visibility and in-stock rules", () => {
    const sql = svc
      .liveListingRowsQuery(knex, {
        sql: "li.game_item_id = ANY(?::uuid[])",
        bindings: [[ITEM_A]],
      })
      .toQuery()
    expect(sql).toContain("l.status = 'active'")
    expect(sql).toContain("l.visibility = 'public'")
    // Test shops never count (services/test-accounts).
    expect(sql).toMatch(/is_test/)
    expect(sql).toContain("lil.listed = true AND lil.quantity_total > 0")
    expect(sql).toContain("p.qty > 0")
    expect(sql).toContain("l.expires_at IS NULL OR l.expires_at > now()")
    expect(sql).toContain(ITEM_A)
  })
})

describe("getMarketPrices", () => {
  afterEach(() => svc.clearMarketPriceCache())

  /** A knex stand-in: transactions run inline, raw() answers the listing query. */
  function fakeKnex(rows: ReturnType<typeof row>[]) {
    const queries: unknown[][] = []
    const trx = {
      raw: vi.fn(async (sql: string, bindings?: unknown[]) => {
        if (sql.startsWith("SET LOCAL")) return { rows: [] }
        queries.push(bindings ?? [])
        const ids = new Set((bindings?.[0] as string[]) ?? [])
        return { rows: rows.filter((r) => ids.has(r.game_item_id)) }
      }),
    }
    const knex = {
      transaction: async (fn: (t: typeof trx) => unknown) => fn(trx),
    }
    return { knex: knex as unknown as Knex, queries }
  }

  it("answers a page of items with one query and leaves out unsold items", async () => {
    const { knex, queries } = fakeKnex([
      row(ITEM_A, "shop-1", 100),
      row(ITEM_A, "shop-2", 90),
      row(ITEM_C, "shop-3", 50),
    ])
    const out = await svc.getMarketPrices(knex, [ITEM_A, ITEM_B, ITEM_C])
    expect(queries).toHaveLength(1)
    expect(out.map((p) => p.game_item_id)).toEqual([ITEM_A, ITEM_C])
    expect(out[0]).toMatchObject({ lowest_price: 90, seller_count: 2 })
  })

  it("caches per item, unsold ones included, and only queries the rest", async () => {
    const { knex, queries } = fakeKnex([row(ITEM_A, "shop-1", 100)])
    await svc.getMarketPrices(knex, [ITEM_A, ITEM_B])
    const out = await svc.getMarketPrices(knex, [ITEM_B, ITEM_A, ITEM_C])
    expect(queries).toHaveLength(2)
    expect(queries[1][0]).toEqual([ITEM_C])
    expect(out.map((p) => p.game_item_id)).toEqual([ITEM_A])
  })

  it("dedupes ids case-insensitively", async () => {
    const { knex, queries } = fakeKnex([row(ITEM_A, "shop-1", 100)])
    const out = await svc.getMarketPrices(knex, [ITEM_A, ITEM_A.toUpperCase()])
    expect(queries[0][0]).toEqual([ITEM_A])
    expect(out).toHaveLength(1)
  })
})
