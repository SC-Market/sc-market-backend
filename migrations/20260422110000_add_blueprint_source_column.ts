import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS source varchar(50)")
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("blueprints", (table) => {
    table.dropColumn("source")
  })
}
