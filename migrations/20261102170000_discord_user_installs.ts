import type { Knex } from "knex"

/**
 * discord_user_installs (services/discord/user-installs.ts): users who
 * installed the SC Market Discord app on their own account (a "user install"),
 * so the bot can DM them without a shared server. Owner decision
 * (2026-11-02): the seller reachability report counts a seller as reachable
 * by Discord DM only if they share a server with the bot or installed the
 * app.
 *
 * No Discord API lists an app's user installs; the bot sees them on
 * interactions (authorizing_integration_owners["1"] is the interacting user)
 * and reports them over the backend SQS queue as "user_install".
 * user_installed_at: first seen (since the row was last cleared);
 * last_seen_at: the latest such interaction. The row is deleted when a later
 * DM to the user fails with 50007 (the app was removed or DMs are closed).
 *
 * Additive: one new, empty table. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS discord_user_installs (
      user_id UUID PRIMARY KEY REFERENCES accounts(user_id) ON DELETE CASCADE,
      user_installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS discord_user_installs")
}
