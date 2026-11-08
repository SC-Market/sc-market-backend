/**
 * Which orgs and shops the site FEATURES (the homepage's "Org storefronts"
 * row and "Top rated shops"). A directory (the Storefronts hub, /shops)
 * still lists everyone who qualifies there; featuring is stricter.
 *
 * Rule: a shop is featured only when it actually trades: it has an order
 * that was fulfilled within FEATURED_TRADE_WINDOW_DAYS. An org is featured
 * when one of its shown shops is (storefront.ts). Lifetime totals, ratings,
 * an active service or listings are not enough: SC Market's own org
 * (SCMARKET) runs a support "service" and has a few old orders, so it ranked
 * among real traders without processing real orders. There is no "official"
 * or "house" account flag to exclude it by (contractors.is_test is only for
 * test accounts and can't change after insert), and a hard-coded slug would
 * miss the next such account, so the rule is about trading, for everyone.
 */

/**
 * A shop must have an order fulfilled within this many days to be featured.
 * A year, not a season: the market is quiet enough (2026-11) that 90 days
 * left one featured org, while SC Market's own org last completed an order
 * over a year ago.
 */
export const FEATURED_TRADE_WINDOW_DAYS = 365

const COLUMN = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i

/**
 * SQL: the shop has an order fulfilled within FEATURED_TRADE_WINDOW_DAYS.
 * Orders fulfilled before orders.fulfilled_at existed have none; their
 * placement time stands in (it is never later than the fulfilment).
 * `shopIdColumn` is a code literal such as "s.shop_id".
 */
export function recentlyTradedSql(shopIdColumn: string): string {
  if (!COLUMN.test(shopIdColumn))
    throw new Error(`featured-sellers: invalid column reference ${shopIdColumn}`)
  return (
    `EXISTS (SELECT 1 FROM orders _fo WHERE _fo.shop_id = ${shopIdColumn}` +
    ` AND _fo.status = 'fulfilled'` +
    ` AND COALESCE(_fo.fulfilled_at, _fo."timestamp") >= now() - INTERVAL '${FEATURED_TRADE_WINDOW_DAYS} days')`
  )
}
