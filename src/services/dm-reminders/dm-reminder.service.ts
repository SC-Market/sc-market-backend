import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import type { UserChannel } from "../notify/channels.js"
import { discordDmDisabled } from "../notify/kill-switch.js"

/**
 * The unread order/offer message reminder (event reminder.unread_messages).
 *
 * Timing: a conversation is reminded about once its newest message has been
 * unread for UNREAD_THRESHOLD_HOURS. The task runs every 30 minutes, so the
 * reminder goes out 6 to 6.5 hours after the message, well within a day.
 *
 * No flood (owner rules, 2026-11-01):
 * - only messages newer than REMINDER_CUTOVER (the deploy) and at most
 *   MAX_MESSAGE_AGE_HOURS old: old unread conversations are never backfilled;
 * - one reminder per user per REMINDER_INTERVAL_HOURS across all their
 *   conversations (a digest of every eligible conversation; dm_reminder_log);
 * - one reminder per conversation per new message (dm_reminder_conversations):
 *   a conversation left unread is not reminded about again until a new
 *   message arrives;
 * - at most MAX_USERS_PER_RUN users per run (logged when the cap is hit);
 * - a reminder is recorded as sent whatever the outcome, so a failed Discord
 *   DM (the bot can only DM users who share a server with it or installed the
 *   app) is logged once and never retried.
 *
 * Quiet when read: only unread notifications are considered at send time.
 *
 * Channels, both through notify() (owner decision 2026-11-02 for email):
 * - email: opt-in (the Personal dm_reminder row), sent on the email queue
 *   like every other notification email, so it is retried, in the user's
 *   language (email-i18n.ts), and re-checked at send time (verified primary
 *   address, not bounced, still opted in), with the one-click unsubscribe
 *   link and List-Unsubscribe headers;
 * - Discord DM: on by default for users with Discord linked; the user's
 *   preference applies; DISCORD_DM_DISABLED_EVENTS=reminder.unread_messages
 *   turns it off.
 */

export const EVENT_KEY = "reminder.unread_messages" as const
const DM_REMINDER_ACTION_TYPE_ID = 82
/** A conversation is reminded about once its newest message is this old and unread. */
export const UNREAD_THRESHOLD_HOURS = 6
/** Conversations whose newest message is older than this are never reminded about. */
export const MAX_MESSAGE_AGE_HOURS = 24
/** At most one reminder per user per this many hours. */
export const REMINDER_INTERVAL_HOURS = 24
/** Messages before this (the 2026-11-01 deploy) never trigger a reminder. */
export const REMINDER_CUTOVER = new Date("2026-11-02T00:00:00Z")
/** Users reminded per run at most. */
export const MAX_USERS_PER_RUN = 100
/** Conversations listed in one reminder. */
const MAX_LISTED = 5

export type ConversationAction = "order_message" | "offer_message"

export interface ReminderCandidate {
  user_id: string
  username: string
  display_name: string
  entity_id: string
  action: ConversationAction
  message_at: Date
}

export interface ReminderDigest {
  user_id: string
  username: string
  display_name: string
  conversations: { entity_id: string; action: ConversationAction; message_at: Date }[]
}

export interface ReminderOptions {
  /** Messages before this never trigger a reminder (tests pass an early date). */
  cutover?: Date
  maxUsers?: number
}

/**
 * The (user, conversation) pairs due a reminder now. Times are compared in
 * the database (NOW()), like the notification timestamps themselves.
 */
