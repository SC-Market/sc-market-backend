import type { Knex } from "knex"

/**
 * Notification scoping by org (owner-approved, drafts/notifications-design.md §8).
 *
 * - notification_org_mutes: a member mutes one org's notifications. While
 *   muted (muted_until NULL = until turned back on), push, email and Discord
 *   DM for that org's events stop; in-app rows are still written and
 *   mandatory alerts still go through.
 * - notification_channel_org_preferences: per-org in-app / Discord DM choices
 *   (push and email already have contractor_id). A sibling table rather than
 *   a column on notification_channel_preferences, so that table's primary key
 *   and its upserts stay as they are. An org row wins over the personal row;
 *   without one the personal row applies, as today.
 * - notification_actions 'org_member_joined' (in-app only by default).
 *
 * New tables only, plus one insert into a small table: idempotent, no lock
 * on any hot table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notification_org_mutes (
      user_id uuid NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      contractor_id uuid NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
      muted_until timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, contractor_id)
    )
  `)

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notification_channel_org_preferences (
      user_id uuid NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      action_type_id integer NOT NULL REFERENCES notification_actions(action_type_id) ON DELETE CASCADE,
      channel varchar(16) NOT NULL CHECK (channel IN ('site', 'discord', 'spectrum')),
      contractor_id uuid NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
      enabled boolean NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, action_type_id, channel, contractor_id)
    )
  `)

  await knex.raw(`
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           'org_member_joined', 'contractors'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = 'org_member_joined')
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS notification_channel_org_preferences")
  await knex.raw("DROP TABLE IF EXISTS notification_org_mutes")
}
