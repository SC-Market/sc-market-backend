/**
 * The Storefronts hub, a page at a time (GET /contractors/storefronts
 * ?page=&page_size=&field=): the controller turns page/page_size into the
 * query's LIMIT/OFFSET (clampPagination: default 24, at most 60, 400 on bad
 * input), the response carries the total and the focus chips, and walking
 * the pages returns every org exactly once.
 *
 * The database is knex-mock-client: the card query's handler answers with
 * the slice of a fixed, already ordered org list that its LIMIT/OFFSET
 * bindings ask for, as Postgres would for the query's total order (it ends
 * on contractor_id, storefront-hub-order.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { MockClient, createTracker, type RawQuery, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

const storefront = await import("./storefront.js")
const { OrgStorefrontV2Controller } = await import(
  "../../api/routes/v2/contractors/OrgStorefrontV2Controller.js"
)

/** The listed orgs, in hub order. */
const ORGS = Array.from({ length: 7 }, (_, i) => ({
  contractor_id: `00000000-0000-0000-0000-00000000000${i}`,
  spectrum_id: `ORG${i}`,
  name: `Org ${i}`,
  description: null,
  logo_url: null,
  active_listings: 1,
  active_services: 0,
  services_shop_slug: null,
  completed_orders: 10 - i,
  avg_rating: null,
  rating_count: 0,
}))

/**
 * The card query's LIMIT and OFFSET, from its SQL tail ("limit $5 offset
 * $6"; knex leaves OFFSET out when it is 0).
 */
function limitOffset(q: RawQuery): { limit: number; offset: number } {
  const m = q.sql.match(/ limit \$(\d+)(?: offset \$(\d+))?$/)
  if (!m) throw new Error(`no LIMIT in ${q.sql.slice(-80)}`)
  const at = (n: string) => q.bindings[Number(n) - 1] as number
  return { limit: at(m[1]), offset: m[2] ? at(m[2]) : 0 }
}

const isCardQuery = (q: RawQuery) => q.sql.startsWith('select "cards".*')
const isCountQuery = (q: RawQuery) => q.sql.startsWith("select count(*)")
const isChipsQuery = (q: RawQuery) => q.sql.startsWith('select "cf"."field"')

let tracker: Tracker

beforeEach(() => {
  const db: Knex = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  // First match wins (the count and the chips also read contractors).
  tracker.on.select(isCountQuery).response([{ count: String(ORGS.length) }])
  tracker.on.select(isChipsQuery).response([{ field: "trading" }, { field: "freight" }])
  tracker.on.select(/from "contractor_fields"/).response([])
  tracker.on.select(isCardQuery).response((q: RawQuery) => {
    const { limit, offset } = limitOffset(q)
    return ORGS.slice(offset, offset + limit)
  })
})

function getStorefronts(page?: number, page_size?: number, field?: string) {
  return new OrgStorefrontV2Controller().getStorefronts(page, page_size, field)
}

const cardQueries = () => tracker.history.select.filter(isCardQuery)

describe("GET /contractors/storefronts pagination", () => {
  it("page 1 by default, 24 cards a page: LIMIT 24 OFFSET 0", async () => {
    const res = await getStorefronts()
    expect(res.page).toBe(1)
    expect(res.page_size).toBe(storefront.STOREFRONTS_DEFAULT_PAGE_SIZE)
    expect(res.page_size).toBe(24)
    expect(limitOffset(cardQueries()[0])).toEqual({ limit: 24, offset: 0 })
  })

  it("page N skips (N - 1) pages: LIMIT page_size OFFSET (N - 1) * page_size", async () => {
    const res = await getStorefronts(3, 2)
    expect(limitOffset(cardQueries()[0])).toEqual({ limit: 2, offset: 4 })
    expect(res.storefronts.map((s) => s.spectrum_id)).toEqual(["ORG4", "ORG5"])
    expect(res).toMatchObject({ page: 3, page_size: 2 })
  })

  it("page_size is clamped to the hub's max (60, the old one-page cap)", async () => {
    const res = await getStorefronts(1, 500)
    expect(res.page_size).toBe(storefront.STOREFRONTS_MAX_PAGE_SIZE)
    expect(limitOffset(cardQueries()[0])).toEqual({ limit: 60, offset: 0 })
  })

  it.each([
    [0, undefined],
    [-1, undefined],
    [1.5, undefined],
    [1, 0],
  ])("page=%s page_size=%s is a 400, never a query", async (page, size) => {
    await expect(getStorefronts(page, size)).rejects.toThrow("Invalid pagination parameters")
    expect(tracker.history.all).toHaveLength(0)
  })

  it("carries the total of every listed org, not just this page's", async () => {
    const res = await getStorefronts(1, 3)
    expect(res.storefronts).toHaveLength(3)
    expect(res.total).toBe(ORGS.length)
  })

  it("pages never overlap and together list every org once, in hub order", async () => {
    const pageSize = 3
    const first = await getStorefronts(1, pageSize)
    const pages = Math.ceil(first.total / pageSize)
    const seen: string[] = []
    for (let page = 1; page <= pages; page++) {
      const res = await getStorefronts(page, pageSize)
      expect(res.storefronts.length).toBeLessThanOrEqual(pageSize)
      seen.push(...res.storefronts.map((s) => s.spectrum_id))
    }
    expect(pages).toBe(3)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toEqual(ORGS.map((o) => o.spectrum_id))
    // Past the end: no cards, the same total (the frontend's last page bound).
    const past = await getStorefronts(pages + 1, pageSize)
    expect(past.storefronts).toEqual([])
    expect(past.total).toBe(ORGS.length)
  })

  it("the focus chips cover every listed org, whatever the page or field", async () => {
    const res = await getStorefronts(2, 3, "freight")
    expect(res.fields).toEqual(["trading", "freight"])
    const chips = tracker.history.select.find(isChipsQuery)!
    expect(chips.bindings).not.toContain("freight")
    expect(chips.sql).toContain('group by "cf"."field"')
    expect(chips.bindings.at(-1)).toBe(storefront.STOREFRONT_HUB_FIELDS)
  })

  it("field filters the cards and the total alike", async () => {
    await getStorefronts(1, 24, " freight ")
    const card = cardQueries()[0]
    const count = tracker.history.select.find(isCountQuery)!
    for (const q of [card, count]) {
      expect(q.sql).toMatch(
        /exists \(select 1 from "contractor_fields" as "cf" where cf\.contractor_id = c\.contractor_id and "cf"\."field" = \$\d+\)/,
      )
      expect(q.bindings).toContain("freight")
    }
  })

  it("without a field, nothing is filtered by field", async () => {
    await getStorefronts()
    expect(cardQueries()[0].sql).not.toContain('"cf"."field" =')
    expect(tracker.history.select.find(isCountQuery)!.sql).not.toContain('"cf"."field" =')
  })
})
