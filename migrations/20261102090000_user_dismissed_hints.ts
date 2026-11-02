import type { Knex } from "knex"

/**
 * user_dismissed_hints: the inline help hints (first-use cards) a signed-in
 * user has dismissed, so a dismissed hint never shows again on any device.
 * One row per (user, hint); hint keys are chosen by the frontend
 * (src/features/help/hints.ts there). Signed-out visitors keep theirs in
 * localStorage only.
 *
 * A new, empty table: additive, nothing hot is altered. The FK to accounts
 * takes a brief lock on accounts, so lock_timeout keeps it from queueing
 * behind traffic. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS user_dismissed_hints (
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      hint_key TEXT NOT NULL CHECK (hint_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_dismissed_hints_user_hint_key
      ON user_dismissed_hints (user_id, hint_key)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS user_dismissed_hints")
}
