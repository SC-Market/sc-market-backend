/**
 * TypeScript interfaces for v2 Market API
 *
 * These types match the v1 API response formats to maintain compatibility.
 * TSOA will use these to generate OpenAPI schemas and validate requests.
 */

import { ErrorCode } from "../../v1/util/error-codes.js"

/**
 * Request body for creating a new listing
 */
export interface CreateListingRequest {
  /** Listing title */
  title: string
  /** Listing description */
  description: string
  /** Price in aUEC */
  price: number
  /** Available quantity */
  quantity: number
  /** Game item ID (optional) */
  game_item_id?: string | null
  /** Item type (e.g., "ship", "component", "commodity") */
  item_type: string
  /** Sale type (e.g., "sale", "auction") */
  sale_type?: string
  /** Photo URLs */
  photos?: string[]
  /** Contractor spectrum ID (for contractor listings) */
  spectrum_id?: string
  /** Whether listing is internal to contractor */
  internal?: boolean
}

/**
 * Request body for updating an existing listing
 */
export interface UpdateListingRequest {
  /** Updated title */
  title?: string
  /** Updated description */
  description?: string
  /** Updated price */
  price?: number
  /** Updated quantity */
  quantity_available?: number
  /** Updated status */
  status?: string
  /** Updated item type */
  item_type?: string
  /** Updated game item name */
  item_name?: string | null
  /** Updated photos */
  photos?: string[]
  /** Updated internal flag */
  internal?: boolean
}

/**
 * Search result listing (flat format from materialized view)
 * Matches v1 /api/market search response format
 */
export interface ListingSearchResult {
  listing_id: string
  listing_type: string
  item_type: string
  item_name: string | null
  game_item_id: string | null
  sale_type: string
  price: number
  expiration: string | null
  minimum_price: number
  maximum_price: number
  quantity_available: number
  timestamp: string
  total_rating: number
  avg_rating: number
  details_id: string | null
  status: "active" | "inactive" | "archived"
  user_seller: string | null
  contractor_seller: string | null
  auction_end_time: string | null
  rating_count: number | null
  rating_streak: number | null
  total_orders: number | null
  total_assignments: number | null
  response_rate: number | null
  title: string
  photo: string
  internal: boolean
  badges: any | null
}

/**
 * Paginated search results response
 * Matches v1 /api/market response format
 */
export interface ListingSearchResponse {
  total: number
  listings: ListingSearchResult[]
}

/**
 * Detailed listing response (nested format)
 * Matches v1 /api/market/:id response format
 * This is the exact return type from formatListing()
 */
export interface ListingDetailResponse {
  type: "unique" | "aggregate" | "multiple"
  listing: {
    listing_id: string
    sale_type: string
    price: number
    quantity_available: number
    status: string
    timestamp: Date
    expiration: Date
  }
  details: {
    title: string
    description: string
    item_type: string
    game_item_id: string | null
  }
  photos: string[]
  stats: {
    order_count?: number
    offer_count?: number
    view_count: number | string
  }
  accept_offers?: boolean
  auction_details?: any
  buy_orders?: any[]
  listings?: any[]
}

/**
 * Standard error response matching v1 format
 */
export interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, any>
    validationErrors?: ValidationError[]
  }
}

/**
 * Validation error detail
 */
export interface ValidationError {
  field: string
  message: string
  code?: string
}

/**
 * Validation error response
 */
export interface ValidationErrorResponse {
  error: {
    code: ErrorCode.VALIDATION_ERROR
    message: string
    validationErrors: ValidationError[]
  }
}
