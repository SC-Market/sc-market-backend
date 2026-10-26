/**
 * Market price shown for ores in the mining database, derived from active
 * SC Market listings of the matching game item.
 *
 * The raw minimum was useless: shops post "WTB <ore>" requests as 1 aUEC sell
 * listings, so every ore with one showed "1 aUEC". Instead we drop obvious
 * placeholder prices and take a low percentile of what's left: close to the
 * cheapest real offer, but not decided by a single outlier listing.
 */
import type { Knex } from "knex"
import { PLACEHOLDER_PRICE_MAX } from "../../util/placeholder-price.js"

/** Which percentile of real listing prices to show (0.1 = 10th percentile). */
export const MARKET_PRICE_PERCENTILE = 0.1

/**
 * Aggregate select for the market price over `li` (listing_items), aliased
 * `min_price`. percentile_disc returns an actual listing price, not an
 * interpolated one.
 */
export const LISTING_MARKET_PRICE = `percentile_disc(${MARKET_PRICE_PERCENTILE}) WITHIN GROUP (ORDER BY li.base_price) as min_price`

/** Where-clause callback that drops placeholder-priced listing items. */
export function excludePlaceholderPrices(this: Knex.QueryBuilder): void {
  this.where("li.base_price", ">", PLACEHOLDER_PRICE_MAX)
}
