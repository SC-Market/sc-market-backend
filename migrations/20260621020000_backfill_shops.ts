import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create shops for contractors that have V2 listings or V1 market_listings
  await knex.raw(`
    INSERT INTO shops (slug, name, description, banner, logo, owner_contractor_id, market_order_template, created_at, updated_at)
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM shops WHERE slug = c.spectrum_id)
          THEN c.spectrum_id
        ELSE c.spectrum_id || '-' || substr(c.contractor_id::text, 1, 8)
      END,
      c.name,
      c.description,
      c.banner,
      c.avatar,
      c.contractor_id,
      COALESCE(c.market_order_template, ''),
      c.created_at,
      NOW()
    FROM contractors c
    WHERE (
      EXISTS (SELECT 1 FROM listings WHERE seller_id = c.contractor_id AND seller_type = 'contractor')
      OR EXISTS (SELECT 1 FROM market_listings WHERE contractor_seller_id = c.contractor_id)
      OR EXISTS (SELECT 1 FROM services WHERE contractor_id = c.contractor_id)
    )
    AND NOT EXISTS (SELECT 1 FROM shops WHERE owner_contractor_id = c.contractor_id)
  `)

  // Create shops for users that have V2 listings or V1 market_listings
  // Use username-shop as slug, with substr(user_id) suffix on collision
  await knex.raw(`
    INSERT INTO shops (slug, name, description, banner, logo, owner_user_id, market_order_template, created_at, updated_at)
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM shops WHERE slug = a.username || '-shop')
          THEN a.username || '-shop'
        ELSE a.username || '-shop-' || substr(a.user_id::text, 1, 8)
      END,
      a.display_name || '''s Shop',
      '',
      a.banner,
      a.avatar,
      a.user_id,
      COALESCE(a.market_order_template, ''),
      a.created_at,
      NOW()
    FROM accounts a
    WHERE (
      EXISTS (SELECT 1 FROM listings WHERE seller_id = a.user_id AND seller_type = 'user')
      OR EXISTS (SELECT 1 FROM market_listings WHERE user_seller_id = a.user_id)
      OR EXISTS (SELECT 1 FROM services WHERE user_id = a.user_id)
    )
    AND NOT EXISTS (SELECT 1 FROM shops WHERE owner_user_id = a.user_id)
  `)

  // Backfill shop_id on V2 listings from contractor sellers
  await knex.raw(`
    UPDATE listings l
    SET shop_id = s.shop_id
    FROM shops s
    WHERE l.seller_type = 'contractor'
      AND s.owner_contractor_id = l.seller_id
      AND l.shop_id IS NULL
  `)

  // Backfill shop_id on V2 listings from user sellers
  await knex.raw(`
    UPDATE listings l
    SET shop_id = s.shop_id
    FROM shops s
    WHERE l.seller_type = 'user'
      AND s.owner_user_id = l.seller_id
      AND l.shop_id IS NULL
  `)

  // Safety check: fail loudly if any listings still have NULL shop_id
  const result = await knex.raw(`SELECT COUNT(*) as count FROM listings WHERE shop_id IS NULL`)
  const nullCount = parseInt(result.rows[0].count, 10)
  if (nullCount > 0) {
    throw new Error(
      `Backfill incomplete: ${nullCount} listings still have NULL shop_id. ` +
      `This likely means a seller has no corresponding shop (slug collision or missing data). ` +
      `Investigate before proceeding.`
    )
  }
}

export async function down(knex: Knex): Promise<void> {
  // Clear shop_id from listings (column stays, just nulled out)
  await knex.raw(`UPDATE listings SET shop_id = NULL WHERE shop_id IS NOT NULL`)

  // Remove backfilled shops (only those auto-created by this migration)
  // Safe because shop_id on listings was just nulled above
  await knex.raw(`DELETE FROM shops`)
}
