import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
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
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order to handle dependencies
  
  // Drop view
  await knex.raw('DROP VIEW IF EXISTS listing_search CASCADE');
  
  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS trg_listing_item_lots_quantity ON listing_item_lots');
  await knex.raw('DROP TRIGGER IF EXISTS trg_item_variants_hash ON item_variants');
  
  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_quantity_available()');
  await knex.raw('DROP FUNCTION IF EXISTS generate_attributes_hash()');
  
  // Drop tables
  await knex.schema.dropTableIfExists('variant_pricing');
  await knex.schema.dropTableIfExists('listing_item_lots');
  await knex.schema.dropTableIfExists('item_variants');
  await knex.schema.dropTableIfExists('listing_items');
  await knex.schema.dropTableIfExists('listings');
  await knex.schema.dropTableIfExists('variant_types');
}
