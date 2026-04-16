import type { Knex } from "knex";

/**
 * Drop all Market V2 data tables.
 *
 * Removes tables, views, triggers, functions, and indexes created by
 * the previous V2 market data migrations. Feature flag tables
 * (user_preferences, feature_flag_config) are NOT touched.
 *
 * Drop order: triggers/functions → views → leaf tables → root tables.
 */
export async function up(knex: Knex): Promise<void> {
  // Triggers on V1 tables
  await knex.raw("DROP TRIGGER IF EXISTS trg_order_price_history ON orders");

  // Materialized view triggers/functions
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution_lots ON listing_item_lots");
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution ON listings");
  await knex.raw("DROP FUNCTION IF EXISTS refresh_quality_distribution()");
  await knex.raw("DROP MATERIALIZED VIEW IF EXISTS quality_distribution_mv");

  // Price history triggers/functions
  await knex.raw("DROP TRIGGER IF EXISTS trg_listing_price_history ON listings");
  await knex.raw("DROP FUNCTION IF EXISTS record_order_price_history()");
  await knex.raw("DROP FUNCTION IF EXISTS record_listing_price_history()");

  // Search view + indexes on V1/V2 tables
  await knex.raw("DROP VIEW IF EXISTS listing_search");
  await knex.raw("DROP INDEX IF EXISTS idx_listings_search_vector");
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_search_vector");
  await knex.raw("DROP INDEX IF EXISTS idx_listings_created_at_desc");

  // Quantity trigger/function
  await knex.raw("DROP TRIGGER IF EXISTS trg_listing_item_lots_quantity ON listing_item_lots");
  await knex.raw("DROP FUNCTION IF EXISTS update_quantity_available()");

  // Revert V1 orders columns (added by cart_feature_parity, partially reverted)
  const hasOfferAmount = await knex.schema.hasColumn("orders", "offer_amount");
  if (hasOfferAmount) {
    await knex.schema.alterTable("orders", (t) => {
      t.dropColumn("offer_amount");
      t.dropColumn("buyer_note");
      t.dropColumn("discord_invite");
      t.dropColumn("session_id");
    });
  }

  // Leaf tables
  await knex.schema.dropTableIfExists("offer_market_items_v2");
  await knex.schema.dropTableIfExists("order_market_items_v2");
  await knex.schema.dropTableIfExists("cart_items_v2");
  await knex.schema.dropTableIfExists("buy_orders_v2");
  await knex.schema.dropTableIfExists("price_history_v2");
  await knex.schema.dropTableIfExists("variant_pricing");
  await knex.schema.dropTableIfExists("listing_item_lots");

  // Mid-level tables
  await knex.schema.dropTableIfExists("item_variants");
  await knex.schema.dropTableIfExists("listing_items");

  // Root tables
  await knex.schema.dropTableIfExists("listings");
  await knex.schema.dropTableIfExists("variant_types");
}

export async function down(_knex: Knex): Promise<void> {
  throw new Error(
    "Cannot reverse automatically. Re-create the V2 market data migrations."
  );
}
