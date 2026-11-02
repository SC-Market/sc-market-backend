import type { Knex } from "knex"

/**
 * Installing the Discord bot through SC Market's own install flow
 * (services/discord/install-oauth.ts, api/routes/discord-install-routes.ts).
 *
 * discord_linked_guilds: a Discord server added to a shop or an org from that
 * shop's or org's Discord settings. The callback writes it only with a valid,
 * signed, single-use state from a user who may manage the owner's Discord
 * integration, and the guild id comes from Discord's code exchange. The
 * settings page lists the server's channels from it so threads and alerts
 * can be picked without /setup. owner_id is a shops.shop_id or a
 * contractors.contractor_id (like discord_channel_setups).
 *
 * discord_install_state_uses: install states (nonces) already used, so a
 * callback URL can't be replayed. A row is kept until its state expires
 * (10 minutes) and pruned after.
 *
 * Additive: two new, empty tables. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS discord_linked_guilds (
      owner_type TEXT NOT NULL CHECK (owner_type IN ('shop', 'org')),
      owner_id UUID NOT NULL,
      guild_id VARCHAR(32) NOT NULL CHECK (guild_id ~ '^[0-9]{15,22}$'),
      linked_by_user_id UUID REFERENCES accounts(user_id) ON DELETE SET NULL,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_type, owner_id, guild_id)
    )
  `)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS discord_install_state_uses (
      nonce VARCHAR(64) PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `)
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS discord_install_state_uses_expires_at ON discord_install_state_uses (expires_at)",
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS discord_install_state_uses")
  await knex.raw("DROP TABLE IF EXISTS discord_linked_guilds")
}
