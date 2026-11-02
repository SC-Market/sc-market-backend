/**
 * Pending-offer reminders (owner decision 2026-11-02). Until now the only
 * reminder was for unread chat messages (services/dm-reminders); nothing
 * nudged a seller about an offer they had not answered.
 *
 * An offer is pending while its session is active, its newest revision
 * (order_offers) was made by the customer (the site shows "Waiting for
 * Seller") and no one on the seller side has written in the offer chat since
 * that revision. Accepting, declining or countering ends it (the session
 * closes, or the newest revision is the seller's); so does any seller message.
 * A customer counter-offer is a new revision: its clock starts again.
 *
 * Stages, by the pending revision's age (the task runs every 30 minutes):
 * - "first"  (reminder.offer_pending): FIRST_AFTER_HOURS (24 h), to the
 *   seller side;
 * - "final"  (reminder.offer_pending_final): FINAL_AFTER_HOURS (72 h), to
 *   the seller side, saying the buyer will be told;
 * - "buyer"  (reminder.offer_waiting_buyer): BUYER_AFTER_FINAL_HOURS (24 h)
 *   after the final nudge went out, to the customer: it is still waiting,
 *   keep waiting, message the seller or withdraw. When no final nudge went
 *   out (no one on the seller side could be reminded, e.g. an org with no
 *   remindable manage_orders member), the buyer is told anyway at
 *   BUYER_FALLBACK_HOURS (96 h) after the offer; offer_reminders records
 *   that case as seller_reminded = false.
 * A stage is only sent within STAGE_WINDOW_HOURS of becoming due (a stage
 * deferred longer, e.g. by the caps, is skipped, never sent stale), and the
 * first stage only before the final one is due.
 *
 * Seller side: as for new offers (services/notify/plans.ts offerPlans): the
 * assigned member, plus the org's members with manage_orders for an org
 * offer (services/notify/recipients.ts), deduplicated, never the customer.
 * Preferences are Personal (category "reminders"): one digest per user spans
 * every org.
 *
 * Caps and safety:
 * - kill switch: OFFER_REMINDERS_ENABLED=false stops the task (default on);
 *   DISCORD_DM_DISABLED_EVENTS can still turn off the Discord DM of any of
 *   the three events (services/notify/kill-switch.ts);
 * - only revisions made after OFFER_REMINDER_CUTOVER (the deploy): no
 *   backlog of old offers is ever reminded;
 * - at most one digest per user per run (one stage; final before first
 *   before buyer, the rest wait for the next run), at most
 *   DAILY_CAP_PER_USER digests per user per rolling 24 hours, at most
 *   MAX_USERS_PER_RUN users per run (logged when hit);
 * - test accounts are excluded (services/test-accounts): sessions whose
 *   customer is a test account (realms never mix, so the seller side is too)
 *   and test recipients; deleted, tombstoned and banned accounts get nothing;
 * - a reminder is recorded (offer_reminders) before it is sent, whatever the
 *   outcome: never retried, never sent twice. Every Discord DM attempt is
 *   recorded in discord_dm_attempts by trySendDirectMessage (notify()'s
 *   Discord DM adapter).
 */
import type { Knex } from "knex"
import { randomUUID } from "node:crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import { discordDmDisabled } from "../notify/kill-switch.js"
import { orgMembersWithPermission } from "../notify/recipients.js"
import type { RenderedMessages, UserChannel } from "../notify/channels.js"

export const EVENTS = {
  first: "reminder.offer_pending",
  final: "reminder.offer_pending_final",
  buyer: "reminder.offer_waiting_buyer",
} as const
export type Stage = keyof typeof EVENTS
export const LEGACY_ACTIONS: Record<Stage, string> = {
  first: "offer_pending_reminder",
  final: "offer_pending_final_reminder",
  buyer: "offer_waiting_buyer",
}

