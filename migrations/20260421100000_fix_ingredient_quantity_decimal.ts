import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("blueprint_ingredients", (table) => {
    table.decimal("quantity_required", 10, 4).notNullable().alter()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("blueprint_ingredients", (table) => {
    table.integer("quantity_required").notNullable().alter()
  })
}
