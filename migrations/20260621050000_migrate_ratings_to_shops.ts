import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Copy existing order_reviews into shop_ratings
  // Only reviews where role='customer' (reviews OF the seller, not BY the seller)
  // Resolve shop from the order's contractor_id or assigned_id

  // Reviews for contractor-based orders
  await knex.raw(`
    INSERT INTO shop_ratings (shop_id, order_id, reviewer_id, rating, comment, created_at)
    SELECT
      s.shop_id,
      r.order_id,
      r.user_author,
      ROUND(r.rating)::integer,
      NULLIF(r.content, ''),
      r."timestamp"
    FROM order_reviews r
    JOIN orders o ON r.order_id = o.order_id
    JOIN shops s ON s.owner_contractor_id = o.contractor_id
    WHERE r.role = 'customer'
      AND o.contractor_id IS NOT NULL
      AND r.rating IS NOT NULL
      AND r.rating > 0
    ON CONFLICT (order_id, reviewer_id) DO NOTHING
  `)

  // Reviews for user-to-user orders (no contractor)
  await knex.raw(`
    INSERT INTO shop_ratings (shop_id, order_id, reviewer_id, rating, comment, created_at)
    SELECT
      s.shop_id,
      r.order_id,
      r.user_author,
      ROUND(r.rating)::integer,
      NULLIF(r.content, ''),
      r."timestamp"
    FROM order_reviews r
    JOIN orders o ON r.order_id = o.order_id
    JOIN shops s ON s.owner_user_id = o.assigned_id
    WHERE r.role = 'customer'
      AND o.contractor_id IS NULL
      AND o.assigned_id IS NOT NULL
      AND r.rating IS NOT NULL
      AND r.rating > 0
    ON CONFLICT (order_id, reviewer_id) DO NOTHING
  `)

  // Create helper functions for shop ratings
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_shop_rating(p_shop_id UUID)
    RETURNS NUMERIC AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(AVG(rating)::numeric(3,2), 0)
        FROM shop_ratings
        WHERE shop_id = p_shop_id
      );
    END;
    $$ LANGUAGE plpgsql STABLE;
  `)

  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_shop_rating_count(p_shop_id UUID)
    RETURNS INTEGER AS $$
    BEGIN
      RETURN (
        SELECT COUNT(*)::integer
        FROM shop_ratings
        WHERE shop_id = p_shop_id
      );
    END;
    $$ LANGUAGE plpgsql STABLE;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS get_shop_rating_count(UUID)`)
  await knex.raw(`DROP FUNCTION IF EXISTS get_shop_rating(UUID)`)
  // Don't delete ratings — they can coexist with order_reviews
  // Just truncate what we inserted (safe since shop_ratings didn't exist before)
  await knex.raw(`TRUNCATE shop_ratings`)
}
