import type { Knex } from "knex"

/**
 * Shop Inventories Schema
 *
 * Adds in-game NPC shop data extracted from Star Citizen's Data.p4k.
 * These are distinct from player-owned marketplace shops (the existing `shops` concept).
 *
 * Tables:
 * - game_shops: In-game NPC shops (87 shops across various locations)
 * - game_shop_items: Items sold/bought at each shop with prices (6,314 entries)
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // GAME_SHOPS TABLE
  // ============================================================================
  await knex.schema.createTable("game_shops", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("name", 200).notNullable()
    table.string("location", 200).notNullable()
    table.string("filename", 300).nullable()
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())

    table.unique(["name", "location"])
  })

  await knex.raw(`
    CREATE INDEX idx_game_shops_location ON game_shops(location)
  `)

  await knex.raw(`
    CREATE INDEX idx_game_shops_name_fts ON game_shops USING GIN (to_tsvector('english', name))
  `)

  await knex.raw(`
    COMMENT ON TABLE game_shops IS 'In-game NPC shops from Data.p4k extraction'
  `)

  // ============================================================================
  // GAME_SHOP_ITEMS TABLE
  // ============================================================================
  await knex.schema.createTable("game_shop_items", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("shop_id").notNullable().references("id").inTable("game_shops").onDelete("CASCADE")
    table.uuid("game_item_id").nullable().references("id").inTable("game_items").onDelete("SET NULL")
    table.string("item_uuid", 100).notNullable()
    table.string("item_name", 300).nullable()
    table.string("item_type", 100).nullable()
    table.string("item_sub_type", 100).nullable()
    table.decimal("buy_price", 14, 2).nullable()
    table.decimal("sell_price", 14, 2).nullable()
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())

    table.unique(["shop_id", "item_uuid"])
  })

  await knex.schema.alterTable("game_shop_items", (table) => {
    table.index(["shop_id"], "idx_game_shop_items_shop")
    table.index(["game_item_id"], "idx_game_shop_items_game_item")
    table.index(["item_uuid"], "idx_game_shop_items_item_uuid")
  })

  await knex.raw(`
    CREATE INDEX idx_game_shop_items_buy_price ON game_shop_items(buy_price) WHERE buy_price > 0
  `)

  await knex.raw(`
    CREATE INDEX idx_game_shop_items_sell_price ON game_shop_items(sell_price) WHERE sell_price > 0
  `)

  await knex.raw(`
    COMMENT ON TABLE game_shop_items IS 'Items available at in-game NPC shops with buy/sell prices';
    COMMENT ON COLUMN game_shop_items.item_uuid IS 'UUID from Data.p4k item entry, matches game_items.p4k_id when linked';
    COMMENT ON COLUMN game_shop_items.buy_price IS 'Price to buy from shop (0 or null means not for sale)';
    COMMENT ON COLUMN game_shop_items.sell_price IS 'Price the shop pays when you sell to it (0 or null means cannot sell here)';
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("game_shop_items")
  await knex.schema.dropTableIfExists("game_shops")
}
