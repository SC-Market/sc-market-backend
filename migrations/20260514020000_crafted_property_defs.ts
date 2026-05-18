import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("crafted_property_defs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("property_key", 100).notNullable().unique()
    table.string("display_name", 200)
    table.string("display_mode", 50).notNullable().defaultTo("raw")
    table.decimal("scale_factor", 12, 6)
    table.string("unit_label", 100)
    table.timestamp("created_at").defaultTo(knex.fn.now())
    table.timestamp("updated_at").defaultTo(knex.fn.now())
  })

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_crafted_property_defs_key ON crafted_property_defs(property_key)",
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("crafted_property_defs")
}
