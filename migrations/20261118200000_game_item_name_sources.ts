import type { Knex } from "knex"
import { ITEM_NAME_SOURCES } from "../src/services/game-data/item-names.js"

/**
 * game_item_name_sources: where a game_items name comes from, so the game
 * data import can rank names (src/services/game-data/item-names.ts):
 * cig > override > derived > key_derived > placeholder. No row = not
 * recorded (rows the import didn't write: full sets, resources); the import
 * judges those by their name. Backfilled by 20261118200050.
 *
 * A companion table, not a game_items column: ADD COLUMN needs ACCESS
 * EXCLUSIVE on game_items, which the site reads constantly; two deploys
 * (9d2ae113e, 9881394a7) of that migration did not go live. Creating this
 * table takes no lock that blocks reads of game_items: the foreign key takes
 * SHARE ROW EXCLUSIVE, which only waits for writers (the game data import).
 * Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const allowed = ITEM_NAME_SOURCES.map((s) => `'${s}'`).join(", ")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS game_item_name_sources (
      game_item_id uuid PRIMARY KEY REFERENCES game_items(id) ON DELETE CASCADE,
      name_source text NOT NULL CHECK (name_source IN (${allowed})),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS game_item_name_sources")
}
