/**
 * Case-insensitive item-type (game item subcategory) matching.
 *
 * `game_items.type` holds values like "Helmet" or "Ranged Weapon", and the
 * market search used to compare it with `=`, so `item_type=helmet` returned
 * nothing while `item_type=Helmet` returned every helmet listing.
 *
 * `game_items` has a btree index on `(type, name)`. Comparing
 * `LOWER(gi.type) = LOWER(?)` inside the big listing query would stop that
 * index from being usable there, so instead the requested value is resolved to
 * the stored spelling(s) with a small lookup on the narrow `game_items.type`
 * column, and the listing query keeps a plain equality / IN on the real values.
 */

import type { Knex } from "knex"

/** Query returning the distinct stored `game_items.type` values equal to `itemType`, ignoring case. */
export function itemTypeLookupQuery(db: Knex, itemType: string): Knex.QueryBuilder {
  return db("game_items")
    .distinct("type")
    .whereNotNull("type")
    .whereRaw("LOWER(type) = LOWER(?)", [itemType.trim()])
}

/**
 * Resolve a user-supplied item type to the stored spellings. Returns an empty
 * array when no game item has that type (the caller's `whereIn` then matches
 * nothing, which is the correct "no results").
 */
export async function resolveItemTypes(db: Knex, itemType: string): Promise<string[]> {
  const rows: Array<{ type: string }> = await itemTypeLookupQuery(db, itemType)
  return rows.map((r) => r.type)
}