export function candidatesQuery(knex: Knex, opts: ReminderOptions = {}): Knex.QueryBuilder {
  const cutover = opts.cutover ?? REMINDER_CUTOVER
  return knex
    .select(
      "a.user_id",
      "a.username",
      "a.display_name",
      "no.entity_id",
      "na.action",
      "no.timestamp as message_at",
    )
    .from("notification as n")
    .join("notification_object as no", "n.notification_object_id", "no.notification_object_id")
    .join("notification_actions as na", "no.action_type_id", "na.action_type_id")
    .join("accounts as a", "n.notifier_id", "a.user_id")
    .where("n.read", false)
    .whereIn("na.action", ["order_message", "offer_message"])
    .where("no.timestamp", "<=", knex.raw(`NOW() - INTERVAL '${UNREAD_THRESHOLD_HOURS} hours'`))
    .where(
      "no.timestamp",
      ">",
      knex.raw(`GREATEST(NOW() - INTERVAL '${MAX_MESSAGE_AGE_HOURS} hours', ?::timestamptz)`, [cutover.toISOString()]),
    )
    .whereNull("a.deleted_at")
    .where("a.is_tombstone", false)
    // One reminder per user per interval, across all conversations.
    .whereNotExists(function () {
      this.select(knex.raw("1"))
        .from("dm_reminder_log as drl")
        .whereRaw("drl.user_id = a.user_id")
        .where("drl.last_reminded_at", ">", knex.raw(`NOW() - INTERVAL '${REMINDER_INTERVAL_HOURS} hours'`))
    })
    // One reminder per conversation per new message.
    .whereNotExists(function () {
      this.select(knex.raw("1"))
        .from("dm_reminder_conversations as drc")
        .whereRaw("drc.user_id = a.user_id")
        .whereRaw("drc.entity_id = no.entity_id")
        .whereRaw("drc.reminded_at >= no.timestamp")
    })
    // Reachable on at least one channel: email opted in with a verified
    // primary address, or Discord linked.
    .where(function () {
      this.whereExists(function () {
        this.select(knex.raw("1"))
          .from("email_notification_preferences as enp")
          .join("user_emails as ue", function () {
            this.on("ue.user_id", "=", "enp.user_id")
              .andOn("ue.email_verified", "=", knex.raw("true"))
              .andOn("ue.is_primary", "=", knex.raw("true"))
          })
          .whereRaw("enp.user_id = a.user_id")
          .where("enp.action_type_id", DM_REMINDER_ACTION_TYPE_ID)
          .where("enp.enabled", true)
          // Personal: what the unsubscribe link and the settings write.
          .whereNull("enp.contractor_id")
      }).orWhereExists(function () {
        this.select(knex.raw("1"))
          .from("account_providers as ap")
          .whereRaw("ap.user_id = a.user_id")
          .where("ap.provider_type", "discord")
      })
    })
    .orderBy("no.timestamp", "asc")
}

/** Group candidates into one digest per user (longest waiting first), capped. */
export function buildDigests(
  candidates: ReminderCandidate[],
  maxUsers = MAX_USERS_PER_RUN,
): { digests: ReminderDigest[]; capped: number } {
  const byUser = new Map<string, ReminderDigest>()
  for (const c of candidates) {
    let d = byUser.get(c.user_id)
    if (!d) {
      d = { user_id: c.user_id, username: c.username, display_name: c.display_name, conversations: [] }
      byUser.set(c.user_id, d)
    }
    if (!d.conversations.some((x) => x.entity_id === c.entity_id)) {
      d.conversations.push({ entity_id: c.entity_id, action: c.action, message_at: new Date(c.message_at) })
    }
  }
  const all = [...byUser.values()]
  return { digests: all.slice(0, maxUsers), capped: Math.max(0, all.length - maxUsers) }
}

function baseUrl(): string {
  return env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
}

export function conversationUrl(c: { entity_id: string; action: ConversationAction }): string {
  return c.action === "order_message"
    ? `${baseUrl()}/contract/${c.entity_id}`
    : `${baseUrl()}/offer/${c.entity_id}`
}

async function conversationTitles(knex: Knex, digests: ReminderDigest[]): Promise<Map<string, string>> {
  const ids = (action: ConversationAction) =>
    digests.flatMap((d) => d.conversations.filter((c) => c.action === action).map((c) => c.entity_id))
  const orderIds = ids("order_message")
  const sessionIds = ids("offer_message")
  const titles = new Map<string, string>()
  if (orderIds.length) {
    const rows: { order_id: string; title: string }[] = await knex("orders")
      .whereIn("order_id", orderIds)
      .select("order_id", "title")
    for (const r of rows) titles.set(r.order_id, r.title)
  }
  if (sessionIds.length) {
    const rows: { session_id: string; title: string }[] = await knex("offers")
      .whereIn("session_id", sessionIds)
      .distinctOn("session_id")
      .orderBy([{ column: "session_id" }, { column: "timestamp", order: "desc" }])
      .select("session_id", "title")
    for (const r of rows) titles.set(r.session_id, r.title)
  }
  return titles
}

/** The Discord DM for one digest. */
export function reminderDm(digest: ReminderDigest, titles: Map<string, string>) {
  const n = digest.conversations.length
  const lines = digest.conversations.slice(0, MAX_LISTED).map((c) => {
    const kind = c.action === "order_message" ? "Order" : "Offer"
    const title = (titles.get(c.entity_id) || `${kind} chat`).replace(/[[\]()]/g, "").slice(0, 80)
    return `• [${kind}: ${title}](${conversationUrl(c)})`
  })
  if (n > MAX_LISTED) lines.push(`…and ${n - MAX_LISTED} more`)
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title:
          n === 1
            ? "You have an unread message on SC Market"
            : `You have unread messages in ${n} conversations on SC Market`,
        description: `${lines.join("\n")}\n\nA quick reply keeps the trade moving.\n[Notification settings](${baseUrl()}/settings?tab=notifications)`.slice(0, 4000),
        url: conversationUrl(digest.conversations[0]),
        color: 0x10b881,
      },
    ],
  }
}

/** Where the reminder email's button goes: the one conversation, or Messages. */
export function reminderEmailUrl(digest: ReminderDigest): string {
  return digest.conversations.length === 1 ? conversationUrl(digest.conversations[0]) : `${baseUrl()}/messaging`
}

