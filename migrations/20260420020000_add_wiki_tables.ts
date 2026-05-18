import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Blueprint reward pools (mission → blueprint drop tables)
  await knex.schema.createTable("blueprint_reward_pools", (table) => {
    table.uuid("pool_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("version_id").notNullable().references("version_id").inTable("game_versions")
    table.string("pool_code", 200).notNullable()
    table.timestamp("updated_at").defaultTo(knex.fn.now())
    table.unique(["version_id", "pool_code"])
  })

  await knex.schema.createTable("blueprint_reward_pool_entries", (table) => {
    table.uuid("entry_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("pool_id").notNullable().references("pool_id").inTable("blueprint_reward_pools").onDelete("CASCADE")
    table.uuid("blueprint_id").notNullable().references("blueprint_id").inTable("blueprints").onDelete("CASCADE")
    table.float("weight").notNullable().defaultTo(1)
    table.index("pool_id")
  })

  // Refining processes
  await knex.schema.createTable("refining_processes", (table) => {
    table.uuid("process_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("name", 100).notNullable()
    table.string("speed", 20).notNullable()
    table.string("quality", 20).notNullable()
    table.unique(["speed", "quality"])
  })

  // Starmap locations
  await knex.schema.createTable("starmap_locations", (table) => {
    table.uuid("location_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("version_id").notNullable().references("version_id").inTable("game_versions")
    table.string("location_code", 200).notNullable()
    table.string("location_name", 200).notNullable()
    table.string("location_type", 50)
    table.string("parent_code", 200)
    table.string("jurisdiction", 200)
    table.text("description")
    table.float("size")
    table.timestamp("updated_at").defaultTo(knex.fn.now())
    table.unique(["version_id", "location_code"])
    table.index("location_type")
    table.index("parent_code")
  })

  // Manufacturers
  await knex.schema.createTable("wiki_manufacturers", (table) => {
    table.uuid("manufacturer_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("code", 50).notNullable().unique()
    table.string("name", 200).notNullable()
    table.text("description")
    table.string("name_key", 200)
  })

  // Ships/vehicles
  await knex.schema.createTable("wiki_ships", (table) => {
    table.uuid("ship_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("version_id").notNullable().references("version_id").inTable("game_versions")
    table.string("ship_code", 200).notNullable()
    table.string("name", 200).notNullable()
    table.string("focus", 100)
    table.string("manufacturer_code", 50)
    table.integer("size")
    table.text("description")
    table.unique(["version_id", "ship_code"])
    table.index("manufacturer_code")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("wiki_ships")
  await knex.schema.dropTableIfExists("wiki_manufacturers")
  await knex.schema.dropTableIfExists("starmap_locations")
  await knex.schema.dropTableIfExists("refining_processes")
  await knex.schema.dropTableIfExists("blueprint_reward_pool_entries")
  await knex.schema.dropTableIfExists("blueprint_reward_pools")
}
