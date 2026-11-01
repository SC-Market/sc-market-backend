import type { Knex } from "knex"

/**
 * Seller activity on listings, shop cards and the shop page
 * (services/seller-activity):
 *
 * - account_settings.hide_online_status: the seller's "hide my online status"
 *   choice. When set, the user never counts towards a shop's "last seen".
 *   account_settings is not a hot table (migration-lock-rules.test.ts).
 * - shop_activity_stats: per shop, the seller's last activity (already
 *   filtered by that choice) and the typical reply time in order/offer chats
 *   over the last 90 days. Recomputed by a background task; a separate table
 *   so the hot shops table is not altered.
 *
 * New/empty objects; lock_timeout so the FK's brief lock on shops never
 * queues behind traffic. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE account_settings
      ADD COLUMN IF NOT EXISTS hide_online_status BOOLEAN NOT NULL DEFAULT false
  `)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS shop_activity_stats (
      shop_id UUID PRIMARY KEY REFERENCES shops(shop_id) ON DELETE CASCADE,
      last_active_at TIMESTAMPTZ,
      reply_median_minutes INTEGER,
      reply_sample_size INTEGER NOT NULL DEFAULT 0,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS shop_activity_stats")
  await knex.raw("ALTER TABLE account_settings DROP COLUMN IF EXISTS hide_online_status")
}
