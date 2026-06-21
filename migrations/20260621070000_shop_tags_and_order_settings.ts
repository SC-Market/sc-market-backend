import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Add tags to shops (array column for simple category tags)
  await knex.schema.alterTable("shops", (table) => {
    table.specificType("tags", "TEXT[]").defaultTo(knex.raw("ARRAY[]::TEXT[]"))
  })

  // Add shop_id to order_settings for shop-scoped settings
  await knex.schema.alterTable("order_settings", (table) => {
    table.uuid("shop_id").nullable().references("shop_id").inTable("shops").onDelete("CASCADE")
  })

  // Backfill order_settings: link existing settings to their entity's shop
  // Contractor settings → contractor's shop
  await knex.raw(`
    UPDATE order_settings os
    SET shop_id = s.shop_id
    FROM shops s
    WHERE os.entity_type = 'contractor'
      AND s.owner_contractor_id = os.entity_id
      AND os.shop_id IS NULL
  `)

  // User settings → user's shop
  await knex.raw(`
    UPDATE order_settings os
    SET shop_id = s.shop_id
    FROM shops s
    WHERE os.entity_type = 'user'
      AND s.owner_user_id = os.entity_id
      AND os.shop_id IS NULL
  `)

  // Add accepts_custom_orders flag to shops
  await knex.schema.alterTable("shops", (table) => {
    table.boolean("accepts_custom_orders").notNullable().defaultTo(false)
  })

  await knex.raw(`CREATE INDEX idx_shops_tags ON shops USING GIN(tags)`)
  await knex.raw(`CREATE INDEX idx_order_settings_shop ON order_settings(shop_id) WHERE shop_id IS NOT NULL`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_order_settings_shop`)
  await knex.raw(`DROP INDEX IF EXISTS idx_shops_tags`)

  await knex.schema.alterTable("shops", (table) => {
    table.dropColumn("accepts_custom_orders")
  })

  await knex.schema.alterTable("order_settings", (table) => {
    table.dropColumn("shop_id")
  })

  await knex.schema.alterTable("shops", (table) => {
    table.dropColumn("tags")
  })
}
