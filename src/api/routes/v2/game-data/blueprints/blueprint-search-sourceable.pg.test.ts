/**
 * GET /game-data/blueprints/search?sourceable=true against the FULL schema:
 * only blueprints a player can get (source "default", or rewarded by at least
 * one mission), the rule the blueprint browser's "Hide Unsourceable" applied
 * in the browser. Filtering in SQL keeps a page full (and `total` right) so
 * the /blueprints hub can be prerendered. Without the param nothing changes.
 *
 * has_mission_source=true likewise moves "Has Mission Source" (mission_count
 * > 0) into SQL.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../../test-utils/full-schema.js"

const DB = "pgtest_blueprint_search_sourceable"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
}))
vi.mock("../../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { BlueprintsController } = await import("./BlueprintsController.js")

/** searchBlueprints with only `sourceable` and pagination set. */
function search(sourceable: boolean | undefined, page = 1, pageSize = 20, has_mission_source?: boolean) {
  return new BlueprintsController().searchBlueprints(
    undefined, // text
    undefined, // item_category
    undefined, // item_subcategory
    undefined, // rarity
    undefined, // tier
    undefined, // crafting_station_type
    undefined, // output_game_item_id
    undefined, // user_owned_only
    undefined, // source
    undefined, // manufacturer
    undefined, // ingredient_name
    sourceable,
    has_mission_source,
    undefined, // version_id: the active LIVE version
    page,
    pageSize,
  )
}

describe.skipIf(!PG_TEST_URL)("searchBlueprints sourceable filter", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 4 } })
    const db = state.db

    const [version] = await db("game_versions")
      .insert({ version_type: "LIVE", version_number: "4.3.0-pgtest", is_active: true })
      .returning("version_id")
    const [item] = await db("game_items").insert({ name: "Output Item", type: "weapon" }).returning("id")
    const blueprint = (name: string, source: string | null) => ({
      version_id: version.version_id,
      blueprint_code: `code-${name}`,
      blueprint_name: name,
      output_game_item_id: item.id,
      source,
      is_active: true,
    })
    const rows = await db("blueprints")
      .insert([
        blueprint("BP_A_DEFAULT", "default"),
        blueprint("BP_B_MISSION", "mission_reward"),
        // Rewarded by a mission though its source column says otherwise.
        blueprint("BP_C_UNSOURCED_WITH_MISSION", "unsourced"),
        blueprint("BP_D_UNSOURCED", "unsourced"),
        // source "mission_reward" but no mission rewards it (yet).
        blueprint("BP_E_MISSION_NO_REWARD", "mission_reward"),
        blueprint("BP_F_NULL_SOURCE", null),
      ])
      .returning(["blueprint_id", "blueprint_name"])
    const id = (name: string) => rows.find((r) => r.blueprint_name === name)!.blueprint_id

    const missions = await db("missions")
      .insert([
        { version_id: version.version_id, mission_code: "M1", mission_name: "One", category: "Delivery" },
        { version_id: version.version_id, mission_code: "M2", mission_name: "Two", category: "Delivery" },
      ])
      .returning("mission_id")
    const reward = (mission_id: string, blueprint_id: string) => ({
      mission_id,
      blueprint_id,
      reward_pool_size: 1,
      drop_probability: 50,
    })
    await db("mission_blueprint_rewards").insert([
      reward(missions[0].mission_id, id("BP_B_MISSION")),
      // Two missions: still one row, still sourceable.
      reward(missions[1].mission_id, id("BP_B_MISSION")),
      reward(missions[0].mission_id, id("BP_C_UNSOURCED_WITH_MISSION")),
    ])
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("returns only default blueprints and ones a mission rewards, with a matching total", async () => {
    const res = await search(true)
    expect(res.blueprints.map((b) => b.blueprint_name)).toEqual([
      "BP_A_DEFAULT",
      "BP_B_MISSION",
      "BP_C_UNSOURCED_WITH_MISSION",
    ])
    expect(res.total).toBe(3)
    // Same rule the browser applied to the unfiltered results.
    for (const b of res.blueprints) {
      expect(b.source === "default" || b.mission_count > 0).toBe(true)
    }
  })

  it("filters before paginating, so pages are full", async () => {
    const first = await search(true, 1, 2)
    const second = await search(true, 2, 2)
    expect(first.blueprints).toHaveLength(2)
    expect(second.blueprints.map((b) => b.blueprint_name)).toEqual(["BP_C_UNSOURCED_WITH_MISSION"])
    expect(first.total).toBe(3)
  })

  it("has_mission_source returns only blueprints a mission rewards, whatever their source", async () => {
    const res = await search(undefined, 1, 20, true)
    expect(res.blueprints.map((b) => b.blueprint_name)).toEqual([
      "BP_B_MISSION",
      "BP_C_UNSOURCED_WITH_MISSION",
    ])
    expect(res.total).toBe(2)
    // Same rule the browser applied ("Has Mission Source").
    for (const b of res.blueprints) expect(b.mission_count > 0).toBe(true)
  })

  it("has_mission_source filters before paginating and combines with sourceable", async () => {
    const first = await search(true, 1, 1, true)
    const second = await search(true, 2, 1, true)
    expect(first.blueprints.map((b) => b.blueprint_name)).toEqual(["BP_B_MISSION"])
    expect(second.blueprints.map((b) => b.blueprint_name)).toEqual(["BP_C_UNSOURCED_WITH_MISSION"])
    expect(first.total).toBe(2)
    const off = await search(undefined, 1, 20, false)
    expect(off.total).toBe(6)
  })

  it("leaves results unchanged without the param (or with false)", async () => {
    for (const sourceable of [undefined, false]) {
      const res = await search(sourceable)
      expect(res.total).toBe(6)
      expect(res.blueprints).toHaveLength(6)
    }
  })
})
