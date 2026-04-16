import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create materialized view for quality distribution analytics
  await knex.raw(`
    CREATE MATERIALIZED VIEW quality_distribution_mv AS
    SELECT
      li.game_item_id,
      (iv.attributes->>'quality_tier')::integer as quality_tier,
      COUNT(DISTINCT l.listing_id) as listing_count,
      COUNT(DISTINCT l.seller_id) as seller_count,
      SUM(lil.quantity_total) as total_quantity,
      MIN(COALESCE(vp.price, li.base_price)) as min_price,
      MAX(COALESCE(vp.price, li.base_price)) as max_price,
      AVG(COALESCE(vp.price, li.base_price))::bigint as avg_price
    FROM listings l
    JOIN listing_items li ON l.listing_id = li.listing_id
    JOIN listing_item_lots lil ON li.item_id = lil.item_id
    JOIN item_variants iv ON lil.variant_id = iv.variant_id
    LEFT JOIN variant_pricing vp ON li.item_id = vp.item_id AND lil.variant_id = vp.variant_id
    WHERE l.status = 'active' AND lil.listed = true
    GROUP BY li.game_item_id, (iv.attributes->>'quality_tier')::integer;
  `)

  // Create unique index on the materialized view for CONCURRENTLY refresh
  await knex.raw(`
    CREATE UNIQUE INDEX idx_quality_distribution_mv_pk 
    ON quality_distribution_mv (game_item_id, quality_tier);
  `)

  // Create additional index for game_item_id lookups
  await knex.raw(`
    CREATE INDEX idx_quality_distribution_mv_game_item 
    ON quality_distribution_mv (game_item_id);
  `)

  // Add comment to the materialized view
  await knex.raw(`
    COMMENT ON MATERIALIZED VIEW quality_distribution_mv IS 
    'Cached quality tier distribution for fast queries';
  `)

  // Create trigger function to refresh materialized view
  // Note: In production, this should be debounced via a job queue to avoid excessive refreshes
  await knex.raw(`
    CREATE OR REPLACE FUNCTION refresh_quality_distribution()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Refresh the materialized view concurrently (non-blocking)
      REFRESH MATERIALIZED VIEW CONCURRENTLY quality_distribution_mv;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `)

  // Create trigger on listings table to refresh view on changes
  // Note: This trigger fires on statement level (not per row) to reduce refresh frequency
  await knex.raw(`
    CREATE TRIGGER trg_refresh_quality_distribution
    AFTER INSERT OR UPDATE OR DELETE ON listings
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_quality_distribution();
  `)

  // Create trigger on listing_item_lots table to refresh view on stock changes
  await knex.raw(`
    CREATE TRIGGER trg_refresh_quality_distribution_lots
    AFTER INSERT OR UPDATE OR DELETE ON listing_item_lots
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_quality_distribution();
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution ON listings")
  await knex.raw("DROP TRIGGER IF EXISTS trg_refresh_quality_distribution_lots ON listing_item_lots")

  // Drop trigger function
  await knex.raw("DROP FUNCTION IF EXISTS refresh_quality_distribution()")

  // Drop materialized view (indexes are dropped automatically)
  await knex.raw("DROP MATERIALIZED VIEW IF EXISTS quality_distribution_mv")
}
