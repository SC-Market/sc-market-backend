import type { Knex } from "knex"

/**
 * One table for every Discord channel SC Market posts into: `discord_channel_setups`.
 *
 * A row says "this channel gets order threads and/or order alerts for this
 * owner". It replaces two older stores:
 * - Thread channels: `official_server_id` + `discord_thread_channel_id` on
 *   `shops`, `contractors` and `accounts`, plus the user's
 *   `account_integrations` (type `discord`) settings.
 * - Alerts: `order_alert_subscriptions`.
 *
 * Rules the table enforces:
 * - One row per (channel, owner); a row has threads, alerts or both.
 * - At most one thread channel per owner, because order threads are routed to
 *   exactly one place.
 *
 * Backfill, chosen so that thread routing and alerts are identical before and
 * after:
 * - Org and user thread rows come from owners with BOTH a server and a channel.
 *   Thread creation needs both, so a server-only or channel-only value never
 *   produced a thread. For users, the `account_integrations` settings win when
 *   the row exists, exactly as the old resolver read them.
 * - Shop thread rows come from shops with both values, except shops whose
 *   values equal their owner's. Those were copied from the owner when the shop
 *   columns were added (20260722000000), so routing to the owner gives the same
 *   server and channel, and later owner changes (via the bot) now reach them.
 * - Every `order_alert_subscriptions` row becomes an alerts row. When the same
 *   owner already has its thread channel there, the two merge into one row,
 *   which keeps the thread row's server.
 *
 * The old columns and table are left in place (unused) so this can be rolled
 * back; dropping them is a separate, later migration.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE discord_channel_setups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel_id VARCHAR(32) NOT NULL CHECK (channel_id ~ '^[0-9]+$'),
      guild_id VARCHAR(32) NOT NULL CHECK (guild_id ~ '^[0-9]+$'),
      owner_type VARCHAR(8) NOT NULL CHECK (owner_type IN ('shop', 'org', 'user')),
      owner_id UUID NOT NULL,
      threads BOOLEAN NOT NULL DEFAULT false,
      alerts BOOLEAN NOT NULL DEFAULT false,
      created_by_discord_id VARCHAR(32) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT discord_channel_setups_has_a_kind CHECK (threads OR alerts),
      CONSTRAINT discord_channel_setups_channel_owner UNIQUE (channel_id, owner_type, owner_id)
    )
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX discord_channel_setups_one_thread_channel
      ON discord_channel_setups (owner_type, owner_id) WHERE threads
  `)
  await knex.raw(`
    CREATE INDEX discord_channel_setups_owner_alerts
      ON discord_channel_setups (owner_type, owner_id) WHERE alerts
  `)
  await knex.raw(`CREATE INDEX discord_channel_setups_channel ON discord_channel_setups (channel_id)`)

  // Org thread channels.
  await knex.raw(`
    INSERT INTO discord_channel_setups (channel_id, guild_id, owner_type, owner_id, threads)
    SELECT c.discord_thread_channel_id::text, c.official_server_id::text, 'org', c.contractor_id, true
      FROM contractors c
     WHERE c.official_server_id IS NOT NULL
       AND c.discord_thread_channel_id IS NOT NULL
  `)

  // User thread channels: the discord integration settings when the user has
  // that row (even with empty values), else the legacy account columns.
  await knex.raw(`
    INSERT INTO discord_channel_setups (channel_id, guild_id, owner_type, owner_id, threads)
    SELECT cfg.channel_id, cfg.guild_id, 'user', cfg.user_id, true
      FROM (${USER_THREAD_CONFIG_SQL}) cfg
     WHERE cfg.guild_id IS NOT NULL
       AND cfg.channel_id IS NOT NULL
  `)

  // Shop thread channels that differ from the owner's.
  await knex.raw(`
    INSERT INTO discord_channel_setups (channel_id, guild_id, owner_type, owner_id, threads)
    SELECT s.discord_thread_channel_id, s.official_server_id, 'shop', s.shop_id, true
      FROM shops s
      LEFT JOIN contractors c ON c.contractor_id = s.owner_contractor_id
      LEFT JOIN (${USER_THREAD_CONFIG_SQL}) u ON u.user_id = s.owner_user_id
     WHERE NULLIF(s.official_server_id, '') IS NOT NULL
       AND NULLIF(s.discord_thread_channel_id, '') IS NOT NULL
       -- IS NOT DISTINCT FROM, not =: an owner with no values must not make
       -- the comparison NULL and drop the shop's own channel.
       AND NOT (
             (s.owner_contractor_id IS NOT NULL
              AND c.official_server_id::text IS NOT DISTINCT FROM s.official_server_id
              AND c.discord_thread_channel_id::text IS NOT DISTINCT FROM s.discord_thread_channel_id)
          OR (s.owner_user_id IS NOT NULL
              AND u.guild_id IS NOT DISTINCT FROM s.official_server_id
              AND u.channel_id IS NOT DISTINCT FROM s.discord_thread_channel_id)
       )
  `)

  // Alert subscriptions, merged into the owner's thread row for the same channel.
  await knex.raw(`
    INSERT INTO discord_channel_setups
      (channel_id, guild_id, owner_type, owner_id, alerts, created_by_discord_id, created_at)
    SELECT o.channel_id::text,
           o.guild_id::text,
           CASE WHEN o.contractor_id IS NOT NULL THEN 'org' ELSE 'user' END,
           COALESCE(o.contractor_id, o.user_id),
           true,
           o.created_by_discord_id::text,
           o.created_at
      FROM order_alert_subscriptions o
    ON CONFLICT (channel_id, owner_type, owner_id) DO UPDATE
       SET alerts = true,
           created_by_discord_id = EXCLUDED.created_by_discord_id
  `)
}

/** Each user's thread server and channel, as the old resolver read them. */
const USER_THREAD_CONFIG_SQL = `
  SELECT a.user_id,
         CASE WHEN i.user_id IS NOT NULL
              THEN NULLIF(i.settings->>'official_server_id', '')
              ELSE a.official_server_id::text END AS guild_id,
         CASE WHEN i.user_id IS NOT NULL
              THEN NULLIF(i.settings->>'discord_thread_channel_id', '')
              ELSE a.discord_thread_channel_id::text END AS channel_id
    FROM accounts a
    LEFT JOIN account_integrations i
      ON i.user_id = a.user_id AND i.integration_type = 'discord'
`

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS discord_channel_setups`)
}
