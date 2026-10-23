/**
 * Tests for GET /game-data/wiki/manufacturers: item counts are grouped by the
 * resolved wiki_manufacturers brand, and values that resolve to no brand
 * (livery logo records, kiosk/placeholder records) are left out.
 *
 * Named without "Controller" so it is not swept up by the vitest exclusion for
 * DB-backed v2 controller tests; the database is replaced by a table-keyed fake.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

const fixtures = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
}))

vi.mock("../../../../../clients/database/knex-db.js", () => {
  const knex: any = (table: string) => {
    const rows = fixtures.tables[table] ?? []
    const builder: any = {}
    for (const m of [
      "select",
      "count",
      "whereNotNull",
      "andWhere",
      "groupByRaw",
    ]) {
      builder[m] = () => builder
    }
    builder.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject)
    return builder
  }
  knex.raw = (sql: string) => ({ sql })
  return { getKnex: () => knex, database: { knex } }
})

import { WikiController } from "./WikiController.js"

beforeEach(() => {
  fixtures.tables = {}
})

describe("WikiController.getManufacturers", () => {
  it("resolves codes to brand names, merges aliases and drops unresolved values", async () => {
    fixtures.tables = {
      wiki_manufacturers: [
        {
          manufacturer_id: "m-aegs",
          code: "aegs",
          name: "Aegis Dynamics",
          description: null,
        },
        {
          manufacturer_id: "m-anvl",
          code: "anvl",
          name: "Anvil Aerospace",
          description: null,
        },
        {
          manufacturer_id: "m-behr",
          code: "behr",
          name: "Behring",
          description: null,
        },
      ],
      game_items: [
        { mfr_lower: "aegs", item_count: "245" },
        // Legacy (pre-P4K) rows that stored the display name resolve by name
        { mfr_lower: "aegis dynamics", item_count: "5" },
        { mfr_lower: "behr", item_count: "225" },
        { mfr_lower: "anvl", item_count: "150" },
        {
          mfr_lower: "paint_hornet_f7a_mk1_blue_blue_red_logo",
          item_count: "1",
        },
        { mfr_lower: "volt", item_count: "70" },
      ],
    }

    const result = await new WikiController().getManufacturers()

    expect(result).toEqual([
      { manufacturer: "aegs", display_name: "Aegis Dynamics", item_count: 250 },
      {
        manufacturer: "anvl",
        display_name: "Anvil Aerospace",
        item_count: 150,
      },
      { manufacturer: "behr", display_name: "Behring", item_count: 225 },
    ])
  })

  it("returns an empty list when no manufacturers have been imported", async () => {
    fixtures.tables = {
      wiki_manufacturers: [],
      game_items: [{ mfr_lower: "aegs", item_count: "245" }],
    }

    expect(await new WikiController().getManufacturers()).toEqual([])
  })
})
