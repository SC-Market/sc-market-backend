/**
 * Resolve game item images from listing photos when no icon_url exists.
 * Checks active listings linked to the game item for the most recent photo.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"

const FALLBACK_URLS = new Set([
  "https://cdn.robertsspaceindustries.com/static/images/Temp/default-image.png",
  "",
])

/**
 * For a batch of game item IDs, resolve missing images from listing photos.
 * Returns a map of game_item_id → photo_url for items that have listing photos.
 */
export async function resolveGameItemImages(
  gameItemIds: string[],
): Promise<Map<string, string>> {
  if (!gameItemIds.length) return new Map()

  const db = getKnex()

  // Find the most recent non-default photo for each game item via its listings
  const rows = await db.raw(`
    SELECT DISTINCT ON (li.game_item_id)
      li.game_item_id,
      lp.url
    FROM listing_items li
    JOIN listings l ON l.listing_id = li.listing_id AND l.status = 'active'
    JOIN listing_photos lp ON lp.listing_id = l.listing_id
    WHERE li.game_item_id = ANY(?)
      AND lp.url IS NOT NULL
      AND lp.url != ''
      AND lp.url != 'https://cdn.robertsspaceindustries.com/static/images/Temp/default-image.png'
    ORDER BY li.game_item_id, lp.created_at DESC
  `, [gameItemIds])

  const result = new Map<string, string>()
  for (const row of rows.rows || []) {
    if (row.url && !FALLBACK_URLS.has(row.url)) {
      result.set(row.game_item_id, row.url)
    }
  }
  return result
}
