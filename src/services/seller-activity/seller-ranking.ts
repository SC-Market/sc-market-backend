/**
 * Seller activity in result ordering (owner decision, 2026-11-01): listings
 * from sellers who are gone stay listed, but rank below the same kind of
 * listing from sellers seen recently. Nothing is hidden or dropped.
 *
 * "Inactive" is the same signal buyers see as "Last seen: over a month"
 * (seller-activity.service.ts lastSeenBucket): shop_activity_stats
 * .last_active_at older than INACTIVE_SELLER_AFTER_DAYS. That value already
 * leaves out anyone who hides their online status, and shops whose stats are
 * not computed yet have none. A shop without a value is NEUTRAL (ranked as
 * active): hiding your status, or opening a new shop, never costs you rank,
 * and the order never reveals a hidden seller's activity.
 *
 * Where it applies:
 * - The default listing order (GET /listings/search without sort_by: the
 *   market grid, shop grids, the bridge/prerender pages that use the
 *   default): newest first, with an inactive seller's listing ranked as if it
 *   had been listed INACTIVE_SELLER_RANK_PENALTY_DAYS earlier. That is THE
 *   weight of the factor; raise it to push inactive sellers further down,
 *   0 turns the factor off.
 * - Every explicit sort (price, newest, quality, rating, quantity, name, ...)
 *   stays exactly what the user chose; seller activity only breaks ties
 *   between rows the chosen sort ranks equal, before a final stable key.
 *   Used by the listing search, the game item page's offers, the item
 *   aggregates (bulk items) page and the shop directory.
 *
 * Determinism: every order ends on a unique key, so the SSR / prerender
 * request and the client's request for the same URL get the same order, and
 * paging never repeats or skips rows. The factor itself only moves when a
 * seller crosses the 30-day line (stats are recomputed every 30 minutes);
 * the sitemap lists every public listing and does not depend on it.
 */

/** A seller last active this many days ago or more counts as inactive ("over a month"). */
export const INACTIVE_SELLER_AFTER_DAYS = 30

/**
 * The weight: in the default listing order, an inactive seller's listing
 * ranks as if it had been listed this many days earlier than it was.
 */
export const INACTIVE_SELLER_RANK_PENALTY_DAYS = 90

const COLUMN = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i

function column(ref: string): string {
  if (!COLUMN.test(ref))
    throw new Error(`seller-ranking: invalid column reference ${ref}`)
  return ref
}

/**
 * SQL: 1 when the shop's seller is known to be inactive, else 0 (active,
 * hidden or unknown). `shopIdColumn` is a code literal such as "ls.shop_id".
 */
export function sellerInactiveSql(shopIdColumn: string): string {
  return (
    "(CASE WHEN EXISTS (SELECT 1 FROM shop_activity_stats _sas" +
    ` WHERE _sas.shop_id = ${column(shopIdColumn)}` +
    ` AND _sas.last_active_at < now() - INTERVAL '${INACTIVE_SELLER_AFTER_DAYS} days')` +
    " THEN 1 ELSE 0 END)"
  )
}

/** ORDER BY fragment: active (and unknown) sellers before inactive ones. A tie-breaker. */
export function sellerActivityTieBreakSql(shopIdColumn: string): string {
  return `${sellerInactiveSql(shopIdColumn)} ASC`
}

/**
 * ORDER BY fragment for the default listing order: newest first, inactive
 * sellers' listings shifted back by INACTIVE_SELLER_RANK_PENALTY_DAYS.
 */
export function defaultListingRankSql(
  createdAtColumn: string,
  shopIdColumn: string,
): string {
  return (
    `(${column(createdAtColumn)} - ${sellerInactiveSql(shopIdColumn)}` +
    ` * INTERVAL '${INACTIVE_SELLER_RANK_PENALTY_DAYS} days') DESC`
  )
}

/** SQL boolean for joined shop_activity_stats rows (alias `sas`): not known to be inactive. */
export function sellerActiveJoinedSql(lastActiveAtColumn: string): string {
  const c = column(lastActiveAtColumn)
  return `(${c} IS NULL OR ${c} >= now() - INTERVAL '${INACTIVE_SELLER_AFTER_DAYS} days')`
}
