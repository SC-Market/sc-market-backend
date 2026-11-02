/**
 * Listing expiry, "Still selling?" notices and pausing (the hourly
 * process_expiring_market_listings task).
 *
 * The rule is the one V1 had (scripts/listing_expiration.sql): a listing is
 * listed for one month; a seller edit or a renew starts a new month. Market V2
 * kept `listings.expires_at` but nothing set or enforced it (the task still
 * swept the V1 market_listings table, which the site no longer reads), so
 * listings stayed up forever. This restores it on V2:
 *
 * 1. assign: an active listing without a current expiry gets one. A listing
 *    created in the last day expires a month after creation. Older ones (the
 *    rollout backlog, and dates migrated from V1 before EXPIRY_CUTOVER that
 *    were never enforced) get a full month from now plus a spread of up to
 *    ROLLOUT_SPREAD_DAYS, so the first notices trickle out instead of all
 *    landing on one day and no seller loses a listing without a full month.
 * 2. notice: NOTICE_DAYS_BEFORE expiry, one notice per (listing, expiry), a
 *    shop's listings batched into one notification (in-app, plus Discord DM
 *    if linked: at most one listing.expiring DM per user per 24 h, kill
 *    switch DISCORD_DM_DISABLED_EVENTS=listing.expiring), at most
 *    MAX_SHOPS_PER_RUN shops per run. A failed DM is recorded, never retried.
 * 3. pause: an expired listing becomes status 'expired' (hidden from the
 *    market, kept for the seller), but only if its notice went out at least
 *    MIN_NOTICE_HOURS earlier. One indexed set-based UPDATE.
 *
 * Renew (POST /listings/{id}/refresh) and any seller edit extend the listing
 * by a month; renewing a paused listing reactivates it.
 *
 * listing_expiry_notices records renewed/paused/reactivated per notice, so
 * the effect is measurable (logged every run).
 *
 * OFF until the owner decides (2026-11-01): turning expiry on is a behaviour
 * change for V2, where nothing has expired since the migration. With
 * LISTING_EXPIRY_ENABLED unset the task only logs a dry run (what it would
 * assign, notice and pause), edits and renews don't write expires_at, and the
 * listing.expiring event is hidden from the settings. Renewing a paused
 * ('expired', e.g. after an admin wipe) listing reactivates it either way.
 */

/** Read on every call: set LISTING_EXPIRY_ENABLED=true (and restart) to turn expiry on. */
export function listingExpiryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LISTING_EXPIRY_ENABLED === "true"
}
import type { Knex } from "knex"
import { randomUUID } from "node:crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import { discordDmDisabled } from "../notify/kill-switch.js"
import { orgMembersWithPermission } from "../notify/recipients.js"
import type { UserChannel, UserRecipient } from "../notify/channels.js"

export const EVENT_KEY = "listing.expiring" as const
/** How long a listing stays listed (V1's interval, unchanged). */
export const LISTING_LIFETIME = "1 month"
export const NOTICE_DAYS_BEFORE = 3
/** A listing is only paused if its notice went out at least this long before. */
export const MIN_NOTICE_HOURS = 24
/** Expiry dates before this were migrated from V1 and never enforced. */
export const EXPIRY_CUTOVER = new Date("2026-11-02T00:00:00Z")
export const ROLLOUT_SPREAD_DAYS = 14
export const MAX_SHOPS_PER_RUN = 50
/** At most one listing.expiring Discord DM per user per this many hours. */
export const DM_INTERVAL_HOURS = 24
const MAX_LISTED = 5

/** Columns that start a new listing month (seller edit, renew); none while expiry is off. */
export function renewalColumns(knex: Knex): { expires_at?: Knex.Raw } {
  if (!listingExpiryEnabled()) return {}
  return { expires_at: knex.raw(`now() + INTERVAL '${LISTING_LIFETIME}'`) }
}

