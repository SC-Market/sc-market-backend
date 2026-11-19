import type { Knex } from "knex"
import {
  inferNameSource,
  ITEM_NAME_SOURCES,
} from "../src/services/game-data/item-names.js"

/**
 * game_items.name_source: where an item's name comes from, so the game data
 * import can rank names (src/services/game-data/item-names.ts):
 * cig > override > derived > key_derived > placeholder. NULL on rows the
 * import didn't write (full sets, resources); the import judges those by
 * their name.
 *
 * Backfill, for rows still NULL: a CIG placeholder name ("PH - ...") →
 * placeholder; a name built from the localization key or record file name →
 * key_derived; any other name → cig. Rows with neither a key nor a file
 * (legacy CStone/UEX rows) only get a source when their name is a
 * placeholder or a raw "@..." key; the rest are left NULL, judged by name.
 *
 * game_items is not a hot table (migration-lock-rules.test.ts): only the game
 * data import writes it. ADD COLUMN without a default and a CHECK added NOT
 * VALID then validated keep the ACCESS EXCLUSIVE lock short; lock_timeout
 * makes it fail fast rather than queue. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("ALTER TABLE game_items ADD COLUMN IF NOT EXISTS name_source text")

  const constraint = await knex.raw(
    "SELECT 1 FROM pg_constraint WHERE conname = 'game_items_name_source_check'",
  )
  if (constraint.rows.length === 0) {
    const allowed = ITEM_NAME_SOURCES.map((s) => `'${s}'`).join(", ")
    await knex.raw(
      `ALTER TABLE game_items ADD CONSTRAINT game_items_name_source_check
       CHECK (name_source IS NULL OR name_source IN (${allowed})) NOT VALID`,
    )
    await knex.raw("ALTER TABLE game_items VALIDATE CONSTRAINT game_items_name_source_check")
  }

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

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(
    "ALTER TABLE game_items DROP CONSTRAINT IF EXISTS game_items_name_source_check",
  )
  await knex.raw("ALTER TABLE game_items DROP COLUMN IF EXISTS name_source")
}
