import type { Knex } from "knex";

/**
 * Market V2 Fresh Schema
 *
 * Drops all existing V2 data tables (idempotent) then creates them fresh.
 * Does NOT touch V1 tables or feature flag tables (user_preferences, feature_flag_config).
 */
export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // DROP EXISTING V2 OBJECTS (idempotent)
  // ============================================================================
  await knex.raw("DROP TRIGGER IF EXISTS trg_order_price_history ON orders");
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution_lots ON listing_item_lots");
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution ON listings");
  await knex.raw("DROP FUNCTION IF EXISTS refresh_quality_distribution()");
  await knex.raw("DROP MATERIALIZED VIEW IF EXISTS quality_distribution_mv");
  await knex.raw("DROP TRIGGER IF EXISTS trg_listing_price_history ON listings");
  await knex.raw("DROP FUNCTION IF EXISTS record_order_price_history()");
  await knex.raw("DROP FUNCTION IF EXISTS record_listing_price_history()");
  await knex.raw("DROP VIEW IF EXISTS listing_search");
  await knex.raw("DROP INDEX IF EXISTS idx_listings_search_vector");
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_search_vector");
  await knex.raw("DROP INDEX IF EXISTS idx_listings_created_at_desc");
  await knex.raw("DROP TRIGGER IF EXISTS trg_listing_item_lots_quantity ON listing_item_lots");
  await knex.raw("DROP FUNCTION IF EXISTS update_quantity_available()");
  await knex.schema.dropTableIfExists("offer_market_items_v2");
  await knex.schema.dropTableIfExists("order_market_items_v2");
  await knex.schema.dropTableIfExists("cart_items_v2");
  await knex.schema.dropTableIfExists("buy_orders_v2");
  await knex.schema.dropTableIfExists("price_history_v2");
  await knex.schema.dropTableIfExists("variant_pricing");
  await knex.schema.dropTableIfExists("listing_item_lots");
  await knex.schema.dropTableIfExists("item_variants");
  await knex.schema.dropTableIfExists("listing_items");
  await knex.schema.dropTableIfExists("listings");
  await knex.schema.dropTableIfExists("variant_types");

  // Also revert any V1 orders columns from old migrations
  const hasOfferAmount = await knex.schema.hasColumn("orders", "offer_amount");
  if (hasOfferAmount) {
    await knex.schema.alterTable("orders", (t) => {
      t.dropColumn("offer_amount");
      t.dropColumn("buyer_note");
      t.dropColumn("discord_invite");
      t.dropColumn("session_id");
    });
  }

  // ============================================================================
  // CREATE V2 TABLES
  // ============================================================================