export const FIRST_AFTER_HOURS = 24
export const FINAL_AFTER_HOURS = 72
export const BUYER_AFTER_FINAL_HOURS = 24
/** The buyer is told at this offer age when no final nudge was sent. */
export const BUYER_FALLBACK_HOURS = FINAL_AFTER_HOURS + BUYER_AFTER_FINAL_HOURS
export const STAGE_WINDOW_HOURS = 48
/** Offer revisions before this (the deploy) are never reminded about. */
export const OFFER_REMINDER_CUTOVER = new Date("2026-11-02T18:00:00Z")
export const DAILY_CAP_PER_USER = 3
export const MAX_USERS_PER_RUN = 100
const MAX_LISTED = 5
/** Due offers read per run at most (the window keeps it small; logged when hit). */
const MAX_CANDIDATES = 2000

/** Read on every run: OFFER_REMINDERS_ENABLED=false turns the reminders off. */
export function offerRemindersEnabled(e: NodeJS.ProcessEnv = process.env): boolean {
  return (e.OFFER_REMINDERS_ENABLED ?? "").trim().toLowerCase() !== "false"
}

/** A pending offer revision with the stages due for it now. */
export interface DueOffer {
  session_id: string
  offer_id: string
  title: string
  offer_at: Date
  customer_id: string
  customer_name: string
  assigned_id: string | null
  contractor_id: string | null
  seller_name: string
  first_due: boolean
  final_due: boolean
  buyer_due: boolean
  /** Whether a final nudge went out to the seller side (the buyer stage records it). */
  final_sent: boolean
}

export interface ReminderOptions {
  /** Revisions before this are never reminded about (tests pass an early date). */
  cutover?: Date
  maxUsers?: number
  dailyCap?: number
}

/**
 * The pending offer revisions with a stage due now. Times are compared in
 * the database (NOW()), like the offer timestamps themselves.
 */
export function dueOffersSql(cutover: Date): { sql: string; bindings: Knex.RawBinding[] } {
  const first = FIRST_AFTER_HOURS
  const final = FINAL_AFTER_HOURS
  const window = STAGE_WINDOW_HOURS
  const buyerAfter = BUYER_AFTER_FINAL_HOURS
  const oldest = final + buyerAfter + window * 2
  const fallback = BUYER_FALLBACK_HOURS
  const sql = `
    WITH pending AS (
      SELECT s.id AS session_id,
             s.customer_id,
             s.assigned_id,
             s.contractor_id,
             s.shop_id,
             o.id AS offer_id,
             o.title,
             o.timestamp AS offer_at
      FROM offer_sessions s
      CROSS JOIN LATERAL (
        SELECT oo.id, oo.title, oo.timestamp, oo.actor_id
        FROM order_offers oo
        WHERE oo.session_id = s.id
        ORDER BY oo.timestamp DESC, oo.id DESC
        LIMIT 1
      ) o
      WHERE s.status = 'active'
        AND o.actor_id = s.customer_id
        AND o.timestamp >= ?::timestamptz
        AND o.timestamp <= now() - INTERVAL '${first} hours'
        AND o.timestamp > now() - INTERVAL '${oldest} hours'
        AND NOT EXISTS (SELECT 1 FROM accounts ta WHERE ta.user_id = s.customer_id AND ta.is_test)
        AND NOT EXISTS (
          SELECT 1 FROM chats c
          JOIN messages m ON m.chat_id = c.chat_id
          WHERE c.session_id = s.id
            AND m.author IS NOT NULL
            AND m.author <> s.customer_id
            AND m.timestamp > o.timestamp
        )
    ),
    staged AS (
      SELECT p.*,
             (SELECT MIN(r.created_at) FROM offer_reminders r
              WHERE r.offer_id = p.offer_id AND r.stage = 'final') AS final_sent_at
      FROM pending p
    )
    SELECT st.session_id,
           st.offer_id,
           st.title,
           st.offer_at,
           st.customer_id,
           st.assigned_id,
           st.contractor_id,
           COALESCE(NULLIF(cu.display_name, ''), cu.username) AS customer_name,
           COALESCE(sh.name, ct.name, NULLIF(asg.display_name, ''), asg.username, 'the seller') AS seller_name,
           (st.offer_at > now() - INTERVAL '${final} hours'
             AND st.offer_at <= now() - INTERVAL '${first} hours') AS first_due,
           (st.offer_at <= now() - INTERVAL '${final} hours'
             AND st.offer_at > now() - INTERVAL '${final + window} hours') AS final_due,
           (st.final_sent_at IS NOT NULL) AS final_sent,
           CASE
             WHEN st.final_sent_at IS NOT NULL THEN
               st.final_sent_at <= now() - INTERVAL '${buyerAfter} hours'
               AND st.final_sent_at > now() - INTERVAL '${buyerAfter + window} hours'
             -- No seller reminder could be sent: tell the buyer anyway.
             ELSE st.offer_at <= now() - INTERVAL '${fallback} hours'
               AND st.offer_at > now() - INTERVAL '${fallback + window} hours'
           END AS buyer_due
    FROM staged st
    JOIN accounts cu ON cu.user_id = st.customer_id
    LEFT JOIN shops sh ON sh.shop_id = st.shop_id
    LEFT JOIN contractors ct ON ct.contractor_id = st.contractor_id
    LEFT JOIN accounts asg ON asg.user_id = st.assigned_id
    ORDER BY st.offer_at ASC
    LIMIT ${MAX_CANDIDATES}
  `
  return { sql, bindings: [cutover.toISOString()] }
}

