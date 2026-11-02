import type { Knex } from "knex"

/**
 * Pending-offer reminders (services/offer-reminders), owner-approved
 * 2026-11-02:
 *
 * - offer_reminders: one row per reminder sent to one person about one
 *   offer revision (order_offers.id) at one stage: "first" (to the seller
 *   side, ~24 h with no response), "final" (seller side, ~72 h) and "buyer"
 *   (to the customer, after the final nudge: still waiting, keep waiting /
 *   message / withdraw). UNIQUE (offer_id, stage, user_id): never twice. A
 *   user's reminders from one run share a batch_id, the in-app
 *   notification's entity (entity type offer_reminders). No FK to the offer
 *   tables (hot); the accounts FK cascades on account deletion.
 * - notification_actions for the three events (reminder.offer_pending,
 *   reminder.offer_pending_final, reminder.offer_waiting_buyer).
 * - discord_install_clicks: clicks on "Add SC Market to Discord" links, per
 *   day, install type (user / server) and the surface the link was on. Counts
 *   only, no user.
 *
 * Additive: new, empty tables and three notification_actions rows;
 * lock_timeout keeps the accounts FK's brief lock from queueing behind
 * traffic. Idempotent.
 */
const ACTIONS = ["offer_pending_reminder", "offer_pending_final_reminder", "offer_waiting_buyer"]

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS offer_reminders (
      reminder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL,
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      session_id UUID NOT NULL,
      offer_id UUID NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('first', 'final', 'buyer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (offer_id, stage, user_id)
    )
  `)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_offer_reminders_batch ON offer_reminders (batch_id)`)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_offer_reminders_user_created ON offer_reminders (user_id, created_at DESC)`)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_offer_reminders_offer ON offer_reminders (offer_id, stage)`)
  for (const action of ACTIONS) {
    await knex.raw(
      `
      INSERT INTO notification_actions (action_type_id, action, entity)
      SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
             ?, 'offer_reminders'
      WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)
    `,
      [action, action],
    )
  }
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS discord_install_clicks (
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      install_type TEXT NOT NULL CHECK (install_type IN ('user', 'server')),
      src TEXT NOT NULL CHECK (src ~ '^[a-z0-9_]{1,40}$'),
      clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
      PRIMARY KEY (day, install_type, src)
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const ids = `(SELECT action_type_id FROM notification_actions WHERE action = ANY(?))`
  const objects = `(SELECT notification_object_id FROM notification_object WHERE action_type_id IN ${ids})`
  await knex.raw(`DELETE FROM notification WHERE notification_object_id IN ${objects}`, [ACTIONS])
  await knex.raw(`DELETE FROM notification_change WHERE notification_object_id IN ${objects}`, [ACTIONS])
  await knex.raw(`DELETE FROM notification_object WHERE action_type_id IN ${ids}`, [ACTIONS])
  for (const table of [
    "email_notification_preferences",
    "push_notification_preferences",
    "notification_channel_preferences",
    "notification_channel_org_preferences",
  ]) {
    await knex.raw(`DELETE FROM ${table} WHERE action_type_id IN ${ids}`, [ACTIONS])
  }
  await knex.raw(`DELETE FROM notification_actions WHERE action = ANY(?)`, [ACTIONS])
  await knex.raw("DROP TABLE IF EXISTS discord_install_clicks")
  await knex.raw("DROP TABLE IF EXISTS offer_reminders")
}
