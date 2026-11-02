/**
 * Seller reachability (Admin › Market): can SC Market reach the sellers whose
 * listings are up, before deciding on listing expiry? Counts only, never who.
 *
 * Sellers: the owners of shops with at least one publicly listed listing
 * (active, public, not a test shop). A personal shop's seller is its owner;
 * an org's shops are one seller, contacted through its members who hold a
 * role with manage_orders or manage_market. An org is reachable on a channel
 * when any of those members is. A user or org with several shops counts once;
 * each listing counts once.
 *
 * Buckets: the seller's last_seen (an org: its most recent such member),
 * with the same cut-offs as the "Last seen" buyers see (today < 24 hours,
 * this week < 7 days, this month < 30 days, else over a month). "unknown":
 * an org with no such member. This is an aggregate for staff, so it uses
 * accounts.last_seen whether or not the seller hides their online status;
 * no per-seller value leaves the database.
 *
 * Channels, and how "reliable" each one is (what signal exists):
 * - Discord DM: a linked Discord account, and the user's last Discord DM
 *   attempt through notify() (notification_deliveries, channel discord_dm)
 *   did not fail. That table records every DM's result (sent / failed: the
 *   bot can't DM them, e.g. 50007 no shared server or DMs closed), kept
 *   DELIVERY_RETENTION_DAYS (90). Users never DMed in that window count as
 *   reachable but unconfirmed; `discord_dm_confirmed` counts those whose
 *   last DM was delivered.
 * - Email: a verified primary address, not unsubscribed from announcement
 *   emails (admin alerts: the category staff would use to reach sellers;
 *   no Personal email preference row for admin_alert with enabled = false).
 *   There is NO delivery signal: SES bounces and complaints are not recorded
 *   (email.service.ts handleBounce is not wired), so a verified address may
 *   still bounce.
 * - Push: at least one push subscription. Subscriptions are deleted when a
 *   push service answers 404/410/403, so a stored one is not known to be
 *   dead, but there is NO per-delivery result either (the push adapter
 *   reports sent once the push service accepts the request).
 * - any: at least one of the above. none: none of them.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { publiclyListedSql } from "../../api/routes/v2/util/listing-visibility.js"
import { DELIVERY_RETENTION_DAYS } from "../notify/deliveries.js"
import type {
  ReachabilityBucket,
  ReachabilityCount,
  SellerReachabilityBucket,
  SellerReachabilityReport,
} from "../../api/routes/v2/types/seller-reachability.types.js"

export const REACHABILITY_BUCKETS: readonly ReachabilityBucket[] = [
  "today",
  "this_week",
  "this_month",
  "over_a_month",
  "unknown",
]

/** The email category the report checks unsubscribes for (catalog legacyAction). */
export const REACHABILITY_EMAIL_ACTION = "admin_alert"

const CHANNELS = [
  "discord_dm",
  "discord_dm_confirmed",
  "email",
  "push",
  "any",
  "none",
] as const
type ChannelKey = (typeof CHANNELS)[number]