/** One (recipient, stage, offer) the run may remind about. */
export interface ReminderItem {
  user_id: string
  stage: Stage
  offer: DueOffer
}

/** Who a stage goes to: the seller side (assigned + org managers), or the customer. */
export async function stageRecipients(offer: DueOffer, stage: Stage): Promise<string[]> {
  if (stage === "buyer") return [offer.customer_id]
  const ids = new Set<string>()
  if (offer.assigned_id) ids.add(offer.assigned_id)
  if (offer.contractor_id) {
    for (const r of await orgMembersWithPermission(offer.contractor_id, "manage_orders")) ids.add(r.userId)
  }
  ids.delete(offer.customer_id)
  return [...ids]
}

/** The stages due for an offer, most advanced first (final replaces first). */
export function stagesOf(offer: DueOffer): Stage[] {
  const out: Stage[] = []
  if (offer.final_due) out.push("final")
  else if (offer.first_due) out.push("first")
  if (offer.buyer_due) out.push("buyer")
  return out
}

const STAGE_PRIORITY: Stage[] = ["final", "first", "buyer"]

export interface Digest {
  batch_id: string
  user_id: string
  stage: Stage
  offers: DueOffer[]
}

/**
 * One digest per user (the most urgent stage they have; the rest wait for the
 * next run), capped. Items must already exclude what was sent and who may not
 * be reminded.
 */
export function buildDigests(items: ReminderItem[], maxUsers = MAX_USERS_PER_RUN): { digests: Digest[]; capped: number } {
  const byUser = new Map<string, Map<Stage, DueOffer[]>>()
  for (const it of items) {
    let stages = byUser.get(it.user_id)
    if (!stages) byUser.set(it.user_id, (stages = new Map()))
    const list = stages.get(it.stage) ?? []
    if (!list.some((o) => o.offer_id === it.offer.offer_id)) list.push(it.offer)
    stages.set(it.stage, list)
  }
  const all: Digest[] = []
  for (const [user_id, stages] of byUser) {
    const stage = STAGE_PRIORITY.find((s) => stages.has(s))!
    all.push({ batch_id: randomUUID(), user_id, stage, offers: stages.get(stage)! })
  }
  return { digests: all.slice(0, maxUsers), capped: Math.max(0, all.length - maxUsers) }
}

function baseUrl(): string {
  return env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
}

export function offerUrl(sessionId: string, action?: "withdraw"): string {
  return `${baseUrl()}/offer/${sessionId}${action ? `?action=${action}` : ""}`
}

