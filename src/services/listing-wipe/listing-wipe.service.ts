/**
 * The admin wipe and the one-click relist after it (owner-approved
 * 2026-11-03). No advance notice: the owner runs the wipe when the game
 * wipes.
 *
 * 1. runWipe (POST /admin/expire-all-listings): records a wipe
 *    (listing_wipes: id, time, admin), pauses every active listing
 *    (status 'expired') and tags each one it paused with the wipe id
 *    (listing_wipe_items), in one transaction. Then it queues the message.
 * 2. One message per user per wipe (event listing.paused_by_wipe): "Your
 *    listings were paused for the wipe. Relist them in one tap.", linking to
 *    My Listings, where the "Relist all" banner is. To a personal shop's
 *    owner and the manage_market members of an org shop's org, one per
 *    user however many shops they help run (listing_wipe_notices' primary
 *    key). Test shops and test, deleted, tombstoned and banned accounts are
 *    left out. Sent through notify() (the user's settings, org mutes) in
 *    batches of SEND_BATCH_SIZE with SEND_BATCH_PAUSE_MS between them; rows
 *    are claimed before sending, so a message is never sent twice, and a run
 *    interrupted by a restart is resumed by the periodic task (tasks.ts).
 * 3. Relist: GET /wipe-relist shows the seller how many of their listings
 *    the latest wipe paused that they can still relist; POST /wipe-relist
 *    renews each one through applyListingRefresh (reactivated, ranks as
 *    fresh, the audit entry). Only listings the wipe paused, still paused,
 *    in a shop the user can manage (canManageShop: the owner, or
 *    manage_market in the org) and not relisted yet. Running it twice changes
 *    nothing the second time.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import { discordDmDisabled } from "../notify/kill-switch.js"
import { orgMembersWithPermission } from "../notify/recipients.js"
import type { UserChannel } from "../notify/channels.js"
import { getShopsForUser } from "../shops/shop-permissions.service.js"
import { applyListingRefresh } from "../market-v2/listing-refresh.service.js"
export { markWipeRelisted } from "./wipe-items.js"
import { emailLocale, wipeRelistText } from "../email/i18n/index.js"
import type { WipeRelistEmailData } from "../email/email-payload-formatters.js"
import type { TokenOrgScope } from "../../api/routes/v2/middleware/token-org-access.js"

export const EVENT_KEY = "listing.paused_by_wipe" as const
export const WIPE_ACTION = "listing_paused_by_wipe"
/** Where the message links: My Listings, with the "Relist all" banner. */
export const RELIST_PATH = "/market/me"
export const SEND_BATCH_SIZE = 25
export const SEND_BATCH_PAUSE_MS = 2_000
/** A claimed row not finished after this long (a restart mid-send) is retried. */
export const STALE_CLAIM_MINUTES = 15
/** Relist all renews at most this many listings per call (the banner offers the rest again). */
export const MAX_RELIST = 500

function baseUrl(): string {
  return env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
}

// ── 1. The wipe ───────────────────────────────────────────────────────────

export interface WipeResult {
  wipe_id: string
  ran_at: string
  affected: number
}

/** Pause every active listing and tag it with a new wipe. */
export async function runWipe(
  knex: Knex,
  adminId: string,
): Promise<WipeResult> {
  const result = await knex.transaction(async (trx) => {
    const [wipe] = await trx("listing_wipes")
      .insert({ ran_by: adminId })
      .returning(["wipe_id", "ran_at"])
    const tagged = await trx.raw(
      `
      WITH paused AS (
        UPDATE listings
        SET status = 'expired', updated_at = now()
        WHERE status = 'active'
        RETURNING listing_id, shop_id
      )
      INSERT INTO listing_wipe_items (wipe_id, listing_id, shop_id)
      SELECT ?::uuid, listing_id, shop_id FROM paused
      `,
      [wipe.wipe_id],
    )
    const affected: number = tagged?.rowCount ?? 0
    await trx("listing_wipes")
      .where({ wipe_id: wipe.wipe_id })
      .update({ paused_count: affected })
    return {
      wipe_id: wipe.wipe_id as string,
      ran_at: new Date(wipe.ran_at).toISOString(),
      affected,
    }
  })
  logger.info("Admin wipe: paused all active listings", {
    ...result,
    admin_id: adminId,
  })
  return result
}

