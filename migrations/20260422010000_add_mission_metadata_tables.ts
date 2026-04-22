import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Add simple columns to missions table
  await knex.schema.alterTable("missions", (table) => {
    table.boolean("is_illegal").nullable()
    table.boolean("is_lawful").nullable()
    table.integer("difficulty_from_broker").nullable()
    table.string("star_system_derived", 50).nullable()
  })

  // Ship encounters (waves of enemy/friendly ships during mission)
  await knex.schema.createTable("mission_ship_encounters", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("mission_id").notNullable().references("mission_id").inTable("missions").onDelete("CASCADE")
    table.string("role", 200).notNullable() // e.g. "Enemy Ships", "ShipToDefend", "SalvageableShip"
    table.jsonb("waves").notNullable() // [{name, shipCount}]
    table.unique(["mission_id", "role"])
  })

  // NPC encounters (ground combat squads)
  await knex.schema.createTable("mission_npc_encounters", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("mission_id").notNullable().references("mission_id").inTable("missions").onDelete("CASCADE")
    table.string("name", 200).notNullable() // e.g. "Squad F - Juggernaut x 3"
    table.integer("count").notNullable()
    table.unique(["mission_id", "name"])
  })

  // Hauling orders (cargo to transport)
  await knex.schema.createTable("mission_hauling_orders", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("mission_id").notNullable().references("mission_id").inTable("missions").onDelete("CASCADE")
    table.string("resource_name", 200).notNullable()
    table.integer("min_scu").notNullable()
    table.integer("max_scu").notNullable()
    table.unique(["mission_id", "resource_name"])
  })

  // Entity spawns (salvage targets, creatures, objects)
  await knex.schema.createTable("mission_entity_spawns", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("mission_id").notNullable().references("mission_id").inTable("missions").onDelete("CASCADE")
    table.string("name", 200).notNullable()
    table.integer("count").notNullable()
    table.unique(["mission_id", "name"])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("mission_entity_spawns")
  await knex.schema.dropTableIfExists("mission_hauling_orders")
  await knex.schema.dropTableIfExists("mission_npc_encounters")
  await knex.schema.dropTableIfExists("mission_ship_encounters")
  await knex.schema.alterTable("missions", (table) => {
    table.dropColumn("is_illegal")
    table.dropColumn("is_lawful")
    table.dropColumn("difficulty_from_broker")
    table.dropColumn("star_system_derived")
  })
}
