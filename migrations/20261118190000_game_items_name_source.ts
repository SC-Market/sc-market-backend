import type { Knex } from "knex"
import { ITEM_NAME_SOURCES } from "../src/services/game-data/item-names.js"

/**
 * game_items.name_source: where an item's name comes from, so the game data
 * import can rank names (src/services/game-data/item-names.ts):
 * cig > override > derived > key_derived > placeholder. NULL on rows the
 * import didn't write (full sets, resources); the import judges those by
 * their name. Backfilled by 20261118190050.
 *
 * game_items is not a hot table for writes (only the game data import writes
 * it), but the site reads it constantly, and ADD COLUMN / ADD CONSTRAINT need
 * ACCESS EXCLUSIVE: a long read (a materialized view refresh, the sitemap)
 * can hold it off past the 5s lock_timeout. The ALTERs are retried a few
 * times under a savepoint before the migration gives up. The column has no
 * default and the CHECK is added NOT VALID then validated (all NULL), so the
 * lock is held only briefly. Idempotent.
 */
const ATTEMPTS = 8
const RETRY_DELAY_MS = 3000
const LOCK_NOT_AVAILABLE = "55P03"

async function withLockRetry(knex: Knex, sql: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await knex.raw("SAVEPOINT name_source_alter")
    try {
      await knex.raw(sql)
      await knex.raw("RELEASE SAVEPOINT name_source_alter")
      return
    } catch (error) {
      await knex.raw("ROLLBACK TO SAVEPOINT name_source_alter")
      const code = (error as { code?: string }).code
      if (code !== LOCK_NOT_AVAILABLE || attempt >= ATTEMPTS) throw error
      console.warn(
        `game_items lock not available (attempt ${attempt}/${ATTEMPTS}); retrying in ${RETRY_DELAY_MS}ms`,
      )
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '3s'")
  const allowed = ITEM_NAME_SOURCES.map((s) => `'${s}'`).join(", ")
  const constraint = await knex.raw(
    "SELECT 1 FROM pg_constraint WHERE conname = 'game_items_name_source_check'",
  )
  await withLockRetry(
    knex,
    [
      "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS name_source text",
      ...(constraint.rows.length === 0
        ? [
            `ADD CONSTRAINT game_items_name_source_check CHECK (name_source IS NULL OR name_source IN (${allowed})) NOT VALID`,
          ]
        : []),
    ].join(", "),
  )
  if (constraint.rows.length === 0) {
    await knex.raw("ALTER TABLE game_items VALIDATE CONSTRAINT game_items_name_source_check")
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(
    "ALTER TABLE game_items DROP CONSTRAINT IF EXISTS game_items_name_source_check",
  )
  await knex.raw("ALTER TABLE game_items DROP COLUMN IF EXISTS name_source")
}
