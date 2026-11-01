/**
 * Player-market price oracle (design: drafts/price-oracle-design.md).
 *
 * One document per game item, served unchanged by the public feed
 * (GET /api/public/prices/{slug}.json) and by the v2 API
 * (GET /api/v2/game-items/{id}/price-stats). Aggregates only: nothing in it
 * names or identifies a seller, a buyer or a listing.
 */

/** The game item a price document is about. */
export interface PriceOracleItemRef {
  /** Game item UUID */
  id: string
  /** Short slug (`<8 hex>--<name>`), the feed's and the aggregate page's id */
  slug: string
  name: string
  type: string | null
}

/** Current asks: eligible public listings right now. All prices in aUEC per unit. */
export interface PriceOracleCurrent {
  /** Listings counted (after outlier trimming) */
  ask_count: number
  /** Distinct sellers counted (after outlier trimming) */
  seller_count: number
  /** Units available across the counted listings */
  quantity_available: number
  /** Lowest counted ask; null without any counted seller */
  lowest_ask: number | null
  /** Median of the sellers' lowest asks; null below the minimum seller count */
  median_ask: number | null
  /** Highest counted ask; null without any counted seller */
  highest_ask: number | null
  /** Sellers left out as outliers or placeholder prices */
  outliers_excluded: number
  /**
   * Weight the numbers can bear: none (no listings), low (under 3 sellers: no
   * median, show the listings themselves), medium (3-5 sellers), high (6+)
   */
  confidence: "none" | "low" | "medium" | "high"
  /** The sample size in words, to show next to every number */
  sample_note: string
}

/** One day of the 30-day trend (from the daily snapshot). */
export interface PriceOracleDailyPoint {
  /** UTC day, YYYY-MM-DD */
  date: string
  median_ask: number | null
  lowest_ask: number | null
  ask_count: number
  seller_count: number
}

export interface PriceOracleTrend {
  /** Days in the window with a published daily median */
  days_with_data: number
  /** Median of the daily medians; null below the minimum number of days */
  median_30d: number | null
  /** % change, first to last daily median in the window; null below the minimum */
  change_pct: number | null
  /** Daily points, oldest first */
  daily: PriceOracleDailyPoint[]
}

/** Completed SC Market orders of the item in the last 30 days. */
export interface PriceOracleSales {
  /** Completed sales (order lines) in the window */
  count: number
  /** Median per-unit sale price; null below the minimum sale count */
  median_price: number | null
}

export interface PriceOracleRules {
  min_listing_age_hours: number
  placeholder_price_max: number
  min_sellers_for_trim: number
  iqr_multiplier: number
  min_sellers_for_median: number
  min_sellers_for_high_confidence: number
  min_days_for_trend: number
  trend_window_days: number
  min_sales_for_median: number
}

export interface PriceOracleMethodology {
  /** Plain-text description of what is counted and how */
  text: string
  rules: PriceOracleRules
}

export interface PriceOracleLinks {
  /** Human-readable aggregate page */
  page: string
  /** This document as the public JSON feed */
  json: string
  /** Index of every priced item */
  index: string
}

/** Licence of the public data feeds: CC BY 4.0. */
export interface PublicFeedLicense {
  /** SPDX identifier, "CC-BY-4.0" */
  license: string
  /** Licence text */
  url: string
  /** The credit line to show when reusing the data */
  attribution: string
  /** Rights notice: game data, and SC Market's aggregation and price data */
  notice: string
}

/**
 * Envelope shared by every public data feed (prices, items; missions and
 * blueprints later): which dataset, its schema version, the terms and the
 * licence (CC BY 4.0). Free to use; rate limits only protect against abuse.
 */
export interface PublicFeedInfo {
  /** Dataset name, e.g. "prices" */
  dataset: string
  /** Schema version of the dataset; bumped only on a breaking change */
  version: number
  /** Usage terms in words: free, no key, CC BY 4.0 with attribution */
  terms: string
  license: PublicFeedLicense
}

/** Player-listing price document of one game item. */
export interface PriceOracleItem {
  feed: PublicFeedInfo
  item: PriceOracleItemRef
  /** Always "aUEC" (in-game currency, not ISO 4217) */
  currency: "aUEC"
  /** What the unit of every price is, in words */
  unit_note: string
  /** When `current` was computed (ISO 8601) */
  as_of: string
  current: PriceOracleCurrent
  trend_30d: PriceOracleTrend
  sales_30d: PriceOracleSales
  /** Plain-text statement of the current numbers, with sample size and confidence */
  summary: string
  methodology: PriceOracleMethodology
  /** How to credit the data when citing or reusing it */
  attribution: string
  links: PriceOracleLinks
}
