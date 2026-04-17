import type { Knex } from "knex";

/**
 * Migration: Additional Indexes for Performance Optimization
 * Task 1.4: Create database views and indexes
 * 
 * This migration adds additional indexes beyond the core migration to optimize
 * common query patterns and meet the 50ms search performance target.
 * 
 * Requirements: 8.2-8.4, 63.1-63.10
 */

export async function up(knex: Knex): Promise<void> {
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
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes in reverse order
  await knex.raw('DROP INDEX IF EXISTS idx_item_variants_crafted_source');
  await knex.raw('DROP INDEX IF EXISTS idx_item_variants_quality_tier');
  await knex.raw('DROP INDEX IF EXISTS idx_listing_item_lots_owner');
  await knex.raw('DROP INDEX IF EXISTS idx_listing_item_lots_location_listed');
  await knex.raw('DROP INDEX IF EXISTS idx_listing_items_variant_count');
  await knex.raw('DROP INDEX IF EXISTS idx_listings_seller_status');
  await knex.raw('DROP INDEX IF EXISTS idx_listing_items_quantity_variant');
  await knex.raw('DROP INDEX IF EXISTS idx_listing_items_game_item_status');
}
