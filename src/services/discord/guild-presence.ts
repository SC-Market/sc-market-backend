/**
 * discord_guild_presence: does a user with Discord linked share at least one
 * server with the SC Market bot? A bot can normally DM only users who share a
 * server with it (or who installed the app on their account, which no API
 * shows), so this is a passive reachability signal: no DM is sent to find out.
 *
 * How (every REFRESH_INTERVAL_HOURS, tasks/tasks.ts): with the bot token, list
 * the bot's servers (GET /users/@me/guilds) and page through each server's
 * member list (GET /guilds/{id}/members, 1000 per page; needs the Server
 * Members intent, which the bot has: SCMarketBot main.py intents.members).
 * Requests go one at a time with a pause between pages; @discordjs/rest waits
 * out any rate limit. Only linked SC Market users are kept, as a count of
 * shared servers; no other member, and no server id, is stored.
 *
 * A complete crawl writes every linked user (true or false) and drops rows of
 * users no longer linked. If any server could not be read in full (an error,
 * or more than MAX_PAGES_PER_GUILD pages), only "shares a server" results are
 * written: a user missed there is not marked false.
 */
import type { Knex } from "knex"
import { Routes } from "discord-api-types/v10"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

export const REFRESH_INTERVAL_HOURS = 12
/** The report counts a result this recent (a missed refresh or two is fine; older is unknown). */
export const PRESENCE_FRESH_DAYS = 3
export const MEMBERS_PAGE_SIZE = 1000
export const MAX_PAGES_PER_GUILD = 200
const GUILDS_PAGE_SIZE = 200
const PAGE_DELAY_MS = 250
const WRITE_BATCH = 500

interface RestLike {
  get(route: `/${string}`, options?: { query?: URLSearchParams }): Promise<unknown>
}

export interface PresenceDeps {
  rest?: RestLike
  db?: Knex
  sleep?: (ms: number) => Promise<void>
  /** Run even if the last refresh is recent (tests). */
  force?: boolean
}

export interface PresenceRunStats {
  linked_users: number
  guilds: number
  guilds_incomplete: number
  member_pages: number
  sharing: number
  complete: boolean
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function botGuildIds(rest: RestLike, sleep: (ms: number) => Promise<void>): Promise<string[]> {
  const ids: string[] = []
  let after = "0"
  for (;;) {
    const page = (await rest.get(Routes.userGuilds(), {
      query: new URLSearchParams({ limit: String(GUILDS_PAGE_SIZE), after }),
    })) as { id: string }[]
    if (!Array.isArray(page) || !page.length) break
    ids.push(...page.map((g) => g.id))
    if (page.length < GUILDS_PAGE_SIZE) break
    after = page[page.length - 1].id
    await sleep(PAGE_DELAY_MS)
  }
  return ids
}

/** One refresh. Returns counts only. */
export async function refreshGuildPresence(deps: PresenceDeps = {}): Promise<PresenceRunStats | null> {
  if (!deps.rest && !env.DISCORD_API_KEY) {
    logger.warn("Discord guild presence: no bot token; skipped")
    return null
  }
  // Loaded here so the report (which reads this module's constants) doesn't pull in the Discord client.
  const rest = deps.rest ?? ((await import("./discord.service.js")).rest as unknown as RestLike)
  const db = deps.db ?? getKnex()
  const sleep = deps.sleep ?? defaultSleep

  // A deploy restarts the schedule: don't crawl again within the interval.
  if (!deps.force) {
    const last = await db("discord_guild_presence").max({ at: "checked_at" }).first()
    const at = last?.at ? new Date(last.at as string | Date) : null
    if (at && Date.now() - at.getTime() < (REFRESH_INTERVAL_HOURS - 1) * 60 * 60 * 1000) {
      logger.debug("Discord guild presence: refreshed recently; skipped")
      return null
    }
  }

  const linkedRows: { user_id: string; provider_id: string }[] = await db("account_providers as p")
    .join("accounts as a", "a.user_id", "p.user_id")
    .where("p.provider_type", "discord")
    .whereNull("a.deleted_at")
    .where("a.is_tombstone", false)
    .select("p.user_id", "p.provider_id")
  const userByDiscordId = new Map(linkedRows.filter((r) => r.provider_id).map((r) => [String(r.provider_id), r.user_id]))
  const stats: PresenceRunStats = {
    linked_users: userByDiscordId.size,
    guilds: 0,
    guilds_incomplete: 0,
    member_pages: 0,
    sharing: 0,
    complete: true,
  }
  if (!userByDiscordId.size) return stats

  const shared = new Map<string, number>()
  const guildIds = await botGuildIds(rest, sleep)
  stats.guilds = guildIds.length

  for (const guildId of guildIds) {
    let after = "0"
    let pages = 0
    try {
      for (;;) {
        const members = (await rest.get(Routes.guildMembers(guildId), {
          query: new URLSearchParams({ limit: String(MEMBERS_PAGE_SIZE), after }),
        })) as { user?: { id: string } }[]
        pages++
        stats.member_pages++
        if (!Array.isArray(members) || !members.length) break
        for (const m of members) {
          const userId = m.user ? userByDiscordId.get(m.user.id) : undefined
          if (userId) shared.set(userId, (shared.get(userId) ?? 0) + 1)
        }
        if (members.length < MEMBERS_PAGE_SIZE) break
        if (pages >= MAX_PAGES_PER_GUILD) {
          stats.guilds_incomplete++
          stats.complete = false
          logger.warn("Discord guild presence: server member list over the page cap; read in part", {
            pages,
          })
          break
        }
        after = members[members.length - 1].user?.id ?? after
        await sleep(PAGE_DELAY_MS)
      }
    } catch (err) {
      stats.guilds_incomplete++
      stats.complete = false
      logger.warn("Discord guild presence: could not read a server's members", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    await sleep(PAGE_DELAY_MS)
  }
  stats.sharing = shared.size

  const now = new Date()
  const rows = (stats.complete ? [...new Set(userByDiscordId.values())] : [...shared.keys()]).map((userId) => ({
    user_id: userId,
    shares_server: (shared.get(userId) ?? 0) > 0,
    guild_count: shared.get(userId) ?? 0,
    checked_at: now,
  }))
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    await db("discord_guild_presence")
      .insert(rows.slice(i, i + WRITE_BATCH))
      .onConflict("user_id")
      .merge(["shares_server", "guild_count", "checked_at"])
  }
  if (stats.complete) {
    await db("discord_guild_presence")
      .whereNotIn("user_id", db("account_providers").where("provider_type", "discord").select("user_id"))
      .delete()
  }
  logger.info("Discord guild presence refreshed", stats)
  return stats
}
