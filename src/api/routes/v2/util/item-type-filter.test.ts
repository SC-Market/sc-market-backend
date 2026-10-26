import { describe, it, expect, vi } from "vitest"
import knexFactory from "knex"
import type { Knex } from "knex"
import { itemTypeLookupQuery, resolveItemTypes } from "./item-type-filter.js"

// SQL is only compiled, never run: no connection is needed for toSQL().
const knex = knexFactory({ client: "pg" })

describe("item type filter", () => {
  // Regression: item_type=Helmet returned 55 listings and item_type=helmet 0,
  // because ls.game_item_type was compared with a case-sensitive `=`.
  it("looks the stored spelling up case-insensitively", () => {
    const q = itemTypeLookupQuery(knex, " helmet ").toSQL()
    expect(q.sql).toBe(
      'select distinct "type" from "game_items" where "type" is not null and LOWER(type) = LOWER(?)',
    )
    expect(q.bindings).toEqual(["helmet"])
  })

  it("returns the stored spellings for the listing query's IN filter", async () => {
    const rows = [{ type: "Helmet" }]
    // Minimal thenable query builder standing in for a real connection.
    const builder = {
      distinct: vi.fn(() => builder),
      whereNotNull: vi.fn(() => builder),
      whereRaw: vi.fn(() => builder),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    }
    const db = vi.fn(() => builder) as unknown as Knex
    await expect(resolveItemTypes(db, "HELMET")).resolves.toEqual(["Helmet"])
    expect(builder.whereRaw).toHaveBeenCalledWith("LOWER(type) = LOWER(?)", ["HELMET"])
  })

  it("keeps the main listing filter a plain IN on the indexed column", () => {
    const q = knex("listing_search as ls").whereIn("ls.game_item_type", ["Helmet"]).toSQL()
    expect(q.sql).toBe('select * from "listing_search" as "ls" where "ls"."game_item_type" in (?)')
    expect(q.sql).not.toMatch(/lower/i)
  })
})
