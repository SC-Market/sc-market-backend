/**
 * Current lowest price for watchlist items: the cheapest public, in-stock,
 * non-placeholder listing each watch would alert on (same listing filter and
 * matching rule as the alerts themselves).
 */

import type { Knex } from "knex"
import { alertableListingFilter } from "./watchlist.service.js"

interface PricedWatch {
  id: string
  query: string
  game_item_id: string | null
}

/** Lowest current price per watch id; watches with no matching listing are absent. */
export async function currentLowestPrices(
  db: Knex,
  watches: PricedWatch[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (watches.length === 0) return result

  const base = () =>
    db("listing_search as ls")
      .where(alertableListingFilter(db))
      .where("ls.quantity_available", ">", 0)

  // Item watches: one grouped query for all of them.
  const itemIds = [
    ...new Set(
      watches.flatMap((w) => (w.game_item_id ? [w.game_item_id] : [])),
    ),
  ]
  if (itemIds.length > 0) {
    const rows: Array<{ game_item_id: string; lowest: string | number }> =
      await base()
        .whereIn("ls.game_item_id", itemIds)
        .groupBy("ls.game_item_id")
        .select("ls.game_item_id", db.raw("min(ls.price_min) as lowest"))
    const byItem = new Map(
      rows.map((r) => [String(r.game_item_id), Number(r.lowest)]),
    )
    for (const w of watches) {
      const lowest = w.game_item_id ? byItem.get(w.game_item_id) : undefined
      if (lowest !== undefined && Number.isFinite(lowest))
        result.set(w.id, lowest)
    }
  }

  // Text watches: a phrase match on the title, one query each (a user has at
  // most WATCHLIST_MAX_ITEMS watches).
  await Promise.all(
    watches
      .filter((w) => !w.game_item_id)
      .map(async (w) => {
        const row = await base()
          .whereRaw(
            "to_tsvector('english', ls.title) @@ phraseto_tsquery('english', ?)",
            [w.query],
          )
          .min({ lowest: "ls.price_min" })
          .first()
        const lowest = row?.lowest == null ? NaN : Number(row.lowest)
        if (Number.isFinite(lowest)) result.set(w.id, lowest)
      }),
  )

  return result
}
