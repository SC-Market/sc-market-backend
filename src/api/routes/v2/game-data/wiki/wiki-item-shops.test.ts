/**
 * GET /game-data/wiki/items/{id}/shops — the wiki item page's "In-Game Shop
 * Availability" section. Replaces V1 /api/v1/shops/game/items/:id/shops,
 * which answered 404 for every item no NPC shop stocks.
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
      "orderByRaw",
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

beforeEach(() => {
  fixtures.tables = {}
  fixtures.queried = []
})

describe("WikiController.getItemShops", () => {
  it("returns the shops stocking the item with numeric prices", async () => {
    fixtures.tables = {
      game_items: { first: { id: ITEM_ID } },
      game_shop_items: {
        rows: [
          { shop_id: "s1", shop_name: "Cubby Blast", shop_location: "Stanton > Area18", buy_price: "1250.00", sell_price: null },
          { shop_id: "s2", shop_name: "Skutters", shop_location: "Stanton > GrimHEX", buy_price: null, sell_price: "300.50" },
        ],
      },
    }

    const result = await new WikiController().getItemShops(ITEM_ID)

    expect(result.shops).toEqual([
      { shop_id: "s1", shop_name: "Cubby Blast", shop_location: "Stanton > Area18", buy_price: 1250, sell_price: null },
      { shop_id: "s2", shop_name: "Skutters", shop_location: "Stanton > GrimHEX", buy_price: null, sell_price: 300.5 },
    ])
  })

  it("returns an empty list (not a 404) when no shop stocks the item", async () => {
    fixtures.tables = {
      game_items: { first: { id: ITEM_ID } },
      game_shop_items: { rows: [] },
    }

    await expect(new WikiController().getItemShops(ITEM_ID)).resolves.toEqual({ shops: [] })
  })

  it("is a 404 for an unknown item", async () => {
    fixtures.tables = { game_items: { first: undefined } }

    await expect(new WikiController().getItemShops(ITEM_ID)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("is a 404 for a slug or other non-UUID id, without querying", async () => {
    await expect(new WikiController().getItemShops("p4-ar-rifle-11111111")).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(fixtures.queried).toEqual([])
  })
})
