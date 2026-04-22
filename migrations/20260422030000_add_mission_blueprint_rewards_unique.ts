import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mission_blueprint_rewards", (table) => {
    table.unique(["mission_id", "blueprint_id"])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mission_blueprint_rewards", (table) => {
    table.dropUnique(["mission_id", "blueprint_id"])
  })
}