/** The report's one statement: aggregated counts per bucket. Exported for tests. */
export function reachabilitySql(): {
  sql: string
  bindings: Knex.RawBinding[]
} {
  const sql = `
    WITH listed AS (
      SELECT DISTINCT l.listing_id,
             CASE WHEN s.owner_user_id IS NOT NULL THEN 'u:' || s.owner_user_id::text
                  ELSE 'c:' || s.owner_contractor_id::text END AS seller_key,
             s.owner_user_id, s.owner_contractor_id
      FROM listings l
      JOIN shops s ON s.shop_id = l.shop_id
      WHERE ${publiclyListedSql("l")}
        AND s.status = 'active'
        AND (s.owner_user_id IS NOT NULL OR s.owner_contractor_id IS NOT NULL)
    ),
    seller_listings AS (
      SELECT seller_key, COUNT(DISTINCT listing_id)::integer AS listings
      FROM listed
      GROUP BY seller_key
    ),
    sellers AS (
      SELECT DISTINCT seller_key, owner_user_id, owner_contractor_id FROM listed
    ),
    contacts AS (
      SELECT seller_key, owner_user_id AS user_id
      FROM sellers
      WHERE owner_user_id IS NOT NULL
      UNION
      SELECT se.seller_key, cmr.user_id
      FROM sellers se
      JOIN contractor_roles cr
        ON cr.contractor_id = se.owner_contractor_id
       AND (cr.manage_orders = true OR cr.manage_market = true)
      JOIN contractor_member_roles cmr ON cmr.role_id = cr.role_id
      JOIN contractor_members cm
        ON cm.contractor_id = se.owner_contractor_id AND cm.user_id = cmr.user_id
      WHERE se.owner_user_id IS NULL
    ),
    user_channels AS (
      SELECT a.user_id,
             a.last_seen,
             EXISTS (
               SELECT 1 FROM account_providers p
               WHERE p.user_id = a.user_id AND p.provider_type = 'discord'
             ) AS discord_linked,
             (
               SELECT d.status FROM notification_deliveries d
               WHERE d.user_id = a.user_id AND d.channel = 'discord_dm'
                 AND d.status IN ('sent', 'failed')
               ORDER BY d.created_at DESC
               LIMIT 1
             ) AS last_dm_status,
             EXISTS (
               SELECT 1 FROM user_emails e
               WHERE e.user_id = a.user_id AND e.is_primary = true AND e.email_verified = true
             ) AS email_verified,
             EXISTS (
               SELECT 1 FROM email_notification_preferences ep
               JOIN notification_actions na ON na.action_type_id = ep.action_type_id
               WHERE ep.user_id = a.user_id AND ep.contractor_id IS NULL
                 AND na.action = ? AND ep.enabled = false
             ) AS email_unsubscribed,
             EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = a.user_id) AS push
      FROM accounts a
      WHERE a.user_id IN (SELECT user_id FROM contacts)
        AND a.deleted_at IS NULL
        AND a.is_tombstone = false
        AND a.banned IS NOT TRUE
    ),
    per_seller AS (
      SELECT c.seller_key,
             MAX(uc.last_seen) AS last_seen,
             COALESCE(BOOL_OR(uc.discord_linked AND uc.last_dm_status IS DISTINCT FROM 'failed'), false) AS discord_dm,
             COALESCE(BOOL_OR(uc.discord_linked AND uc.last_dm_status = 'sent'), false) AS discord_dm_confirmed,
             COALESCE(BOOL_OR(uc.email_verified AND NOT uc.email_unsubscribed), false) AS email,
             COALESCE(BOOL_OR(uc.push), false) AS push
      FROM contacts c
      JOIN user_channels uc ON uc.user_id = c.user_id
      GROUP BY c.seller_key
    ),
    rows AS (
      SELECT sl.listings,
             CASE
               WHEN ps.last_seen IS NULL THEN 'unknown'
               WHEN ps.last_seen > now() - INTERVAL '1 day' THEN 'today'
               WHEN ps.last_seen > now() - INTERVAL '7 days' THEN 'this_week'
               WHEN ps.last_seen > now() - INTERVAL '30 days' THEN 'this_month'
               ELSE 'over_a_month'
             END AS bucket,
             COALESCE(ps.discord_dm, false) AS discord_dm,
             COALESCE(ps.discord_dm_confirmed, false) AS discord_dm_confirmed,
             COALESCE(ps.email, false) AS email,
             COALESCE(ps.push, false) AS push
      FROM seller_listings sl
      LEFT JOIN per_seller ps ON ps.seller_key = sl.seller_key
    )
    SELECT bucket,
           COUNT(*)::integer AS sellers,
           COALESCE(SUM(listings), 0)::integer AS listings,
           COUNT(*) FILTER (WHERE discord_dm)::integer AS discord_dm_sellers,
           COALESCE(SUM(listings) FILTER (WHERE discord_dm), 0)::integer AS discord_dm_listings,
           COUNT(*) FILTER (WHERE discord_dm_confirmed)::integer AS discord_dm_confirmed_sellers,
           COALESCE(SUM(listings) FILTER (WHERE discord_dm_confirmed), 0)::integer AS discord_dm_confirmed_listings,
           COUNT(*) FILTER (WHERE email)::integer AS email_sellers,
           COALESCE(SUM(listings) FILTER (WHERE email), 0)::integer AS email_listings,
           COUNT(*) FILTER (WHERE push)::integer AS push_sellers,
           COALESCE(SUM(listings) FILTER (WHERE push), 0)::integer AS push_listings,
           COUNT(*) FILTER (WHERE discord_dm OR email OR push)::integer AS any_sellers,
           COALESCE(SUM(listings) FILTER (WHERE discord_dm OR email OR push), 0)::integer AS any_listings,
           COUNT(*) FILTER (WHERE NOT (discord_dm OR email OR push))::integer AS none_sellers,
           COALESCE(SUM(listings) FILTER (WHERE NOT (discord_dm OR email OR push)), 0)::integer AS none_listings
    FROM rows
    GROUP BY bucket
  `
  return { sql, bindings: [REACHABILITY_EMAIL_ACTION] }
}

type Row = {
  bucket: string
  sellers: number | string
  listings: number | string
} & Record<`${ChannelKey}_${"sellers" | "listings"}`, number | string>

const zero = (): ReachabilityCount => ({ sellers: 0, listings: 0 })

function emptyBucket(bucket: ReachabilityBucket): SellerReachabilityBucket {
  return {
    bucket,
    sellers: 0,
    listings: 0,
    discord_dm: zero(),
    discord_dm_confirmed: zero(),
    email: zero(),
    push: zero(),
    any: zero(),
    none: zero(),
  }
}

/** Rows of reachabilitySql() to the report: every bucket present, in order, plus totals. */
export function toReport(
  rows: Row[],
  now = new Date(),
): SellerReachabilityReport {
  const byBucket = new Map<ReachabilityBucket, SellerReachabilityBucket>()
  for (const b of REACHABILITY_BUCKETS) byBucket.set(b, emptyBucket(b))
  for (const row of rows) {
    const bucket = byBucket.get(row.bucket as ReachabilityBucket)
    if (!bucket) continue
    bucket.sellers = Number(row.sellers) || 0
    bucket.listings = Number(row.listings) || 0
    for (const c of CHANNELS) {
      bucket[c] = {
        sellers: Number(row[`${c}_sellers`]) || 0,
        listings: Number(row[`${c}_listings`]) || 0,
      }
    }
  }
  const buckets = REACHABILITY_BUCKETS.map((b) => byBucket.get(b)!)
  const { bucket: _bucket, ...totals } = emptyBucket("today")
  void _bucket
  for (const b of buckets) {
    totals.sellers += b.sellers
    totals.listings += b.listings
    for (const c of CHANNELS) {
      totals[c].sellers += b[c].sellers
      totals[c].listings += b[c].listings
    }
  }
  return {
    generated_at: now.toISOString(),
    buckets,
    totals,
    signals: {
      discord_dm_delivery_results: true,
      discord_dm_result_retention_days: DELIVERY_RETENTION_DAYS,
      email_delivery_results: false,
      push_delivery_results: false,
    },
    email_category: "announcements",
  }
}

export async function getSellerReachability(
  db: Knex = getKnex(),
): Promise<SellerReachabilityReport> {
  const { sql, bindings } = reachabilitySql()
  const result = await db.raw(sql, bindings)
  return toReport((result?.rows ?? []) as Row[])
}
