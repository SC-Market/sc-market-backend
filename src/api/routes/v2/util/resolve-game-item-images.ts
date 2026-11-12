/**
 * Resolve game item images from listing photos when no icon_url exists.
 * Checks publicly listed listings linked to the game item for the most recent
 * photo (never an org-internal or unlisted listing's photo).
 */

import type { Knex } from "knex"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { publiclyListedSql } from "./listing-visibility.js"
import { DEFAULT_PLACEHOLDER_PHOTO_URL } from "../../v1/market/constants.js"

/** Placeholder photos (no real photo), never a game item's image. */
const FALLBACK_URLS = new Set([
  DEFAULT_PLACEHOLDER_PHOTO_URL,
  // Placeholders stored by older listings.
  "https://cdn.robertsspaceindustries.com/static/images/Temp/default-image.png",
  "https://media.starcitizen.tools/thumb/9/93/Placeholderv2.png/399px-Placeholderv2.png.webp",
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
  const rows = await db.raw(
    `
    SELECT DISTINCT ON (li.game_item_id)
      li.game_item_id,
      COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) as url
    FROM listing_items li
    JOIN listings l ON l.listing_id = li.listing_id AND ${publiclyListedSql("l")}
    JOIN listing_photos_v2 lp ON lp.listing_id = l.listing_id
    JOIN image_resources ir ON lp.resource_id = ir.resource_id
    WHERE li.game_item_id = ANY(?)
      AND (ir.external_url IS NULL OR NOT (ir.external_url = ANY(?)))
    ORDER BY li.game_item_id, lp.display_order ASC
  `,
    // Skip placeholders in SQL, so an item still gets a real photo when
    // its first listing's is a placeholder.
    [gameItemIds, [...FALLBACK_URLS].filter(Boolean)],
  )

  const result = new Map<string, string>()
  for (const row of rows.rows || []) {
    if (row.url && !FALLBACK_URLS.has(row.url)) {
      result.set(row.game_item_id, row.url)
    }
  }
  return result
}

/**
 * For a page of game item IDs, the first photo (lowest display_order) of a
 * publicly listed listing of each item, in one batched query. Placeholders are
 * not filtered (callers that want that use resolveGameItemImages).
 *
 * Replaces a correlated per-row subquery: run in the select list of a paged
 * query, Postgres evaluated it for every skipped OFFSET row too, and its
 * `game_item_id::text = id::text` casts hid idx_listing_items_game_item, so
 * each evaluation scanned listing_items (statement timeouts on high pages).
 * The uuid = ANY(uuid[]) filter here uses that index.
 */
export async function firstListingPhotoByGameItem(
  db: Knex,
  gameItemIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(gameItemIds.filter(Boolean))]
  if (!ids.length) return new Map()

  const { rows } = (await db.raw(
    `
    SELECT DISTINCT ON (li.game_item_id)
      li.game_item_id,
      COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) AS url
    FROM listing_items li
    JOIN listings l ON l.listing_id = li.listing_id AND ${publiclyListedSql("l")}
    JOIN listing_photos_v2 lp ON lp.listing_id = l.listing_id
    JOIN image_resources ir ON lp.resource_id = ir.resource_id
    WHERE li.game_item_id = ANY(?::uuid[])
    ORDER BY li.game_item_id, lp.display_order ASC
  `,
    [ids],
  )) as { rows: Array<{ game_item_id: string; url: string | null }> }

  const result = new Map<string, string>()
  for (const row of rows || []) {
    if (row.url) result.set(row.game_item_id, row.url)
  }
  return result
}