async function recordReminder(knex: Knex, digest: ReminderDigest): Promise<void> {
  await knex("dm_reminder_log")
    .insert({ user_id: digest.user_id, last_reminded_at: knex.fn.now() })
    .onConflict("user_id")
    .merge({ last_reminded_at: knex.fn.now() })
  await knex("dm_reminder_conversations")
    .insert(
      digest.conversations.map((c) => ({
        user_id: digest.user_id,
        entity_id: c.entity_id,
        reminded_at: knex.fn.now(),
      })),
    )
    .onConflict(["user_id", "entity_id"])
    .merge({ reminded_at: knex.fn.now() })
}

export interface ReminderRunStats {
  candidates: number
  users: number
  capped: number
  email_sent: number
  discord_sent: number
  discord_failed: number
  errors: number
}

/** One run of the reminder task (every 30 minutes). */
export async function processDmReminders(opts: ReminderOptions = {}): Promise<ReminderRunStats> {
  const knex = getKnex()
  const stats: ReminderRunStats = {
    candidates: 0,
    users: 0,
    capped: 0,
    email_sent: 0,
    discord_sent: 0,
    discord_failed: 0,
    errors: 0,
  }

  const candidates: ReminderCandidate[] = await candidatesQuery(knex, opts)
  stats.candidates = candidates.length
  if (!candidates.length) {
    logger.debug("DM reminder: nothing due")
    return stats
  }
  const maxUsers = opts.maxUsers ?? MAX_USERS_PER_RUN
  const { digests, capped } = buildDigests(candidates, maxUsers)
  stats.users = digests.length
  stats.capped = capped
  if (capped) {
    logger.warn("DM reminder: per-run cap reached; the rest wait for the next run", {
      cap: maxUsers,
      deferred_users: capped,
    })
  }

  const titles = await conversationTitles(knex, digests)
  const dmOff = discordDmDisabled(EVENT_KEY)
  const channels: UserChannel[] = dmOff ? ["email"] : ["email", "discord_dm"]

  for (const digest of digests) {
    try {
      // Record first: whatever happens below, this user and these
      // conversations are not reminded again (no retry spam).
      await recordReminder(knex, digest)

      const result = await notify(EVENT_KEY, [{ userId: digest.user_id, contractorId: null }], {
        entityId: digest.conversations[0].entity_id,
        dedupeKey: digest.conversations
          .map((c) => `${c.entity_id}@${c.message_at.toISOString()}`)
          .sort()
          .join(","),
        channels,
        messages: {
          // Rendered by the email queue (formatUnreadReminderEmailData).
          email: {
            data: { reminder: { conversations: digest.conversations.length, url: reminderEmailUrl(digest) } },
          },
          discord_dm: reminderDm(digest, titles),
        },
      })
      const count = (list: { channel: UserChannel }[], channel: UserChannel) =>
        list.filter((d) => d.channel === channel).length
      stats.email_sent += count(result.delivered, "email")
      stats.errors += count(result.failed, "email")
      stats.discord_sent += count(result.delivered, "discord_dm")
      stats.discord_failed += count(result.failed, "discord_dm")
    } catch (error) {
      stats.errors++
      logger.error("DM reminder: failed for user", {
        user_id: digest.user_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info("DM reminder run", { ...stats, discord_dm_disabled: dmOff })
  return stats
}

/**
 * Volume estimate for the owner (logged daily): over the last 7 days, the
 * order/offer conversation notifications with a new message, and how many
 * were still unread UNREAD_THRESHOLD_HOURS later (the ones a reminder would
 * cover). Counts only, no user data.
 */
export async function logReminderVolumeEstimate(): Promise<void> {
  try {
    const knex = getKnex()
    const unread = `n.read = false AND no.timestamp < NOW() - INTERVAL '${UNREAD_THRESHOLD_HOURS} hours'`
    const row = await knex("notification as n")
      .join("notification_object as no", "n.notification_object_id", "no.notification_object_id")
      .join("notification_actions as na", "no.action_type_id", "na.action_type_id")
      .whereIn("na.action", ["order_message", "offer_message"])
      .where("no.timestamp", ">", knex.raw("NOW() - INTERVAL '7 days'"))
      .first(
        knex.raw("COUNT(*)::integer AS conversation_notifications"),
        knex.raw("COUNT(DISTINCT n.notifier_id)::integer AS recipients"),
        knex.raw(`COUNT(*) FILTER (WHERE ${unread})::integer AS unread_past_threshold`),
        knex.raw(`COUNT(DISTINCT n.notifier_id) FILTER (WHERE ${unread})::integer AS users_unread_past_threshold`),
      )
    logger.info("DM reminder volume estimate (last 7 days)", row)
  } catch (error) {
    logger.warn("DM reminder volume estimate failed", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
