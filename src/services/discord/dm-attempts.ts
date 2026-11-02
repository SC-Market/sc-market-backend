/**
 * discord_dm_attempts: every Discord DM SC Market tried to send, in one place,
 * whichever path sent it (migration 20261102120000):
 *
 * - backend: discordService.trySendDirectMessage (notify()'s Discord DM
 *   channel, and any direct caller), source "notify:<event key>" or the
 *   caller's own;
 * - bot: DMs the Discord bot sends itself (today: the fulfilment-server invite
 *   when it can't add someone to an order thread), reported over the backend
 *   SQS queue as a "dm_result" message (tasks/discord-queue-consumer.ts),
 *   source "bot:<kind>".
 *
 * Per attempt: the user, sent or failed, and Discord's error code
 * (DM_CLOSED_CODE 50007: the bot cannot DM them, their DMs are closed or they
 * share no server with it). Attempts for Discord accounts not linked to an
 * SC Market user are not recorded (there is no one to attribute them to).
 * Recording never throws: a DM that went out is never failed by bookkeeping.
 */
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

/** Discord JSON error code: "Cannot send messages to this user". */
export const DM_CLOSED_CODE = 50007

/** Attempts are kept this many days (as notification_deliveries). */
export const DM_ATTEMPT_RETENTION_DAYS = 90

const SOURCE_RE = /^[a-z0-9_.:-]{1,64}$/
const DISCORD_ID_RE = /^\d{15,21}$/

export interface DmAttempt {
  /** The SC Market user; resolved from discordId when absent. */
  userId?: string | null
  /** The recipient's Discord user id (used only to find the user). */
  discordId?: string | null
  source: string
  status: "sent" | "failed"
  errorCode?: number | null
  httpStatus?: number | null
}

function intOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null
}

/** The SC Market user a Discord account is linked to, or null. */
async function userIdForDiscordId(discordId: string): Promise<string | null> {
  const row = await getKnex()("account_providers")
    .where({ provider_type: "discord", provider_id: discordId })
    .first("user_id")
  return row?.user_id ?? null
}

/** Record one DM attempt. Returns whether a row was written. Never throws. */
export async function recordDmAttempt(a: DmAttempt): Promise<boolean> {
  try {
    if (!SOURCE_RE.test(a.source)) {
      logger.warn("discord_dm_attempts: invalid source, not recorded", { source: String(a.source).slice(0, 80) })
      return false
    }
    let userId = a.userId ?? null
    if (!userId && a.discordId && DISCORD_ID_RE.test(a.discordId)) {
      userId = await userIdForDiscordId(a.discordId)
    }
    if (!userId) return false
    await getKnex()("discord_dm_attempts").insert({
      user_id: userId,
      source: a.source,
      status: a.status,
      error_code: a.status === "failed" ? intOrNull(a.errorCode) : null,
      http_status: a.status === "failed" ? intOrNull(a.httpStatus) : null,
    })
    return true
  } catch (err) {
    logger.warn("Failed to record Discord DM attempt", {
      source: a.source,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/** A "dm_result" message from the bot (backend SQS queue), validated. */
export interface BotDmResult {
  discord_id: string
  status: "sent" | "failed"
  source: string
  error_code?: number | null
  http_status?: number | null
}

/** Parse a bot dm_result payload; null when it is not one. */
export function parseBotDmResult(payload: unknown): BotDmResult | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  if (typeof p.discord_id !== "string" || !DISCORD_ID_RE.test(p.discord_id)) return null
  if (p.status !== "sent" && p.status !== "failed") return null
  if (typeof p.source !== "string" || !/^[a-z0-9_]{1,40}$/.test(p.source)) return null
  return {
    discord_id: p.discord_id,
    status: p.status,
    source: p.source,
    error_code: intOrNull(p.error_code),
    http_status: intOrNull(p.http_status),
  }
}

/** Record a bot-sent DM (source "bot:<kind>"). */
export async function recordBotDmResult(payload: unknown): Promise<boolean> {
  const r = parseBotDmResult(payload)
  if (!r) {
    logger.warn("Discord bot sent an invalid dm_result; ignored")
    return false
  }
  return recordDmAttempt({
    discordId: r.discord_id,
    source: `bot:${r.source}`,
    status: r.status,
    errorCode: r.error_code,
    httpStatus: r.http_status,
  })
}

/** Delete attempts past the retention window. */
export async function pruneDmAttempts(): Promise<number> {
  return getKnex()("discord_dm_attempts")
    .where("created_at", "<", getKnex().raw(`NOW() - INTERVAL '${DM_ATTEMPT_RETENTION_DAYS} days'`))
    .delete()
}
