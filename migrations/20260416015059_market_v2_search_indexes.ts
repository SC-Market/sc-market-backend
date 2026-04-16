import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Note: PostgreSQL doesn't support indexes directly on views
  // Instead, we create indexes on the underlying base tables that the view uses
  // The query planner will use these indexes when querying the view

  // Create GIN index on the search_vector for full-text search
  // We need to create a functional index on the base tables
  await knex.raw(`
    CREATE INDEX idx_listings_search_vector ON listings 
    USING GIN (
      setweight(to_tsvector('english', title), 'A') ||
      setweight(to_tsvector('english', COALESCE(description, '')), 'B')
    );
  `)

  await knex.raw(`
    CREATE INDEX idx_game_items_search_vector ON game_items 
    USING GIN (to_tsvector('english', name));
  `)

  // Create supporting indexes for common filter columns used in the view
  // These help with WHERE clauses in queries against the view

  // Index on game_item_id for filtering by item
  // (already exists from core tables migration: idx_listing_items_game_item)

  // Index on created_at for sorting by date
  await knex.raw(`
    CREATE INDEX idx_listings_created_at_desc ON listings (created_at DESC)
    WHERE status = 'active';
  `)

  // Add comments for documentation
  await knex.raw(`
    COMMENT ON INDEX idx_listings_search_vector IS 
    'GIN index for full-text search on listing title and description';
  `)

  await knex.raw(`
    COMMENT ON INDEX idx_game_items_search_vector IS 
    'GIN index for full-text search on game item names';
  `)

  await knex.raw(`
    COMMENT ON INDEX idx_listings_created_at_desc IS 
    'Index for sorting active listings by creation date (descending)';
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop the indexes
  await knex.raw(`DROP INDEX IF EXISTS idx_listings_search_vector;`)
  await knex.raw(`DROP INDEX IF EXISTS idx_game_items_search_vector;`)
  await knex.raw(`DROP INDEX IF EXISTS idx_listings_created_at_desc;`)
}
