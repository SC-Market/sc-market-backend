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

function search(
  status: string | undefined,
  user?: { user_id: string; role?: string; is_test?: boolean },
  includeUnlisted?: boolean,
) {
  const args = new Array(24).fill(undefined) as SearchArgs
  args[8] = 1 // page
  args[9] = 20 // page_size
  args[12] = status as SearchArgs[12]
  args[22] = includeUnlisted // include_unlisted
  args[23] = { user } as never // request
  const controller = new ListingsV2Controller()
  return controller.searchListings(...args).then(() => controller)
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

  // Regression: the admin Market page's inactive/expired/sold/cancelled tabs
  // read this search with ?status= and went empty when non-active statuses
  // were closed to everyone.
  it.each(["inactive", "sold", "expired", "cancelled"])(
    "serves %s listings to site admins",
    async (status) => {
      await search(status, { user_id: "admin", role: "admin" })
      const queries = gridQueries()
      expect(queries.length).toBe(2)
      for (const q of queries) {
        expect(q.sql).not.toMatch(/\bfalse\b/)
        expect(q.bindings).toContain(status)
        expect(q.bindings).not.toContain("active")
        // Visibility and test-shop rules still apply.
        expect(q.sql).toContain("NOT EXISTS (SELECT 1 FROM shops _ts WHERE _ts.shop_id = ls.shop_id AND _ts.is_test)")
        expect(q.bindings).not.toContain("unlisted")
      }
    },
  )

  it.each(["inactive", "expired"])(
    "still never lists %s listings to non-admin users",
    async (status) => {
      await search(status, { user_id: "member", role: "user" })
      for (const q of gridQueries()) {
        expect(q.sql).toContain("false")
        expect(q.bindings).not.toContain(status)
      }
    },
  )

  it("an admin test account is not an admin: no non-active listings", async () => {
    await search("inactive", { user_id: "t", role: "admin", is_test: true } as never)
    for (const q of gridQueries()) {
      expect(q.sql).toContain("false")
      expect(q.bindings).not.toContain("inactive")
    }
  })

  // include_unlisted: the admin Market page and the admin-only "Show
  // unlisted" toggle on shop pages. Only a site admin who asks gets unlisted
  // listings; it is never a way for anyone else to list them.
  describe("include_unlisted", () => {
    const admin = { user_id: "admin", role: "admin" }

    it("an admin with the flag also gets unlisted listings", async () => {
      const controller = await search("inactive", admin, true)
      const queries = gridQueries()
      expect(queries.length).toBe(2)
      for (const q of queries) {
        expect(q.bindings).toEqual(expect.arrayContaining(["public", "unlisted", "private", "inactive"]))
        // The test-shop rule still applies.
        expect(q.sql).toContain("NOT EXISTS (SELECT 1 FROM shops _ts WHERE _ts.shop_id = ls.shop_id AND _ts.is_test)")
      }
      expect(controller.getHeader("Cache-Control")).toBe("private, no-store")
    })

    it("an admin with the flag gets unlisted active listings too", async () => {
      await search(undefined, admin, true)
      for (const q of gridQueries()) {
        expect(q.bindings).toEqual(expect.arrayContaining(["active", "public", "unlisted"]))
      }
    })

    it("an admin without the flag doesn't", async () => {
      for (const flag of [undefined, false]) {
        tracker.resetHistory()
        const controller = await search("inactive", admin, flag)
        for (const q of gridQueries()) {
          expect(q.bindings).toContain("inactive")
          expect(q.bindings).not.toContain("unlisted")
        }
        expect(controller.getHeader("Cache-Control")).toBeUndefined()
      }
    })

    it("a non-admin with the flag never does", async () => {
      for (const user of [undefined, { user_id: "member", role: "user" }]) {
        tracker.resetHistory()
        await search(undefined, user, true)
        for (const q of gridQueries()) {
          expect(q.bindings).not.toContain("unlisted")
          expect(q.bindings).toContain("public")
        }
      }
    })

    it("a test account with the admin role never does", async () => {
      await search(undefined, { user_id: "t", role: "admin", is_test: true }, true)
      for (const q of gridQueries()) {
        expect(q.bindings).not.toContain("unlisted")
      }
    })
  })
})
