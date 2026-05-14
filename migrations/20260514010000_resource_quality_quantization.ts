import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("resources", (table) => {
    table.jsonb("quality_bands").nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("resources", (table) => {
    table.dropColumn("quality_bands")
  })
}
