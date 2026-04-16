import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create listing_search view for denormalized search queries
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
      
      gi.name as item_name,
      gi.type as item_type,
      
      -- Seller info (join with accounts for users or contractors for contractors)
      COALESCE(u.username, c.name) as seller_name,
      CASE
        WHEN l.seller_type = 'user' THEN get_average_rating_float(l.seller_id, NULL::uuid)
        WHEN l.seller_type = 'contractor' THEN get_average_rating_float(NULL::uuid, l.seller_id)
      END as seller_rating,
      
      -- Price range (computed based on pricing mode)
      CASE 
        WHEN li.pricing_mode = 'unified' THEN li.base_price
        ELSE (
          SELECT MIN(price) 
          FROM variant_pricing 
          WHERE item_id = li.item_id
        )
      END as price_min,
      CASE 
        WHEN li.pricing_mode = 'unified' THEN li.base_price
        ELSE (
          SELECT MAX(price) 
          FROM variant_pricing 
          WHERE item_id = li.item_id
        )
      END as price_max,
      
      -- Quality tier range (computed from variants in stock lots)
      (
        SELECT MIN((iv.attributes->>'quality_tier')::integer)
        FROM listing_item_lots sl
        JOIN item_variants iv ON sl.variant_id = iv.variant_id
        WHERE sl.item_id = li.item_id 
          AND sl.listed = true
          AND iv.attributes->>'quality_tier' IS NOT NULL
      ) as quality_tier_min,
      (
        SELECT MAX((iv.attributes->>'quality_tier')::integer)
        FROM listing_item_lots sl
        JOIN item_variants iv ON sl.variant_id = iv.variant_id
        WHERE sl.item_id = li.item_id 
          AND sl.listed = true
          AND iv.attributes->>'quality_tier' IS NOT NULL
      ) as quality_tier_max,
      
      -- Full-text search vector (weighted: title=A, item name=A, description=B)
      setweight(to_tsvector('english', l.title), 'A') ||
      setweight(to_tsvector('english', COALESCE(l.description, '')), 'B') ||
      setweight(to_tsvector('english', gi.name), 'A') as search_vector
      
    FROM listings l
    JOIN listing_items li ON l.listing_id = li.listing_id
    JOIN game_items gi ON li.game_item_id = gi.id
    LEFT JOIN accounts u ON l.seller_type = 'user' AND l.seller_id = u.user_id
    LEFT JOIN contractors c ON l.seller_type = 'contractor' AND l.seller_id = c.contractor_id
    WHERE l.status = 'active';
  `)

  // Add comment to the view
  await knex.raw(`
    COMMENT ON VIEW listing_search IS 
    'Denormalized view for fast search queries with computed price and quality ranges';
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop the view
  await knex.raw(`
    DROP VIEW IF EXISTS listing_search;
  `)
}