// === FROM core.ts ===

  // ============================================================================
  // VARIANT TYPES TABLE
  // ============================================================================
  // Defines available variant attribute types and validation rules
  await knex.schema.createTable('variant_types', (table) => {
    table.uuid('variant_type_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable().unique();
    table.string('display_name', 200).notNullable();
    table.text('description');
    table.boolean('affects_pricing').notNullable().defaultTo(true);
    table.boolean('searchable').notNullable().defaultTo(true);
    table.boolean('filterable').notNullable().defaultTo(true);
    table.string('value_type', 20).notNullable();
    table.decimal('min_value', 10, 2);
    table.decimal('max_value', 10, 2);
    table.jsonb('allowed_values');
    table.integer('display_order').notNullable().defaultTo(0);
    table.string('icon', 100);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Check constraint for value_type
    table.check(
      "value_type IN ('integer', 'decimal', 'string', 'enum')",
      [],
      'chk_variant_types_value_type'
    );
    
    // Index for searchable types
    table.index(['searchable'], 'idx_variant_types_searchable');
  });

  await knex.raw(`
    COMMENT ON TABLE variant_types IS 'Defines available variant attribute types with validation rules'
  `);

  // Seed variant types data
  await knex('variant_types').insert([
    {
      name: 'quality_tier',
      display_name: 'Quality Tier',
      description: 'Item quality level from 1 (lowest) to 5 (highest)',
      value_type: 'integer',
      min_value: 1,
      max_value: 5,
      display_order: 0
    },
    {
      name: 'quality_value',
      display_name: 'Quality Value',
      description: 'Precise quality percentage from 0 to 100',
      value_type: 'decimal',
      min_value: 0,
      max_value: 100,
      display_order: 1
    },
    {
      name: 'crafted_source',
      display_name: 'Source',
      description: 'How the item was obtained',
      value_type: 'enum',
      allowed_values: JSON.stringify(['crafted', 'store', 'looted', 'unknown']),
      display_order: 2
    },
    {
      name: 'blueprint_tier',
      display_name: 'Blueprint Tier',
      description: 'Blueprint quality tier for craftable items',
      value_type: 'integer',
      min_value: 1,
      max_value: 5,
      display_order: 3
    }
  ]);

  // ============================================================================
  // LISTINGS TABLE
  // ============================================================================
  // Unified listing table replacing V1's 3-table structure
  await knex.schema.createTable('listings', (table) => {
    table.uuid('listing_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('seller_id').notNullable();
    table.string('seller_type', 20).notNullable();
    table.string('title', 500).notNullable();
    table.text('description');
    table.string('status', 20).notNullable().defaultTo('active');
    table.string('visibility', 20).notNullable().defaultTo('public');
    table.string('sale_type', 20).notNullable().defaultTo('fixed');
    table.string('listing_type', 20).notNullable().defaultTo('single');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    
    // Check constraints
    table.check(
      "seller_type IN ('user', 'contractor')",
      [],
      'chk_listings_seller_type'
    );
    table.check(
      "status IN ('active', 'sold', 'expired', 'cancelled')",
      [],
      'chk_listings_status'
    );
    table.check(
      "visibility IN ('public', 'private', 'unlisted')",
      [],
      'chk_listings_visibility'
    );
    table.check(
      "sale_type IN ('fixed', 'auction', 'negotiable')",
      [],
      'chk_listings_sale_type'
    );
    table.check(
      "listing_type IN ('single', 'bundle', 'bulk')",
      [],
      'chk_listings_listing_type'
    );
    
    // Indexes
    table.index(['seller_id', 'seller_type'], 'idx_listings_seller');
    table.index(['status', 'created_at'], 'idx_listings_status_created');
  });

  await knex.raw(`
    COMMENT ON TABLE listings IS 'Unified listing table for all listing types (single, bundle, bulk)'
  `);

  // Create full-text search index on title and description
  // Note: GIN indexes on expressions require wrapping in parentheses
  await knex.raw(`
    CREATE INDEX idx_listings_search_vector ON listings 
    USING GIN ((
      to_tsvector('english', title) || 
      to_tsvector('english', COALESCE(description, ''))
    ))
  `);

  // ============================================================================
  // LISTING_ITEMS TABLE
  // ============================================================================
  // Items being sold with pricing configuration
  await knex.schema.createTable('listing_items', (table) => {
    table.uuid('item_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('listing_id').notNullable();
    table.uuid('game_item_id').notNullable();
    table.string('pricing_mode', 20).notNullable().defaultTo('unified');
    table.bigInteger('base_price');
    table.integer('display_order').notNullable().defaultTo(0);
    table.integer('quantity_available').notNullable().defaultTo(0);
    table.integer('variant_count').notNullable().defaultTo(0);
    
    // Foreign keys
    table.foreign('listing_id')
      .references('listing_id')
      .inTable('listings')
      .onDelete('CASCADE');
    
    // Check constraints
    table.check(
      "pricing_mode IN ('unified', 'per_variant')",
      [],
      'chk_listing_items_pricing_mode'
    );
    table.check(
      'quantity_available >= 0',
      [],
      'chk_listing_items_quantity_available'
    );
    table.check(
      'variant_count >= 0',
      [],
      'chk_listing_items_variant_count'
    );
    
    // Indexes
    table.index(['listing_id'], 'idx_listing_items_listing');
    table.index(['game_item_id'], 'idx_listing_items_game_item');
  });

  await knex.raw(`
    COMMENT ON TABLE listing_items IS 'Items being sold with pricing configuration'
  `);
  await knex.raw(`
    COMMENT ON COLUMN listing_items.pricing_mode IS 'unified = one price for all variants, per_variant = different prices per variant'
  `);
  await knex.raw(`
    COMMENT ON COLUMN listing_items.quantity_available IS 'Computed by trigger from sum of listed stock lots'
  `);
  await knex.raw(`
    COMMENT ON COLUMN listing_items.variant_count IS 'Computed by trigger from count of distinct variants'
  `);

  // ============================================================================
  // ITEM_VARIANTS TABLE
  // ============================================================================
  // Unique combinations of variant attributes
  await knex.schema.createTable('item_variants', (table) => {
    table.uuid('variant_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('game_item_id').notNullable();
    table.jsonb('attributes').notNullable();
    table.string('attributes_hash', 64).notNullable();
    table.string('display_name', 200);
    table.string('short_name', 100);
    table.decimal('base_price_modifier', 5, 2);
    table.bigInteger('fixed_price_override');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Unique constraint on game_item_id + attributes_hash for deduplication
    table.unique(['game_item_id', 'attributes_hash'], {
      indexName: 'uq_item_variants_game_item_hash'
    });
    
    // Indexes
    table.index(['game_item_id'], 'idx_item_variants_game_item');
  });

  await knex.raw(`
    COMMENT ON TABLE item_variants IS 'Unique combinations of variant attributes (quality_tier, crafted_source, etc.)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN item_variants.attributes IS 'JSONB field storing flexible item properties for future extensibility'
  `);
  await knex.raw(`
    COMMENT ON COLUMN item_variants.attributes_hash IS 'SHA-256 hash of normalized attributes for deduplication'
  `);

  // Create GIN index on attributes JSONB field
  await knex.raw(`
    CREATE INDEX idx_item_variants_attributes ON item_variants USING GIN (attributes)
  `);

  // Create function to generate attributes_hash
  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_attributes_hash()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.attributes_hash := encode(digest(NEW.attributes::text, 'sha256'), 'hex');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger to auto-generate attributes_hash
  await knex.raw(`
    CREATE TRIGGER trg_item_variants_hash
    BEFORE INSERT OR UPDATE ON item_variants
    FOR EACH ROW
    EXECUTE FUNCTION generate_attributes_hash();
  `);

  // ============================================================================
  // LISTING_ITEM_LOTS TABLE
  // ============================================================================
  // Physical inventory units with location and quality
  await knex.schema.createTable('listing_item_lots', (table) => {
    table.uuid('lot_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('item_id').notNullable();
    table.uuid('variant_id').notNullable();
    table.integer('quantity_total').notNullable();
    table.uuid('location_id');
    table.uuid('owner_id');
    table.boolean('listed').notNullable().defaultTo(true);
    table.string('notes', 1000);
    table.uuid('crafted_by');
    table.timestamp('crafted_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('item_id')
      .references('item_id')
      .inTable('listing_items')
      .onDelete('CASCADE');
    table.foreign('variant_id')
      .references('variant_id')
      .inTable('item_variants');
    
    // Check constraints
    table.check(
      'quantity_total >= 0',
      [],
      'chk_listing_item_lots_quantity_total'
    );
    
    // Indexes
    table.index(['item_id'], 'idx_listing_item_lots_item');
    table.index(['variant_id'], 'idx_listing_item_lots_variant');
    table.index(['location_id'], 'idx_listing_item_lots_location');
    table.index(['listed'], 'idx_listing_item_lots_listed');
    table.index(['item_id', 'listed'], 'idx_listing_item_lots_item_listed');
  });

  await knex.raw(`
    COMMENT ON TABLE listing_item_lots IS 'Physical inventory units with specific variant attributes and location'
  `);
  await knex.raw(`
    COMMENT ON COLUMN listing_item_lots.listed IS 'Controls whether this lot is available for purchase'
  `);

  // ============================================================================
  // VARIANT_PRICING TABLE
  // ============================================================================
  // Per-variant pricing when pricing_mode = 'per_variant'
  await knex.schema.createTable('variant_pricing', (table) => {
    table.uuid('pricing_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('item_id').notNullable();
    table.uuid('variant_id').notNullable();
    table.bigInteger('price').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('item_id')
      .references('item_id')
      .inTable('listing_items')
      .onDelete('CASCADE');
    table.foreign('variant_id')
      .references('variant_id')
      .inTable('item_variants')
      .onDelete('CASCADE');
    
    // Unique constraint on item_id + variant_id
    table.unique(['item_id', 'variant_id'], {
      indexName: 'uq_variant_pricing_item_variant'
    });
    
    // Check constraints
    table.check(
      'price > 0',
      [],
      'chk_variant_pricing_price'
    );
    
    // Indexes
    table.index(['item_id'], 'idx_variant_pricing_item');
  });

  await knex.raw(`
    COMMENT ON TABLE variant_pricing IS 'Per-variant pricing when pricing_mode = per_variant'
  `);

  // ============================================================================
  // TRIGGERS
  // ============================================================================
  // Create function to update quantity_available and variant_count
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_quantity_available()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE listing_items
      SET 
        quantity_available = (
          SELECT COALESCE(SUM(quantity_total), 0)
          FROM listing_item_lots
          WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
            AND listed = true
        ),
        variant_count = (
          SELECT COUNT(DISTINCT variant_id)
          FROM listing_item_lots
          WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
            AND listed = true
        )
      WHERE item_id = COALESCE(NEW.item_id, OLD.item_id);
      
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger on listing_item_lots
  await knex.raw(`
    CREATE TRIGGER trg_listing_item_lots_quantity
    AFTER INSERT OR UPDATE OR DELETE ON listing_item_lots
    FOR EACH ROW
    EXECUTE FUNCTION update_quantity_available();
  `);

  // ============================================================================
  // LISTING_SEARCH VIEW
  // ============================================================================
  // Denormalized view for fast search queries
  await knex.raw(`
    CREATE VIEW listing_search AS
    SELECT 
      l.listing_id,
      l.seller_id,
      l.seller_type,
      l.title,
      l.description,
      l.status,
      l.sale_type,
      l.listing_type,
      l.created_at,
      li.item_id,
      li.game_item_id,
      li.quantity_available,
      li.variant_count,
      li.pricing_mode,
      li.base_price,
      -- Computed price range
      CASE 
        WHEN li.pricing_mode = 'unified' THEN li.base_price
        ELSE (SELECT MIN(price) FROM variant_pricing WHERE item_id = li.item_id)
      END AS price_min,
      CASE 
        WHEN li.pricing_mode = 'unified' THEN li.base_price
        ELSE (SELECT MAX(price) FROM variant_pricing WHERE item_id = li.item_id)
      END AS price_max,
      -- Computed quality tier range
      (SELECT MIN((iv.attributes->>'quality_tier')::integer)
       FROM listing_item_lots sl
       JOIN item_variants iv ON sl.variant_id = iv.variant_id
       WHERE sl.item_id = li.item_id AND sl.listed = true
      ) AS quality_tier_min,
      (SELECT MAX((iv.attributes->>'quality_tier')::integer)
       FROM listing_item_lots sl
       JOIN item_variants iv ON sl.variant_id = iv.variant_id
       WHERE sl.item_id = li.item_id AND sl.listed = true
      ) AS quality_tier_max,
      -- Full-text search vector
      setweight(to_tsvector('english', l.title), 'A') ||
      setweight(to_tsvector('english', COALESCE(l.description, '')), 'B') AS search_vector
    FROM listings l
    JOIN listing_items li ON l.listing_id = li.listing_id
    WHERE l.status = 'active'
  `);

  await knex.raw(`
    COMMENT ON VIEW listing_search IS 'Denormalized view for fast search queries with computed price and quality ranges'
  `);

  // Note: Cannot create indexes directly on views in PostgreSQL
  // The idx_listings_search_vector index on the listings table will be used
  // when querying the view


// === FROM indexes.ts ===

  // ============================================================================
  // ADDITIONAL INDEXES ON CORE TABLES FOR QUERY OPTIMIZATION
  // ============================================================================
  // Note: PostgreSQL does not support creating indexes directly on views.
  // Instead, we create indexes on the underlying tables that will be used
  // when querying through the listing_search view.
  
  // ============================================================================
  // INDEXES TO OPTIMIZE LISTING_SEARCH VIEW QUERIES
  // ============================================================================
  
  
  // Index on listing_items for game_item_id filtering (used by view)
  // This optimizes the most common query pattern: filtering by game item
  await knex.raw(`
    CREATE INDEX idx_listing_items_game_item_status 
    ON listing_items (game_item_id)
  `);

  // Index on listing_items for quantity and variant filtering
  await knex.raw(`
    CREATE INDEX idx_listing_items_quantity_variant 
    ON listing_items (quantity_available, variant_count)
    WHERE quantity_available > 0
  `);

  // ============================================================================
  // ADDITIONAL INDEXES ON CORE TABLES
  // ============================================================================

  // Index on listings.seller_id for "my listings" queries
  await knex.raw(`
    CREATE INDEX idx_listings_seller_status 
    ON listings (seller_id, status, created_at DESC)
  `);

  // Index on listing_items for variant count queries
  await knex.raw(`
    CREATE INDEX idx_listing_items_variant_count 
    ON listing_items (variant_count)
    WHERE variant_count > 0
  `);

  // Index on listing_item_lots for location-based queries
  await knex.raw(`
    CREATE INDEX idx_listing_item_lots_location_listed 
    ON listing_item_lots (location_id, listed)
    WHERE location_id IS NOT NULL
  `);

  // Index on listing_item_lots for owner-based queries
  await knex.raw(`
    CREATE INDEX idx_listing_item_lots_owner 
    ON listing_item_lots (owner_id, listed)
    WHERE owner_id IS NOT NULL
  `);

  // Index on item_variants for quality tier queries
  await knex.raw(`
    CREATE INDEX idx_item_variants_quality_tier 
    ON item_variants ((attributes->>'quality_tier'))
    WHERE attributes->>'quality_tier' IS NOT NULL
  `);

  // Index on item_variants for crafted_source queries
  await knex.raw(`
    CREATE INDEX idx_item_variants_crafted_source 
    ON item_variants ((attributes->>'crafted_source'))
    WHERE attributes->>'crafted_source' IS NOT NULL
  `);

  // ============================================================================
  // STATISTICS AND COMMENTS
  // ============================================================================

  // Add comments explaining the purpose of these indexes
  await knex.raw(`
    COMMENT ON INDEX idx_listing_items_game_item_status IS 
    'Optimizes filtering by game item through listing_search view'
  `);

  await knex.raw(`
    COMMENT ON INDEX idx_listing_items_quantity_variant IS 
    'Optimizes filtering by quantity and variant count'
  `);

  // Update statistics for query planner
  await knex.raw(`ANALYZE listings`);
  await knex.raw(`ANALYZE listing_items`);
  await knex.raw(`ANALYZE item_variants`);
  await knex.raw(`ANALYZE listing_item_lots`);
  await knex.raw(`ANALYZE variant_pricing`);


// === FROM integration.ts ===

  // ============================================================================
  // ORDER_MARKET_ITEMS_V2 TABLE
  // ============================================================================
  // Links V1 orders to V2 listings with variant information
  // This is a JOIN TABLE connecting V2 listings to V1 orders system
  await knex.schema.createTable('order_market_items_v2', (table) => {
    table.uuid('order_item_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('item_id').notNullable();
    table.uuid('variant_id').notNullable();
    table.integer('quantity').notNullable();
    table.bigInteger('price_per_unit').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Foreign keys to V2 tables
    table.foreign('listing_id')
      .references('listing_id')
      .inTable('listings');
    table.foreign('item_id')
      .references('item_id')
      .inTable('listing_items');
    table.foreign('variant_id')
      .references('variant_id')
      .inTable('item_variants');
    
    // Note: order_id references V1 orders table (not created in this migration)
    // The V1 orders table should already exist in the database
    
    // Check constraints
    table.check(
      'quantity > 0',
      [],
      'chk_order_market_items_v2_quantity'
    );
    table.check(
      'price_per_unit > 0',
      [],
      'chk_order_market_items_v2_price'
    );
    
    // Indexes
    table.index(['order_id'], 'idx_order_market_items_v2_order');
    table.index(['listing_id'], 'idx_order_market_items_v2_listing');
    table.index(['variant_id'], 'idx_order_market_items_v2_variant');
  });

  await knex.raw(`
    COMMENT ON TABLE order_market_items_v2 IS 'JOIN TABLE linking V1 orders to V2 listings with variant tracking'
  `);
  await knex.raw(`
    COMMENT ON COLUMN order_market_items_v2.price_per_unit IS 'Snapshot of variant price at time of purchase'
  `);
  await knex.raw(`
    COMMENT ON COLUMN order_market_items_v2.order_id IS 'References V1 orders table (existing)'
  `);

  // ============================================================================
  // CART_ITEMS_V2 TABLE
  // ============================================================================
  // Shopping cart for V2 users with variant selection
  // This replaces V1 cart for users with V2 feature flag enabled
  await knex.schema.createTable('cart_items_v2', (table) => {
    table.uuid('cart_item_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('item_id').notNullable();
    table.uuid('variant_id').notNullable();
    table.integer('quantity').notNullable();
    table.bigInteger('price_per_unit').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Foreign keys to V2 tables
    table.foreign('listing_id')
      .references('listing_id')
      .inTable('listings')
      .onDelete('CASCADE');
    table.foreign('item_id')
      .references('item_id')
      .inTable('listing_items')
      .onDelete('CASCADE');
    table.foreign('variant_id')
      .references('variant_id')
      .inTable('item_variants');
    
    // Note: user_id references V1 accounts table (not created in this migration)
    // The V1 accounts/users table should already exist in the database
    
    // Unique constraint: one cart entry per user/listing/variant combination
    table.unique(['user_id', 'listing_id', 'variant_id'], {
      indexName: 'uq_cart_items_v2_user_listing_variant'
    });
    
    // Check constraints
    table.check(
      'quantity > 0',
      [],
      'chk_cart_items_v2_quantity'
    );
    table.check(
      'price_per_unit > 0',
      [],
      'chk_cart_items_v2_price'
    );
    
    // Indexes
    table.index(['user_id'], 'idx_cart_items_v2_user');
    table.index(['listing_id'], 'idx_cart_items_v2_listing');
    table.index(['variant_id'], 'idx_cart_items_v2_variant');
  });

  await knex.raw(`
    COMMENT ON TABLE cart_items_v2 IS 'Shopping cart for V2 users with variant-specific item selection'
  `);
  await knex.raw(`
    COMMENT ON COLUMN cart_items_v2.price_per_unit IS 'Snapshot of variant price at time of add-to-cart'
  `);
  await knex.raw(`
    COMMENT ON COLUMN cart_items_v2.user_id IS 'References V1 accounts/users table (existing)'
  `);

  // ============================================================================
  // BUY_ORDERS_V2 TABLE
  // ============================================================================
  // Buyer requests with quality tier requirements
  await knex.schema.createTable('buy_orders_v2', (table) => {
    table.uuid('buy_order_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('buyer_id').notNullable();
    table.uuid('game_item_id').notNullable();
    table.integer('quality_tier_min');
    table.integer('quality_tier_max');
    table.jsonb('desired_attributes');
    table.bigInteger('price_min');
    table.bigInteger('price_max');
    table.integer('quantity_desired').notNullable();
    table.string('status', 20).notNullable().defaultTo('active');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    
    // Note: buyer_id references V1 accounts table (not created in this migration)
    // Note: game_item_id references V1 game_items table (not created in this migration)
    
    // Check constraints
    table.check(
      "status IN ('active', 'fulfilled', 'cancelled', 'expired')",
      [],
      'chk_buy_orders_v2_status'
    );
    table.check(
      'quality_tier_min >= 1 AND quality_tier_min <= 5',
      [],
      'chk_buy_orders_v2_quality_tier_min'
    );
    table.check(
      'quality_tier_max >= 1 AND quality_tier_max <= 5',
      [],
      'chk_buy_orders_v2_quality_tier_max'
    );
    table.check(
      'quality_tier_min <= quality_tier_max',
      [],
      'chk_buy_orders_v2_quality_tier_range'
    );
    table.check(
      'price_min <= price_max',
      [],
      'chk_buy_orders_v2_price_range'
    );
    table.check(
      'quantity_desired > 0',
      [],
      'chk_buy_orders_v2_quantity_desired'
    );
    table.check(
      'price_min >= 0',
      [],
      'chk_buy_orders_v2_price_min'
    );
    table.check(
      'price_max >= 0',
      [],
      'chk_buy_orders_v2_price_max'
    );
    
    // Indexes
    table.index(['buyer_id'], 'idx_buy_orders_v2_buyer');
    table.index(['game_item_id'], 'idx_buy_orders_v2_game_item');
    table.index(['status'], 'idx_buy_orders_v2_status');
    table.index(['game_item_id', 'status'], 'idx_buy_orders_v2_game_item_status');
  });

  await knex.raw(`
    COMMENT ON TABLE buy_orders_v2 IS 'Buyer requests with quality tier requirements for matching with V2 listings'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.quality_tier_min IS 'Minimum acceptable quality tier (1-5)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.quality_tier_max IS 'Maximum quality tier (1-5)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.desired_attributes IS 'Additional variant attribute requirements (JSONB)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.buyer_id IS 'References V1 accounts/users table (existing)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.game_item_id IS 'References V1 game_items table (existing)'
  `);

  // Create GIN index on desired_attributes JSONB field
  await knex.raw(`
    CREATE INDEX idx_buy_orders_v2_desired_attributes ON buy_orders_v2 USING GIN (desired_attributes)
  `);


}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order
  await knex.raw("DROP TRIGGER IF EXISTS trg_order_price_history ON orders");
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution_lots ON listing_item_lots");
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution ON listings");
  await knex.raw("DROP FUNCTION IF EXISTS refresh_quality_distribution()");
  await knex.raw("DROP MATERIALIZED VIEW IF EXISTS quality_distribution_mv");
  await knex.raw("DROP TRIGGER IF EXISTS trg_listing_price_history ON listings");
  await knex.raw("DROP FUNCTION IF EXISTS record_order_price_history()");
  await knex.raw("DROP FUNCTION IF EXISTS record_listing_price_history()");
  await knex.raw("DROP VIEW IF EXISTS listing_search");
  await knex.raw("DROP INDEX IF EXISTS idx_listings_search_vector");
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_search_vector");
  await knex.raw("DROP INDEX IF EXISTS idx_listings_created_at_desc");
  await knex.raw("DROP TRIGGER IF EXISTS trg_listing_item_lots_quantity ON listing_item_lots");
  await knex.raw("DROP FUNCTION IF EXISTS update_quantity_available()");
  await knex.schema.dropTableIfExists("offer_market_items_v2");
  await knex.schema.dropTableIfExists("order_market_items_v2");
  await knex.schema.dropTableIfExists("cart_items_v2");
  await knex.schema.dropTableIfExists("buy_orders_v2");
  await knex.schema.dropTableIfExists("price_history_v2");
  await knex.schema.dropTableIfExists("variant_pricing");
  await knex.schema.dropTableIfExists("listing_item_lots");
  await knex.schema.dropTableIfExists("item_variants");
  await knex.schema.dropTableIfExists("listing_items");
  await knex.schema.dropTableIfExists("listings");
  await knex.schema.dropTableIfExists("variant_types");
}
