import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // OFFER_MARKET_ITEMS_V2 TABLE
  // ============================================================================
  // Links V1 offers to V2 listings with variant information.
  // When a buyer creates an offer on a V2 listing, this records which variant
  // they selected. On offer acceptance, initiateOrder() copies these rows
  // into order_market_items_v2.
  await knex.schema.createTable("offer_market_items_v2", (table) => {
    table
      .uuid("offer_item_id")
      .primary()
      .defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("offer_id").notNullable()
    table.uuid("listing_id").notNullable()
    table.uuid("variant_id").notNullable()
    table.integer("quantity").notNullable()
    table.bigInteger("price_per_unit").notNullable()
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())

    // Foreign keys to V2 tables
    table
      .foreign("listing_id")
      .references("listing_id")
      .inTable("listings")
    table
      .foreign("variant_id")
      .references("variant_id")
      .inTable("item_variants")

    // Note: offer_id references V1 offer_sessions.id (not created here)

    table.check("quantity > 0", [], "chk_offer_market_items_v2_quantity")
    table.check(
      "price_per_unit >= 0",
      [],
      "chk_offer_market_items_v2_price",
    )

    table.index(["offer_id"], "idx_offer_market_items_v2_offer")
    table.index(["listing_id"], "idx_offer_market_items_v2_listing")
    table.index(["variant_id"], "idx_offer_market_items_v2_variant")
  })

  await knex.raw(`
    COMMENT ON TABLE offer_market_items_v2 IS 'JOIN TABLE linking V1 offers to V2 listings with variant tracking'
  `)

  // ============================================================================
  // STOCK_ALLOCATION_LOG TABLE
  // ============================================================================
  await knex.schema.createTable("stock_allocation_log", (table) => {
    table
      .uuid("allocation_id")
      .primary()
      .defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("order_id").notNullable()
    table.uuid("lot_id").notNullable()
    table.integer("quantity_allocated").notNullable()
    table.uuid("allocated_by")
    table.timestamp("allocated_at").notNullable().defaultTo(knex.fn.now())

    table
      .foreign("lot_id")
      .references("lot_id")
      .inTable("listing_item_lots")

    table.index(["order_id"], "idx_allocation_log_order")
    table.index(["lot_id"], "idx_allocation_log_lot")
    table.index(["allocated_at"], "idx_allocation_log_time")
  })

  await knex.raw(`
    COMMENT ON TABLE stock_allocation_log IS 'Audit trail for stock allocations to orders'
  `)

  // ============================================================================
  // PRICE HISTORY TRIGGERS
  // ============================================================================
  // Record price history when listings are created or prices updated
  await knex.raw(`
    CREATE OR REPLACE FUNCTION record_listing_price_history()
    RETURNS TRIGGER AS $$
    DECLARE
      v_game_item_id UUID;
      v_variant RECORD;
      v_price BIGINT;
      v_event TEXT;
    BEGIN
      -- Determine event type
      IF TG_OP = 'INSERT' THEN
        v_event := 'listing_created';
      ELSE
        v_event := 'price_updated';
      END IF;

      -- Get game_item_id from listing_items
      SELECT game_item_id INTO v_game_item_id
      FROM listing_items
      WHERE item_id = NEW.item_id
      LIMIT 1;

      IF v_game_item_id IS NULL THEN
        RETURN NEW;
      END IF;

      -- Record price for this variant
      INSERT INTO price_history_v2 (game_item_id, variant_id, price, quality_tier, listing_id, event_type)
      SELECT
        v_game_item_id,
        NEW.variant_id,
        NEW.price,
        COALESCE((iv.attributes->>'quality_tier')::integer, 1),
        (SELECT listing_id FROM listing_items WHERE item_id = NEW.item_id LIMIT 1),
        v_event
      FROM item_variants iv
      WHERE iv.variant_id = NEW.variant_id;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  await knex.raw(`
    CREATE TRIGGER trg_listing_price_history
    AFTER INSERT OR UPDATE OF price ON variant_pricing
    FOR EACH ROW
    EXECUTE FUNCTION record_listing_price_history();
  `)

  // Record price history when orders are completed (sale_completed event)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION record_order_price_history()
    RETURNS TRIGGER AS $$
    DECLARE
      v_item RECORD;
    BEGIN
      -- Only fire on status change to fulfilled
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

  await knex.raw(`
    CREATE TRIGGER trg_order_price_history
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION record_order_price_history();
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "DROP TRIGGER IF EXISTS trg_order_price_history ON orders",
  )
  await knex.raw(
    "DROP TRIGGER IF EXISTS trg_listing_price_history ON variant_pricing",
  )
  await knex.raw("DROP FUNCTION IF EXISTS record_order_price_history()")
  await knex.raw("DROP FUNCTION IF EXISTS record_listing_price_history()")
  await knex.schema.dropTableIfExists("stock_allocation_log")
  await knex.schema.dropTableIfExists("offer_market_items_v2")
}
