import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("loot_tables", (table) => {
    table.uuid("loot_table_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("name", 200).notNullable().unique()
    table.jsonb("entries").notNullable()
  })

  await knex.schema.createTable("rock_compositions", (table) => {
    table.uuid("composition_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("name", 200).notNullable().unique()
    table.string("deposit_name", 200)
    table.integer("min_distinct_elements")
    table.jsonb("elements").notNullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("rock_compositions")
  await knex.schema.dropTableIfExists("loot_tables")
}
