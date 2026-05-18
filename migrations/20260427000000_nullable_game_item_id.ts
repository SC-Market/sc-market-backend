import type { Knex } from "knex"

/**
 * Make listing_items.game_item_id nullable.
 * Custom listings (not linked to a specific game item) need NULL game_item_id.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE listing_items ALTER COLUMN game_item_id DROP NOT NULL`)
  await knex.raw(`ALTER TABLE item_variants ALTER COLUMN game_item_id DROP NOT NULL`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE listing_items ALTER COLUMN game_item_id SET NOT NULL`)
}