// ── 2. The message ────────────────────────────────────────────────────────

export interface WipeShop {
  shop_id: string
  owner_user_id: string | null
  owner_contractor_id: string | null
}

export interface WipeRecipient {
  userId: string
  /** Owns a personal shop in the wipe. */
  personal: boolean
  /** Orgs whose shops in the wipe they manage (manage_market). */
  contractorIds: string[]
}

/**
 * One entry per user, whatever number of shops they own or help run:
 * personal shops' owners and the given org members.
 */
export function groupRecipients(
  shops: WipeShop[],
  orgManagers: Map<string, string[]>,
): WipeRecipient[] {
  const byUser = new Map<string, WipeRecipient>()
  const entry = (userId: string) => {
    let r = byUser.get(userId)
    if (!r) {
      r = { userId, personal: false, contractorIds: [] }
      byUser.set(userId, r)
    }
    return r
  }
  for (const shop of shops) {
    if (shop.owner_user_id) entry(shop.owner_user_id).personal = true
    else if (shop.owner_contractor_id) {
      for (const userId of orgManagers.get(shop.owner_contractor_id) ?? []) {
        const r = entry(userId)
        if (!r.contractorIds.includes(shop.owner_contractor_id))
          r.contractorIds.push(shop.owner_contractor_id)
      }
    }
  }
  return [...byUser.values()]
}

/** Accounts that may get the message: not deleted, tombstoned, banned or a test account. */
async function reachableAccounts(
  knex: Knex,
  userIds: string[],
): Promise<Set<string>> {
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

/** Queue one message per user for the wipe (never twice: the primary key). Returns how many were queued. */
export async function queueWipeNotices(
  knex: Knex,
  wipeId: string,
): Promise<number> {
  const shops: WipeShop[] = await knex("shops as s")
    .whereIn(
      "s.shop_id",
      knex("listing_wipe_items").where({ wipe_id: wipeId }).distinct("shop_id"),
    )
    .where("s.is_test", false)
    .select("s.shop_id", "s.owner_user_id", "s.owner_contractor_id")
  const orgIds = [
    ...new Set(
      shops.map((s) => s.owner_contractor_id).filter((c): c is string => !!c),
    ),
  ]
  const orgManagers = new Map<string, string[]>()
  for (const orgId of orgIds) {
    orgManagers.set(
      orgId,
      (await orgMembersWithPermission(orgId, "manage_market")).map(
        (m) => m.userId,
      ),
    )
  }
  const recipients = groupRecipients(
    shops.filter((s) => s.owner_user_id || s.owner_contractor_id),
    orgManagers,
  )
  const reachable = await reachableAccounts(
    knex,
    recipients.map((r) => r.userId),
  )
  const rows = recipients
    .filter((r) => reachable.has(r.userId))
    .map((r) => ({
      wipe_id: wipeId,
      user_id: r.userId,
      personal: r.personal,
      contractor_ids: r.contractorIds,
    }))
  let queued = 0
  for (let i = 0; i < rows.length; i += 500) {
    const inserted = await knex("listing_wipe_notices")
      .insert(rows.slice(i, i + 500))
      .onConflict(["wipe_id", "user_id"])
      .ignore()
      .returning("user_id")
    queued += inserted.length
  }
  return queued
}

export interface NoticeRow {
  wipe_id: string
  user_id: string
  personal: boolean
  contractor_ids: string[]
  locale?: string | null
}

/** Claim the next batch of unsent messages (a stale claim counts as unsent). */
async function claimBatch(knex: Knex, size: number): Promise<NoticeRow[]> {
  const result = await knex.raw(
    `
    WITH next AS (
      SELECT wipe_id, user_id FROM listing_wipe_notices
      WHERE sent_at IS NULL
        AND (claimed_at IS NULL OR claimed_at < now() - INTERVAL '${STALE_CLAIM_MINUTES} minutes')
      ORDER BY created_at, user_id
      LIMIT ?
      FOR UPDATE SKIP LOCKED
    )
    UPDATE listing_wipe_notices n
    SET claimed_at = now()
    FROM next
    WHERE n.wipe_id = next.wipe_id AND n.user_id = next.user_id
    RETURNING n.wipe_id, n.user_id, n.personal, n.contractor_ids,
      (SELECT a.locale FROM accounts a WHERE a.user_id = n.user_id) AS locale
    `,
    [size],
  )
  return result?.rows ?? []
}

export function wipeMessages(
  locale: string | null | undefined,
  wipeId: string,
) {
  const text = wipeRelistText(emailLocale(locale))
  const url = `${baseUrl()}${RELIST_PATH}`
  const icon = `${baseUrl()}/android-chrome-192x192.png`
  const email: WipeRelistEmailData = { wipe_id: wipeId, path: RELIST_PATH }
  return {
    push: {
      title: text.title,
      body: text.tap,
      icon,
      badge: icon,
      data: { url, type: "listing", entityId: wipeId, action: WIPE_ACTION },
      tag: `listing-wipe-${wipeId}`,
      requireInteraction: false,
    },
    email: { data: { wipeRelist: email } },
    discord_dm: {
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: text.title,
          description: `${text.tap}\n\n[${text.action}](${url})`,
          url,
          color: 0x10b881,
        },
      ],
    },
  }
}

