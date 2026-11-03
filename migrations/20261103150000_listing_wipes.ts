import type { Knex } from "knex"

/**
 * Wipe tagging and one-click relist (services/listing-wipe), owner-approved
 * 2026-11-03:
 *
 * - listing_wipes: one row per run of the admin wipe (POST
 *   /admin/expire-all-listings): its id, when it ran, who ran it and how
 *   many listings it paused.
 * - listing_wipe_items: the listings a wipe paused, one row each, with the
 *   shop it was in then. relisted_at is set when the listing is put back on
 *   the market (Relist all, or a renew of that listing), for the admin's
 *   "relisted so far" count. The tag lives here rather than on listings so
 *   this migration never alters or locks a hot table. No FK to listings or
 *   shops (hot).
 * - listing_wipe_notices: the one "Your listings were paused for the wipe"
 *   message per user per wipe (event listing.paused_by_wipe). The primary
 *   key is the one-per-user rule; the sender claims rows in batches
 *   (claimed_at) and records the outcome (sent_at, outcome). contractor_ids
 *   are the orgs whose shops the user manages (manage_market) and personal
 *   whether they own a personal shop in the wipe. The accounts FK cascades
 *   on account deletion.
 * - notification_actions 'listing_paused_by_wipe' (entity listing_wipes).
 *
 * Additive and idempotent: new, empty tables and one notification_actions
 * row; lock_timeout keeps the accounts FK's brief lock from queueing behind
 * traffic.
 */
const ACTION = "listing_paused_by_wipe"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS listing_wipes (
      wipe_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ran_by UUID,
      paused_count INTEGER NOT NULL DEFAULT 0 CHECK (paused_count >= 0)
    )
  `)
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_listing_wipes_ran_at ON listing_wipes (ran_at DESC)`,
  )
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS listing_wipe_items (
      wipe_id UUID NOT NULL REFERENCES listing_wipes(wipe_id) ON DELETE CASCADE,
      listing_id UUID NOT NULL,
      shop_id UUID,
      relisted_at TIMESTAMPTZ,
      PRIMARY KEY (wipe_id, listing_id)
    )
  `)
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_listing_wipe_items_listing ON listing_wipe_items (listing_id)`,
  )
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS listing_wipe_notices (
      wipe_id UUID NOT NULL REFERENCES listing_wipes(wipe_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      personal BOOLEAN NOT NULL DEFAULT false,
      contractor_ids UUID[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      outcome TEXT,
      PRIMARY KEY (wipe_id, user_id)
    )
  `)
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_listing_wipe_notices_pending ON listing_wipe_notices (created_at) WHERE sent_at IS NULL`,
  )
  await knex.raw(
    `
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           ?, 'listing_wipes'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)
  `,
    [ACTION, ACTION],
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const id = `(SELECT action_type_id FROM notification_actions WHERE action = ?)`
  const objects = `(SELECT notification_object_id FROM notification_object WHERE action_type_id IN ${id})`
  await knex.raw(
    `DELETE FROM notification WHERE notification_object_id IN ${objects}`,
    [ACTION],
  )
  await knex.raw(
    `DELETE FROM notification_change WHERE notification_object_id IN ${objects}`,
    [ACTION],
  )
  await knex.raw(
    `DELETE FROM notification_object WHERE action_type_id IN ${id}`,
    [ACTION],
  )
  for (const table of [
    "email_notification_preferences",
    "push_notification_preferences",
    "notification_channel_preferences",
    "notification_channel_org_preferences",
  ]) {
    await knex.raw(`DELETE FROM ${table} WHERE action_type_id IN ${id}`, [
      ACTION,
    ])
  }
  await knex.raw(`DELETE FROM notification_actions WHERE action = ?`, [ACTION])
  await knex.raw("DROP TABLE IF EXISTS listing_wipe_notices")
  await knex.raw("DROP TABLE IF EXISTS listing_wipe_items")
  await knex.raw("DROP TABLE IF EXISTS listing_wipes")
}
