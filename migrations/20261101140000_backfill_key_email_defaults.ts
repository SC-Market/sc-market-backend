import type { Knex } from "knex"

/**
 * Backfill the key email notification defaults for existing users (owner
 * approval 2026-11-01; drafts/onboarding-standing-selfhost.md §A3). New
 * emails get them from applyKeyEmailDefaults (services/notify/email-defaults.ts).
 *
 * For each key action (KEY_EMAIL_ACTIONS: the four order statuses, new and
 * counter offers, dm_reminder), insert a Personal (contractor_id NULL)
 * enabled row for a user who:
 * - has a verified primary email;
 * - has NO Personal row for that action, on or off (a row is the user's
 *   choice and is never touched);
 * - never used an unsubscribe link (email_unsubscribe_tokens.used_at: the old
 *   links turned off only existing rows, so someone who unsubscribed with
 *   no rows has no row to show for it);
 * - is not a test account, deleted, tombstoned or banned.
 *
 * Also, for the users it changed:
 * - email_defaults_notices: their next notification email carries a one-time
 *   banner ("We turned on email for order updates, offers and unread
 *   messages. Turn off with one click", services/email/defaults-notice.ts).
 *   No bulk email is sent.
 * Only new events email: the queue is filled by events as they happen
 * (nothing here enqueues anything), and the unread-message reminder only
 * covers messages from the last 24 hours and after its 2026-11-02 cutover
 * (dm-reminder.service.ts REMINDER_CUTOVER, MAX_MESSAGE_AGE_HOURS).
 *
 * Idempotent: a second run finds a row for every action it wrote and inserts
 * nothing. Logs the counts and an expected daily email volume.
 */
const KEY_ACTIONS = [
  "order_status_not_started",
  "order_status_in_progress",
  "order_status_fulfilled",
  "order_status_cancelled",
  "offer_create",
  "counter_offer_create",
  "dm_reminder",
]

// knex.raw turns `?` into a binding even inside literals: no `?` in this SQL.
const KEY_ACTIONS_SQL = KEY_ACTIONS.map((a) => `'${a}'`).join(", ")

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS email_defaults_notices (
      user_id uuid PRIMARY KEY REFERENCES accounts(user_id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      shown_at timestamptz
    )
  `)

  await knex.raw(`
    CREATE TEMP TABLE _email_backfill (user_id uuid NOT NULL, action text NOT NULL) ON COMMIT DROP
  `)
  await knex.raw(`
    WITH key_actions AS (
      SELECT action_type_id, action FROM notification_actions WHERE action IN (${KEY_ACTIONS_SQL})
    ),
    eligible AS (
      SELECT DISTINCT ue.user_id
      FROM user_emails ue
      JOIN accounts a ON a.user_id = ue.user_id
      WHERE ue.email_verified
        AND ue.is_primary
        AND NOT a.is_test
        AND NOT COALESCE(a.banned, false)
        AND a.deleted_at IS NULL
        AND NOT COALESCE(a.is_tombstone, false)
        AND NOT EXISTS (
          SELECT 1 FROM email_unsubscribe_tokens t
          WHERE t.user_id = ue.user_id AND t.used_at IS NOT NULL
        )
    ),
    inserted AS (
      INSERT INTO email_notification_preferences
        (user_id, action_type_id, contractor_id, enabled, frequency, digest_time, created_at, updated_at)
      SELECT e.user_id, k.action_type_id, NULL, true, 'immediate', NULL, now(), now()
      FROM eligible e
      CROSS JOIN key_actions k
      WHERE NOT EXISTS (
        SELECT 1 FROM email_notification_preferences p
        WHERE p.user_id = e.user_id
          AND p.action_type_id = k.action_type_id
          AND p.contractor_id IS NULL
      )
      RETURNING user_id, action_type_id
    )
    INSERT INTO _email_backfill (user_id, action)
    SELECT i.user_id, k.action FROM inserted i JOIN key_actions k ON k.action_type_id = i.action_type_id
  `)

  await knex.raw(`
    INSERT INTO email_defaults_notices (user_id)
    SELECT DISTINCT user_id FROM _email_backfill
    ON CONFLICT (user_id) DO NOTHING
  `)

  const counts = await knex.raw(`
    SELECT
      (SELECT COUNT(DISTINCT user_id) FROM _email_backfill)::int AS users_affected,
      (SELECT COUNT(*) FROM _email_backfill)::int AS rows_inserted
  `)
  const byAction = await knex.raw(`
    SELECT action, COUNT(*)::int AS n FROM _email_backfill GROUP BY action ORDER BY action
  `)
  // Expected daily volume from the last 7 days of in-app notifications for
  // the backfilled (user, action) pairs: each such event would now also email.
  // Unread-message reminders are at most one per user per day.
  const volume = await knex.raw(`
    SELECT
      (COUNT(*) FILTER (WHERE na.action <> 'dm_reminder') / 7.0)::numeric(10,1) AS event_emails_per_day
    FROM notification n
    JOIN notification_object nobj ON nobj.notification_object_id = n.notification_object_id
    JOIN notification_actions na ON na.action_type_id = nobj.action_type_id
    JOIN _email_backfill b ON b.user_id = n.notifier_id AND b.action = na.action
    WHERE nobj.timestamp > now() - interval '7 days'
  `)
  const reminderUsers = await knex.raw(`
    SELECT COUNT(DISTINCT b.user_id)::int AS users_with_recent_messages
    FROM _email_backfill b
    JOIN notification n ON n.notifier_id = b.user_id
    JOIN notification_object nobj ON nobj.notification_object_id = n.notification_object_id
    JOIN notification_actions na ON na.action_type_id = nobj.action_type_id
    WHERE b.action = 'dm_reminder'
      AND na.action IN ('order_message', 'offer_message')
      AND nobj.timestamp > now() - interval '7 days'
  `)

  const summary = {
    ...counts.rows[0],
    rows_by_action: Object.fromEntries(byAction.rows.map((r: { action: string; n: number }) => [r.action, r.n])),
    expected_event_emails_per_day: Number(volume.rows[0]?.event_emails_per_day ?? 0),
    dm_reminder_users_with_messages_last_7d: reminderUsers.rows[0]?.users_with_recent_messages ?? 0,
  }
  console.log(`[migration] backfill_key_email_defaults ${JSON.stringify(summary)}`)
}

export async function down(knex: Knex): Promise<void> {
  // The inserted rows are indistinguishable from the users' own choices once
  // they've been seen or changed, so they are not removed. The notice table
  // goes.
  await knex.raw("DROP TABLE IF EXISTS email_defaults_notices")
}
