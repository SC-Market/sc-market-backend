/**
 * Featuring (featured-sellers.ts): the homepage's org row and top shops only
 * take orgs/shops with an order fulfilled in the last 365 days; the
 * Storefronts hub (no `featured`) is unchanged. Checks the SQL built.
 */
import { describe, expect, it, vi } from "vitest"
import knexFactory from "knex"

vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(),
)

const { FEATURED_TRADE_WINDOW_DAYS, fulfilledWithinSql, recentlyTradedSql } = await import("./featured-sellers.js")
const storefront = await import("../storefront/storefront.js")

const pg = knexFactory({ client: "pg" })

describe("recentlyTradedSql", () => {
  it("needs a fulfilled order of the shop within the window", () => {
    const sql = recentlyTradedSql("s.shop_id")
    expect(sql).toContain("FROM orders _fo WHERE _fo.shop_id = s.shop_id")
    expect(sql).toContain("_fo.status = 'fulfilled'")
    expect(sql).toContain(
      `COALESCE(_fo.fulfilled_at, _fo."timestamp") >= now() - INTERVAL '${FEATURED_TRADE_WINDOW_DAYS} days'`,
    )
    expect(FEATURED_TRADE_WINDOW_DAYS).toBe(365)
  })

  it("rejects anything but a column reference", () => {
    expect(() => recentlyTradedSql("s.shop_id; DROP TABLE orders")).toThrow()
    expect(() => recentlyTradedSql("shop_id")).toThrow()
  })
})

describe("fulfilledWithinSql", () => {
  it("is a fulfilled order whose fulfilment (or, before fulfilled_at, placement) is in the window", () => {
    expect(fulfilledWithinSql("o", 90)).toBe(
      `o.status = 'fulfilled' AND COALESCE(o.fulfilled_at, o."timestamp") >= now() - INTERVAL '90 days'`,
    )
  })

  it("rejects anything but an alias and a positive whole number of days", () => {
    expect(() => fulfilledWithinSql("o; DROP TABLE orders", 90)).toThrow()
    expect(() => fulfilledWithinSql("o", 0)).toThrow()
    expect(() => fulfilledWithinSql("o", 1.5)).toThrow()
  })
})

describe("storefront cards: featured", () => {
  const traded = recentlyTradedSql("s.shop_id")

  it("the homepage row (featured) only takes orgs with a shown shop that traded", () => {
    const page = storefront.storefrontCardsQuery(pg, { limit: 6, offset: 0, featured: true }).toSQL().sql
    const count = storefront.storefrontCountQuery(pg, undefined, true).toSQL().sql
    for (const sql of [page, count]) {
      expect(sql).toContain(
        `EXISTS (SELECT 1 FROM shops s WHERE s.owner_contractor_id = c.contractor_id AND s.status = 'active' AND NOT EXISTS (SELECT 1 FROM storefront_directory_hidden h WHERE h.shop_id = s.shop_id) AND ${traded})`,
      )
    }
  })

  it("the Storefronts hub (not featured) still lists every directory org", () => {
    const page = storefront.storefrontCardsQuery(pg, { limit: 24, offset: 0 }).toSQL().sql
    const count = storefront.storefrontCountQuery(pg).toSQL().sql
    for (const sql of [page, count]) expect(sql).not.toContain("FROM orders _fo")
  })
})
