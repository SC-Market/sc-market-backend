/**
 * GET /game-data/wiki/items and /game-items/aggregates: the listing photo
 * fallback is one batched query for the page's items, not a correlated
 * subquery in the paged select. The subquery ran for every OFFSET row too,
 * and its `game_item_id::text = gi.id::text` casts hid the listing_items
 * index, so high pages hit the 15s statement timeout (Bugsnag, 859 events).
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { WikiController } = await import("./WikiController.js")
const { GameItemsV2Controller } = await import(
  "../../game-items/GameItemsV2Controller.js"
)
const { firstListingPhotoByGameItem } = await import(
  "../../util/resolve-game-item-images.js"
)

const WITH_ICON = "11111111-1111-4111-8111-111111111111"
const NO_ICON = "22222222-2222-4222-8222-222222222222"
const PHOTO = "https://cdn.sc-market.space/photo.png"

let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.select(/listing_photos_v2/).response({
    rows: [{ game_item_id: NO_ICON, url: PHOTO }],
  })
  tracker.on.select(/^SELECT COUNT\(\*\)/).response({ rows: [{ count: 2 }] })
  tracker.on.select(/count\(\*\)/).response([{ count: 2 }])
  tracker.on.select(/from "game_items"/).response([
    { id: WITH_ICON, name: "A", image_url: "https://icon/a.png" },
    { id: NO_ICON, name: "B", image_url: null },
  ])
  tracker.on.select(/from "listing_search"/).response([
    { game_item_id: WITH_ICON, name: "A", image_url: "https://icon/a.png", listing_count: "1", shop_count: "1" },
    { game_item_id: NO_ICON, name: "B", image_url: null, listing_count: "1", shop_count: "1" },
  ])
  tracker.on.select(() => true).response([])
})

function photoQueries() {
  return tracker.history.select.filter((q) => q.sql.includes("listing_photos_v2"))
}

describe("wiki items listing photo", () => {
  it("pages game_items without a per-row photo subquery or uuid text casts", async () => {
    await new WikiController().searchItems(
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 50, 20,
    )
    const page = tracker.history.select.find(
      (q) => q.sql.includes('from "game_items"') && q.sql.includes("limit"),
    )
    expect(page).toBeDefined()
    expect(page!.sql).not.toContain("listing_photos_v2")
    expect(page!.sql).not.toContain("::text")
  })

  it("fetches photos once, by uuid, only for the page's items without an image", async () => {
    const result = await new WikiController().searchItems(
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 20,
    )
    const q = photoQueries()
    expect(q).toHaveLength(1)
    expect(q[0].sql).toMatch(/li\.game_item_id = ANY\((\?|\$1)::uuid\[\]\)/)
    expect(q[0].sql).toContain("DISTINCT ON (li.game_item_id)")
    expect(q[0].sql).toContain("ORDER BY li.game_item_id, lp.display_order ASC")
    expect(q[0].sql).toContain("l.status = 'active' AND l.visibility = 'public'")
    expect(q[0].sql).not.toContain("::text")
    expect(q[0].bindings).toEqual([[NO_ICON]])

    expect(result.items.map((i) => i.image_url)).toEqual(["https://icon/a.png", PHOTO])
  })
})

describe("game item aggregates listing photo", () => {
  it("joins game_items on uuid and batches the page's photos", async () => {
    const result = await new GameItemsV2Controller().searchGameItemAggregates(
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 24,
      { user: undefined } as never,
    )
    const page = tracker.history.select.find(
      (q) => q.sql.includes('from "listing_search"') && !q.sql.startsWith("SELECT COUNT"),
    )
    expect(page!.sql).toContain('left join "game_items" as "gi" on "gi"."id" = "ls"."game_item_id"')
    expect(page!.sql).not.toContain("::text")
    expect(page!.sql).not.toContain("listing_photos_v2")

    const q = photoQueries().filter((x) => !x.sql.includes("listing_search"))
    expect(q).toHaveLength(1)
    expect(q[0].bindings).toEqual([[WITH_ICON, NO_ICON]])
    // The listing photo still wins over the icon here, as before.
    expect(result.items.map((i) => i.image_url)).toEqual(["https://icon/a.png", PHOTO])
  })
})

describe("firstListingPhotoByGameItem", () => {
  it("skips the query for an empty page", async () => {
    const photos = await firstListingPhotoByGameItem(h.db as never, [])
    expect(photos.size).toBe(0)
    expect(tracker.history.select).toHaveLength(0)
  })
})
