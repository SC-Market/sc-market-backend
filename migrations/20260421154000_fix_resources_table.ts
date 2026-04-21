import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("wiki_commodities")

  await knex.schema.alterTable("resources", (table) => {
    table.string("p4k_id", 100).nullable()
    table.string("resource_name", 200).nullable()
    table.string("group_name", 100).nullable()
    table.float("density").nullable()
    table.text("description").nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("resources", (table) => {
    table.dropColumn("p4k_id")
    table.dropColumn("resource_name")
    table.dropColumn("group_name")
    table.dropColumn("density")
    table.dropColumn("description")
  })
}