/** Text for Discord markdown: no link or formatting syntax from user content. */
function plain(s: string, max = 80): string {
  return s.replace(/[[\]()*_`~|>#]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "Offer"
}

function waited(offerAt: Date, now: Date): string {
  const hours = Math.max(0, Math.floor((now.getTime() - offerAt.getTime()) / 3_600_000))
  const days = Math.floor(hours / 24)
  return days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`
}

function titleFor(d: Digest): string {
  const n = d.offers.length
  if (d.stage === "buyer") {
    return n === 1 ? "Your offer is still waiting for the seller" : `${n} of your offers are still waiting for the seller`
  }
  if (d.stage === "final") {
    return n === 1
      ? "Last reminder: an offer is still waiting for your reply"
      : `Last reminder: ${n} offers are still waiting for your reply`
  }
  return n === 1 ? "An offer is waiting for your reply" : `${n} offers are waiting for your reply`
}

function bodyFor(d: Digest, now: Date): string {
  const o = d.offers[0]
  const n = d.offers.length
  if (d.stage === "buyer") {
    return n === 1
      ? `${plain(o.seller_name, 60)} hasn't replied to "${plain(o.title)}" in ${waited(o.offer_at, now)}. Keep waiting, message the seller, or withdraw the offer.`
      : `The sellers haven't replied in a few days. Keep waiting, message them, or withdraw.`
  }
  const tail =
    d.stage === "final"
      ? " If it stays unanswered, the buyer will be told it's still waiting."
      : " Accept, decline, counter or reply in the chat."
  return n === 1
    ? `${plain(o.customer_name, 60)} has waited ${waited(o.offer_at, now)} for a reply to "${plain(o.title)}".${tail}`
    : `${n} buyers are waiting for a reply.${tail}`
}

/** The Discord DM for a digest (link buttons only: they need no interaction handling). */
export function reminderDm(d: Digest, now = new Date()) {
  const n = d.offers.length
  const lines = d.offers.slice(0, MAX_LISTED).map((o) => {
    const who = d.stage === "buyer" ? plain(o.seller_name, 40) : plain(o.customer_name, 40)
    return `• [${plain(o.title)}](${offerUrl(o.session_id)}) · ${who} · ${waited(o.offer_at, now)}`
  })
  if (n > MAX_LISTED) lines.push(`…and ${n - MAX_LISTED} more`)
  const first = d.offers[0]
  const footer =
    d.stage === "buyer"
      ? "To keep waiting, you don't need to do anything."
      : d.stage === "final"
        ? "This is the last reminder about " + (n === 1 ? "this offer." : "these offers.")
        : "A quick reply keeps the trade moving."
  const buttons =
    d.stage === "buyer" && n === 1
      ? [
          { type: 2, style: 5, label: "Message the seller", url: offerUrl(first.session_id) },
          { type: 2, style: 5, label: "Withdraw the offer", url: offerUrl(first.session_id, "withdraw") },
        ]
      : [{ type: 2, style: 5, label: n === 1 ? "Open the offer" : "Open the first offer", url: offerUrl(first.session_id) }]
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: titleFor(d).slice(0, 256),
        description: `${bodyFor(d, now)}\n\n${lines.join("\n")}\n\n${footer}\n[Notification settings](${baseUrl()}/settings?tab=notifications)`.slice(0, 4000),
        url: offerUrl(first.session_id),
        color: 0x10b881,
      },
    ],
    components: [{ type: 1, components: buttons }],
  } as unknown as NonNullable<RenderedMessages["discord_dm"]>
}

/** What each channel of a digest delivers. */
export function reminderMessages(d: Digest, now = new Date()): RenderedMessages {
  const first = d.offers[0]
  const url = offerUrl(first.session_id)
  const base = baseUrl()
  return {
    push: {
      title: titleFor(d),
      body: bodyFor(d, now),
      icon: `${base}/android-chrome-192x192.png`,
      data: { url, type: "offer", entityId: first.session_id },
      tag: `offer-reminder-${d.stage}-${d.batch_id}`,
    },
    email: {
      data: {
        offerReminder: {
          stage: d.stage,
          title: titleFor(d),
          body: bodyFor(d, now),
          offers: d.offers.slice(0, MAX_LISTED).map((o) => ({
            session_id: o.session_id,
            title: o.title,
            counterparty: d.stage === "buyer" ? o.seller_name : o.customer_name,
            waited: waited(o.offer_at, now),
            url: offerUrl(o.session_id),
          })),
          more: Math.max(0, d.offers.length - MAX_LISTED),
          url,
          withdraw_url: d.stage === "buyer" && d.offers.length === 1 ? offerUrl(first.session_id, "withdraw") : null,
        },
      },
    },
    discord_dm: reminderDm(d, now),
  }
}

