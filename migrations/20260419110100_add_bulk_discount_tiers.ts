import type { Knex } from "knex"

/**
 * Add bulk_discount_tiers JSONB column to listing_items (V2) and market_listings (V1).
 * Format: [{ min_quantity: number, discount_percent: number }]
 * Sorted by min_quantity ascending.
 */
export async function up(knex: Knex): Promise<void> {
  // V2
  if (await knex.schema.hasTable("listing_items")) {
    await knex.schema.alterTable("listing_items", (t) => {
      t.jsonb("bulk_discount_tiers").nullable().defaultTo(null)
    })

    // Recreate listing_search view to include has_bulk_discount
    await knex.raw("DROP VIEW IF EXISTS listing_search")
    await knex.raw(`
      CREATE VIEW listing_search AS
      SELECT 
        l.listing_id, l.seller_id, l.seller_type, l.title, l.description,
        l.status, l.sale_type, l.listing_type, l.pickup_method,
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
        setweight(to_tsvector('english', l.title), 'A') || setweight(to_tsvector('english', COALESCE(l.description, '')), 'B') || setweight(to_tsvector('english', COALESCE(gi.name, '')), 'C') AS search_vector
      FROM listings l
      JOIN listing_items li ON l.listing_id = li.listing_id
      LEFT JOIN game_items gi ON li.game_item_id::text = gi.id::text
    `)
  }

  // V1
  if (await knex.schema.hasTable("market_listings")) {
    await knex.schema.alterTable("market_listings", (t) => {
      t.jsonb("bulk_discount_tiers").nullable().defaultTo(null)
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("listing_items")) {
    // Restore view without has_bulk_discount
    await knex.raw("DROP VIEW IF EXISTS listing_search")
    await knex.raw(`
      CREATE VIEW listing_search AS
      SELECT 
        l.listing_id, l.seller_id, l.seller_type, l.title, l.description,
        l.status, l.sale_type, l.listing_type, l.pickup_method,
        l.created_at, l.updated_at,
        li.item_id, li.game_item_id, li.quantity_available, li.variant_count,
        li.pricing_mode, li.base_price,
        CASE WHEN li.pricing_mode = 'unified' THEN li.base_price
             ELSE (SELECT MIN(price) FROM variant_pricing WHERE item_id = li.item_id) END AS price_min,
        CASE WHEN li.pricing_mode = 'unified' THEN li.base_price
             ELSE (SELECT MAX(price) FROM variant_pricing WHERE item_id = li.item_id) END AS price_max,
        (SELECT MIN((iv.attributes->>'quality_tier')::integer) FROM listing_item_lots sl JOIN item_variants iv ON sl.variant_id = iv.variant_id WHERE sl.item_id = li.item_id AND sl.listed = true) AS quality_tier_min,
        (SELECT MAX((iv.attributes->>'quality_tier')::integer) FROM listing_item_lots sl JOIN item_variants iv ON sl.variant_id = iv.variant_id WHERE sl.item_id = li.item_id AND sl.listed = true) AS quality_tier_max,
        gi.name AS game_item_name, gi.type AS game_item_type,
        (SELECT COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) FROM listing_photos_v2 lp JOIN image_resources ir ON lp.resource_id = ir.resource_id WHERE lp.listing_id = l.listing_id ORDER BY lp.display_order ASC LIMIT 1) AS photo,
        setweight(to_tsvector('english', l.title), 'A') || setweight(to_tsvector('english', COALESCE(l.description, '')), 'B') || setweight(to_tsvector('english', COALESCE(gi.name, '')), 'C') AS search_vector
      FROM listings l
      JOIN listing_items li ON l.listing_id = li.listing_id
      LEFT JOIN game_items gi ON li.game_item_id::text = gi.id::text
    `)

    await knex.schema.alterTable("listing_items", (t) => {
      t.dropColumn("bulk_discount_tiers")
    })
  }
  if (await knex.schema.hasTable("market_listings")) {
    await knex.schema.alterTable("market_listings", (t) => {
      t.dropColumn("bulk_discount_tiers")
    })
  }
}
