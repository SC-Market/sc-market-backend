import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Slot-level quality modifiers: how ingredient quality affects output stats
  await knex.schema.createTable("blueprint_slot_modifiers", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("blueprint_id").notNullable().references("blueprint_id").inTable("blueprints").onDelete("CASCADE")
    table.string("slot_name", 200).notNullable() // e.g. "Armored Carapace", "Insulative Liner"
    table.string("slot_display_name", 200) // localized name
    table.string("property", 200).notNullable() // e.g. "damagemitigation", "mintemp", "maxtemp"
    table.integer("start_quality").notNullable() // e.g. 0
    table.integer("end_quality").notNullable() // e.g. 1000
    table.decimal("modifier_at_start", 10, 6).notNullable() // e.g. 0.9
    table.decimal("modifier_at_end", 10, 6).notNullable() // e.g. 1.1
    table.integer("base_quality").defaultTo(500) // midpoint quality
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
  })

  // Also add slot_name and min_quality to blueprint_ingredients for linking
  await knex.schema.alterTable("blueprint_ingredients", (table) => {
    table.string("slot_name", 200).nullable()
    table.string("slot_display_name", 200).nullable()
    table.decimal("quantity_scu", 10, 4).nullable() // SCU quantity (more precise than integer)
    table.integer("min_quality").nullable() // 0-1000 quality requirement
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("blueprint_ingredients", (table) => {
    table.dropColumn("slot_name")
    table.dropColumn("slot_display_name")
    table.dropColumn("quantity_scu")
    table.dropColumn("min_quality")
  })
  await knex.schema.dropTableIfExists("blueprint_slot_modifiers")
}
