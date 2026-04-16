import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create trigger function to record price history on listing creation
  await knex.raw(`
    CREATE OR REPLACE FUNCTION record_listing_price_history()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Record prices for all variants in the listing
      INSERT INTO price_history_v2 (game_item_id, variant_id, price, quality_tier, source, source_id)
      SELECT 
        li.game_item_id,
        lil.variant_id,
        COALESCE(vp.price, li.base_price) as price,
        (iv.attributes->>'quality_tier')::integer as quality_tier,
        'listing_created' as source,
        NEW.listing_id as source_id
      FROM listing_items li
      JOIN listing_item_lots lil ON li.item_id = lil.item_id
      JOIN item_variants iv ON lil.variant_id = iv.variant_id
      LEFT JOIN variant_pricing vp ON li.item_id = vp.item_id AND lil.variant_id = vp.variant_id
      WHERE li.listing_id = NEW.listing_id AND lil.listed = true;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  // Create trigger on listings table for INSERT
  await knex.raw(`
    CREATE TRIGGER trg_listing_price_history
    AFTER INSERT ON listings
    FOR EACH ROW
    EXECUTE FUNCTION record_listing_price_history();
  `)

  // Create trigger function to record price history on order completion
  await knex.raw(`
    CREATE OR REPLACE FUNCTION record_order_price_history()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Only record when order status changes to completed
      IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        INSERT INTO price_history_v2 (game_item_id, variant_id, price, quality_tier, source, source_id)
        SELECT 
          li.game_item_id,
          omi.variant_id,
          omi.price_per_unit,
          (iv.attributes->>'quality_tier')::integer as quality_tier,
          'order_completed' as source,
          NEW.order_id as source_id
        FROM order_market_items_v2 omi
        JOIN listing_items li ON omi.item_id = li.item_id
        JOIN item_variants iv ON omi.variant_id = iv.variant_id
        WHERE omi.order_id = NEW.order_id;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  // Create trigger on orders table for UPDATE
  await knex.raw(`
    CREATE TRIGGER trg_order_price_history
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION record_order_price_history();
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw("DROP TRIGGER IF EXISTS trg_listing_price_history ON listings")
  await knex.raw("DROP TRIGGER IF EXISTS trg_order_price_history ON orders")

  // Drop trigger functions
  await knex.raw("DROP FUNCTION IF EXISTS record_listing_price_history()")
  await knex.raw("DROP FUNCTION IF EXISTS record_order_price_history()")
}
