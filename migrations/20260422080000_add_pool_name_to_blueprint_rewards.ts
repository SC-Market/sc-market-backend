import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mission_blueprint_rewards", (table) => {
    table.string("pool_name", 200).nullable()
    table.decimal("pool_chance", 5, 2).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mission_blueprint_rewards", (table) => {
    table.dropColumn("pool_name")
    table.dropColumn("pool_chance")
  })
}
