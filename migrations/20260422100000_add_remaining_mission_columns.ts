import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS destinations jsonb")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS item_rewards jsonb")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS token_substitutions jsonb")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS time_to_complete real")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS max_players_per_instance integer")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS is_intro boolean DEFAULT false")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS linked_intros jsonb")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS buy_in integer")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS reputation_reward integer")
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS reward_scope varchar(200)")
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS destinations")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS item_rewards")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS token_substitutions")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS time_to_complete")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS max_players_per_instance")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS is_intro")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS linked_intros")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS buy_in")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS reputation_reward")
  await knex.raw("ALTER TABLE missions DROP COLUMN IF EXISTS reward_scope")
}
