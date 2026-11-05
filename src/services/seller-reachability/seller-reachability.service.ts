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
 * - Discord DM (owner decision 2026-11-02: "you have to share a server with
 *   the bot or perhaps install the bot to your personal account"): the one
 *   rule in services/discord/dm-reachability.ts (discordDmStateSql): a linked
 *   Discord account, the user's last Discord DM attempt is not a standing
 *   refusal (50007 DMs closed always stands; 50278 no mutual server stands
 *   until a later app install or shared-server check), and they share a server with the bot (discord_guild_presence,
 *   checked within PRESENCE_FRESH_DAYS) or installed the app on their own
 *   account (discord_user_installs; USER_INSTALL_COUNTS_AS_DM_REACHABLE,
 *   confirmed 2026-11-05, reported in signals.discord_user_install_counts_as_dm).
 *   discord_dm_attempts (services/discord/dm-attempts.ts)
 *   records every DM SC Market tries, from the backend (notify() and direct
 *   sends) and from the bot (reported over the backend SQS queue): sent, or
 *   failed with Discord's error code, kept DM_ATTEMPT_RETENTION_DAYS (90).
 *   Users never DMed in that window count as reachable but unconfirmed;
 *   `discord_dm_confirmed` counts the reachable ones whose last DM was
 *   delivered.
 *   `discord_dm_closed`: not reachable by DM because the last DM was refused
 *   (50007 DMs closed; or 50278 no shared server, with no install or shared
 *   server recorded since); for an org,
 *   that holds for every contact with Discord linked. Other failures (rate
 *   limits, Discord errors) say nothing about reachability.
 * - Shares a server or installed the app (`discord_server_or_app`, passive
 *   signals: no DM is sent): Discord linked and either discord_guild_presence
 *   says the account is a member of at least one server the bot is in,
 *   checked within PRESENCE_FRESH_DAYS (services/discord/guild-presence.ts),
 *   or discord_user_installs has them. Whatever their last DM did. Not part
 *   of "any" / "none" (Discord DM is).
 * - Email: a verified primary address that is not marked undeliverable
 *   (user_emails.email_bounced_at: a hard bounce, a spam complaint or soft
 *   bounces in a row, recorded from SES feedback by
 *   services/email/email-feedback.ts; the send path skips such addresses),
 *   not unsubscribed from announcement emails (admin alerts: the category
 *   staff would use to reach sellers; no Personal email preference row for
 *   admin_alert with enabled = false). `email_confirmed` counts those whose
 *   address SES confirmed a delivery to in the last
 *   EMAIL_DELIVERED_WINDOW_DAYS (user_emails.last_delivered_at). Those never
 *   emailed in that window count as reachable but unconfirmed.
 * - Push: at least one push subscription. Subscriptions are deleted when a
 *   push service answers 404/410/403, so a stored one is not known to be
 *   dead, but there is NO per-delivery result either (the push adapter
 *   reports sent once the push service accepts the request).
 * - any: at least one of the above. none: none of them.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { publiclyListedSql } from "../../api/routes/v2/util/listing-visibility.js"
import { DM_ATTEMPT_RETENTION_DAYS, DM_REFUSAL_CODES } from "../discord/dm-attempts.js"
import { PRESENCE_FRESH_DAYS } from "../discord/guild-presence.js"
import { installClickCounts, type InstallClickCount } from "../discord/install-clicks.js"
import { discordDmStateSql, USER_INSTALL_COUNTS_AS_DM_REACHABLE } from "../discord/dm-reachability.js"
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

/** "Delivered recently" for email: an SES Delivery notification within this many days. */
export const EMAIL_DELIVERED_WINDOW_DAYS = 90

/** The email category the report checks unsubscribes for (catalog legacyAction). */
export const REACHABILITY_EMAIL_ACTION = "admin_alert"

const CHANNELS = [
  "discord_dm",
  "discord_dm_confirmed",
  "discord_dm_closed",
  "discord_server_or_app",
  "email",
  "email_confirmed",
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
  const dm = discordDmStateSql("a.user_id")
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
             dm.discord_linked,
             dm.last_dm_status,
             dm.dm_closed,
             dm.server_or_app,
             dm.dm_reachable,
             EXISTS (
               SELECT 1 FROM user_emails e
               WHERE e.user_id = a.user_id AND e.is_primary = true AND e.email_verified = true
                 AND e.email_bounced_at IS NULL
             ) AS email_verified,
             EXISTS (
               SELECT 1 FROM user_emails e
               WHERE e.user_id = a.user_id AND e.is_primary = true
                 AND e.last_delivered_at > now() - make_interval(days => ?)
             ) AS email_delivered,
             EXISTS (
               SELECT 1 FROM email_notification_preferences ep
               JOIN notification_actions na ON na.action_type_id = ep.action_type_id
               WHERE ep.user_id = a.user_id AND ep.contractor_id IS NULL
                 AND na.action = ? AND ep.enabled = false
             ) AS email_unsubscribed,
             EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = a.user_id) AS push
      FROM accounts a
      CROSS JOIN LATERAL (${dm.sql}) dm
      WHERE a.user_id IN (SELECT user_id FROM contacts)
        AND a.deleted_at IS NULL
        AND a.is_tombstone = false
        AND a.banned IS NOT TRUE
    ),
    per_seller AS (
      SELECT c.seller_key,
             MAX(uc.last_seen) AS last_seen,
             COALESCE(BOOL_OR(uc.dm_reachable), false) AS discord_dm,
             COALESCE(BOOL_OR(uc.dm_reachable AND uc.last_dm_status = 'sent'), false) AS discord_dm_confirmed,
             COALESCE(BOOL_OR(uc.discord_linked AND uc.dm_closed), false)
               AND NOT COALESCE(BOOL_OR(uc.discord_linked AND NOT uc.dm_closed), false) AS discord_dm_closed,
             COALESCE(BOOL_OR(uc.discord_linked AND uc.server_or_app), false) AS discord_server_or_app,
             COALESCE(BOOL_OR(uc.email_verified AND NOT uc.email_unsubscribed), false) AS email,
             COALESCE(BOOL_OR(uc.email_verified AND NOT uc.email_unsubscribed AND uc.email_delivered), false) AS email_confirmed,
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
             COALESCE(ps.discord_dm_closed, false) AS discord_dm_closed,
             COALESCE(ps.discord_server_or_app, false) AS discord_server_or_app,
             COALESCE(ps.email, false) AS email,
             COALESCE(ps.email_confirmed, false) AS email_confirmed,
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
           COUNT(*) FILTER (WHERE discord_dm_closed)::integer AS discord_dm_closed_sellers,
           COALESCE(SUM(listings) FILTER (WHERE discord_dm_closed), 0)::integer AS discord_dm_closed_listings,
           COUNT(*) FILTER (WHERE discord_server_or_app)::integer AS discord_server_or_app_sellers,
           COALESCE(SUM(listings) FILTER (WHERE discord_server_or_app), 0)::integer AS discord_server_or_app_listings,
           COUNT(*) FILTER (WHERE email)::integer AS email_sellers,
           COALESCE(SUM(listings) FILTER (WHERE email), 0)::integer AS email_listings,
           COUNT(*) FILTER (WHERE email_confirmed)::integer AS email_confirmed_sellers,
           COALESCE(SUM(listings) FILTER (WHERE email_confirmed), 0)::integer AS email_confirmed_listings,
           COUNT(*) FILTER (WHERE push)::integer AS push_sellers,
           COALESCE(SUM(listings) FILTER (WHERE push), 0)::integer AS push_listings,
           COUNT(*) FILTER (WHERE discord_dm OR email OR push)::integer AS any_sellers,
           COALESCE(SUM(listings) FILTER (WHERE discord_dm OR email OR push), 0)::integer AS any_listings,
           COUNT(*) FILTER (WHERE NOT (discord_dm OR email OR push))::integer AS none_sellers,
           COALESCE(SUM(listings) FILTER (WHERE NOT (discord_dm OR email OR push)), 0)::integer AS none_listings,
           (SELECT MAX(checked_at) FROM discord_guild_presence) AS presence_checked_at
    FROM rows
    GROUP BY bucket
  `
  // Placeholders in the order they appear in the statement.
  return {
    sql,
    bindings: [EMAIL_DELIVERED_WINDOW_DAYS, REACHABILITY_EMAIL_ACTION, ...dm.bindings],
  }
}

type Row = {
  bucket: string
  sellers: number | string
  listings: number | string
  presence_checked_at?: Date | string | null
} & Record<`${ChannelKey}_${"sellers" | "listings"}`, number | string>

const zero = (): ReachabilityCount => ({ sellers: 0, listings: 0 })

function emptyBucket(bucket: ReachabilityBucket): SellerReachabilityBucket {
  return {
    bucket,
    sellers: 0,
    listings: 0,
    discord_dm: zero(),
    discord_dm_confirmed: zero(),
    discord_dm_closed: zero(),
    discord_server_or_app: zero(),
    email: zero(),
    email_confirmed: zero(),
    push: zero(),
    any: zero(),
    none: zero(),
  }
}

/** Rows of reachabilitySql() to the report: every bucket present, in order, plus totals. */
export function toReport(
  rows: Row[],
  now = new Date(),
  installClicks: InstallClickCount[] = [],
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
  const checkedRaw = rows.find((r) => r.presence_checked_at)?.presence_checked_at ?? null
  const checkedAt = checkedRaw ? new Date(checkedRaw) : null
  return {
    generated_at: now.toISOString(),
    buckets,
    totals,
    signals: {
      discord_dm_delivery_results: true,
      discord_dm_result_retention_days: DM_ATTEMPT_RETENTION_DAYS,
      discord_dm_refusal_codes: [...DM_REFUSAL_CODES],
      discord_dm_closed_code: DM_REFUSAL_CODES[0],
      discord_shared_server_checked_at:
        checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt.toISOString() : null,
      discord_shared_server_fresh_days: PRESENCE_FRESH_DAYS,
      discord_user_install_counts_as_dm: USER_INSTALL_COUNTS_AS_DM_REACHABLE,
      email_delivery_results: true,
      email_delivered_window_days: EMAIL_DELIVERED_WINDOW_DAYS,
      push_delivery_results: false,
    },
    email_category: "announcements",
    install_clicks: installClicks,
  }
}

export async function getSellerReachability(
  db: Knex = getKnex(),
): Promise<SellerReachabilityReport> {
  const { sql, bindings } = reachabilitySql()
  const [result, clicks] = await Promise.all([db.raw(sql, bindings), installClickCounts(db)])
  return toReport((result?.rows ?? []) as Row[], new Date(), clicks)
}
