import { describe, it, expect } from "vitest"
import knexFactory from "knex"
import { LISTING_MARKET_PRICE, excludePlaceholderPrices } from "./market-price.js"
import { PLACEHOLDER_PRICE_MAX } from "../../util/placeholder-price.js"

// SQL is only compiled, never run: no connection is needed for toSQL().
const knex = knexFactory({ client: "pg" })

describe("mining market price", () => {
  it("uses a low percentile instead of the raw minimum", () => {
    const sql = knex("listing_items as li").select(knex.raw(LISTING_MARKET_PRICE)).toSQL().sql
    expect(sql).toContain("percentile_disc(0.1) WITHIN GROUP (ORDER BY li.base_price)")
    expect(sql).not.toMatch(/MIN\(li\.base_price\)/i)
  })

  it("drops placeholder prices such as 1 aUEC WTB listings", () => {
    const q = knex("listing_items as li").select("li.base_price").where(excludePlaceholderPrices).toSQL()
    expect(q.sql).toContain('"li"."base_price" > ?')
    expect(q.bindings).toEqual([PLACEHOLDER_PRICE_MAX])
  })
})
