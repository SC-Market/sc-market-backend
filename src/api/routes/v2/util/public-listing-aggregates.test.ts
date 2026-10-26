/**
 * Viewer-independent public aggregates must only use publicly listed
 * listings (active + visibility = 'public'). They used to use every active
 * listing, so org-internal (private) and link-only (unlisted) listings set
 * public prices, counts and photos:
 * - wiki item "market stats" (listing count, min/max price, quantity);
 * - mining ore market prices;
 * - the public price-history chart and quality distribution (analytics);
 * - listing photos used as game-item images (wiki list, aggregates, image
 *   resolver) and the price-history snapshot (raw SQL: publiclyListedSql).
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

const { publiclyListedSql } = await import("./listing-visibility.js")
const { resolveGameItemImages } = await import("./resolve-game-item-images.js")
const { WikiController } = await import("../game-data/wiki/WikiController.js")
const { AnalyticsV2Controller } = await import("../analytics/AnalyticsV2Controller.js")
const { snapshot_price_history_v2 } = await import("../../../../tasks/timers.js")
const { MiningController } = await import("../game-data/mining/MiningController.js")

const ITEM = "11111111-2222-4333-8444-555555555555"
let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.select(/information_schema/).response([{ table_name: "price_history_v2" }])
  tracker.on.select(/from "game_items"/).response({ id: ITEM, name: "Gun", type: "Weapon" })
  tracker.on.select(() => true).response([])
  tracker.on.any(() => true).response({ rows: [], rowCount: 0 })
})

const all = () => [
  ...tracker.history.select,
  ...tracker.history.any,
  ...tracker.history.insert,
]

describe("publiclyListedSql", () => {
  it("is active + public", () => {
    expect(publiclyListedSql("l")).toBe("l.status = 'active' AND l.visibility = 'public'")
  })

  it("only takes a plain table alias", () => {
    expect(() => publiclyListedSql("l; drop table x")).toThrow()
  })
})

describe("public listing aggregates", () => {
  it("wiki item market stats count only publicly listed listings", async () => {
    await new WikiController().getItemDetail(ITEM).catch(() => undefined)
    const stats = all().find((q) => q.sql.includes("listing_count"))
    expect(stats?.sql).toMatch(/"l"\."status" = (\?|\$\d+) and \("l"\."visibility" = (\?|\$\d+)\)/)
    expect(stats?.bindings).toEqual(expect.arrayContaining(["active", "public"]))
  })

  it("game-item images never come from a private or unlisted listing's photo", async () => {
    await resolveGameItemImages([ITEM])
    const q = all().find((x) => x.sql.includes("listing_photos_v2"))
    expect(q?.sql).toContain("l.status = 'active' AND l.visibility = 'public'")
  })

  it("the public price-history chart only reads public listings' prices", async () => {
    await new AnalyticsV2Controller().getPriceHistory(ITEM).catch(() => undefined)
    const q = all().find((x) => x.sql.includes("price_history_v2"))
    expect(q?.sql).toMatch(/exists \(select 1 from "listings" as "l" where l\.listing_id = ph\.listing_id and "l"\."visibility" = (\?|\$\d+)\)/)
    expect(q?.bindings).toContain("public")
  })

  it("the quality distribution only counts publicly listed listings", async () => {
    await new AnalyticsV2Controller().getQualityDistribution(ITEM).catch(() => undefined)
    const q = all().find((x) => x.sql.includes("listing_item_lots"))
    expect(q?.sql).toMatch(/"l"\."status" = (\?|\$\d+) and \("l"\."visibility" = (\?|\$\d+)\)/)
    expect(q?.bindings).toEqual(expect.arrayContaining(["active", "public"]))
  })

  it("mining ore market prices only use publicly listed listings", async () => {
    await new MiningController().searchOres().catch(() => undefined)
    const q = all().find((x) => x.sql.includes("percentile_disc"))
    // The paginated count inlines its bindings.
    expect(q?.sql).toMatch(/"l"\."status" = (\?|\$\d+|'active') and \("l"\."visibility" = (\?|\$\d+|'public')\)/)
  })

  it("the price-history snapshot only records publicly listed prices", async () => {
    await snapshot_price_history_v2()
    const q = all().find((x) => x.sql.includes("INSERT INTO price_history_v2"))
    expect(q?.sql).toContain("l.status = 'active' AND l.visibility = 'public'")
  })
})
