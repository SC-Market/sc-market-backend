/**
 * GET /api/v2/game-items/{id}/listings and /game-items/aggregates must hide
 * private listings from non-members, like the market grid does. They used to
 * return (and count) every active listing, so private org listings leaked.
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

const { GameItemsV2Controller } = await import("./GameItemsV2Controller.js")

const ITEM = "11111111-1111-4111-8111-111111111111"
let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  // Raw "SELECT COUNT(*) ... FROM (<query>) as sub" pagination counts
  tracker.on.select(/^SELECT COUNT\(\*\)/).response({ rows: [{ count: 0 }] })
  tracker.on
    .select(/from "game_items"/)
    .response({ id: ITEM, name: "Gun", type: "Weapon" })
  tracker.on.select(() => true).response([])
})

function lotQueries() {
  return tracker.history.select.filter(
    (q) =>
      q.sql.includes("listing_item_lots") && !q.sql.startsWith("SELECT COUNT"),
  )
}

describe("game item listings visibility", () => {
  it("shows anonymous viewers public listings only (no private, no unlisted)", async () => {
    await new GameItemsV2Controller().getListings(
      ITEM,
      undefined,
      undefined,
      undefined,
      1,
      20,
      {
        user: undefined,
      } as never,
    )
    const queries = lotQueries()
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q.sql).toMatch(/"l"\."visibility" = (\?|\$\d+)/)
      expect(q.bindings).toContain("public")
      expect(q.bindings).not.toContain("unlisted")
    }
  })

  it("lets org members see their org's private listings", async () => {
    await new GameItemsV2Controller().getListings(
      ITEM,
      undefined,
      undefined,
      undefined,
      1,
      20,
      {
        user: { user_id: "member" },
      } as never,
    )
    for (const q of lotQueries()) {
      expect(q.sql).toContain("contractor_members")
      expect(q.bindings).toContain("member")
    }
  })

  it("filters private and unlisted listings out of the aggregates", async () => {
    await new GameItemsV2Controller().searchGameItemAggregates(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      24,
      { user: undefined } as never,
    )
    const q = tracker.history.select.find((x) =>
      x.sql.includes("listing_search"),
    )
    expect(q?.sql).toMatch(/"ls"\."visibility" = ('public'|\?|\$\d+)/)
    expect(q?.sql).not.toContain("unlisted")
  })
})
