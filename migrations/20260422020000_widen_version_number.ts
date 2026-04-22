import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("game_versions", (table) => {
    table.string("version_number", 200).alter()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("game_versions", (table) => {
    table.string("version_number", 50).alter()
  })
}
