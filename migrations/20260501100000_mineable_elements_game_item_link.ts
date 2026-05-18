import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mineable_elements", (table) => {
    table.uuid("game_item_id").nullable()
    table.string("display_name", 200).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("mineable_elements", (table) => {
    table.dropColumn("game_item_id")
    table.dropColumn("display_name")
  })
}
