import type { Knex } from "knex"

/**
 * listing_views stops storing the raw viewer IP and the full Referer.
 *
 * This migration only adds the replacement columns (one ALTER on one table,
 * catalog-only, instant). The code in this deploy writes viewer_ip_hash
 * (daily-keyed HMAC, see src/services/listing-views/listing-view-privacy.ts)
 * and referrer_origin instead of viewer_ip / referrer.
 *
 * The old columns are dropped by the next migration
 * (20261027020000_listing_views_drop_raw_ip), shipped in a separate deploy:
 * while this deploy rolls out, the previous container is still serving and
 * still inserts viewer_ip / referrer, so dropping them now would fail its
 * view tracking.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE public.listing_views
      ADD COLUMN IF NOT EXISTS viewer_ip_hash TEXT,
      ADD COLUMN IF NOT EXISTS referrer_origin TEXT
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE public.listing_views
      DROP COLUMN IF EXISTS viewer_ip_hash,
      DROP COLUMN IF EXISTS referrer_origin
  `)
}
