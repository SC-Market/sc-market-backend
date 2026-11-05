/**
 * discord_user_installs: users who installed the SC Market Discord app on
 * their own account (migration 20261102170000). A bot can DM a user who
 * shares a server with it (discord_guild_presence) or who installed the app
 * for their account; owner decision (2026-11-02): the seller reachability
 * report counts a seller as reachable by Discord DM only in those cases.
 *
 * Detection: no Discord API lists an app's user installs. Every interaction
 * carries authorizing_integration_owners; when its USER_INSTALL key ("1") is
 * the interacting user's id, that user installed the app on their account.
 * The backend has no interactions endpoint (the bot holds the gateway
 * connection and receives every interaction), so the bot checks this
 * (SCMarketBot util/user_installs.py) and reports the Discord id over the
 * backend SQS queue as a "user_install" message (tasks/discord-queue-consumer.ts),
 * at most once per user per 6 hours. Only linked SC Market accounts are
 * recorded.
 *
 * The website's own install flow (install-oauth.ts) also records one when a
 * user install's code exchange names a Discord account linked to SC Market.
 *
 * Expiry: a later DM to the user that is refused (DM_REFUSAL_CODES, 50007 /
 * 50278: the app was removed, DMs are closed, or no mutual server) deletes the
 * row (dm-attempts.ts). The
 * next user-install interaction records it again, as a new row with fresh
 * timestamps; after a 50278 (no mutual server) that later install makes the
 * user reachable again (dm-reachability.ts compares last_seen_at with the
 * refused attempt's time). After a 50007 (DMs closed) it does not.
 *
 * Recording never throws.
 */
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

const DISCORD_ID_RE = /^\d{15,21}$/

/** A "user_install" message from the bot (backend SQS queue): the Discord id, validated; null when it is not one. */
export function parseUserInstall(payload: unknown): { discord_id: string } | null {
  if (!payload || typeof payload !== "object") return null
  const id = (payload as Record<string, unknown>).discord_id
  if (typeof id !== "string" || !DISCORD_ID_RE.test(id)) return null
  return { discord_id: id }
}

/**
 * Record that the Discord user installed the app on their account (from a bot
 * "user_install" message). Returns whether a row was written: false for an
 * invalid payload or a Discord account not linked to SC Market.
 */
export async function recordUserInstall(payload: unknown): Promise<boolean> {
  const parsed = parseUserInstall(payload)
  if (!parsed) {
    logger.warn("Discord bot sent an invalid user_install; ignored")
    return false
  }
  try {
    const knex = getKnex()
    const row = await knex("account_providers")
      .where({ provider_type: "discord", provider_id: parsed.discord_id })
      .first("user_id")
    if (!row?.user_id) return false
    return await recordUserInstallFor(String(row.user_id))
  } catch (err) {
    logger.warn("Failed to record a Discord user install", {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Record that this SC Market user installed the app on their Discord account
 * (the bot's report above, or our own install flow, install-oauth.ts, which
 * saw the install's code exchange). Returns whether a row was written.
 * Never throws.
 */
export async function recordUserInstallFor(userId: string): Promise<boolean> {
  try {
    const knex = getKnex()
    await knex("discord_user_installs")
      .insert({ user_id: userId, user_installed_at: knex.fn.now(), last_seen_at: knex.fn.now() })
      .onConflict("user_id")
      .merge({ last_seen_at: knex.fn.now() })
    return true
  } catch (err) {
    logger.warn("Failed to record a Discord user install", {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/** A DM to the user was refused (DM_REFUSAL_CODES): the app is no longer installed for them (or their DMs are closed). Never throws. */
export async function clearUserInstall(userId: string): Promise<void> {
  try {
    await getKnex()("discord_user_installs").where({ user_id: userId }).delete()
  } catch (err) {
    logger.warn("Failed to clear a Discord user install", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
