/**
 * Seller activity in result ordering (seller-ranking.ts): inactive sellers'
 * listings rank lower in the default order and lose ties in explicit sorts,
 * but are never filtered out; explicit sorts keep the user's key first; every
 * order ends on a unique key (same order for SSR and the client, stable
 * paging). The database is knex-mock-client: these check the SQL built.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))

const ranking = await import("./seller-ranking.js")
const { ListingsV2Controller } =
  await import("../../api/routes/v2/listings/ListingsV2Controller.js")
const { GameItemsV2Controller } =
  await import("../../api/routes/v2/game-items/GameItemsV2Controller.js")
const { ShopsV2Controller } =
  await import("../../api/routes/v2/shops/ShopsV2Controller.js")

const ITEM = "11111111-2222-4333-8444-555555555555"
const INACTIVE = ranking.sellerInactiveSql("ls.shop_id")

let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  // Raw counts (knex.raw: .rows) before the builder's counts.
  tracker.on.select(/^SELECT COUNT\(\*\)/).response({ rows: [{ count: 0 }] })
  tracker.on.select(/^select count\(\*\)/).response([{ count: 0 }])
  tracker.on
    .select(/^select "id", "name", "type", "image_url" from "game_items"/)
    .response([{ id: ITEM, name: "Item", type: "Helmet", image_url: null }])
  tracker.on.select(() => true).response([])
  tracker.on.any(() => true).response({ rows: [{ count: 0 }] })
})

/** The ORDER BY part of the page query (not the count). */
function orderOf(match: string): string {
  const q = tracker.history.select
    .filter((s) => s.sql.includes(match) && / order by /i.test(s.sql))
    .at(-1)
  expect(q, `no ordered query on ${match}`).toBeDefined()
  const sql = q!.sql.slice(q!.sql.toLowerCase().lastIndexOf(" order by "))
  return sql.replace(/ limit \$\d+( offset \$\d+)?$/, "")
}

type SearchArgs = Parameters<
  InstanceType<typeof ListingsV2Controller>["searchListings"]
>
function search(sortBy?: SearchArgs[13], sortOrder?: SearchArgs[14]) {
  const args = new Array(25).fill(undefined) as SearchArgs
  args[8] = 1
  args[9] = 20
  args[13] = sortBy
  args[14] = sortOrder
  args[23] = { user: undefined } as never
  return new ListingsV2Controller().searchListings(...args)
}

describe("the factor itself", () => {
  it("is one named weight, documented in days", () => {
    expect(ranking.INACTIVE_SELLER_AFTER_DAYS).toBe(30)
    expect(ranking.INACTIVE_SELLER_RANK_PENALTY_DAYS).toBeGreaterThan(0)
  })

  it("counts a seller as inactive only when known to be gone 30+ days (hidden or unknown is neutral)", () => {
    expect(INACTIVE).toBe(
      "(CASE WHEN EXISTS (SELECT 1 FROM shop_activity_stats _sas WHERE _sas.shop_id = ls.shop_id" +
        " AND _sas.last_active_at < now() - INTERVAL '30 days') THEN 1 ELSE 0 END)",
    )
    // NULL last_active_at (hidden status, no stats yet) is not "< now() - 30 days".
    expect(ranking.sellerActiveJoinedSql("sas.last_active_at")).toBe(
      "(sas.last_active_at IS NULL OR sas.last_active_at >= now() - INTERVAL '30 days')",
    )
  })

  it("shifts an inactive seller's listing back by the weight in the default order", () => {
    expect(ranking.defaultListingRankSql("ls.created_at", "ls.shop_id")).toBe(
      `(ls.created_at - ${INACTIVE} * INTERVAL '${ranking.INACTIVE_SELLER_RANK_PENALTY_DAYS} days') DESC`,
    )
  })

  it("only takes column references, never input", () => {
    expect(() => ranking.sellerInactiveSql("ls.shop_id; DROP TABLE x")).toThrow(
      /invalid column/,
    )
    expect(() => ranking.defaultListingRankSql("now()", "ls.shop_id")).toThrow(
      /invalid column/,
    )
  })
})

