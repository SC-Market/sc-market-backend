/**
 * Watchlist (price alerts): items the user watches, each with a target price.
 * Delivery channels are in price-alerts.types.ts.
 */

/** One watched item. */
export interface WatchlistItem {
  /** Watchlist item id */
  id: string
  /**
   * What is watched: the game item's name for item watches, otherwise the
   * text matched as a phrase in listing titles.
   */
  query: string
  /** Set for item watches: only listings of exactly this game item match. */
  game_item_id: string | null
  /** Name of the watched game item (item watches only). */
  item_name: string | null
  /** Image of the watched game item (item watches only). */
  item_image_url: string | null
  /** Alert when a public listing is at or below this price (aUEC). */
  max_price: number
  /**
   * Item watches only: alerts only for listed lots of at least this quality
   * tier (1-5), at their price. null: any quality.
   */
  min_quality_tier: number | null
  /** Paused watches never alert, until resumed. */
  paused: boolean
  /** When the watch was paused; null while it is active. */
  paused_at: string | null
  /** Lowest public, in-stock price this watch would alert on now; null if none. */
  current_lowest: number | null
  /** When the last alert for this item was sent; alerts have a 1 hour cooldown. */
  last_notified_at: string | null
  created_at: string
}

export interface WatchlistResponse {
  items: WatchlistItem[]
  /** Most items one user may watch. */
  max_items: number
}

/** Watch a game item (preferred) or a text query. */
export interface AddWatchlistItemRequest {
  /** Watch exactly this game item. */
  game_item_id?: string
  /** Free text matched as a phrase in listing titles; used when game_item_id is absent. */
  query?: string
  /**
   * Target price in aUEC: a whole number above 1 (1 aUEC listings are
   * placeholders and never alert).
   * @isInt
   * @minimum 2
   * @maximum 2147483647
   */
  max_price: number
  /**
   * Item watches only: lowest quality tier that alerts; omit or null for any.
   * @isInt
   * @minimum 1
   * @maximum 5
   */
  min_quality_tier?: number | null
}

/** Changes to a watch; omitted fields keep their current value. */
export interface UpdateWatchlistItemRequest {
  /**
   * New target price in aUEC.
   * @isInt
   * @minimum 2
   * @maximum 2147483647
   */
  max_price?: number
  /**
   * Item watches only: lowest quality tier that alerts; null for any quality.
   * @isInt
   * @minimum 1
   * @maximum 5
   */
  min_quality_tier?: number | null
  /** true pauses the watch (no alerts), false resumes it. */
  paused?: boolean
}
