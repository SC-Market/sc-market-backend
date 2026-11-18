/**
 * Ranked item search (GET /game-items/search and the wiki item search)
 * against the FULL schema, pg_trgm included: proper name matches come before
 * localization-key, manufacturer and typo matches.
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
} from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"

const DB = "pgtest_item_search_ranking"
const state: { db: Knex | null } = { db: null }

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { GameItemsV2Controller } =
  await import("../../api/routes/v2/game-items/GameItemsV2Controller.js")
const { WikiController } =
  await import("../../api/routes/v2/game-data/wiki/WikiController.js")
const { clearSearchManufacturerCache } = await import("./item-search.js")

async function search(query: string, limit = 50): Promise<string[]> {
  const rows = await new GameItemsV2Controller().searchGameItems(query, limit)
  return rows.map((r) => r.name)
}

describe.skipIf(!PG_TEST_URL)("ranked item search", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 4 },
    })
    clearSearchManufacturerCache()
    const db = state.db

    await db("wiki_manufacturers").insert([
      { code: "ksar", name: "Kastak Arms" },
      { code: "behr", name: "Behring" },
    ])
    const item = (
      name: string,
      manufacturer: string | null,
      name_key: string | null = null,
    ) => ({
      name,
      type: "Ranged Weapon",
      manufacturer,
      name_key,
    })
    await db("game_items").insert([
      item("Arrowhead", "klwe"),
      item("Arrowhead Sniper Rifle Magazine", "klwe"),
      item("Broadhead Arrowhead Decal", null),
      item(
        'Verdict "Derivation" LMG',
        "ksar",
        "@item_Nameksar_lmg_energy_01_store01",
      ),
      item("Ksar Lmg Energy 01", "ksar", "@item_Nameksar_lmg_energy_01"),
      item(
        "Ksar Lmg Energy 01 Tint02",
        "ksar",
        "@item_Nameksar_lmg_energy_01_tint02",
      ),
      item("Custodian SMG", "ksar"),
      item("P4-AR Rifle", "behr"),
      item("Unrelated Helmet", "behr"),
    ])
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("puts the exact name first, then prefix, then substring", async () => {
    expect(await search("arrowhead")).toEqual([
      "Arrowhead",
      "Arrowhead Sniper Rifle Magazine",
      "Broadhead Arrowhead Decal",
    ])
  })

  it("finds near spellings, after nothing better", async () => {
    expect((await search("verdikt"))[0]).toBe('Verdict "Derivation" LMG')
    expect(await search("arowhead")).toEqual(
      expect.arrayContaining(["Arrowhead", "Arrowhead Sniper Rifle Magazine"]),
    )
  })

  it("matches by manufacturer name or code, below name matches", async () => {
    const kastak = await search("kastak")
    expect(kastak.sort()).toEqual(
      [
        "Custodian SMG",
        "Ksar Lmg Energy 01",
        "Ksar Lmg Energy 01 Tint02",
        'Verdict "Derivation" LMG',
      ].sort(),
    )
    // "ksar" names Ksar items directly (name tiers), the rest by manufacturer
    const ksar = await search("ksar")
    expect(ksar.slice(0, 2)).toEqual([
      "Ksar Lmg Energy 01",
      "Ksar Lmg Energy 01 Tint02",
    ])
    expect(ksar).toContain("Custodian SMG")
  })

  it("combines a manufacturer with words of the name", async () => {
    const res = await search("kastak lmg")
    expect(res.sort()).toEqual(
      [
        "Ksar Lmg Energy 01",
        "Ksar Lmg Energy 01 Tint02",
        'Verdict "Derivation" LMG',
      ].sort(),
    )
    expect(await search("kastek lmg")).toEqual(expect.arrayContaining(res))
  })

  it("matches localization keys and class names", async () => {
    // The keyed item first; near spellings of the key may follow
    expect((await search("@item_Nameksar_lmg_energy_01_tint02"))[0]).toBe(
      "Ksar Lmg Energy 01 Tint02",
    )
    const byClass = await search("ksar_lmg_energy_01")
    expect(byClass.slice(0, 3).sort()).toEqual(
      [
        "Ksar Lmg Energy 01",
        "Ksar Lmg Energy 01 Tint02",
        'Verdict "Derivation" LMG',
      ].sort(),
    )
    expect(byClass).not.toContain("Arrowhead")
  })

  it("treats LIKE wildcards literally and survives punctuation", async () => {
    expect(await search("%")).toEqual([])
    expect(await search("*")).toEqual([])
    expect(await search("P4-AR")).toEqual(["P4-AR Rifle"])
  })

  it("ranks the wiki item search the same way, with a matching total", async () => {
    const res = await new WikiController().searchItems("arrowhead")
    expect(res.items.map((i) => i.name)).toEqual([
      "Arrowhead",
      "Arrowhead Sniper Rifle Magazine",
      "Broadhead Arrowhead Decal",
    ])
    expect(res.total).toBe(3)
  })
})