/** Accounts that may be reminded: not deleted, tombstoned, banned or a test account. */
async function remindable(knex: Knex, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const rows: { user_id: string }[] = await knex("accounts")
    .whereIn("user_id", userIds)
    .whereNull("deleted_at")
    .where("is_tombstone", false)
    .where("is_test", false)
    .whereRaw("banned IS NOT TRUE")
    .select("user_id")
  return new Set(rows.map((r) => r.user_id))
}

/** "offer:stage:user" already reminded. */
async function alreadySent(knex: Knex, offerIds: string[]): Promise<Set<string>> {
  if (!offerIds.length) return new Set()
  const rows: { offer_id: string; stage: Stage; user_id: string }[] = await knex("offer_reminders")
    .whereIn("offer_id", offerIds)
    .select("offer_id", "stage", "user_id")
  return new Set(rows.map((r) => `${r.offer_id}:${r.stage}:${r.user_id}`))
}

/** Users at the daily cap (digests in the last 24 hours). */
async function atDailyCap(knex: Knex, userIds: string[], cap: number): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const rows: { user_id: string }[] = await knex("offer_reminders")
    .whereIn("user_id", userIds)
    .where("created_at", ">", knex.raw("now() - INTERVAL '24 hours'"))
    .groupBy("user_id")
    .havingRaw("COUNT(DISTINCT batch_id) >= ?", [cap])
    .select("user_id")
  return new Set(rows.map((r) => r.user_id))
}

/** Record a digest before sending; returns the offers actually claimed (a concurrent run may have taken some). */
async function claim(knex: Knex, d: Digest): Promise<DueOffer[]> {
  const rows: { offer_id: string }[] = await knex("offer_reminders")
    .insert(
      d.offers.map((o) => ({
        batch_id: d.batch_id,
        user_id: d.user_id,
        session_id: o.session_id,
        offer_id: o.offer_id,
        stage: d.stage,
        // Buyer stage: whether the seller side got a final nudge first.
        seller_reminded: d.stage === "buyer" ? o.final_sent : null,
      })),
    )
    .onConflict(["offer_id", "stage", "user_id"])
    .ignore()
    .returning("offer_id")
  const won = new Set(rows.map((r) => r.offer_id))
  return d.offers.filter((o) => won.has(o.offer_id))
}

export interface OfferReminderRunStats {
  enabled: boolean
  due_offers: number
  users: number
  capped_run: number
  capped_daily: number
  sent: Record<Stage, number>
  discord_sent: number
  discord_failed: number
  errors: number
}

