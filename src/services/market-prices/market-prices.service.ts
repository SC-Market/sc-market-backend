/**
 * Market prices of game items, batched: "Lowest on SC Market: X aUEC · N
 * sellers" on wiki and game-data pages (detail pages, list rows, comparison
 * tables). One query answers a whole page of items, so list pages never make
 * one request per item.
 *
 * Which listings count (the market search's rules for an anonymous visitor,
 * which is also what the item's market page shows to anyone):
 * - active, public, not a test shop's listing (publiclyListedSql), not
 *   expired;
 * - with stock: at least one listed lot with quantity > 0.
 *
 * Numbers:
 * - seller_count: distinct shops (the market's "one seller per shop" rule,
 *   sc-market-frontend groupSellerRule.ts), so a shop with three listings of
 *   the item is one seller;
 * - lowest_price: the lowest per-unit fixed-price ask above the placeholder
 *   price (1 aUEC "contact me" listings), the same rule as the acquisition
 *   document's listings.lowest_ask; null when every listing is an auction or
 *   a placeholder.
 *
 * An item nobody sells has no entry at all (callers hide the line).
 *
 * Bounded load: one query per call under a short statement timeout, per-item
 * results kept in an in-process cache for 5 minutes (the edge cache sits in
 * front of the HTTP endpoints too).
 */

import type { Knex } from "knex"
import { LRUCache } from "lru-cache"
import { withStatementTimeout } from "../../clients/database/session-settings.js"
import { publiclyListedSql } from "../../api/routes/v2/util/listing-visibility.js"
import { PRICE_ORACLE_RULES } from "../price-oracle/price-math.js"
import type { GameItemMarketPrice } from "../../api/routes/v2/types/game-items.types.js"

/** Statement timeout of one batch query. */
export const MARKET_PRICES_TIMEOUT = "3s"

/** Most items one request may ask for (the largest wiki list page, 120 rows). */
export const MARKET_PRICES_MAX_IDS = 120

/** One row per live listing of an item (the query's inner level). */
export interface MarketPriceListingRow {
  game_item_id: string
  listing_id: string
  shop_id: string
  sale_type: string
  /** Lowest per-unit price over the listing's in-stock lots (pg bigint: a string) */
  price: string | number | null
}

/**
 * The live listings of the selected items, one row per (item, listing).
 * `itemFilter` is a SQL condition on `li.game_item_id` with its bindings
 * (an id list, or a subquery for a whole comparison category).
 */
export function liveListingRowsQuery(
  knex: Knex,
  itemFilter: { sql: string; bindings: readonly Knex.Value[] },
): Knex.Raw<{ rows: MarketPriceListingRow[] }> {
  return knex.raw(
    `
    SELECT
      li.game_item_id::text AS game_item_id,
      l.listing_id::text AS listing_id,
      l.shop_id::text AS shop_id,
      l.sale_type,
      MIN(p.price)::bigint AS price
    FROM listings l
    JOIN listing_items li ON li.listing_id = l.listing_id
    JOIN LATERAL (
      SELECT
        MIN(CASE WHEN li.pricing_mode = 'per_variant'
                 THEN COALESCE(vp.price, li.base_price)
                 ELSE li.base_price END) AS price,
        SUM(lil.quantity_total) AS qty
      FROM listing_item_lots lil
      LEFT JOIN variant_pricing vp
        ON vp.item_id = li.item_id AND vp.variant_id = lil.variant_id
      WHERE lil.item_id = li.item_id AND lil.listed = true AND lil.quantity_total > 0
    ) p ON p.qty > 0
    WHERE ${publiclyListedSql("l")}
      AND (l.expires_at IS NULL OR l.expires_at > now())
      AND ${itemFilter.sql}
    GROUP BY li.game_item_id, l.listing_id, l.shop_id, l.sale_type
    `,
    itemFilter.bindings as Knex.Value[],
  )
}

/**
 * Pure: the per-item summaries from the listing rows. Sellers are distinct
 * shops; an item without rows has no entry.
 */
export function summarizeMarketPrices(
  rows: readonly MarketPriceListingRow[],
): Map<string, GameItemMarketPrice> {
  const placeholder = PRICE_ORACLE_RULES.placeholderPriceMax
  const byItem = new Map<
    string,
    { shops: Set<string>; listings: Set<string>; lowest: number | null }
  >()
  for (const row of rows) {
    let acc = byItem.get(row.game_item_id)
    if (!acc) {
      acc = { shops: new Set(), listings: new Set(), lowest: null }
      byItem.set(row.game_item_id, acc)
    }
    acc.shops.add(row.shop_id)
    acc.listings.add(row.listing_id)
    const price = row.price === null ? null : Number(row.price)
    if (
      row.sale_type === "fixed" &&
      price !== null &&
      Number.isFinite(price) &&
      price > placeholder &&
      (acc.lowest === null || price < acc.lowest)
    ) {
      acc.lowest = price
    }
  }
  const out = new Map<string, GameItemMarketPrice>()
  for (const [game_item_id, acc] of byItem) {
    out.set(game_item_id, {
      game_item_id,
      lowest_price: acc.lowest,
      seller_count: acc.shops.size,
      listing_count: acc.listings.size,
    })
  }
  return out
}

/**
 * Summaries of the given items, straight from the database (no cache), on
 * the caller's connection or transaction (which sets the timeout).
 */
export async function fetchMarketPrices(
  knex: Knex,
  itemFilter: { sql: string; bindings: readonly Knex.Value[] },
): Promise<Map<string, GameItemMarketPrice>> {
  const result = await liveListingRowsQuery(knex, itemFilter)
  return summarizeMarketPrices(result.rows)
}

/** fetchMarketPrices in its own transaction under MARKET_PRICES_TIMEOUT. */
export async function queryMarketPrices(
  knex: Knex,
  itemFilter: { sql: string; bindings: readonly Knex.Value[] },
): Promise<Map<string, GameItemMarketPrice>> {
  return withStatementTimeout(knex, MARKET_PRICES_TIMEOUT, (trx) =>
    fetchMarketPrices(trx, itemFilter),
  )
}

/** In-process cache TTL; under the edge's s-maxage. */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Per item: its summary, or null when nobody sells it. */
const cache = new LRUCache<string, GameItemMarketPrice | { none: true }>({
  max: 20_000,
  ttl: CACHE_TTL_MS,
})

/**
 * Cached summaries (5 minutes) of the given game item UUIDs. Ids already
 * cached are answered from memory; the rest in one query. Returns only the
 * items somebody sells, in the order asked.
 */
export async function getMarketPrices(
  knex: Knex,
  ids: readonly string[],
): Promise<GameItemMarketPrice[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))]
  const missing = unique.filter((id) => !cache.has(id))
  if (missing.length) {
    const fresh = await queryMarketPrices(knex, {
      sql: "li.game_item_id = ANY(?::uuid[])",
      bindings: [missing],
    })
    for (const id of missing) cache.set(id, fresh.get(id) ?? { none: true })
  }
  const out: GameItemMarketPrice[] = []
  for (const id of unique) {
    const hit = cache.get(id)
    if (hit && !("none" in hit)) out.push(hit)
  }
  return out
}

/** Test hook. */
export function clearMarketPriceCache(): void {
  cache.clear()
}
