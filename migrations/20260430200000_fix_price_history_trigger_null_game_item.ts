import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION record_order_price_history()
    RETURNS TRIGGER AS $$
    DECLARE
      v_item RECORD;
    BEGIN
      IF NEW.status = 'fulfilled' AND (OLD.status IS NULL OR OLD.status != 'fulfilled') THEN
        FOR v_item IN
          SELECT
            omi.variant_id,
            omi.price_per_unit,
            omi.listing_id,
            li.game_item_id,
            COALESCE((iv.attributes->>'quality_tier')::integer, 1) AS quality_tier
          FROM order_market_items_v2 omi
          JOIN listing_items li ON omi.item_id = li.item_id
          JOIN item_variants iv ON omi.variant_id = iv.variant_id
          WHERE omi.order_id = NEW.order_id
            AND li.game_item_id IS NOT NULL
        LOOP
          INSERT INTO price_history_v2 (game_item_id, variant_id, price, quality_tier, listing_id, event_type)
          VALUES (v_item.game_item_id, v_item.variant_id, v_item.price_per_unit, v_item.quality_tier, v_item.listing_id, 'sale_completed');
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Revert to version without NULL check
  await knex.raw(`
    CREATE OR REPLACE FUNCTION record_order_price_history()
    RETURNS TRIGGER AS $$
    DECLARE
      v_item RECORD;
    BEGIN
      IF NEW.status = 'fulfilled' AND (OLD.status IS NULL OR OLD.status != 'fulfilled') THEN
        FOR v_item IN
          SELECT
            omi.variant_id,
            omi.price_per_unit,
            omi.listing_id,
            li.game_item_id,
            COALESCE((iv.attributes->>'quality_tier')::integer, 1) AS quality_tier
          FROM order_market_items_v2 omi
          JOIN listing_items li ON omi.item_id = li.item_id
          JOIN item_variants iv ON omi.variant_id = iv.variant_id
          WHERE omi.order_id = NEW.order_id
        LOOP
          INSERT INTO price_history_v2 (game_item_id, variant_id, price, quality_tier, listing_id, event_type)
          VALUES (v_item.game_item_id, v_item.variant_id, v_item.price_per_unit, v_item.quality_tier, v_item.listing_id, 'sale_completed');
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)
}
