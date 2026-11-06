/**
 * Blueprint search and detail return `manufacturer_name` (the display name
 * from wiki_manufacturers) next to `manufacturer` (the raw code the
 * `manufacturer` search filter takes).
 *
 * Named without "Controller" so it is not swept up by the vitest exclusion for
 * DB-backed v2 controller tests; the database is replaced by a table-keyed fake.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

type TableFixture = { first?: unknown; rows?: unknown[] }

const fixtures = vi.hoisted(() => ({
  tables: {} as Record<string, TableFixture>,
  queried: [] as string[],
}))

vi.mock("../../../../../clients/database/knex-db.js", () => {
  // Every chained call returns the builder; awaiting it yields the table's
  // rows (or a count row after .count()), .first() yields the table's `first`.
  const makeBuilder = (table: string, state: { counting: boolean }): any => {
    const fx = (): TableFixture => fixtures.tables[table] ?? {}
    const proxy: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(
                state.counting
                  ? [{ count: String((fx().rows ?? []).length) }]
                  : (fx().rows ?? []),
              ).then(resolve, reject)
          }
          if (prop === "first") return () => Promise.resolve(fx().first)
          if (prop === "clone") return () => makeBuilder(table, { ...state })
          if (prop === "count") {
            return () => {
              state.counting = true
              return proxy
            }
          }
          return () => proxy
        },
      },
    )
    return proxy
  }
  const knex: any = (tableExpr: string) => {
    const table = tableExpr.split(" ")[0]
    fixtures.queried.push(table)
    return makeBuilder(table, { counting: false })
  }
  knex.raw = (sql: string) => ({ sql })
  return { getKnex: () => knex, database: { knex } }
})
vi.mock("../../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
}))
vi.mock("../../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { BlueprintsController } from "./BlueprintsController.js"

const BP_ID = "11111111-2222-4333-8444-555555555555"
const ITEM_ID = "66666666-7777-4888-9999-000000000000"
const MANUFACTURERS = [{ code: "behr", name: "Behring" }]

function searchRow(overrides: Record<string, unknown>) {
  return {
    blueprint_id: BP_ID,
    blueprint_code: "code-1",
    blueprint_name: "BP_CRAFT_behr_rifle_ballistic_03",
    output_item_name: "CQ7 Rifle",
    output_item_icon: null,
    manufacturer: "behr",
    item_category: "Personal Weapons",
    item_subcategory: null,
    rarity: null,
    tier: null,
    source: "mission_reward",
    crafting_time_seconds: 150,
    ingredient_count: 0,
    mission_count: 1,
    modifier_properties: null,
    ...overrides,
  }
}

function search() {
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
    undefined, // sourceable
    undefined, // has_mission_source
    "version-1",
  )
}

function detailFixtures(manufacturer: string | null, manufacturers: unknown[]) {
  const now = new Date("2026-11-01T00:00:00Z")
  fixtures.tables = {
    blueprints: {
      first: {
        blueprint_id: BP_ID,
        version_id: "version-1",
        blueprint_code: "code-1",
        blueprint_name: "BP_CRAFT_behr_rifle_ballistic_03",
        output_game_item_id: ITEM_ID,
        output_quantity: 1,
        source: "mission_reward",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    },
    game_items: { first: { id: ITEM_ID, name: "CQ7 Rifle", type: "WeaponPersonal", manufacturer } },
    wiki_manufacturers: { rows: manufacturers },
  }
}

beforeEach(() => {
  fixtures.tables = {}
  fixtures.queried = []
})

describe("BlueprintsController.searchBlueprints manufacturer_name", () => {
  it("returns the display name next to the code", async () => {
    fixtures.tables = {
      blueprints: {
        rows: [
          searchRow({}),
          searchRow({ blueprint_id: "b2", manufacturer: "volt" }),
          searchRow({ blueprint_id: "b3", manufacturer: null }),
        ],
      },
      wiki_manufacturers: { rows: MANUFACTURERS },
    }

    const result = await search()

    expect(result.blueprints[0].manufacturer).toBe("behr")
    expect(result.blueprints[0].manufacturer_name).toBe("Behring")
    // A code with no wiki_manufacturers name: no name, code kept as-is
    expect(result.blueprints[1].manufacturer).toBe("volt")
    expect(result.blueprints[1].manufacturer_name).toBeNull()
    expect(result.blueprints[2].manufacturer).toBeUndefined()
    expect(result.blueprints[2].manufacturer_name).toBeNull()
    // One lookup for the whole page
    expect(fixtures.queried.filter((t) => t === "wiki_manufacturers")).toHaveLength(1)
  })

  it("skips the name lookup when the page has no manufacturers", async () => {
    fixtures.tables = { blueprints: { rows: [searchRow({ manufacturer: null })] } }

    const result = await search()

    expect(result.blueprints[0].manufacturer_name).toBeNull()
    expect(fixtures.queried).not.toContain("wiki_manufacturers")
  })
})

describe("BlueprintsController.getBlueprintDetail manufacturer_name", () => {
  it("returns the display name next to the code", async () => {
    detailFixtures("behr", MANUFACTURERS)

    const result = await new BlueprintsController().getBlueprintDetail(BP_ID)

    expect(result.manufacturer).toBe("behr")
    expect(result.manufacturer_name).toBe("Behring")
  })

  it("returns manufacturer_name null when the code has no name", async () => {
    detailFixtures("volt", [])

    const result = await new BlueprintsController().getBlueprintDetail(BP_ID)

    expect(result.manufacturer).toBe("volt")
    expect(result.manufacturer_name).toBeNull()
  })
})
