/**
 * Watchlist items: the per-user list of price alerts.
 *
 * Shared by the site (v2 `/watchlist`) and the Discord bot
 * (`/threads/watchlist/*`), so both validate and store watches the same way.
 * Every function is scoped to one user: another user's item id behaves as if
 * it did not exist.
 *
 * Alert matching and delivery live in watchlist.service.ts.
 */

import type { Knex } from "knex"
import { isUuid } from "../../api/routes/v2/util/short-slug.js"
import { PLACEHOLDER_PRICE_MAX } from "../../api/routes/v2/util/placeholder-price.js"
import { currentLowestPrices } from "./watchlist-prices.js"

/** Most items one user may watch. */
export const WATCHLIST_MAX_ITEMS = 50

/** Highest storable target price (`watchlist_items.max_price` is an int4). */
export const WATCHLIST_MAX_PRICE = 2_147_483_647

/** Longest free-text query (`watchlist_items.query` is varchar(500)). */
export const WATCHLIST_MAX_QUERY_LENGTH = 200

export type WatchlistErrorCode =
  | "invalid"
  | "unknown_item"
  | "not_found"
  | "limit"
  | "duplicate"

/** A watchlist request the caller can fix; `message` is shown to the user. */
export class WatchlistError extends Error {
  constructor(
    public readonly code: WatchlistErrorCode,
    message: string,
    public readonly field?: "max_price" | "query" | "game_item_id",
  ) {
    super(message)
    this.name = "WatchlistError"
  }

  /** HTTP status for the bot routes. */
  get status(): number {
    switch (this.code) {
      case "not_found":
        return 404
      case "duplicate":
        return 409
      default:
        return 400
    }
  }
}

export interface WatchlistItemRow {
  id: string
  query: string
  game_item_id: string | null
  max_price: number
  created_at: Date
  last_notified_at: Date | null
}

export interface WatchlistItemView extends WatchlistItemRow {
  /** Name of the watched game item, for item watches. */
  item_name: string | null
  item_image_url: string | null
  /** Lowest public, in-stock price this watch would alert on, if any. */
  current_lowest: number | null
}

export interface AddWatchlistItemInput {
  /** Watch exactly this game item (its name becomes the query). */
  game_item_id?: string | null
  /** Free text, matched as a phrase in listing titles. Ignored with game_item_id. */
  query?: string | null
  max_price: number
}

const ITEM_COLUMNS = [
  "id",
  "query",
  "game_item_id",
  "max_price",
  "created_at",
  "last_notified_at",
] as const

/**
 * A target price must be a whole number of aUEC above the placeholder price:
 * listings at or below it never alert, so such a watch could never fire.
 */
export function validateMaxPrice(maxPrice: unknown): number {
  if (
    typeof maxPrice !== "number" ||
    !Number.isInteger(maxPrice) ||
    maxPrice <= PLACEHOLDER_PRICE_MAX ||
    maxPrice > WATCHLIST_MAX_PRICE
  ) {
    throw new WatchlistError(
      "invalid",
      `The target price must be a whole number above ${PLACEHOLDER_PRICE_MAX} aUEC`,
      "max_price",
    )
  }
  return maxPrice
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase()
}

function toRow(raw: Record<string, unknown>): WatchlistItemRow {
  return {
    id: String(raw.id),
    query: String(raw.query),
    game_item_id: (raw.game_item_id as string | null) ?? null,
    max_price: Number(raw.max_price),
    created_at: raw.created_at as Date,
    last_notified_at: (raw.last_notified_at as Date | null) ?? null,
  }
}

/**
 * Add a watch for `userId`. Rejects a bad price, an unknown game item, a
 * watch the user already has (same game item, or the same text query) and a
 * full watchlist.
 */
