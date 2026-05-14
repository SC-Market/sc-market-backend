import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("blueprint_slot_modifiers", (table) => {
    table.string("modifier_type", 50).notNullable().defaultTo("linear")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("blueprint_slot_modifiers", (table) => {
    table.dropColumn("modifier_type")
  })
}
