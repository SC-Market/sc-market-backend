import type { Knex } from "knex"

/**
 * Email bounce tracking (services/email/email-feedback.ts). SES posts bounce,
 * complaint and delivery notifications through SNS to
 * POST /api/webhooks/ses/feedback; they land on the address's user_emails row:
 *
 * - email_bounced_at / bounce_type: the address is undeliverable. Set by a
 *   hard (Permanent) bounce, a complaint, or SOFT_BOUNCE_LIMIT soft
 *   (Transient) bounces in a row. The send path skips it; the user sees a
 *   notice in Settings › Email and re-verifying clears it.
 * - bounce_subtype: SES's bounceSubType or complaintFeedbackType, for staff.
 * - soft_bounce_count: soft bounces since the last delivery.
 * - last_delivered_at: the last SES Delivery notification for the address
 *   (the seller reachability report's "delivered recently").
 *
 * email_feedback_events: SNS MessageIds already applied, so a redelivered or
 * replayed notification is applied once. Rows older than two days are pruned
 * by the webhook (notifications older than a day are refused).
 *
 * Additive. user_emails is not a hot table; ADD COLUMN with constant (or no)
 * defaults is a catalog change. lock_timeout keeps the ALTER from queueing
 * behind traffic. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE user_emails
      ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS bounce_type TEXT NULL
        CONSTRAINT user_emails_bounce_type_check
        CHECK (bounce_type IN ('hard', 'soft', 'complaint')),
      ADD COLUMN IF NOT EXISTS bounce_subtype TEXT NULL,
      ADD COLUMN IF NOT EXISTS soft_bounce_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_delivered_at TIMESTAMPTZ NULL
  `)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS email_feedback_events (
      message_id TEXT PRIMARY KEY CHECK (length(message_id) BETWEEN 1 AND 128),
      notification_type TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS email_feedback_events_received_at_idx
      ON email_feedback_events (received_at)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS email_feedback_events")
  await knex.raw(`
    ALTER TABLE user_emails
      DROP COLUMN IF EXISTS last_delivered_at,
      DROP COLUMN IF EXISTS soft_bounce_count,
      DROP COLUMN IF EXISTS bounce_subtype,
      DROP COLUMN IF EXISTS bounce_type,
      DROP COLUMN IF EXISTS email_bounced_at
  `)
}
