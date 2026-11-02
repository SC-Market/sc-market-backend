/**
 * Is a user reachable by a Discord DM from the SC Market bot? The one rule,
 * used by the seller reachability report (services/seller-reachability) and
 * by anything that wants to DM only users the bot can reach
 * (discordDmReachableUsers / isDiscordDmReachable).
 *
 * Owner decision (2026-11-02): "you have to share a server with the bot or
 * perhaps install the bot to your personal [account]". A user is reachable
 * when all of:
 * - their Discord account is linked (account_providers);
 * - their last recorded DM attempt (discord_dm_attempts, DM_ATTEMPT_RETENTION_DAYS)
 *   did not fail with 50007 (DM_CLOSED_CODE: DMs closed / no way to reach).
 *   Never DMed counts as not refused; other failures (rate limits, Discord
 *   errors) say nothing about reachability;
 * - they share a server with the bot (discord_guild_presence, checked within
 *   PRESENCE_FRESH_DAYS), or, once confirmed (USER_INSTALL_COUNTS_AS_DM_REACHABLE),
 *   installed the app on their own account (discord_user_installs,
 *   user-installs.ts).
 *
 * User installs are recorded but NOT counted yet. Discord's docs say a
 * user-installed app is usable "across all of a user's servers, within their
 * (G)DMs, and in DMs with the app's bot user" (changelog, 2024-03-15), and
 * "Once it's installed you can open a DM with it" (user-installable app
 * tutorial); nothing says the bot may open a DM to an installer who shares no
 * server with it. And as of 2026-11-02 the SC Market app's
 * integration_types_config has only GUILD_INSTALL ("0"): User Install is not
 * enabled in the Developer Portal, so no one can user-install it yet. Flip
 * USER_INSTALL_COUNTS_AS_DM_REACHABLE once the manual test (an account with
 * the app installed and no shared server receives a DM) passes.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { DM_ATTEMPT_RETENTION_DAYS, DM_CLOSED_CODE } from "./dm-attempts.js"
import { PRESENCE_FRESH_DAYS } from "./guild-presence.js"

/** Whether a recorded user install makes a user DM-reachable. False until confirmed (see above). */
export const USER_INSTALL_COUNTS_AS_DM_REACHABLE = false

/**
 * A LATERAL subquery with one row of Discord DM state for the user in
 * `userIdColumn` (a code-side, table-qualified column, never user input):
 * discord_linked, last_dm_status, last_dm_error_code, shares_server,
 * user_installed, dm_closed (last DM refused with 50007), server_or_app
 * (shares a server or installed the app, whatever the last DM did) and
 * dm_reachable (the rule above). Every flag is non-null.
 *
 * Bindings, in order: PRESENCE_FRESH_DAYS, DM_ATTEMPT_RETENTION_DAYS, DM_CLOSED_CODE.
 */
export function discordDmStateSql(userIdColumn: string): { sql: string; bindings: Knex.RawBinding[] } {
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i.test(userIdColumn)) {
    throw new Error(`Invalid column reference: ${userIdColumn}`)
  }
  const u = userIdColumn
  const reachableVia = USER_INSTALL_COUNTS_AS_DM_REACHABLE ? "(s.shares_server OR s.user_installed)" : "s.shares_server"
  const sql = `
    SELECT s.*,
           (s.shares_server OR s.user_installed) AS server_or_app,
           (s.discord_linked AND NOT s.dm_closed AND ${reachableVia}) AS dm_reachable
    FROM (
      SELECT
        EXISTS (
          SELECT 1 FROM account_providers p
          WHERE p.user_id = ${u} AND p.provider_type = 'discord'
        ) AS discord_linked,
        EXISTS (
          SELECT 1 FROM discord_guild_presence gp
          WHERE gp.user_id = ${u} AND gp.shares_server = true
            AND gp.checked_at > now() - make_interval(days => ?)
        ) AS shares_server,
        EXISTS (SELECT 1 FROM discord_user_installs ui WHERE ui.user_id = ${u}) AS user_installed,
        ld.status AS last_dm_status,
        ld.error_code AS last_dm_error_code,
        COALESCE(ld.status = 'failed' AND ld.error_code = ?, false) AS dm_closed
      FROM (SELECT 1) one
      LEFT JOIN LATERAL (
        SELECT d.status, d.error_code FROM discord_dm_attempts d
        WHERE d.user_id = ${u}
          AND d.created_at > now() - make_interval(days => ?)
        ORDER BY d.created_at DESC, d.attempt_id DESC
        LIMIT 1
      ) ld ON true
    ) s
  `
  // Placeholders in statement order: presence days, closed code, retention days.
  return { sql, bindings: [PRESENCE_FRESH_DAYS, DM_CLOSED_CODE, DM_ATTEMPT_RETENTION_DAYS] }
}

/** Of these users, the ones the bot can reach by Discord DM (the rule above). */
export async function discordDmReachableUsers(userIds: string[], db: Knex = getKnex()): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Set()
  const state = discordDmStateSql("u.user_id")
  const result = await db.raw(
    `SELECT u.user_id FROM unnest(?::uuid[]) AS u(user_id)
     CROSS JOIN LATERAL (${state.sql}) dm
     WHERE dm.dm_reachable`,
    [ids, ...state.bindings],
  )
  return new Set(((result?.rows ?? []) as { user_id: string }[]).map((r) => r.user_id))
}

/** Whether the bot can reach this user by Discord DM. */
export async function isDiscordDmReachable(userId: string, db: Knex = getKnex()): Promise<boolean> {
  return (await discordDmReachableUsers([userId], db)).has(userId)
}
