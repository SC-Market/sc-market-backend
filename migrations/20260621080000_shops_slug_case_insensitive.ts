import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Find and resolve slug collisions before lowercasing
  // If two shops have the same slug when lowercased, append UUID suffix to all but the oldest
  await knex.raw(`
    UPDATE shops s1
    SET slug = LOWER(s1.slug) || '-' || substr(s1.shop_id::text, 1, 8)
    WHERE s1.shop_id IN (
      SELECT s2.shop_id
      FROM shops s2
      WHERE LOWER(s2.slug) IN (
        SELECT LOWER(slug) FROM shops GROUP BY LOWER(slug) HAVING COUNT(*) > 1
      )
      AND s2.shop_id != (
        SELECT s3.shop_id FROM shops s3
        WHERE LOWER(s3.slug) = LOWER(s2.slug)
        ORDER BY s3.created_at ASC
        LIMIT 1
      )
    )
  `)

  // Now safely lowercase all remaining slugs
  await knex.raw(`UPDATE shops SET slug = LOWER(slug) WHERE slug != LOWER(slug)`)

  // Drop views that reference shops.slug before changing type
  await knex.raw(`DROP VIEW IF EXISTS listing_search`)

  // Change slug column to citext for case-insensitive uniqueness
  await knex.raw(`ALTER TABLE shops ALTER COLUMN slug TYPE citext`)

  // Recreate the listing_search view
  await knex.raw(`
    CREATE VIEW listing_search AS
    SELECT
      l.listing_id, l.seller_id, l.seller_type, l.shop_id, l.title, l.description,
      l.status, l.visibility, l.sale_type, l.listing_type, l.pickup_method, l.quantity_unit,
      l.created_at, l.updated_at,
      li.item_id, li.game_item_id, li.quantity_available, li.variant_count,
      li.pricing_mode, li.base_price,
      (li.bulk_discount_tiers IS NOT NULL AND li.bulk_discount_tiers::text != '[]') AS has_bulk_discount,
      CASE WHEN li.pricing_mode = 'unified' THEN li.base_price
           ELSE (SELECT MIN(price) FROM variant_pricing WHERE item_id = li.item_id) END AS price_min,
      CASE WHEN li.pricing_mode = 'unified' THEN li.base_price
           ELSE (SELECT MAX(price) FROM variant_pricing WHERE item_id = li.item_id) END AS price_max,
      (SELECT MIN((iv.attributes->>'quality_tier')::integer) FROM listing_item_lots sl JOIN item_variants iv ON sl.variant_id = iv.variant_id WHERE sl.item_id = li.item_id AND sl.listed = true) AS quality_tier_min,
      (SELECT MAX((iv.attributes->>'quality_tier')::integer) FROM listing_item_lots sl JOIN item_variants iv ON sl.variant_id = iv.variant_id WHERE sl.item_id = li.item_id AND sl.listed = true) AS quality_tier_max,
      gi.name AS game_item_name, gi.type AS game_item_type,
      (SELECT COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) FROM listing_photos_v2 lp JOIN image_resources ir ON lp.resource_id = ir.resource_id WHERE lp.listing_id = l.listing_id ORDER BY lp.display_order ASC LIMIT 1) AS photo,
      setweight(to_tsvector('english', l.title), 'A') || setweight(to_tsvector('english', COALESCE(l.description, '')), 'B') || setweight(to_tsvector('english', COALESCE(gi.name, '')), 'C') AS search_vector,
      s.shop_id AS shop_id_ref,
      s.slug AS shop_slug,
      s.name AS shop_name,
      s.supported_languages AS shop_languages,
      s.owner_user_id AS shop_owner_user_id,
      s.owner_contractor_id AS shop_owner_contractor_id,
      (SELECT COALESCE(ir2.external_url, 'https://cdn.sc-market.space/' || ir2.filename) FROM image_resources ir2 WHERE ir2.resource_id = s.logo) AS shop_logo
    FROM listings l
    JOIN listing_items li ON l.listing_id = li.listing_id
    LEFT JOIN game_items gi ON li.game_item_id::text = gi.id::text
    LEFT JOIN shops s ON l.shop_id = s.shop_id
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE shops ALTER COLUMN slug TYPE varchar(50)`)
}
