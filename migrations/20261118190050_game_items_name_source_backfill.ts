import type { Knex } from "knex"
import { inferNameSource } from "../src/services/game-data/item-names.js"

/**
 * Backfill game_items.name_source (20261118190000) for rows still NULL, from
 * the name itself (inferNameSource): a CIG placeholder name ("PH - ...") →
 * placeholder; a name built from the localization key or record file name
 * (or a raw "@..." key) → key_derived; any other name → cig. Rows with
 * neither a key nor a file (legacy CStone/UEX rows, full sets) are left NULL
 * unless their name is a placeholder or a raw key: the import judges NULL
 * rows by name.
 *
 * A separate migration from the ALTER so no ACCESS EXCLUSIVE lock is held
 * while it runs; it takes row locks only (only the game data import writes
 * game_items). Idempotent (only NULL rows).
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("game_items", "name_source")
  if (!hasColumn) throw new Error("game_items.name_source is missing (20261118190000)")

  const rows: { id: string; name: string; name_key: string | null; p4k_file: string | null }[] =
    await knex("game_items")
      .whereNull("name_source")
      .select("id", "name", "name_key", "p4k_file")

  const idsBySource = new Map<string, string[]>()
  for (const row of rows) {
    const source = inferNameSource(row.name, row.name_key, row.p4k_file)
    if (source === "cig" && !row.name_key && !row.p4k_file) continue
    const ids = idsBySource.get(source) ?? []
    ids.push(row.id)
    idsBySource.set(source, ids)
  }

  const BATCH = 1000
  for (const [source, ids] of idsBySource) {
    for (let i = 0; i < ids.length; i += BATCH) {
      await knex("game_items")
        .whereIn("id", ids.slice(i, i + BATCH))
        .whereNull("name_source")
        .update({ name_source: source })
    }
  }
}

export async function down(): Promise<void> {
  // The column's own migration drops it.
}
