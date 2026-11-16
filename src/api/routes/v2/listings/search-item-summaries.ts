import type { SearchItemSummary } from "../types/listings.types.js"

/**
 * One search-matching listing of a game item, as read for the item summaries:
 * the same filtered listing_search query as the result page, without its
 * ordering or paging, restricted to the page's game items.
 */
export interface SearchItemSummaryRow {
  game_item_id: string
  listing_id: string
  shop_id: string
  price_min: string | number | null
  price_max: string | number | null
  quantity_available: string | number | null
  quality_tier_min: string | number | null
  quality_tier_max: string | number | null
  quality_value_min: string | number | null
  quality_value_max: string | number | null
  has_bulk_discount: boolean | null
}

/**
 * SQL of a search row's lowest or highest quality value among its listed lots
 * with stock (listing_search aliased "ls").
 */
export function searchQualityValueSql(
  agg: "MIN" | "MAX",
  alias: "quality_value_min" | "quality_value_max",
): string {
  return `(
            SELECT ${agg}((iv.attributes->>'quality_value')::int)
            FROM listing_item_lots lil
            JOIN listing_items li ON lil.item_id = li.item_id
            JOIN item_variants iv ON lil.variant_id = iv.variant_id
            WHERE li.listing_id = ls.listing_id
              AND iv.attributes->>'quality_value' IS NOT NULL
              AND lil.quantity_total > 0
              AND lil.listed = true
          ) as ${alias}`
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const minOf = (values: (number | null)[]): number | null => {
  const xs = values.filter((v): v is number => v !== null)
  return xs.length ? Math.min(...xs) : null
}

const maxOf = (values: (number | null)[]): number | null => {
  const xs = values.filter((v): v is number => v !== null)
  return xs.length ? Math.max(...xs) : null
}

/**
 * Pure: one summary per game item over ALL its search-matching listings (not
 * only the ones on the result page), so a grouped market card counts every
 * seller.
 *
 * - listing_count: every matching listing, in stock or not.
 * - seller_count: distinct shops with stock (quantity_available > 0), the
 *   rule of the expanded seller list (GET /game-items/{id}/listings only
 *   returns variants with stock, one card per shop).
 * - price, quality and bulk discount: over the in-stock listings, the ones a
 *   buyer can order; over all of them when none has stock (the card then shows
 *   OUT OF STOCK).
 *
 * Items keep the order of their first row.
 */
export function summarizeSearchItems(
  rows: readonly SearchItemSummaryRow[],
): SearchItemSummary[] {
  const byItem = new Map<string, SearchItemSummaryRow[]>()
  for (const row of rows) {
    const list = byItem.get(row.game_item_id)
    if (list) list.push(row)
    else byItem.set(row.game_item_id, [row])
  }

  const summaries: SearchItemSummary[] = []
  for (const [game_item_id, itemRows] of byItem) {
    const listings = new Map<string, SearchItemSummaryRow>()
    for (const r of itemRows) listings.set(r.listing_id, r)
    const all = [...listings.values()]
    const inStock = all.filter((r) => (num(r.quantity_available) ?? 0) > 0)
    const priced = inStock.length ? inStock : all

    const priceMin = minOf(priced.map((r) => num(r.price_min)))
    const priceMax = maxOf(
      priced.map((r) => num(r.price_max) ?? num(r.price_min)),
    )
    summaries.push({
      game_item_id,
      listing_count: all.length,
      seller_count: new Set(inStock.map((r) => r.shop_id)).size,
      quantity_available: inStock.reduce(
        (sum, r) => sum + (num(r.quantity_available) ?? 0),
        0,
      ),
      price_min: priceMin ?? 0,
      price_max: priceMax ?? priceMin ?? 0,
      quality_tier_min:
        minOf(priced.map((r) => num(r.quality_tier_min))) ?? undefined,
      quality_tier_max:
        maxOf(priced.map((r) => num(r.quality_tier_max))) ?? undefined,
      quality_value_min:
        minOf(priced.map((r) => num(r.quality_value_min))) ?? undefined,
      quality_value_max:
        maxOf(priced.map((r) => num(r.quality_value_max))) ?? undefined,
      has_bulk_discount: priced.some((r) => r.has_bulk_discount === true),
    })
  }
  return summaries
}
