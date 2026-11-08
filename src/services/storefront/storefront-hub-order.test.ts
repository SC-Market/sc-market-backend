/**
 * The storefront order (storefront.ts orderStorefrontCards), shared by the
 * Storefronts hub and the homepage row: orgs rank on their own recent
 * trading (storefrontActivityScore), stale orgs (nothing traded, updated or
 * posted in 90 days) rank lower but are never hidden, member logins play no
 * part, showcase orgs are pinned first in the hub only, and the order is in
 * SQL and ends on a unique key, so SSR, prerender and the client agree. The
 * database is knex-mock-client: these check the SQL built, that the SQL and
 * TS formulas agree, and that the rows come back in the query's order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

const storefront = await import("./storefront.js")
const featuredSellers = await import("../seller-activity/featured-sellers.js")

const pg = knexFactory({ client: "pg" })
const built = (featured = false) =>
  storefront.storefrontCardsQuery(pg, { limit: 24, offset: 48, featured }).toSQL()

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

type Counts = Parameters<typeof storefront.storefrontActivityScore>[0]
const counts = (c: Partial<Counts> = {}): Counts => ({
  orders_90d: 0,
  orders_365d: 0,
  reviews_90d: 0,
  listings_updated_90d: 0,
  services_posted_90d: 0,
  ...c,
})

/** Evaluates a cards.* SQL expression (score / stale) for one row, as Postgres would. */
function evalSql(sql: string, row: Counts): number {
  const js = sql
    .replace(/cards\.([a-z_0-9]+)/g, (_, k: keyof Counts) => String(row[k]))
    .replace(/LEAST\(/g, "Math.min(")
    .replace(/\(CASE WHEN (.+) THEN 1 ELSE 0 END\)/, "(($1) ? 1 : 0)")
    .replace(/ AND /g, " && ")
    .replace(/ = /g, " === ")
  return Number(new Function(`return ${js}`)())
}

interface Org extends Counts {
  name: string
  completed_orders: number
  /** Not an input of the order at all: there to show logins don't matter. */
  owner_last_login_days_ago: number
}

/** The ORDER BY of the homepage row, in TS (stale, score, lifetime orders, name). */
function rank(orgs: Org[]): string[] {
  return [...orgs]
    .sort(
      (a, b) =>
        Number(storefront.storefrontIsStale(a)) - Number(storefront.storefrontIsStale(b)) ||
        storefront.storefrontActivityScore(b) - storefront.storefrontActivityScore(a) ||
        b.completed_orders - a.completed_orders ||
        a.name.localeCompare(b.name),
    )
    .map((o) => o.name)
}

describe("ordering SQL", () => {
  it("hub: showcase, then stale last, then activity score, then lifetime orders, listings, services, name, a unique id", () => {
    const { sql, bindings } = built()
    expect(items(orderBy(sql))).toEqual([
      "(CASE cards.spectrum_id WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END) ASC",
      '"stale" asc',
      '"activity_score" desc',
      '"cards"."completed_orders" desc',
      '"cards"."active_listings" desc',
      '"cards"."active_services" desc',
      '"cards"."name" asc',
      '"cards"."contractor_id" asc',
    ])
    expect(bindings.slice(-4)).toEqual([...storefront.SHOWCASE_STOREFRONTS, 24, 48])
  })

  it("homepage row (featured): no showcase pin, the same order otherwise", () => {
    const { sql, bindings } = built(true)
    const order = items(orderBy(sql))
    expect(order[0]).toBe('"stale" asc')
    expect(order).toHaveLength(7)
    expect(sql).not.toContain("CASE cards.spectrum_id")
    for (const sid of storefront.SHOWCASE_STOREFRONTS) expect(bindings).not.toContain(sid)
  })

  it("computes the score and the stale flag once, on the wrapped per-org row", () => {
    const { sql } = built()
    expect(sql.startsWith(
      `select "cards".*, ${storefront.storefrontScoreSql()} as activity_score, ${storefront.storefrontStaleSql()} as stale from (select`,
    )).toBe(true)
    expect(sql).toContain(') as "cards" order by ')
  })

  it("ends on contractor_id, the unique key (deterministic for SSR, prerender and client)", () => {
    expect(items(orderBy(built().sql)).at(-1)).toBe('"cards"."contractor_id" asc')
  })

  it("never filters on staleness: stale orgs stay in the hub", () => {
    const { sql } = built()
    const where = sql.slice(sql.indexOf(" from (select"), sql.lastIndexOf(" order by "))
    expect(where).not.toContain(storefront.storefrontStaleSql())
    expect(where).not.toMatch(/ where [^()]*stale/)
  })

  it("never looks at member logins (no seller-activity stats anywhere)", () => {
    for (const featured of [false, true]) {
      const { sql } = built(featured)
      expect(sql).not.toContain("shop_activity_stats")
      expect(sql).not.toContain("last_active_at")
    }
  })
})

describe("the activity counts", () => {
  const cols = storefront.storefrontActivityColumns()

  it("counts orders fulfilled in 90 and 365 days, the featuring definition of a trade", () => {
    expect(storefront.RECENT_ACTIVITY_DAYS).toBe(90)
    expect(featuredSellers.FEATURED_TRADE_WINDOW_DAYS).toBe(365)
    expect(cols.orders_90d).toContain(featuredSellers.fulfilledWithinSql("_ro", 90))
    expect(cols.orders_365d).toContain(featuredSellers.fulfilledWithinSql("_ro", 365))
    for (const c of [cols.orders_90d, cols.orders_365d])
      expect(c).toContain(
        "_ro.shop_id IN (SELECT s.shop_id FROM shops s WHERE s.owner_contractor_id = c.contractor_id AND s.status = 'active' AND NOT EXISTS",
      )
  })

  it("counts reviews, listing updates and new services in 90 days, in shown shops", () => {
    const recent = "now() - INTERVAL '90 days'"
    expect(cols.reviews_90d).toContain(`FROM shop_ratings _rr WHERE _rr.shop_id IN (SELECT s.shop_id FROM shops s`)
    expect(cols.reviews_90d).toContain(`_rr.created_at >= ${recent}`)
    expect(cols.listings_updated_90d).toContain("ls.status = 'active' AND ls.visibility = 'public'")
    expect(cols.listings_updated_90d).toContain(`ls.updated_at >= ${recent}`)
    expect(cols.services_posted_90d).toContain("sv.status = 'active'")
    expect(cols.services_posted_90d).toContain(`sv."timestamp" >= ${recent}`)
  })

  it("puts every count in the per-org select", () => {
    const { sql } = built()
    for (const [name, col] of Object.entries(cols)) expect(sql).toContain(`${col} as ${name}`)
  })
})

describe("the score", () => {
  it("is 3 per 90-day order, 1 per 365-day order, 1 per recent review, 1 per updated listing up to 5", () => {
    expect(storefront.storefrontActivityScore(counts({ orders_90d: 2, orders_365d: 5 }))).toBe(11)
    expect(storefront.storefrontActivityScore(counts({ reviews_90d: 3 }))).toBe(3)
    expect(storefront.storefrontActivityScore(counts({ listings_updated_90d: 40 }))).toBe(
      storefront.LISTING_UPDATES_SCORE_CAP,
    )
    expect(storefront.storefrontActivityScore(counts())).toBe(0)
  })

  it("re-saving listings never outweighs two recent trades", () => {
    const relister = counts({ listings_updated_90d: 1000 })
    const trader = counts({ orders_90d: 2, orders_365d: 2 })
    expect(storefront.storefrontActivityScore(trader)).toBeGreaterThan(
      storefront.storefrontActivityScore(relister),
    )
  })

  it("the SQL formula gives the TS formula's value", () => {
    const rows = [
      counts(),
      counts({ orders_90d: 2, orders_365d: 7, reviews_90d: 1, listings_updated_90d: 3 }),
      counts({ orders_365d: 4, listings_updated_90d: 12, services_posted_90d: 2 }),
    ]
    for (const r of rows)
      expect(evalSql(storefront.storefrontScoreSql(), r)).toBe(storefront.storefrontActivityScore(r))
  })
})

describe("what counts as stale", () => {
  it("nothing fulfilled, no listing updated and no service posted in 90 days", () => {
    expect(storefront.storefrontIsStale(counts())).toBe(true)
    expect(storefront.storefrontIsStale(counts({ orders_365d: 50, reviews_90d: 0 }))).toBe(true)
    expect(storefront.storefrontIsStale(counts({ orders_90d: 1, orders_365d: 1 }))).toBe(false)
    expect(storefront.storefrontIsStale(counts({ listings_updated_90d: 1 }))).toBe(false)
    expect(storefront.storefrontIsStale(counts({ services_posted_90d: 1 }))).toBe(false)
  })

  it("the SQL rule matches the TS rule and is 1/0, so it only moves cards", () => {
    const sql = storefront.storefrontStaleSql()
    expect(sql.endsWith(" THEN 1 ELSE 0 END)")).toBe(true)
    expect(sql).not.toMatch(/\bOR\b/)
    for (const r of [
      counts(),
      counts({ orders_365d: 9 }),
      counts({ orders_90d: 1, orders_365d: 1 }),
      counts({ listings_updated_90d: 2 }),
      counts({ services_posted_90d: 1 }),
    ])
      expect(evalSql(sql, r)).toBe(storefront.storefrontIsStale(r) ? 1 : 0)
  })
})

describe("ranking outcomes", () => {
  const org = (name: string, o: Partial<Org>): Org => ({
    ...counts(),
    name,
    completed_orders: 0,
    owner_last_login_days_ago: 400,
    ...o,
  })

  it("an org whose owner is active every day but that doesn't trade ranks below orgs that trade", () => {
    const house = org("HOUSE", {
      completed_orders: 11,
      orders_365d: 1,
      services_posted_90d: 0,
      owner_last_login_days_ago: 0,
    })
    const traderA = org("TRADER_A", { orders_90d: 2, orders_365d: 6, completed_orders: 8, reviews_90d: 2 })
    const traderB = org("TRADER_B", { orders_365d: 3, listings_updated_90d: 4, completed_orders: 3 })
    expect(storefront.storefrontIsStale(house)).toBe(true)
    expect(rank([house, traderB, traderA])).toEqual(["TRADER_A", "TRADER_B", "HOUSE"])
  })

  it("a long-quiet org with a big lifetime count ranks below an org trading now", () => {
    const veteran = org("VETERAN", { completed_orders: 1320 })
    const newcomer = org("NEWCOMER", { completed_orders: 3, orders_90d: 3, orders_365d: 3 })
    expect(rank([veteran, newcomer])).toEqual(["NEWCOMER", "VETERAN"])
  })

  it("lifetime orders only break ties between equally active orgs", () => {
    const a = org("A", { orders_365d: 2, completed_orders: 40, listings_updated_90d: 1 })
    const b = org("B", { orders_365d: 2, completed_orders: 90, listings_updated_90d: 1 })
    expect(rank([a, b])).toEqual(["B", "A"])
  })

  it("among stale orgs, the year's trading still decides", () => {
    const yearTrader = org("YEAR", { orders_365d: 5, completed_orders: 5 })
    const dormant = org("DORMANT", { completed_orders: 500 })
    expect(rank([dormant, yearTrader])).toEqual(["YEAR", "DORMANT"])
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
    orders_90d: completed_orders > 100 ? 0 : 2,
    orders_365d: completed_orders > 100 ? 0 : 2,
    reviews_90d: 1,
    listings_updated_90d: 0,
    services_posted_90d: 0,
    activity_score: completed_orders > 100 ? "0" : "9",
    stale: completed_orders > 100 ? "1" : "0",
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
    expect(cards[1].activity).toEqual({
      orders_90d: 2,
      orders_365d: 2,
      reviews_90d: 1,
      listings_updated_90d: 0,
      services_posted_90d: 0,
      score: 9,
      stale: false,
    })
    expect(cards[2].activity.stale).toBe(true)
    const hub = tracker.history.select.find((q) =>
      q.sql.startsWith('select "cards".*'),
    )!
    expect(hub.sql).toContain(storefront.storefrontStaleSql())
    // Page 1: LIMIT 24, no OFFSET (knex leaves out OFFSET 0).
    expect(hub.sql).toMatch(/ limit \$\d+$/)
    expect(hub.bindings.at(-1)).toBe(24)
  })
})
