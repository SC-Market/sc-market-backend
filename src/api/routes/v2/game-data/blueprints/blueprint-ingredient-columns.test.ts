/**
 * blueprint_ingredients names its game item ingredient_game_item_id. Two
 * queries said game_item_id instead, and Postgres refused them:
 * - GET /game-data/blueprints/search?ingredient_name=... (the blueprint
 *   browser's material filter): "column bi_filter.game_item_id does not exist".
 * - POST /game-data/blueprints/craftable (the crafting calculator), on its
 *   first ingredient query.
 *
 * The endpoints run against knex-mock-client and every query they send is
 * checked against the schema snapshot (config/postgres + migrations).
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"
import { schemaProblems } from "../../../../../test-utils/schema-snapshot.js"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
}))
vi.mock("../../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { BlueprintsController } = await import("./BlueprintsController.js")

const VERSION = "v-1"
const BP = "11111111-2222-4333-8444-555555555555"
const ORE = "66666666-7777-4888-9999-000000000001"
const GEM = "66666666-7777-4888-9999-000000000002"
let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.any(/information_schema/).response([])
  tracker.on.select(/from "game_versions"/).response([{ version_id: VERSION }])
  tracker.on.select(/^select count\(\*\)/).response([{ count: "0" }])
})

const allQueriesMatchSchema = () => {
  const sqls = tracker.history.all.map((q) => q.sql).filter((s) => !s.includes("information_schema"))
  expect(sqls.length).toBeGreaterThan(1)
  for (const sql of sqls) expect(schemaProblems(sql), sql).toEqual([])
}

describe("GET /game-data/blueprints/search?ingredient_name=", () => {
  it("filters on the ingredient's real column; every query names real tables and columns", async () => {
    tracker.on.select(() => true).response([])
    await new BlueprintsController().searchBlueprints(
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, "Copper",
    )
    const count = tracker.history.select.find((q) => q.sql.startsWith("select count(*)"))!
    expect(count.sql).toContain(
      'inner join "game_items" as "gi_filter" on "bi_filter"."ingredient_game_item_id" = "gi_filter"."id"',
    )
    expect(count.bindings).toContain("%Copper%")
    allQueriesMatchSchema()
  })
})

describe("POST /game-data/blueprints/craftable", () => {
  beforeEach(() => {
    tracker.on.select(/from "blueprints"/).response([
      {
        blueprint_id: BP,
        blueprint_code: "bp-1",
        blueprint_name: "BP_ONE",
        crafting_time_seconds: 60,
        output_item_name: "Thing",
        output_item_icon: null,
        item_category: "Armor",
      },
    ])
    tracker.on.select(/from "blueprint_ingredients"/).response([
      { blueprint_id: BP, game_item_id: ORE, name: "Ore", quantity_required: "2" },
      { blueprint_id: BP, game_item_id: GEM, name: "Gem", quantity_required: "0.5" },
    ])
  })

  it("reads ingredients in one query; every query names real tables and columns", async () => {
    await new BlueprintsController().findCraftableBlueprints({
      materials: [{ game_item_id: ORE, quantity_scu: 7 }],
    })
    expect(tracker.history.select.filter((q) => q.sql.includes('from "blueprint_ingredients"'))).toHaveLength(1)
    allQueriesMatchSchema()
  })

  it("returns blueprints whose every ingredient is on hand, with how many can be made", async () => {
    const results = await new BlueprintsController().findCraftableBlueprints({
      materials: [
        { game_item_id: ORE, quantity_scu: 7 },
        { game_item_id: GEM, quantity_scu: 10, quality_value: 800 },
      ],
    })
    expect(results).toEqual([
      expect.objectContaining({
        blueprint_id: BP,
        max_craftable: 3,
        ingredients: [
          { game_item_id: ORE, name: "Ore", quantity_required: 2, available_quantity: 7, quality_value: 500 },
          { game_item_id: GEM, name: "Gem", quantity_required: 0.5, available_quantity: 10, quality_value: 800 },
        ],
      }),
    ])
  })

  it("leaves out blueprints missing an ingredient", async () => {
    await expect(
      new BlueprintsController().findCraftableBlueprints({ materials: [{ game_item_id: ORE, quantity_scu: 7 }] }),
    ).resolves.toEqual([])
  })
})
