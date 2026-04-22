import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.boolean("hide_in_mobiglas").defaultTo(false)
    table.string("min_standing_name", 200).nullable()
    table.integer("min_standing_xp").nullable()
    table.string("max_standing_name", 200).nullable()
    table.integer("max_standing_xp").nullable()
    table.integer("reputation_reward_amount").nullable()
    table.string("reputation_reward_scope", 200).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.dropColumn("hide_in_mobiglas")
    table.dropColumn("min_standing_name")
    table.dropColumn("min_standing_xp")
    table.dropColumn("max_standing_name")
    table.dropColumn("max_standing_xp")
    table.dropColumn("reputation_reward_amount")
    table.dropColumn("reputation_reward_scope")
  })
}
