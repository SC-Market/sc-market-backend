import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("wiki_commodities", (table) => {
    table.uuid("commodity_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("game_item_id").nullable().references("id").inTable("game_items")
    table.string("p4k_id", 100).notNullable()
    table.string("name", 200).notNullable()
    table.string("group_name", 100)
    table.string("group_key", 100)
    table.string("parent_group", 100)
    table.float("density")
    table.string("description", 500)
    table.unique("p4k_id")
    table.index("group_name")
    table.index("game_item_id")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("wiki_commodities")
}
