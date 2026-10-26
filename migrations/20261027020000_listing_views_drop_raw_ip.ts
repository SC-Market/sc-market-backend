import type { Knex } from "knex"

/**
 * Drop the raw viewer IP and full Referer from listing_views. Existing values
 * can't be converted (the HMAC key isn't available in SQL), so they're
 * deleted with the column. DROP COLUMN only touches the catalog, so it's
 * instant regardless of table size.
 *
 * Shipped one deploy after 20261027010000_listing_views_hashed_ip: by the
 * time this runs, the container still serving during the rollout already
 * writes viewer_ip_hash / referrer_origin and never these columns.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE public.listing_views
      DROP COLUMN IF EXISTS viewer_ip,
      DROP COLUMN IF EXISTS referrer
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Structure only; the dropped values are gone.
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE public.listing_views
      ADD COLUMN IF NOT EXISTS viewer_ip INET,
      ADD COLUMN IF NOT EXISTS referrer TEXT
  `)
}
