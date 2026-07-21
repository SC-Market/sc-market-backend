/**
 * TypeScript interfaces for Market V2 Game Items API
 *
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 *
 * Requirements: 38.1-38.12
 */

// ============================================================================
// Game Item Listings Types
// ============================================================================

/**
 * Query parameters for game item listings endpoint
 */
export interface GetGameItemListingsRequest {
  /** Game item UUID (required, from path parameter) */
  id: string

  /** Optional quality tier filter (1-5) */
  quality_tier?: number

  /** Sort field (default: price) */
  sort_by?: "price" | "quality" | "quantity" | "shop_rating"

  /** Sort order (default: asc) */
  sort_order?: "asc" | "desc"

  /** Page number for pagination (default: 1) */
  page?: number

  /** Number of results per page (default: 20, max: 100) */
  page_size?: number
}

/**
 * Quality tier distribution data for a game item
 */
export interface GameItemQualityDistribution {
  /** Quality tier (1-5) */
  quality_tier: number

  /** Total quantity available for this tier across all listings */
  quantity_available: number

  /** Minimum price for this tier */
  price_min: number

  /** Maximum price for this tier */
  price_max: number

  /** Average price for this tier */
  price_avg: number

  /** Number of unique shops offering this tier */
  shop_count: number

  /** Number of listings offering this tier */
  listing_count: number
}

/**
 * Per-variant listing result for game item listings endpoint.
 *
 * Each row represents a single (listing × quality variant) — a cart-ready
 * comparable. A listing that offers multiple quality tiers produces one row
 * per variant.
 */
export interface GameItemListingResult {
  /** Listing UUID */
  listing_id: string

  /** Variant UUID (the item_variants.variant_id for this row) */
  variant_id: string

  /** Listing title */
  title: string

  /** Shop ID */
  shop_id: string

  /** Shop name */
  shop_name: string

  /** Shop rating (0-5) */
  shop_rating: number

  /** Shop slug — use for profile links: /shops/:slug */
  shop_slug: string

  /** Price for this variant */
  price: number

  /** Quantity available for this variant (summed across its lots) */
  quantity_available: number

  /** Quality tier for this variant (1-5), if defined */
  quality_tier?: number

  /** Numeric quality value for this variant, if defined */
  quality_value?: number

  /** Variant display name (from item_variants.display_name) */
  variant_display_name?: string

  /** Variant short name (from item_variants.short_name) */
  variant_short_name?: string

  /** Listing created timestamp */
  created_at: string
}

/**
 * Game item metadata
 */
export interface GameItemMetadata {
  /** Game item UUID */
  id: string

  /** Game item name */
  name: string

  /** Game item type */
  type: string

  /** Game item image URL */
  image_url?: string
}

/**
 * Response for game item listings endpoint
 */
export interface GetGameItemListingsResponse {
  /** Game item metadata */
  game_item: GameItemMetadata

  /** Quality distribution across all listings */
  quality_distribution: GameItemQualityDistribution[]

  /** Per-variant listing rows for this game item (one row per listing × variant) */
  listings: GameItemListingResult[]

  /** Total number of variant rows (for pagination) */
  total: number

  /** Current page number */
  page: number

  /** Page size */
  page_size: number
}

// ============================================================================
// Game Item Aggregate Search Types (for Bulk Items page)
// ============================================================================

/**
 * A single game item aggregate — one row per game item with totals across all sellers
 */
export interface GameItemAggregate {
  /** Game item UUID */
  game_item_id: string
  /** Game item name */
  name: string
  /** Game item type/category */
  type: string
  /** Game item image URL */
  image_url?: string
  /** Minimum price across all listings for this item */
  min_price: number
  /** Maximum price across all listings for this item */
  max_price: number
  /** Total quantity available across all sellers */
  total_quantity: number
  /** Number of active listings */
  listing_count: number
  /** Number of unique sellers */
  shop_count: number
  /** Minimum quality tier available */
  quality_tier_min?: number
  /** Maximum quality tier available */
  quality_tier_max?: number
}

/**
 * Response for game item aggregate search
 */
export interface SearchGameItemAggregatesResponse {
  /** Array of game item aggregates */
  items: GameItemAggregate[]
  /** Total number of game items with active listings */
  total: number
  /** Current page */
  page: number
  /** Page size */
  page_size: number
}
