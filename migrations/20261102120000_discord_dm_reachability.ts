import type { Knex } from "knex"

/**
 * Discord DM reachability (services/discord/dm-attempts.ts,
 * services/discord/guild-presence.ts), read by the seller reachability report.
 *
 * discord_dm_attempts: one row per Discord DM SC Market tried to send, from
 * any path: the backend (discordService.trySendDirectMessage, which notify()'s
 * Discord DM channel uses) and the bot (reported over the backend SQS queue as
 * "dm_result"). status sent | failed; error_code is Discord's JSON error code
 * (50007: cannot send messages to this user, i.e. DMs closed or no shared
 * server), http_status its HTTP status. source says which path sent it
 * ("notify:<event>", "bot:thread_invite", ...). Pruned after 90 days.
 *
 * discord_guild_presence: per user with Discord linked, whether their Discord
 * account shares at least one server with the SC Market bot (guild_count:
 * how many; which servers is not stored), as of checked_at. Refreshed by a
 * periodic task from the bot's guild member lists. No DM is sent to find out.
 *
 * Additive: two new, empty tables. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS discord_dm_attempts (
      attempt_id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 64),
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
      error_code INTEGER NULL,
      http_status INTEGER NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS discord_dm_attempts_user_created_idx
      ON discord_dm_attempts (user_id, created_at DESC)
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS discord_dm_attempts_created_idx
      ON discord_dm_attempts (created_at)
  `)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS discord_guild_presence (
      user_id UUID PRIMARY KEY REFERENCES accounts(user_id) ON DELETE CASCADE,
      shares_server BOOLEAN NOT NULL,
      guild_count INTEGER NOT NULL DEFAULT 0 CHECK (guild_count >= 0),
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS discord_guild_presence")
  await knex.raw("DROP TABLE IF EXISTS discord_dm_attempts")
}
