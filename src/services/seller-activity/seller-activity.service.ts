/**
 * Seller activity: what a buyer sees about a shop's seller before asking
 * anything (listing page, search cards, shop page, crawlable listing HTML).
 *
 * - last seen: a coarse bucket ("today", "this week", ...), never a
 *   timestamp. For a user's shop it is the owner's activity; for an org's
 *   shop, the most recently active member who can fulfil orders (an org role
 *   with manage_orders). Anyone who turned on "hide my online status"
 *   (account_settings.hide_online_status) never counts.
 * - typical reply time: the median time from a buyer's first message in an
 *   order or offer chat to the seller side's first reply, over chats the
 *   buyer wrote in during the last 90 days. A chat still unanswered after
 *   UNANSWERED_AFTER_HOURS counts as a very slow reply, so ignoring buyers
 *   doesn't look fast. Chats younger than that and still unanswered are left
 *   out (the seller may yet reply). Hidden below MIN_REPLY_SAMPLE chats.
 * - completed orders: shops.total_completed (shop-metrics.service.ts).
 *
 * The expensive parts are precomputed into shop_activity_stats by a
 * background task (refreshShopActivityStats, every 30 minutes, and right
 * away for a user's shops when they change the privacy setting). Reads are a
 * single indexed lookup per page of results.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  BACKGROUND_STATEMENT_TIMEOUT,
  withStatementTimeout,
} from "../../clients/database/session-settings.js"
import logger from "../../logger/logger.js"
import type {
  LastSeenBucket,
  ReplyTimeBucket,
  SellerActivity,
} from "../../api/routes/v2/types/seller-activity.types.js"

export type { LastSeenBucket, ReplyTimeBucket, SellerActivity }

/** Reply statistics window. */
export const REPLY_WINDOW_DAYS = 90
/** Fewer measured chats than this: no reply time is shown. */
export const MIN_REPLY_SAMPLE = 5
/** An unanswered chat older than this counts as a (very) slow reply. */
export const UNANSWERED_AFTER_HOURS = 72

const HOUR = 60
const DAY = 24 * HOUR

export function lastSeenBucket(lastActiveAt: Date | string | null | undefined, now = new Date()): LastSeenBucket | null {
  if (!lastActiveAt) return null
  const t = new Date(lastActiveAt).getTime()
  if (Number.isNaN(t)) return null
  const ageMinutes = Math.max(0, (now.getTime() - t) / 60_000)
  if (ageMinutes < DAY) return "today"
  if (ageMinutes < 7 * DAY) return "this_week"
  if (ageMinutes < 30 * DAY) return "this_month"
  return "over_a_month"
}

export function replyTimeBucket(
  medianMinutes: number | null | undefined,
  sampleSize: number,
): ReplyTimeBucket | null {
  if (medianMinutes == null || sampleSize < MIN_REPLY_SAMPLE) return null
  if (medianMinutes <= HOUR) return "within_hour"
  if (medianMinutes <= 6 * HOUR) return "within_hours"
  if (medianMinutes <= DAY) return "within_day"
  if (medianMinutes <= UNANSWERED_AFTER_HOURS * HOUR) return "within_days"
  return "slow"
}

interface StatsRow {
  shop_id: string
  last_active_at: Date | null
  reply_median_minutes: number | null
  reply_sample_size: number | null
  total_completed: number | null
}

export function toSellerActivity(row: Partial<StatsRow> | undefined, now = new Date()): SellerActivity {
  const sample = Number(row?.reply_sample_size ?? 0)
  const reply = replyTimeBucket(row?.reply_median_minutes ?? null, sample)
  return {
    last_seen: lastSeenBucket(row?.last_active_at ?? null, now),
    reply_time: reply,
    reply_sample_size: reply ? sample : null,
    completed_orders: Number(row?.total_completed ?? 0),
  }
}

/** Seller activity for several shops (one query). Shops without stats get an empty activity. */
export async function getShopActivity(
  shopIds: string[],
  db: Knex = getKnex(),
): Promise<Map<string, SellerActivity>> {
  const ids = [...new Set(shopIds.filter(Boolean))]
  const out = new Map<string, SellerActivity>()
  if (!ids.length) return out
  const rows: StatsRow[] = await db("shops as s")
    .leftJoin("shop_activity_stats as sas", "sas.shop_id", "s.shop_id")
    .whereIn("s.shop_id", ids)
    .select(
      "s.shop_id",
      "s.total_completed",
      "sas.last_active_at",
      "sas.reply_median_minutes",
      "sas.reply_sample_size",
    )
  const now = new Date()
  for (const row of rows) out.set(row.shop_id, toSellerActivity(row, now))
  for (const id of ids) if (!out.has(id)) out.set(id, toSellerActivity(undefined, now))
  return out
}

export async function getOneShopActivity(shopId: string, db: Knex = getKnex()): Promise<SellerActivity> {
  return (await getShopActivity([shopId], db)).get(shopId)!
}

/**
 * The statement that (re)computes shop_activity_stats, for all active shops
 * or only `shopIds`. Exported for tests.
 */
