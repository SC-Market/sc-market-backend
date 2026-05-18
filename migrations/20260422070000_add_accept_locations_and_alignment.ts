import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.jsonb("accept_locations").nullable()
  })
  await knex.schema.alterTable("mission_ship_encounters", (table) => {
    table.string("alignment", 20).defaultTo("neutral") // hostile | friendly | neutral
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mission_ship_encounters", (table) => {
    table.dropColumn("alignment")
  })
  await knex.schema.alterTable("missions", (table) => {
    table.dropColumn("accept_locations")
  })
}
