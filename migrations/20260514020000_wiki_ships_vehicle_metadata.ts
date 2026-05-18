import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wiki_ships", (table) => {
    table.integer("crew_size")
    table.string("career", 100)
    table.string("role", 100)
    table.decimal("length_m", 10, 2)
    table.decimal("width_m", 10, 2)
    table.decimal("height_m", 10, 2)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wiki_ships", (table) => {
    table.dropColumn("crew_size")
    table.dropColumn("career")
    table.dropColumn("role")
    table.dropColumn("length_m")
    table.dropColumn("width_m")
    table.dropColumn("height_m")
  })
}
