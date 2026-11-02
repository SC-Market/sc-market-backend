/**
 * The Storefronts hub order (storefront.ts orderStorefrontCards): stale orgs
 * (nothing fresh listed or posted AND managing members inactive) rank lower
 * but are never hidden; showcase orgs stay first; the order is in SQL and
 * ends on a unique key, so SSR, prerender and the client agree. The database
 * is knex-mock-client: these check the SQL built and that the rows come back
 * in the query's order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

const storefront = await import("./storefront.js")
const ranking = await import("../seller-activity/seller-ranking.js")

const pg = knexFactory({ client: "pg" })
const built = () => storefront.storefrontCardsQuery(pg, { limit: 24, offset: 48 }).toSQL()

/** The query's ORDER BY clause (without the LIMIT / OFFSET). */
function orderBy(sql: string): string {
  const at = sql.lastIndexOf(" order by ")
  expect(at, "the hub query has an ORDER BY").toBeGreaterThan(0)
  return sql.slice(at + " order by ".length).replace(/ limit \? offset \?$/, "")
}

/** Splits an ORDER BY clause into its top-level items. */
function items(order: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of order) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

describe("hub ordering SQL", () => {
  const { sql, bindings } = built()
  const order = items(orderBy(sql))
  const stale = storefront.storefrontStaleSql()

  it("orders showcase, then stale last, then completed orders, listings, services, name, and a unique id", () => {
    expect(order).toEqual([
      "(CASE c.spectrum_id WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END) ASC",
      `${stale} ASC`,
      '"completed_orders" desc',
      '"active_listings" desc',
      '"active_services" desc',
      '"c"."name" asc',
      '"c"."contractor_id" asc',
    ])
  })

  it("binds the showcase orgs in their order, then the page's limit and offset", () => {
    expect(bindings.slice(-4)).toEqual([...storefront.SHOWCASE_STOREFRONTS, 24, 48])
    expect(sql).toMatch(/ limit \? offset \?$/)
  })

  it("ends on contractor_id, the unique key (deterministic for SSR, prerender and client)", () => {
    expect(order.at(-1)).toBe('"c"."contractor_id" asc')
  })

  it("never filters on staleness: stale orgs stay in the hub", () => {
    const where = sql.slice(0, sql.lastIndexOf(" order by "))
    expect(where).not.toContain(stale)
    expect(where).not.toContain("updated_at >=")
    expect(where).not.toContain('"timestamp" >=')
    expect(where).not.toContain("shop_activity_stats")
  })
})

describe("what counts as stale", () => {
  const stale = storefront.storefrontStaleSql()
  const window = `now() - INTERVAL '${ranking.INACTIVE_SELLER_RANK_PENALTY_DAYS} days'`

  it("uses the seller-activity weight as the freshness window", () => {
    expect(storefront.STALE_STOREFRONT_AFTER_DAYS).toBe(
      ranking.INACTIVE_SELLER_RANK_PENALTY_DAYS,
    )
  })

  it("needs no public, active listing updated within the window, in a shown shop", () => {
    expect(stale).toContain(
      "NOT EXISTS (SELECT 1 FROM listing_search ls WHERE ls.status = 'active' AND ls.visibility = 'public'" +
        " AND ls.shop_id IN (SELECT s.shop_id FROM shops s WHERE s.owner_contractor_id = c.contractor_id AND s.status = 'active' AND NOT EXISTS",
    )
    expect(stale).toContain(`AND ls.updated_at >= ${window})`)
  })

  it("needs no active service posted within the window, in a shown shop", () => {
    expect(stale).toMatch(
      /NOT EXISTS \(SELECT 1 FROM services sv WHERE sv\.status = 'active' AND sv\.shop_id IN \(SELECT s\.shop_id FROM shops s WHERE s\.owner_contractor_id = c\.contractor_id AND s\.status = 'active'/,
    )
    expect(stale).toContain(`AND sv."timestamp" >= ${window})`)
  })

  it("needs every shown shop's managing members inactive (the seller-ranking factor; unknown/hidden is neutral)", () => {
    expect(stale).toContain(
      "AND NOT EXISTS (SELECT 1 FROM shops s WHERE s.owner_contractor_id = c.contractor_id AND s.status = 'active' AND NOT EXISTS",
    )
    expect(stale).toContain(
      `AND ${ranking.sellerInactiveSql("s.shop_id")} = 0)`,
    )
  })

  it("requires both conditions (AND), and is 1/0 so it only moves cards", () => {
    expect(stale.startsWith("(CASE WHEN NOT EXISTS")).toBe(true)
    expect(stale.endsWith(" THEN 1 ELSE 0 END)")).toBe(true)
    expect(
      stale.match(/ AND NOT EXISTS \(SELECT 1 FROM (services|shops) /g),
    ).toHaveLength(2)
    expect(stale).not.toMatch(/\bOR\b/)
  })
})

describe("listStorefrontCards", () => {
  let tracker: Tracker
  let db: Knex

  beforeEach(() => {
    db = knexFactory({ client: MockClient, dialect: "pg" })
    h.db = db
    tracker = createTracker(db)
  })

  const row = (spectrum_id: string, completed_orders: number) => ({
    contractor_id: `id-${spectrum_id}`,
    spectrum_id,
    name: spectrum_id,
    description: null,
    logo_url: null,
    active_listings: 0,
    active_services: 1,
    services_shop_slug: "svc",
    completed_orders,
    avg_rating: null,
    rating_count: 0,
  })

  it("returns the cards in the query's order, stale ones included (no re-sort, no filter)", async () => {
    // The query put the stale ZETA (more orders) after the fresh ALPHA.
    // First match wins: the count and the field lookups also read contractors.
    tracker.on.select(/^select count\(\*\)/).response([{ count: 3 }])
    tracker.on.select(/from "contractor_fields"/).response([])
    tracker.on
      .select(/from "contractors" as "c"/)
      .response([row("BWINCORP", 0), row("ALPHA", 1), row("ZETA", 500)])

    const { storefronts: cards } = await storefront.listStorefrontCards({ limit: 24, offset: 0 })

    expect(cards.map((c) => c.spectrum_id)).toEqual([
      "BWINCORP",
      "ALPHA",
      "ZETA",
    ])
    expect(cards[0].showcase).toBe(true)
    const hub = tracker.history.select.find((q) =>
      q.sql.startsWith('select "c"."contractor_id"'),
    )!
    expect(hub.sql).toContain(storefront.storefrontStaleSql())
    // Page 1: LIMIT 24, no OFFSET (knex leaves out OFFSET 0).
    expect(hub.sql).toMatch(/ limit \$\d+$/)
    expect(hub.bindings.at(-1)).toBe(24)
  })
})
