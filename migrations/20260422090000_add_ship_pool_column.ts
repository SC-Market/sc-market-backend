import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mission_ship_encounters", (table) => {
    table.jsonb("ship_pool").nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mission_ship_encounters", (table) => {
    table.dropColumn("ship_pool")
  })
}
