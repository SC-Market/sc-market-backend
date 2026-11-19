import type { Knex } from "knex"

/**
 * Curated item names, keyed by the item's record id (game_items.p4k_id,
 * stable across patches). The game data import gives an item its override
 * when CIG has no name for it (name_source 'override', ranked below CIG's
 * name and above derived ones; src/services/game-data/item-names.ts).
 * Owner-edited; empty to start. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS game_item_name_overrides (
      p4k_id uuid PRIMARY KEY,
      name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS game_item_name_overrides")
}
