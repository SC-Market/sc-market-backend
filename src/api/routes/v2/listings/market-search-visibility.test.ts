/**
 * GET /api/v2/listings/search (the /market grid, shop grids, the bridge's
 * market hub) must only list active, public listings to anonymous visitors.
 *
 * Regressions:
 * - unlisted (link-only) listings appeared in the anonymous market grid: the
 *   rule was "visibility != 'private'", which lets 'unlisted' through.
 * - ?status=inactive (or sold/expired/cancelled) listed everyone's non-active
 *   listings to anyone.
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
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const { ListingsV2Controller } = await import("./ListingsV2Controller.js")

let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.select(/^select count\(\*\)/i).response([{ count: 0 }])
  tracker.on.select(() => true).response([])
})

type SearchArgs = Parameters<InstanceType<typeof ListingsV2Controller>["searchListings"]>

function search(status: string | undefined, user?: { user_id: string }) {
  const args = new Array(23).fill(undefined) as SearchArgs
  args[8] = 1 // page
  args[9] = 20 // page_size
  args[12] = status as SearchArgs[12]
  args[22] = { user } as never // request
  return new ListingsV2Controller().searchListings(...args)
}

function gridQueries() {
  return tracker.history.select.filter((q) => q.sql.includes("listing_search"))
}

describe("market search visibility", () => {
  it("lists only active, public listings to anonymous visitors", async () => {
    await search(undefined)
    const queries = gridQueries()
    expect(queries.length).toBe(2) // count + page
    for (const q of queries) {
      expect(q.sql).toMatch(/"ls"\."status" = (\?|\$\d+)/)
      expect(q.sql).toMatch(/and "ls"\."visibility" = (\?|\$\d+)\)/)
      // Test shops' listings are never shown to anonymous visitors.
      expect(q.sql).toContain("NOT EXISTS (SELECT 1 FROM shops _ts WHERE _ts.shop_id = ls.shop_id AND _ts.is_test)")
      expect(q.bindings).toContain("active")
      expect(q.bindings).toContain("public")
      expect(q.bindings).not.toContain("private")
      expect(q.bindings).not.toContain("unlisted")
    }
  })

  it("adds the viewer's own orgs' private listings, but never unlisted ones", async () => {
    await search(undefined, { user_id: "member" })
    for (const q of gridQueries()) {
      expect(q.sql).toContain("contractor_members")
      expect(q.bindings).toEqual(expect.arrayContaining(["public", "private", "member"]))
      expect(q.bindings).not.toContain("unlisted")
    }
  })

  it.each(["inactive", "sold", "expired", "cancelled"])(
    "never lists %s listings",
    async (status) => {
      await search(status)
      for (const q of gridQueries()) {
        expect(q.sql).toContain("false")
        expect(q.bindings).not.toContain(status)
        expect(q.bindings).toContain("active")
      }
    },
  )
})