export async function addWatchlistItem(
  db: Knex,
  userId: string,
  input: AddWatchlistItemInput,
): Promise<WatchlistItemRow> {
  const maxPrice = validateMaxPrice(input.max_price)
  const gameItemId = input.game_item_id || null
  if (gameItemId !== null && typeof gameItemId !== "string") {
    throw new WatchlistError(
      "unknown_item",
      "Unknown game item",
      "game_item_id",
    )
  }

  let query: string
  if (gameItemId) {
    const item = isUuid(gameItemId)
      ? await db("game_items").where("id", gameItemId).first("id", "name")
      : undefined
    if (!item)
      throw new WatchlistError(
        "unknown_item",
        "Unknown game item",
        "game_item_id",
      )
    query = String(item.name)
  } else {
    query = (typeof input.query === "string" ? input.query : "")
      .trim()
      .replace(/\s+/g, " ")
    if (!query) {
      throw new WatchlistError(
        "invalid",
        "query or game_item_id is required",
        "query",
      )
    }
    if (query.length > WATCHLIST_MAX_QUERY_LENGTH) {
      throw new WatchlistError(
        "invalid",
        `query must be at most ${WATCHLIST_MAX_QUERY_LENGTH} characters`,
        "query",
      )
    }
  }

  const existing: Array<Record<string, unknown>> = await db("watchlist_items")
    .where("user_id", userId)
    .select("id", "query", "game_item_id")
  const duplicate = existing.find((row) =>
    gameItemId
      ? row.game_item_id === gameItemId
      : !row.game_item_id &&
        normalizeQuery(String(row.query)) === normalizeQuery(query),
  )
  if (duplicate) {
    throw new WatchlistError(
      "duplicate",
      `You already watch ${query}`,
    )
  }
  if (existing.length >= WATCHLIST_MAX_ITEMS) {
    throw new WatchlistError(
      "limit",
      `You can watch up to ${WATCHLIST_MAX_ITEMS} items. Remove one to add another.`,
    )
  }

  const [row] = await db("watchlist_items")
    .insert({
      user_id: userId,
      query,
      game_item_id: gameItemId,
      max_price: maxPrice,
      created_at: new Date(),
    })
    .returning([...ITEM_COLUMNS])
  return toRow(row)
}

/** Change the target price of one of `userId`'s watches. */
export async function updateWatchlistItemPrice(
  db: Knex,
  userId: string,
  watchlistId: string,
  maxPrice: number,
): Promise<WatchlistItemRow> {
  const price = validateMaxPrice(maxPrice)
  if (typeof watchlistId !== "string" || !isUuid(watchlistId)) throw notFound()
  const updated = await db("watchlist_items")
    .where({ id: watchlistId, user_id: userId })
    .update({ max_price: price })
  if (!updated) throw notFound()
  const row = await db("watchlist_items")
    .where({ id: watchlistId, user_id: userId })
    .first(...ITEM_COLUMNS)
  if (!row) throw notFound()
  return toRow(row)
}

/** Delete one of `userId`'s watches. */
export async function removeWatchlistItem(
  db: Knex,
  userId: string,
  watchlistId: string,
): Promise<void> {
  if (typeof watchlistId !== "string" || !isUuid(watchlistId)) throw notFound()
  const deleted = await db("watchlist_items")
    .where({ id: watchlistId, user_id: userId })
    .del()
  if (!deleted) throw notFound()
}

/**
 * `userId`'s watches, newest first, with the watched item's name and image
 * and the current lowest price each watch would alert on.
 */
export async function listWatchlistItems(
  db: Knex,
  userId: string,
): Promise<WatchlistItemView[]> {
  const raw: Array<Record<string, unknown>> = await db("watchlist_items")
    .where("user_id", userId)
    .orderBy("created_at", "desc")
    .select(...ITEM_COLUMNS)
  return describeWatchlistItems(db, raw.map(toRow))
}

/** Add the item name/image and current lowest price to watch rows. */
export async function describeWatchlistItems(
  db: Knex,
  rows: WatchlistItemRow[],
): Promise<WatchlistItemView[]> {
  if (rows.length === 0) return []

  const gameItemIds = [
    ...new Set(rows.flatMap((r) => (r.game_item_id ? [r.game_item_id] : []))),
  ]
  const gameItems: Array<{
    id: string
    name: string
    image_url: string | null
  }> =
    gameItemIds.length > 0
      ? await db("game_items")
          .whereIn("id", gameItemIds)
          .select("id", "name", "image_url")
      : []
  const itemsById = new Map(gameItems.map((g) => [g.id, g]))
  const lowest = await currentLowestPrices(db, rows)

  return rows.map((row) => {
    const item = row.game_item_id ? itemsById.get(row.game_item_id) : undefined
    return {
      ...row,
      item_name: item?.name ?? null,
      item_image_url: item?.image_url ?? null,
      current_lowest: lowest.get(row.id) ?? null,
    }
  })
}

function notFound(): WatchlistError {
  return new WatchlistError("not_found", "Watchlist item not found")
}