export function refreshStatsSql(shopIds?: string[]): { sql: string; bindings: unknown[] } {
  const scoped = !!shopIds?.length
  const shopFilter = scoped ? "AND s.shop_id = ANY(?::uuid[])" : ""
  const sql = `
    WITH target AS (
      SELECT s.shop_id, s.owner_user_id, s.owner_contractor_id
      FROM shops s
      WHERE s.status = 'active' ${shopFilter}
    ),
    fulfillers AS (
      -- A user's shop: its owner.
      SELECT t.shop_id, t.owner_user_id AS user_id
      FROM target t
      WHERE t.owner_user_id IS NOT NULL
      UNION
      -- An org's shop: current members holding a role that manages orders.
      SELECT t.shop_id, cmr.user_id
      FROM target t
      JOIN contractor_roles cr
        ON cr.contractor_id = t.owner_contractor_id AND cr.manage_orders = true
      JOIN contractor_member_roles cmr ON cmr.role_id = cr.role_id
      JOIN contractor_members cm
        ON cm.contractor_id = t.owner_contractor_id AND cm.user_id = cmr.user_id
    ),
    last_active AS (
      SELECT f.shop_id, MAX(a.last_seen) AS last_active_at
      FROM fulfillers f
      JOIN accounts a ON a.user_id = f.user_id
      LEFT JOIN account_settings acs ON acs.user_id = a.user_id
      WHERE a.deleted_at IS NULL
        AND a.is_tombstone = false
        AND COALESCE(acs.hide_online_status, false) = false
      GROUP BY f.shop_id
    ),
    convo AS (
      SELECT c.chat_id,
             COALESCE(o.shop_id, os.shop_id) AS shop_id,
             COALESCE(o.customer_id, os.customer_id) AS customer_id
      FROM chats c
      LEFT JOIN orders o ON o.order_id = c.order_id
      LEFT JOIN offer_sessions os ON os.id = c.session_id
      WHERE c.order_id IS NOT NULL OR c.session_id IS NOT NULL
    ),
    recent AS (
      SELECT m.chat_id, m.author, m."timestamp"
      FROM messages m
      WHERE m."timestamp" > now() - INTERVAL '${REPLY_WINDOW_DAYS} days'
        AND m.author IS NOT NULL
    ),
    asked AS (
      SELECT cv.chat_id, cv.shop_id, cv.customer_id, MIN(r."timestamp") AS asked_at
      FROM convo cv
      JOIN target t ON t.shop_id = cv.shop_id
      JOIN recent r ON r.chat_id = cv.chat_id AND r.author = cv.customer_id
      GROUP BY cv.chat_id, cv.shop_id, cv.customer_id
    ),
    answered AS (
      SELECT q.chat_id, q.shop_id, q.asked_at, MIN(r."timestamp") AS replied_at
      FROM asked q
      LEFT JOIN recent r
        ON r.chat_id = q.chat_id AND r."timestamp" > q.asked_at AND r.author <> q.customer_id
      GROUP BY q.chat_id, q.shop_id, q.asked_at
    ),
    measured AS (
      SELECT shop_id,
             CASE WHEN replied_at IS NULL THEN 1e9
                  ELSE EXTRACT(EPOCH FROM (replied_at - asked_at)) / 60 END AS minutes
      FROM answered
      WHERE replied_at IS NOT NULL
         OR asked_at < now() - INTERVAL '${UNANSWERED_AFTER_HOURS} hours'
    ),
    reply AS (
      SELECT shop_id,
             COUNT(*)::integer AS sample,
             LEAST(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes), 2000000000)::integer AS median
      FROM measured
      GROUP BY shop_id
    )
    INSERT INTO shop_activity_stats
      (shop_id, last_active_at, reply_median_minutes, reply_sample_size, computed_at)
    SELECT t.shop_id, la.last_active_at, rp.median, COALESCE(rp.sample, 0), now()
    FROM target t
    LEFT JOIN last_active la ON la.shop_id = t.shop_id
    LEFT JOIN reply rp ON rp.shop_id = t.shop_id
    ON CONFLICT (shop_id) DO UPDATE SET
      last_active_at = EXCLUDED.last_active_at,
      reply_median_minutes = EXCLUDED.reply_median_minutes,
      reply_sample_size = EXCLUDED.reply_sample_size,
      computed_at = EXCLUDED.computed_at
  `
  return { sql, bindings: scoped ? [shopIds] : [] }
}

/** Recompute shop_activity_stats (all active shops, or some). Returns rows written. */
export async function refreshShopActivityStats(shopIds?: string[]): Promise<number> {
  const knex = getKnex()
  const { sql, bindings } = refreshStatsSql(shopIds)
  const result = await withStatementTimeout(knex, BACKGROUND_STATEMENT_TIMEOUT, (trx) =>
    trx.raw(sql, bindings as Knex.RawBinding[]),
  )
  return result?.rowCount ?? 0
}

/** The shops whose "last seen" a user's activity feeds: their own and their orgs' shops. */
export async function shopsFedByUser(userId: string, db: Knex = getKnex()): Promise<string[]> {
  const rows: { shop_id: string }[] = await db("shops")
    .where("owner_user_id", userId)
    .orWhereIn(
      "owner_contractor_id",
      db("contractor_members").where("user_id", userId).select("contractor_id"),
    )
    .select("shop_id")
  return rows.map((r) => r.shop_id)
}

/** Background task wrapper. */
export async function refresh_shop_activity_stats(): Promise<void> {
  try {
    const count = await refreshShopActivityStats()
    logger.info("Refreshed shop activity stats", { shops: count })
  } catch (error) {
    logger.error("Failed to refresh shop activity stats", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
