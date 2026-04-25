import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Listing mapping: V1 listing_id → V2 listing_id
  await knex.schema.createTable("v1_v2_listing_map", (table) => {
    table.uuid("v1_listing_id").notNullable()
    table.uuid("v2_listing_id").notNullable()
    table.string("v1_listing_type", 30).notNullable() // 'unique', 'aggregate', 'multiple'
    table.timestamp("migrated_at").notNullable().defaultTo(knex.fn.now())

    table.primary(["v1_listing_id"])
    table.unique(["v2_listing_id"])
    table.foreign("v2_listing_id").references("listing_id").inTable("listings").onDelete("CASCADE")
    table.index(["v1_listing_type"], "idx_listing_map_type")
  })

  // Stock lot mapping: V1 stock_lots.lot_id → V2 listing_item_lots.lot_id
  await knex.schema.createTable("v1_v2_stock_lot_map", (table) => {
    table.uuid("v1_lot_id").notNullable()
    table.uuid("v2_lot_id").notNullable()
    table.uuid("v1_listing_id").notNullable() // for cross-referencing
    table.timestamp("migrated_at").notNullable().defaultTo(knex.fn.now())

    table.primary(["v1_lot_id"])
    table.unique(["v2_lot_id"])
    table.foreign("v2_lot_id").references("lot_id").inTable("listing_item_lots").onDelete("CASCADE")
    table.index(["v1_listing_id"], "idx_stock_lot_map_listing")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("v1_v2_stock_lot_map")
  await knex.schema.dropTableIfExists("v1_v2_listing_map")
}
