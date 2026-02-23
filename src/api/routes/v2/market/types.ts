/**
 * TypeScript interfaces for v2 Market API
 *
 * These types define the request and response structures for market endpoints.
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
 * Query parameters for filtering listings
 */
export interface ListingFilters {
  /** Search query string */
  search?: string
  /** Filter by game item ID */
  game_item_id?: string
  /** Filter by item type */
  item_type?: string
  /** Filter by sale type */
  sale_type?: string
  /** Filter by status */
  status?: string
  /** Minimum price */
  min_price?: number
  /** Maximum price */
  max_price?: number
  /** Filter by seller user ID */
  user_seller_id?: string
  /** Filter by contractor seller ID */
  contractor_seller_id?: string
  /** Results limit */
  limit?: number
  /** Results offset for pagination */
  offset?: number
  /** Sort field */
  sort?: string
  /** Reverse sort order */
  reverse_sort?: boolean
}

/**
 * Minimal user information
 */
export interface MinimalUser {
  user_id: string
  username: string
  avatar?: string | null
}

/**
 * Minimal contractor information
 */
export interface MinimalContractor {
  contractor_id: string
  spectrum_id: string
  name: string
  avatar?: string | null
}

/**
 * Listing response structure
 */
export interface ListingResponse {
  /** Unique listing ID */
  listing_id: string
  /** Listing title */
  title: string
  /** Listing description */
  description: string
  /** Price in aUEC */
  price: number
  /** Available quantity */
  quantity_available: number
  /** Listing status */
  status: string
  /** Sale type */
  sale_type: string
  /** Item type */
  item_type: string
  /** Game item ID */
  game_item_id: string | null
  /** Seller user (if user listing) */
  user_seller: MinimalUser | null
  /** Seller contractor (if contractor listing) */
  contractor_seller: MinimalContractor | null
  /** Creation timestamp */
  timestamp: string
  /** Expiration timestamp */
  expiration: string
  /** Photo URLs */
  photos: string[]
  /** Whether listing is internal */
  internal: boolean
}

/**
 * Paginated listings response
 */
export interface PaginatedListingsResponse {
  /** Array of listings */
  listings: ListingResponse[]
  /** Total count of listings matching filters */
  total: number
  /** Current limit */
  limit: number
  /** Current offset */
  offset: number
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
