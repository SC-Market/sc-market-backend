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
  sort_by?: "price" | "quality" | "quantity" | "seller_rating"

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

  /** Number of unique sellers offering this tier */
  seller_count: number

  /** Number of listings offering this tier */
  listing_count: number
}

/**
 * Listing result for game item listings endpoint
 */
export interface GameItemListingResult {
  /** Listing UUID */
  listing_id: string

  /** Listing title */
  title: string

  /** Seller ID */
  seller_id: string

  /** Seller name */
  seller_name: string

  /** Seller rating (0-5) */
  seller_rating: number

  /** Seller type */
  seller_type: "user" | "contractor"

  /** Username (for user sellers) or spectrum_id (for contractor sellers) */
  seller_slug: string

  /** Minimum price across all variants in this listing */
  price_min: number

  /** Maximum price across all variants in this listing */
  price_max: number

  /** Total quantity available in this listing */
  quantity_available: number

  /** Minimum quality tier in this listing */
  quality_tier_min?: number

  /** Maximum quality tier in this listing */
  quality_tier_max?: number

  /** Number of variants in this listing */
  variant_count: number

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

  /** Individual listings for this game item */
  listings: GameItemListingResult[]

  /** Total number of listings (for pagination) */
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
  seller_count: number
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