/**
 * Record that a seller renewed (or reactivated) listings: closes their open
 * notices for the funnel numbers.
 */
export async function markRenewed(
  knex: Knex,
  listingIds: string[],
  wasPaused: boolean,
): Promise<void> {
  if (!listingIds.length) return
  try {
    const q = knex("listing_expiry_notices").whereIn("listing_id", listingIds)
    if (wasPaused) {
      await q.whereNotNull("paused_at").whereNull("reactivated_at").update({ reactivated_at: knex.fn.now() })
    } else {
      await q.whereNull("paused_at").whereNull("renewed_at").update({ renewed_at: knex.fn.now() })
    }
  } catch (error) {
    // Bookkeeping only; never fail a renew over it.
    logger.warn("listing expiry: failed to record renewal", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function baseUrl(): string {
  return env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
}

/** The one-click renew path: the seller's listings page renews these on open. */
export function renewPath(shopSlug: string, listingIds: string[]): string {
  return `/shop/${encodeURIComponent(shopSlug)}/listings?renew=${listingIds.join(",")}`
}

export function renewUrl(shopSlug: string, listingIds: string[]): string {
  return `${baseUrl()}${renewPath(shopSlug, listingIds)}`
}

/** Step 1: give active listings without a current expiry one. */
export async function assignMissingExpiry(knex: Knex, cutover = EXPIRY_CUTOVER): Promise<number> {
  const result = await knex.raw(
    `
    UPDATE listings
    SET expires_at = CASE
      WHEN created_at > now() - INTERVAL '1 day' THEN created_at + INTERVAL '${LISTING_LIFETIME}'
      ELSE now() + INTERVAL '${LISTING_LIFETIME}' + random() * INTERVAL '${ROLLOUT_SPREAD_DAYS} days'
    END
    WHERE status = 'active'
      AND (expires_at IS NULL OR expires_at < ?::timestamptz)
    `,
    [cutover.toISOString()],
  )
  return result?.rowCount ?? 0
}

interface DueListing {
  listing_id: string
  title: string
  expires_at: Date
  shop_id: string
  shop_slug: string
  shop_name: string
  owner_user_id: string | null
  owner_contractor_id: string | null
}

export interface NoticeBatch {
  batch_id: string
  shop_id: string
  shop_slug: string
  shop_name: string
  owner_user_id: string | null
  owner_contractor_id: string | null
  listings: { listing_id: string; title: string; expires_at: Date }[]
}

/** Group due listings into one batch per shop, capped. */
export function batchByShop(rows: DueListing[], maxShops = MAX_SHOPS_PER_RUN): { batches: NoticeBatch[]; capped: number } {
  const byShop = new Map<string, NoticeBatch>()
  for (const r of rows) {
    let b = byShop.get(r.shop_id)
    if (!b) {
      b = {
        batch_id: randomUUID(),
        shop_id: r.shop_id,
        shop_slug: r.shop_slug,
        shop_name: r.shop_name,
        owner_user_id: r.owner_user_id,
        owner_contractor_id: r.owner_contractor_id,
        listings: [],
      }
      byShop.set(r.shop_id, b)
    }
    b.listings.push({ listing_id: r.listing_id, title: r.title, expires_at: new Date(r.expires_at) })
  }
  const all = [...byShop.values()]
  return { batches: all.slice(0, maxShops), capped: Math.max(0, all.length - maxShops) }
}

export function noticeDm(batch: NoticeBatch) {
  const n = batch.listings.length
  const lines = batch.listings.slice(0, MAX_LISTED).map((l) => `• ${l.title.replace(/[[\]()*_`~]/g, "").slice(0, 80)}`)
  if (n > MAX_LISTED) lines.push(`…and ${n - MAX_LISTED} more`)
  const url = renewUrl(batch.shop_slug, batch.listings.map((l) => l.listing_id))
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: n === 1 ? "Still selling? Your listing expires in 3 days" : `Still selling? ${n} listings expire in 3 days`,
        description:
          `${lines.join("\n")}\n\nShop: ${batch.shop_name.replace(/[[\]()*_`~]/g, "")}\n` +
          `[Renew ${n === 1 ? "it" : "them"} in one click](${url}). ` +
          `If you do nothing, ${n === 1 ? "it is" : "they are"} paused (hidden from the market, not deleted); you can reactivate from your listings page any time.`,
        url,
        color: 0x10b881,
      },
    ],
  }
}

async function recipientsFor(batch: NoticeBatch): Promise<UserRecipient[]> {
  if (batch.owner_user_id) return [{ userId: batch.owner_user_id, contractorId: null }]
  if (batch.owner_contractor_id) return orgMembersWithPermission(batch.owner_contractor_id, "manage_market")
  return []
}

/** Users who already got a listing.expiring DM attempt in the last DM_INTERVAL_HOURS. */
async function recentlyDmed(knex: Knex, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const rows: { user_id: string }[] = await knex("notification_deliveries")
    .where({ event_key: EVENT_KEY, channel: "discord_dm" })
    .whereIn("user_id", userIds)
    .where("created_at", ">", knex.raw(`NOW() - INTERVAL '${DM_INTERVAL_HOURS} hours'`))
    .distinct("user_id")
  return new Set(rows.map((r) => r.user_id))
}

export interface ExpiryRunStats {
  assigned: number
  noticed_listings: number
  notice_batches: number
  capped_shops: number
  dm_sent: number
  dm_failed: number
  paused: number
}

/** Step 2: notices for listings expiring within NOTICE_DAYS_BEFORE. */
export async function sendExpiryNotices(knex: Knex, stats: ExpiryRunStats, maxShops = MAX_SHOPS_PER_RUN): Promise<void> {
  const due: DueListing[] = await knex("listings as l")
    .join("shops as s", "s.shop_id", "l.shop_id")
    .where("l.status", "active")
    .whereNotNull("l.expires_at")
    .where("l.expires_at", "<=", knex.raw(`now() + INTERVAL '${NOTICE_DAYS_BEFORE} days'`))
    .whereNotExists(function () {
      this.select(knex.raw("1"))
        .from("listing_expiry_notices as n")
        .whereRaw("n.listing_id = l.listing_id")
        .whereRaw("n.expires_at = l.expires_at")
    })
    .orderBy("l.expires_at", "asc")
    .select(
      "l.listing_id",
      "l.title",
      "l.expires_at",
      "s.shop_id",
      "s.slug as shop_slug",
      "s.name as shop_name",
      "s.owner_user_id",
      "s.owner_contractor_id",
    )
  if (!due.length) return
  const { batches, capped } = batchByShop(due, maxShops)
  stats.capped_shops = capped
  if (capped) {
    logger.warn("listing expiry: per-run notice cap reached; the rest go next run", {
      cap: maxShops,
      deferred_shops: capped,
    })
  }
  const dmOff = discordDmDisabled(EVENT_KEY)

  for (const batch of batches) {
    try {
      // Claim first (one notice per listing and expiry): a failure below is
      // never retried. expires_at is copied in SQL, not round-tripped through
      // a JS Date: Postgres keeps microseconds, a Date only milliseconds, and
      // the pause step matches the notice to the listing by exact equality.
      // The due condition is repeated so a listing renewed since the select
      // is not claimed for its new date.
      const claimed: { rows: { listing_id: string }[] } = await knex.raw(
        `
        INSERT INTO listing_expiry_notices (batch_id, listing_id, shop_id, expires_at)
        SELECT ?::uuid, l.listing_id, l.shop_id, l.expires_at
        FROM listings l
        WHERE l.listing_id = ANY(?::uuid[])
          AND l.status = 'active'
          AND l.expires_at IS NOT NULL
          AND l.expires_at <= now() + INTERVAL '${NOTICE_DAYS_BEFORE} days'
        ON CONFLICT (listing_id, expires_at) DO NOTHING
        RETURNING listing_id
        `,
        [batch.batch_id, batch.listings.map((l) => l.listing_id)],
      )
      const claimedIds = new Set(claimed.rows.map((c) => c.listing_id))
      batch.listings = batch.listings.filter((l) => claimedIds.has(l.listing_id))
      if (!batch.listings.length) continue
      stats.notice_batches++
      stats.noticed_listings += batch.listings.length

      const recipients = await recipientsFor(batch)
      const dmed = await recentlyDmed(knex, recipients.map((r) => r.userId))
      const message = noticeDm(batch)
      for (const r of recipients) {
        const channels: UserChannel[] = dmOff || dmed.has(r.userId) ? ["in_app"] : ["in_app", "discord_dm"]
        const result = await notify(EVENT_KEY, [r], {
          entityId: batch.batch_id,
          channels,
          messages: { discord_dm: message },
        })
        stats.dm_sent += result.delivered.filter((d) => d.channel === "discord_dm").length
        stats.dm_failed += result.failed.filter((d) => d.channel === "discord_dm").length
      }
    } catch (error) {
      logger.error("listing expiry: notice failed", {
        shop_id: batch.shop_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Step 3: pause expired listings whose notice went out long enough ago. */
export async function pauseExpired(knex: Knex): Promise<string[]> {
  // One statement: the notice is matched on the listing's exact expires_at
  // (microseconds), which a JS Date round trip would lose.
  const result = await knex.raw(`
    WITH paused AS (
      UPDATE listings l
      SET status = 'expired'
      WHERE l.status = 'active'
        AND l.expires_at <= now()
        AND EXISTS (
          SELECT 1 FROM listing_expiry_notices n
          WHERE n.listing_id = l.listing_id
            AND n.expires_at = l.expires_at
            AND n.notified_at <= now() - INTERVAL '${MIN_NOTICE_HOURS} hours'
        )
      RETURNING l.listing_id, l.expires_at
    ), recorded AS (
      UPDATE listing_expiry_notices n
      SET paused_at = now()
      FROM paused p
      WHERE n.listing_id = p.listing_id AND n.expires_at = p.expires_at
      RETURNING n.listing_id
    )
    SELECT listing_id FROM paused
  `)
  const rows: { listing_id: string }[] = result?.rows ?? []
  return rows.map((r) => r.listing_id)
}

/** Counts for the owner (logged every run): the state and the 30-day funnel. */
export async function expiryMetrics(knex: Knex) {
  const [state] = (
    await knex.raw(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::integer AS active,
        COUNT(*) FILTER (WHERE status = 'active' AND expires_at <= now() + INTERVAL '1 day')::integer AS expiring_24h,
        COUNT(*) FILTER (WHERE status = 'active' AND expires_at <= now() + INTERVAL '${NOTICE_DAYS_BEFORE} days')::integer AS expiring_3d,
        COUNT(*) FILTER (WHERE status = 'expired')::integer AS paused_total
      FROM listings
    `)
  ).rows
  const [funnel] = (
    await knex.raw(`
      SELECT
        COUNT(*)::integer AS noticed,
        COUNT(*) FILTER (WHERE renewed_at IS NOT NULL)::integer AS renewed_before_expiry,
        COUNT(*) FILTER (WHERE paused_at IS NOT NULL)::integer AS paused,
        COUNT(*) FILTER (WHERE reactivated_at IS NOT NULL)::integer AS reactivated_after_pause
      FROM listing_expiry_notices
      WHERE notified_at > now() - INTERVAL '30 days'
    `)
  ).rows
  return { state, funnel_30d: funnel }
}

/**
 * Dry run while expiry is off: what turning it on would do, for the owner.
 * Counts only.
 */
export async function expiryDryRun(knex: Knex, cutover = EXPIRY_CUTOVER) {
  const [row] = (
    await knex.raw(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::integer AS active,
        COUNT(*) FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at < ?::timestamptz))::integer AS would_assign,
        COUNT(*) FILTER (WHERE status = 'active' AND expires_at IS NULL)::integer AS active_without_expiry,
        COUNT(*) FILTER (WHERE status = 'active' AND expires_at < now())::integer AS active_past_legacy_expiry,
        COUNT(*) FILTER (WHERE status = 'active' AND updated_at < now() - INTERVAL '30 days')::integer AS active_untouched_30d,
        COUNT(*) FILTER (WHERE status = 'active' AND updated_at < now() - INTERVAL '90 days')::integer AS active_untouched_90d,
        COUNT(*) FILTER (WHERE status = 'active' AND created_at > now() - INTERVAL '30 days')::integer AS created_last_30d,
        COUNT(DISTINCT shop_id) FILTER (WHERE status = 'active')::integer AS shops_with_active
      FROM listings
      `,
      [cutover.toISOString()],
    )
  ).rows
  return row
}

let lastDryRunLog = 0

/** The hourly task. Tests pass an early cutover (all expiry dates count) and force it on. */
export async function processListingExpiry(
  opts: { cutover?: Date; enabled?: boolean } = {},
): Promise<ExpiryRunStats> {
  const knex = getKnex()
  if (!(opts.enabled ?? listingExpiryEnabled())) {
    // Every 6 hours: the numbers the owner needs to decide.
    if (Date.now() - lastDryRunLog > 6 * 3600_000) {
      lastDryRunLog = Date.now()
      try {
        logger.info("Listing expiry is off (LISTING_EXPIRY_ENABLED); dry run", await expiryDryRun(knex, opts.cutover))
      } catch (error) {
        logger.warn("listing expiry: dry run failed", { error: error instanceof Error ? error.message : String(error) })
      }
    }
    return { assigned: 0, noticed_listings: 0, notice_batches: 0, capped_shops: 0, dm_sent: 0, dm_failed: 0, paused: 0 }
  }
  const stats: ExpiryRunStats = {
    assigned: 0,
    noticed_listings: 0,
    notice_batches: 0,
    capped_shops: 0,
    dm_sent: 0,
    dm_failed: 0,
    paused: 0,
  }
  stats.assigned = await assignMissingExpiry(knex, opts.cutover ?? EXPIRY_CUTOVER)
  await sendExpiryNotices(knex, stats)
  stats.paused = (await pauseExpired(knex)).length
  let metrics: unknown = null
  try {
    metrics = await expiryMetrics(knex)
  } catch (error) {
    logger.warn("listing expiry: metrics failed", { error: error instanceof Error ? error.message : String(error) })
  }
  logger.info("Listing expiry run", { ...stats, metrics, discord_dm_disabled: discordDmDisabled(EVENT_KEY) })
  return stats
}

/** The in-app notification's entity (entity type listing_expiry_notices, id = batch_id). */
export async function noticeEntity(batchId: string) {
  const knex = getKnex()
  const rows: { listing_id: string; title: string; expires_at: Date; status: string; slug: string; name: string }[] =
    await knex("listing_expiry_notices as n")
      .join("listings as l", "l.listing_id", "n.listing_id")
      .join("shops as s", "s.shop_id", "n.shop_id")
      .where("n.batch_id", batchId)
      .orderBy("n.expires_at", "asc")
      .select("n.listing_id", "l.title", "n.expires_at", "l.status", "s.slug", "s.name")
  if (!rows.length) throw new Error(`Listing expiry notice not found: ${batchId}`)
  return {
    batch_id: batchId,
    shop_slug: rows[0].slug,
    shop_name: rows[0].name,
    renew_path: renewPath(rows[0].slug, rows.map((r) => r.listing_id)),
    listings: rows.map((r) => ({
      listing_id: r.listing_id,
      title: r.title,
      expires_at: new Date(r.expires_at).toISOString(),
      status: r.status,
    })),
  }
}
