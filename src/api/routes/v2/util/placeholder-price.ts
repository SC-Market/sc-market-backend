/**
 * Placeholder listing prices.
 *
 * Shops post "WTB <item>" requests as sell listings priced at 1 aUEC. Those
 * are not real offers, so anything that reads listing prices as offers (the
 * mining market price, watchlist price alerts) must ignore them.
 */

/** Prices at or below this many aUEC are placeholders, not real offers. */
export const PLACEHOLDER_PRICE_MAX = 1
