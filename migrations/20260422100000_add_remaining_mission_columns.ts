import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.jsonb("destinations").nullable()
    table.jsonb("item_rewards").nullable()
    table.jsonb("token_substitutions").nullable()
    table.float("time_to_complete").nullable()
    table.integer("max_players_per_instance").nullable()
    table.boolean("is_intro").defaultTo(false)
    table.jsonb("linked_intros").nullable()
    table.integer("buy_in").nullable()
    table.integer("reputation_reward").nullable()
    table.string("reward_scope", 200).nullable()
  })
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
