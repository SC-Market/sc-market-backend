import type { Knex } from "knex"

/**
 * - dm_reminder_conversations: which unread order/offer conversation each
 *   user was last reminded about (services/dm-reminders). A conversation is
 *   reminded about once per new message burst; dm_reminder_log still caps a
 *   user at one reminder per 24 hours across all conversations.
 * - listing_expiry_notices: the "Still selling?" notice sent before a listing
 *   expires (services/listing-expiry), one per (listing, expiry date), and
 *   what happened next (renewed, paused, reactivated) so the change can be
 *   measured. A shop's listings noticed in the same run share a batch_id (one
 *   notification per batch). No FK to listings or shops (hot tables).
 * - notification_actions 'listing_expiring': the in-app row of that notice
 *   (entity listing_expiry_notices).
 *
 * New, empty tables; lock_timeout keeps the accounts FK's brief lock from
 * queueing behind traffic. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS dm_reminder_conversations (
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      entity_id UUID NOT NULL,
      reminded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, entity_id)
    )
  `)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS listing_expiry_notices (
      notice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL,
      listing_id UUID NOT NULL,
      shop_id UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      renewed_at TIMESTAMPTZ,
      paused_at TIMESTAMPTZ,
      reactivated_at TIMESTAMPTZ,
      UNIQUE (listing_id, expires_at)
    )
  `)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_listing_expiry_notices_batch ON listing_expiry_notices (batch_id)`)
  await knex.raw(`
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           'listing_expiring', 'listing_expiry_notices'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = 'listing_expiring')
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  for (const table of ["notification", "notification_change"]) {
    await knex.raw(`
      DELETE FROM ${table}
      WHERE notification_object_id IN (
        SELECT o.notification_object_id FROM notification_object o
        JOIN notification_actions a ON a.action_type_id = o.action_type_id
        WHERE a.action = 'listing_expiring'
      )
    `)
  }
  await knex.raw(`
    DELETE FROM notification_object
    WHERE action_type_id IN (SELECT action_type_id FROM notification_actions WHERE action = 'listing_expiring')
  `)
  await knex.raw(`DELETE FROM notification_actions WHERE action = 'listing_expiring'`)
  await knex.raw("DROP TABLE IF EXISTS listing_expiry_notices")
  await knex.raw("DROP TABLE IF EXISTS dm_reminder_conversations")
}
