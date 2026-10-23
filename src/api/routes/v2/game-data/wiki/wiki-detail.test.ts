/**
 * Tests for the wiki item/ship detail endpoints:
 * - `manufacturer_name` carries the display name while `manufacturer` keeps
 *   its existing value (raw code for items).
 * - A non-UUID, non-short-slug item id is a 404, not a Postgres uuid-cast 500.
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
  const knex: any = (tableExpr: string) => {
    const table = tableExpr.split(" ")[0]
    fixtures.queried.push(table)
    const fx = fixtures.tables[table] ?? {}
    const builder: any = {}
    for (const m of [
      "where",
      "whereRaw",
      "orWhereRaw",
      "whereIn",
      "join",
      "leftJoin",
      "select",
      "orderBy",
      "clone",
      "clearSelect",
      "clearOrder",
      "limit",
      "offset",
    ]) {
      builder[m] = () => builder
    }
    builder.count = () => Promise.resolve([{ count: String((fx.rows ?? []).length) }])
    builder.first = () => Promise.resolve(fx.first)
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(fx.rows ?? []).then(resolve, reject)
    return builder
  }
  knex.raw = (sql: string) => ({ sql })
  return { getKnex: () => knex, database: { knex } }
})

import { WikiController } from "./WikiController.js"
import { NotFoundError } from "../../../v1/util/errors.js"

const ITEM_ID = "11111111-2222-4333-8444-555555555555"
const MANUFACTURERS = [{ code: "BEHR", name: "Behring Applied Technology" }]

beforeEach(() => {
  fixtures.tables = {}
  fixtures.queried = []
})

describe("WikiController.getItemDetail", () => {
  it("returns manufacturer_name alongside the raw manufacturer code", async () => {
    fixtures.tables = {
      game_items: {
        first: { id: ITEM_ID, name: "P4-AR Rifle", type: "WeaponPersonal", manufacturer: "behr" },
      },
      listings: { first: { listing_count: "0", total_quantity: null } },
      wiki_manufacturers: { rows: MANUFACTURERS },
    }

    const result = await new WikiController().getItemDetail(ITEM_ID)

    expect(result.manufacturer).toBe("behr")
    expect(result.manufacturer_name).toBe("Behring Applied Technology")
  })

  it("returns manufacturer_name null when the code is unknown", async () => {
    fixtures.tables = {
      game_items: { first: { id: ITEM_ID, name: "Mystery", manufacturer: "zzzz" } },
      listings: { first: { listing_count: "0", total_quantity: null } },
      wiki_manufacturers: { rows: [] },
    }

    const result = await new WikiController().getItemDetail(ITEM_ID)

    expect(result.manufacturer).toBe("zzzz")
    expect(result.manufacturer_name).toBeNull()
  })

  it("throws NotFound for a non-UUID, non-short-slug id without querying", async () => {
    await expect(new WikiController().getItemDetail("does-not-exist")).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(fixtures.queried).toEqual([])
  })
})

describe("WikiController.searchItems", () => {
  it("adds manufacturer_name to each result without changing manufacturer", async () => {
    fixtures.tables = {
      game_items: {
        rows: [
          // case-sensitive wm join missed it, so manufacturer stays the raw code
          { id: ITEM_ID, name: "P4-AR Rifle", manufacturer: "behr", manufacturer_name: null },
          { id: "x", name: "Unbranded", manufacturer: null, manufacturer_name: null },
        ],
      },
      wiki_manufacturers: { rows: MANUFACTURERS },
    }

    const result = await new WikiController().searchItems()

    expect(result.items[0].manufacturer).toBe("behr")
    expect(result.items[0].manufacturer_name).toBe("Behring Applied Technology")
    expect(result.items[1].manufacturer_name).toBeNull()
  })
})

describe("WikiController.getShipDetail", () => {
  it("returns manufacturer_name resolved from the wiki_ships manufacturer code", async () => {
    fixtures.tables = {
      game_versions: { first: { version_id: "v1" } },
      game_items: { first: { id: ITEM_ID, name: "Gladius", manufacturer: "aegs" } },
      wiki_ships: { first: { ship_id: "s1", name: "Gladius", manufacturer_code: "AEGS" } },
      game_item_attributes: { rows: [] },
      wiki_manufacturers: { rows: [{ code: "AEGS", name: "Aegis Dynamics" }] },
    }

    const result = await new WikiController().getShipDetail(ITEM_ID)

    expect(result.manufacturer_name).toBe("Aegis Dynamics")
    // `manufacturer` keeps its pre-existing value (display name when resolvable)
    expect(result.manufacturer).toBe("Aegis Dynamics")
  })

  it("returns manufacturer_name null (manufacturer falls back to code) when unknown", async () => {
    fixtures.tables = {
      game_versions: { first: { version_id: "v1" } },
      game_items: { first: { id: ITEM_ID, name: "Oddity", manufacturer: "klwe" } },
      wiki_ships: { first: undefined },
      game_item_attributes: { rows: [] },
      wiki_manufacturers: { rows: [] },
    }

    const result = await new WikiController().getShipDetail(ITEM_ID)

    expect(result.manufacturer).toBe("klwe")
    expect(result.manufacturer_name).toBeNull()
  })
})
