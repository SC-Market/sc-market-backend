import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("starmap_amenity_types", (table) => {
    table.uuid("amenity_type_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("p4k_id").notNullable().unique()
    table.string("name", 100).notNullable()
    table.string("display_name", 200)
    table.string("icon_path", 500)
  })

  await knex.schema.createTable("jurisdictions", (table) => {
    table.uuid("jurisdiction_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("code", 100).notNullable().unique()
    table.string("name", 200).notNullable()
    table.string("logo_path", 500)
    table.string("parent_jurisdiction_code", 100)
    table.integer("base_fine").defaultTo(0)
    table.boolean("is_prison").defaultTo(false)
    table.decimal("max_stolen_goods_scu", 10, 4)
  })

  await knex.schema.createTable("jurisdiction_prohibited_goods", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("jurisdiction_code", 100).notNullable().references("code").inTable("jurisdictions").onDelete("CASCADE")
    table.string("commodity_name", 200).notNullable()
    table.string("substance_class", 10)
    table.decimal("max_possession_scu", 10, 4)
  })

  // Alter existing starmap_locations table — add new columns
  await knex.schema.alterTable("starmap_locations", (table) => {
    table.uuid("p4k_id").nullable().unique()
    table.string("name_key", 500).nullable()
    table.string("nav_icon", 50).nullable()
    table.string("jurisdiction_code", 100).nullable()
    table.string("respawn_type", 50).nullable()
    table.boolean("is_visible").defaultTo(true)
    table.string("file_name", 200).nullable()
    table.decimal("qt_arrival_radius", 16, 2).nullable()
    table.decimal("qt_obstruction_radius", 16, 2).nullable()
  })

  await knex.schema.createTable("location_amenities", (table) => {
    table.uuid("location_id").notNullable().references("location_id").inTable("starmap_locations").onDelete("CASCADE")
    table.uuid("amenity_p4k_id").notNullable()
    table.primary(["location_id", "amenity_p4k_id"])
  })

  await knex.schema.createTable("mineable_elements", (table) => {
    table.uuid("element_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("name", 200).notNullable().unique()
    table.string("resource_name", 200)
    table.decimal("instability", 12, 4)
    table.decimal("resistance", 12, 4)
    table.decimal("optimal_window_midpoint", 12, 4)
    table.decimal("optimal_window_midpoint_randomness", 12, 4)
    table.decimal("optimal_window_thinness", 12, 4)
    table.decimal("explosion_multiplier", 12, 4)
    table.decimal("cluster_factor", 12, 4)
  })

  await knex.schema.createTable("location_mining_spawns", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("location_name", 200).notNullable()
    table.string("system", 50).notNullable()
    table.string("location_type", 50).notNullable()
    table.string("group_name", 100).notNullable()
    table.decimal("group_probability", 12, 6).notNullable()
    table.string("preset_name", 200).notNullable()
    table.decimal("relative_probability", 12, 4).notNullable()
    table.unique(["location_name", "group_name", "preset_name"])
  })

  await knex.schema.createTable("mining_quality_distributions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("name", 200).notNullable()
    table.string("mining_type", 50).notNullable()
    table.string("rarity", 50)
    table.boolean("is_location_override").defaultTo(false)
    table.string("location_ref", 500)
    table.integer("dist_min")
    table.integer("dist_max")
    table.decimal("dist_mean", 12, 4)
    table.decimal("dist_stddev", 12, 4)
  })

  // Indexes
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_starmap_locations_p4k_id ON starmap_locations(p4k_id) WHERE p4k_id IS NOT NULL")
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_starmap_locations_jurisdiction_code ON starmap_locations(jurisdiction_code) WHERE jurisdiction_code IS NOT NULL")
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_location_mining_spawns_location ON location_mining_spawns(location_name)")
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_location_mining_spawns_preset ON location_mining_spawns(preset_name)")
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_jurisdiction_prohibited_goods_jur ON jurisdiction_prohibited_goods(jurisdiction_code)")
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("mining_quality_distributions")
  await knex.schema.dropTableIfExists("location_mining_spawns")
  await knex.schema.dropTableIfExists("mineable_elements")
  await knex.schema.dropTableIfExists("location_amenities")
  await knex.schema.dropTableIfExists("jurisdiction_prohibited_goods")
  await knex.schema.dropTableIfExists("jurisdictions")
  await knex.schema.dropTableIfExists("starmap_amenity_types")

  // Remove added columns from starmap_locations (keep original table intact)
  await knex.schema.alterTable("starmap_locations", (table) => {
    table.dropColumn("p4k_id")
    table.dropColumn("name_key")
    table.dropColumn("nav_icon")
    table.dropColumn("jurisdiction_code")
    table.dropColumn("respawn_type")
    table.dropColumn("is_visible")
    table.dropColumn("file_name")
    table.dropColumn("qt_arrival_radius")
    table.dropColumn("qt_obstruction_radius")
  })
}