/** One run of the task (every 30 minutes). */
export async function processOfferReminders(opts: ReminderOptions = {}): Promise<OfferReminderRunStats> {
  const stats: OfferReminderRunStats = {
    enabled: offerRemindersEnabled(),
    due_offers: 0,
    users: 0,
    capped_run: 0,
    capped_daily: 0,
    sent: { first: 0, final: 0, buyer: 0 },
    discord_sent: 0,
    discord_failed: 0,
    errors: 0,
  }
  if (!stats.enabled) {
    logger.debug("Offer reminders are off (OFFER_REMINDERS_ENABLED=false)")
    return stats
  }
  const knex = getKnex()
  const { sql, bindings } = dueOffersSql(opts.cutover ?? OFFER_REMINDER_CUTOVER)
  const due: DueOffer[] = ((await knex.raw(sql, bindings))?.rows ?? []).map((r: DueOffer) => ({
    ...r,
    offer_at: new Date(r.offer_at),
  }))
  stats.due_offers = due.length
  if (!due.length) {
    logger.debug("Offer reminders: nothing due")
    return stats
  }
  if (due.length >= MAX_CANDIDATES) logger.warn("Offer reminders: candidate cap reached", { cap: MAX_CANDIDATES })

  // Expand to (recipient, stage, offer), then drop what was sent and who may not be reminded.
  const items: ReminderItem[] = []
  for (const offer of due) {
    for (const stage of stagesOf(offer)) {
      for (const user_id of await stageRecipients(offer, stage)) items.push({ user_id, stage, offer })
    }
  }
  const users = [...new Set(items.map((i) => i.user_id))]
  const [ok, sent, capped] = await Promise.all([
    remindable(knex, users),
    alreadySent(knex, [...new Set(items.map((i) => i.offer.offer_id))]),
    atDailyCap(knex, users, opts.dailyCap ?? DAILY_CAP_PER_USER),
  ])
  const eligible = items.filter(
    (i) => ok.has(i.user_id) && !capped.has(i.user_id) && !sent.has(`${i.offer.offer_id}:${i.stage}:${i.user_id}`),
  )
  stats.capped_daily = new Set(items.filter((i) => capped.has(i.user_id) && ok.has(i.user_id)).map((i) => i.user_id)).size

  const maxUsers = opts.maxUsers ?? MAX_USERS_PER_RUN
  const { digests, capped: cappedRun } = buildDigests(eligible, maxUsers)
  stats.users = digests.length
  stats.capped_run = cappedRun
  if (cappedRun) {
    logger.warn("Offer reminders: per-run cap reached; the rest wait for the next run", {
      cap: maxUsers,
      deferred_users: cappedRun,
    })
  }

  const now = new Date()
  for (const digest of digests) {
    try {
      // Record first: whatever happens below, it is not sent again.
      digest.offers = await claim(knex, digest)
      if (!digest.offers.length) continue
      const event = EVENTS[digest.stage]
      const channels: UserChannel[] = discordDmDisabled(event)
        ? ["in_app", "push", "email"]
        : ["in_app", "push", "email", "discord_dm"]
      const result = await notify(event, [{ userId: digest.user_id, contractorId: null }], {
        entityId: digest.batch_id,
        dedupeKey: digest.batch_id,
        channels,
        messages: reminderMessages(digest, now),
      })
      stats.sent[digest.stage]++
      stats.discord_sent += result.delivered.filter((d) => d.channel === "discord_dm").length
      stats.discord_failed += result.failed.filter((d) => d.channel === "discord_dm").length
    } catch (error) {
      stats.errors++
      logger.error("Offer reminders: failed for user", {
        user_id: digest.user_id,
        stage: digest.stage,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info("Offer reminder run", {
    ...stats,
    discord_dm_disabled: Object.values(EVENTS).filter((e) => discordDmDisabled(e)),
  })
  return stats
}

/** The in-app notification's entity (entity type offer_reminders, id = batch_id). */
export async function offerReminderEntity(batchId: string) {
  const knex = getKnex()
  const rows: {
    stage: Stage
    session_id: string
    created_at: Date
    title: string | null
    offer_at: Date | null
    session_status: string | null
  }[] = await knex("offer_reminders as r")
    .leftJoin("order_offers as o", "o.id", "r.offer_id")
    .leftJoin("offer_sessions as s", "s.id", "r.session_id")
    .where("r.batch_id", batchId)
    .orderBy("o.timestamp", "asc")
    .select("r.stage", "r.session_id", "r.created_at", "o.title", "o.timestamp as offer_at", "s.status as session_status")
  if (!rows.length) throw new Error(`Offer reminder not found: ${batchId}`)
  return {
    batch_id: batchId,
    stage: rows[0].stage,
    offers: rows.map((r) => ({
      session_id: r.session_id,
      title: r.title ?? "",
      offer_at: r.offer_at ? new Date(r.offer_at).toISOString() : null,
      /** Whether the session is still open (the offer may have been answered since). */
      open: r.session_status === "active",
    })),
  }
}
