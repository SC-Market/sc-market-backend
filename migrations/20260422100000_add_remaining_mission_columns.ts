import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Use raw SQL with IF NOT EXISTS to handle columns that may already exist
  const cols = [
    ["destinations", "jsonb"],
    ["item_rewards", "jsonb"],
    ["token_substitutions", "jsonb"],
    ["time_to_complete", "real"],
    ["max_players_per_instance", "integer"],
    ["is_intro", "boolean DEFAULT false"],
    ["linked_intros", "jsonb"],
    ["buy_in", "integer"],
    ["reputation_reward", "integer"],
    ["reward_scope", "varchar(200)"],
  ]
  for (const [col, type] of cols) {
    await knex.raw(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.dropColumn("destinations")
    table.dropColumn("item_rewards")
    table.dropColumn("token_substitutions")
    table.dropColumn("time_to_complete")
    table.dropColumn("max_players_per_instance")
    table.dropColumn("is_intro")
    table.dropColumn("linked_intros")
    table.dropColumn("buy_in")
    table.dropColumn("reputation_reward")
    table.dropColumn("reward_scope")
  })
}