/**
 * Send one user's message: under their Personal preferences if they own a
 * personal shop in the wipe, else under the first org (of theirs in the
 * wipe) whose preferences and mute let anything through. Never more than one.
 */
export async function sendOne(row: NoticeRow): Promise<string> {
  const scopes: (string | null)[] = [
    ...(row.personal ? [null] : []),
    ...row.contractor_ids,
  ]
  const channels: UserChannel[] = discordDmDisabled(EVENT_KEY)
    ? ["in_app", "push", "email"]
    : ["in_app", "push", "email", "discord_dm"]
  const messages = wipeMessages(row.locale, row.wipe_id)
  for (const contractorId of scopes) {
    const result = await notify(
      EVENT_KEY,
      [{ userId: row.user_id, contractorId }],
      {
        entityId: row.wipe_id,
        dedupeKey: `${row.wipe_id}:${row.user_id}`,
        channels,
        messages,
      },
    )
    if (result.planned.length) {
      return result.delivered.length || result.duplicate.length
        ? "sent"
        : "failed"
    }
  }
  return "off"
}

let sending = false

/** Send queued messages in batches until none are left. One run at a time per process. */
export async function sendWipeNotices(
  opts: { batchSize?: number; pauseMs?: number; knex?: Knex } = {},
): Promise<{ sent: number; skipped: number; failed: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0 }
  if (sending) return stats
  sending = true
  const knex = opts.knex ?? getKnex()
  const pauseMs = opts.pauseMs ?? SEND_BATCH_PAUSE_MS
  try {
    for (;;) {
      const batch = await claimBatch(knex, opts.batchSize ?? SEND_BATCH_SIZE)
      if (!batch.length) break
      for (const row of batch) {
        let outcome: string
        try {
          outcome = await sendOne(row)
        } catch (error) {
          outcome = "failed"
          logger.warn("listing wipe: message failed", {
            wipe_id: row.wipe_id,
            user_id: row.user_id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        if (outcome === "sent") stats.sent++
        else if (outcome === "off") stats.skipped++
        else stats.failed++
        // Recorded either way: a failed message is never retried.
        await knex("listing_wipe_notices")
          .where({ wipe_id: row.wipe_id, user_id: row.user_id })
          .update({ sent_at: knex.fn.now(), outcome })
      }
      if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
    }
  } finally {
    sending = false
  }
  if (stats.sent || stats.skipped || stats.failed)
    logger.info("listing wipe: messages", stats)
  return stats
}

/** After a wipe: queue its messages and start sending (not awaited by the request). */
export async function startWipeNotices(
  knex: Knex,
  wipeId: string,
): Promise<number> {
  const queued = await queueWipeNotices(knex, wipeId)
  void sendWipeNotices().catch((error) =>
    logger.error("listing wipe: sending failed", {
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  return queued
}

/** The in-app notification's entity (entity type listing_wipes). */
export async function wipeNoticeEntity(wipeId: string) {
  const wipe = await getKnex()("listing_wipes")
    .where({ wipe_id: wipeId })
    .first("wipe_id", "ran_at")
  if (!wipe) throw new Error(`Listing wipe not found: ${wipeId}`)
  return {
    wipe_id: wipe.wipe_id,
    ran_at: new Date(wipe.ran_at).toISOString(),
    relist_path: RELIST_PATH,
  }
}

// ── 3. Relist ─────────────────────────────────────────────────────────────

/** Shops whose listings the user may relist (canManageShop), optionally one. */
async function manageableShopIds(
  userId: string,
  orgScope: TokenOrgScope,
  shopId?: string,
): Promise<string[]> {
  const shops = await getShopsForUser(userId, orgScope)
  return shops
    .filter(
      (s) => s.permissions.can_manage && (!shopId || s.shop_id === shopId),
    )
    .map((s) => s.shop_id)
}

/** Listings a wipe paused that are still paused, not relisted, in these shops. */
function relistableQuery(knex: Knex, shopIds: string[]) {
  return knex("listing_wipe_items as i")
    .join("listings as l", "l.listing_id", "i.listing_id")
    .whereIn("l.shop_id", shopIds)
    .where("l.status", "expired")
    .whereNull("i.relisted_at")
}

export interface WipeRelistSummary {
  wipe_id: string
  ran_at: string
  /** Listings the user can relist with one click. */
  count: number
}

/** The latest wipe with listings this user can still relist, or null. */
export async function relistSummary(
  knex: Knex,
  userId: string,
  orgScope: TokenOrgScope,
  shopId?: string,
): Promise<WipeRelistSummary | null> {
  const shopIds = await manageableShopIds(userId, orgScope, shopId)
  if (!shopIds.length) return null
  const row = await relistableQuery(knex, shopIds)
    .join("listing_wipes as w", "w.wipe_id", "i.wipe_id")
    .groupBy("w.wipe_id", "w.ran_at")
    .orderBy("w.ran_at", "desc")
    .first("w.wipe_id", "w.ran_at", knex.raw("COUNT(*)::integer AS count"))
  if (!row) return null
  return {
    wipe_id: row.wipe_id,
    ran_at: new Date(row.ran_at).toISOString(),
    count: Number(row.count),
  }
}

/** Relist everything of one wipe this user can still relist. */
export async function relistAll(
  knex: Knex,
  userId: string,
  orgScope: TokenOrgScope,
  wipeId: string,
  shopId?: string,
): Promise<{ relisted: number }> {
  const shopIds = await manageableShopIds(userId, orgScope, shopId)
  if (!shopIds.length) return { relisted: 0 }
  const listings: {
    listing_id: string
    status: string
    expires_at: Date | null
  }[] = await relistableQuery(knex, shopIds)
    .where("i.wipe_id", wipeId)
    .orderBy("l.listing_id")
    .limit(MAX_RELIST)
    .select("l.listing_id", "l.status", "l.expires_at")
  const now = new Date()
  let relisted = 0
  for (const listing of listings) {
    // applyListingRefresh marks the wipe item relisted (markWipeRelisted).
    await applyListingRefresh(knex, listing, userId, now)
    relisted++
  }
  if (relisted)
    logger.info("listing wipe: relisted", {
      wipe_id: wipeId,
      user_id: userId,
      relisted,
    })
  return { relisted }
}

// ── 4. Admin ──────────────────────────────────────────────────────────────

export interface LastWipeStats {
  wipe_id: string
  ran_at: string
  paused: number
  relisted: number
  /** Users the message was queued for, and how many it has reached so far. */
  messages_queued: number
  messages_sent: number
}

export async function lastWipeStats(knex: Knex): Promise<LastWipeStats | null> {
  const wipe = await knex("listing_wipes")
    .orderBy("ran_at", "desc")
    .first("wipe_id", "ran_at", "paused_count")
  if (!wipe) return null
  const [items] = await knex("listing_wipe_items")
    .where({ wipe_id: wipe.wipe_id })
    .select(
      knex.raw(
        "COUNT(*) FILTER (WHERE relisted_at IS NOT NULL)::integer AS relisted",
      ),
    )
  const [notices] = await knex("listing_wipe_notices")
    .where({ wipe_id: wipe.wipe_id })
    .select(
      knex.raw("COUNT(*)::integer AS queued"),
      knex.raw("COUNT(*) FILTER (WHERE outcome = 'sent')::integer AS sent"),
    )
  return {
    wipe_id: wipe.wipe_id,
    ran_at: new Date(wipe.ran_at).toISOString(),
    paused: Number(wipe.paused_count),
    relisted: Number(items?.relisted ?? 0),
    messages_queued: Number(notices?.queued ?? 0),
    messages_sent: Number(notices?.sent ?? 0),
  }
}
