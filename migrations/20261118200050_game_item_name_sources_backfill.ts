import type { Knex } from "knex"
import { inferNameSource } from "../src/services/game-data/item-names.js"

/**
 * Backfill game_item_name_sources (20261118200000) for game_items rows
 * without one, from the name itself (inferNameSource): a CIG placeholder
 * name ("PH - ...") → placeholder; a name built from the localization key or
 * record file name (or a raw "@..." key) → key_derived; any other name →
 * cig. Rows with neither a key nor a file (legacy CStone/UEX rows, full sets)
 * get no row unless their name is a placeholder or a raw key: the import
 * judges rows without one by name.
 *
 * Reads game_items, writes only the new table. Idempotent (ON CONFLICT DO
 * NOTHING).
 */
export async function up(knex: Knex): Promise<void> {
  const rows: { id: string; name: string; name_key: string | null; p4k_file: string | null }[] =
    await knex("game_items")
      .leftJoin("game_item_name_sources as s", "s.game_item_id", "game_items.id")
      .whereNull("s.game_item_id")
      .select("game_items.id", "game_items.name", "game_items.name_key", "game_items.p4k_file")

  const inserts: { game_item_id: string; name_source: string }[] = []
  for (const row of rows) {
    const source = inferNameSource(row.name, row.name_key, row.p4k_file)
    if (source === "cig" && !row.name_key && !row.p4k_file) continue
    inserts.push({ game_item_id: row.id, name_source: source })
  }

  const BATCH = 1000
  for (let i = 0; i < inserts.length; i += BATCH) {
    await knex("game_item_name_sources")
      .insert(inserts.slice(i, i + BATCH))
      .onConflict("game_item_id")
      .ignore()
  }
}

export async function down(): Promise<void> {
  // The table's own migration drops it.
}