describe("GET /listings/search", () => {
  it("default order (no sort): newest first with the seller-activity weight, then listing_id", async () => {
    await search()
    expect(orderOf("listing_search")).toBe(
      ` order by ${ranking.defaultListingRankSql("ls.created_at", "ls.shop_id")}, "ls"."listing_id" asc`,
    )
  })

  it("never filters inactive sellers out: the factor is only in ORDER BY", async () => {
    await search()
    for (const q of tracker.history.select.filter((s) =>
      s.sql.includes("listing_search"),
    )) {
      const where = q.sql.toLowerCase().split(" order by ")[0]
      expect(where).not.toContain("shop_activity_stats")
    }
  })

  it.each([
    ["price", "asc", '"ls"."price_min" asc'],
    ["price", "desc", '"ls"."price_min" desc'],
    ["created_at", "desc", '"ls"."created_at" desc'],
    ["created_at", "asc", '"ls"."created_at" asc'],
    ["updated_at", "desc", '"ls"."updated_at" desc'],
    ["quantity", "asc", '"ls"."quantity_available" asc'],
    ["quality", "desc", '"ls"."quality_tier_max" desc'],
  ] as const)(
    "explicit sort %s %s stays first; seller activity only breaks ties",
    async (by, dir, key) => {
      await search(by, dir)
      expect(orderOf("listing_search")).toBe(
        ` order by ${key}, ${INACTIVE} ASC, "ls"."listing_id" asc`,
      )
    },
  )

  it("sort_order alone keeps the old newest/oldest order (an explicit choice)", async () => {
    await search(undefined, "asc")
    expect(orderOf("listing_search")).toBe(
      ` order by "ls"."created_at" asc, ${INACTIVE} ASC, "ls"."listing_id" asc`,
    )
  })

  it("the same request builds the same SQL every time (SSR and client agree)", async () => {
    await search()
    await search()
    const pages = tracker.history.select.filter(
      (s) => s.sql.includes("listing_search") && / order by /i.test(s.sql),
    )
    expect(pages).toHaveLength(2)
    expect(pages[0].sql).toBe(pages[1].sql)
  })
})

describe("game item page offers (GET /game-items/{id}/listings)", () => {
  it("keeps price (the default) first, then seller activity, then a unique key", async () => {
    await new GameItemsV2Controller().getListings(ITEM)
    const order = orderOf("listing_item_lots")
    const priceExpr =
      "CASE WHEN li.pricing_mode = 'unified' THEN li.base_price ELSE COALESCE(vp.price, li.base_price) END"
    expect(
      order.startsWith(
        ` order by ${priceExpr} asc, ${ranking.sellerInactiveSql("l.shop_id")} ASC, "l"."listing_id" asc, "lil"."variant_id" asc`,
      ),
    ).toBe(true)
  })

  it("a chosen sort (quantity desc) stays first", async () => {
    await new GameItemsV2Controller().getListings(
      ITEM,
      undefined,
      "quantity",
      "desc",
    )
    expect(orderOf("listing_item_lots")).toMatch(
      new RegExp(
        `^ order by SUM\\(lil\\.quantity_total\\) desc, \\(CASE WHEN EXISTS`,
      ),
    )
  })
})

describe("item aggregates (GET /game-items/aggregates)", () => {
  it("keeps the chosen sort first; ties go to items with more listings from active sellers", async () => {
    await new GameItemsV2Controller().searchGameItemAggregates(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "price",
      "asc",
    )
    const order = orderOf('"shop_activity_stats" as "sas"')
    expect(order).toContain(
      ` order by MIN(ls.price_min) asc, COUNT(DISTINCT ls.listing_id) FILTER (WHERE ${ranking.sellerActiveJoinedSql("sas.last_active_at")}) DESC, "ls"."game_item_id" asc, "ls"."title" asc`,
    )
  })

  it("joins the stats one-to-one (left join on the primary key), so totals don't change", async () => {
    await new GameItemsV2Controller().searchGameItemAggregates()
    const q = tracker.history.select.find((s) =>
      s.sql.includes('"shop_activity_stats" as "sas"'),
    )
    expect(q?.sql).toContain(
      'left join "shop_activity_stats" as "sas" on "sas"."shop_id" = "ls"."shop_id"',
    )
  })
})

describe("shop directory (GET /shops)", () => {
  it.each(["rating", "total_sales", "name", "created_at"] as const)(
    "sort %s: chosen key first, then seller activity, then shop_id",
    async (sortBy) => {
      await new ShopsV2Controller().browseShops(
        undefined,
        undefined,
        1,
        20,
        sortBy,
        "desc",
      )
      const order = orderOf('from "shops" as "s"')
      expect(order).toContain(
        `, ${ranking.sellerInactiveSql("s.shop_id")} ASC, "s"."shop_id" asc`,
      )
      expect(order.indexOf("shop_activity_stats")).toBeGreaterThan(
        " order by ".length,
      )
    },
  )
})
