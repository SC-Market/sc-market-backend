/**
 * Manufacturer display-name resolution for wiki responses.
 *
 * `game_items.manufacturer` / `wiki_ships.manufacturer_code` hold raw codes
 * ("aegs", "BEHR", ...) and sometimes a display name. GET
 * /game-data/wiki/manufacturers resolves these against `wiki_manufacturers` by
 * matching the value case-insensitively against either the code or the name;
 * this module applies that same rule so item/ship responses can expose a
 * `manufacturer_name` consistent with the manufacturers list's `display_name`.
 */

import type { Knex } from "knex"

export interface ManufacturerNameRow {
  code: string
  name: string | null
}

/** Lowercased code/name → display name, mirroring getManufacturers' lookup. */
export function buildManufacturerNameLookup(
  rows: ManufacturerNameRow[],
): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const row of rows) {
    if (!row.name) continue
    lookup.set(row.code.toLowerCase(), row.name)
    lookup.set(row.name.toLowerCase(), row.name)
  }
  return lookup
}

/**
 * First display name found among `values` (tried in order), or null when none
 * of them resolve.
 */
export function lookupManufacturerName(
  lookup: Map<string, string>,
  ...values: (string | null | undefined)[]
): string | null {
  for (const value of values) {
    if (!value) continue
    const name = lookup.get(value.toLowerCase())
    if (name) return name
  }
  return null
}

/**
 * Load a lookup covering just the given manufacturer values with one query.
 */
export async function loadManufacturerNameLookup(
  knex: Knex,
  values: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const keys = Array.from(
    new Set(
      values
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .map((v) => v.toLowerCase()),
    ),
  )
  if (keys.length === 0) return new Map()

  const placeholders = keys.map(() => "?").join(", ")
  const rows = await knex("wiki_manufacturers")
    .whereRaw(`lower(code) IN (${placeholders})`, keys)
    .orWhereRaw(`lower(name) IN (${placeholders})`, keys)
    .select<ManufacturerNameRow[]>("code", "name")

  return buildManufacturerNameLookup(rows)
}
