/**
 * Market Listings Models for TSOA Controllers
 *
 * These type definitions are used by TSOA controllers to define
 * request/response schemas for market listing endpoints in the OpenAPI spec.
 * They match the legacy response format for backward compatibility.
 */

import { ApiResponse } from "./common.models.js"

/**
 * Market listing entity
 * Represents a single market listing (unique, aggregate, or multiple)
 *
 * @example
 * {
 *   "listing_id": "550e8400-e29b-41d4-a716-446655440000",
 *   "listing_type": "unique",
 *   "sale_type": "sale",
 *   "status": "active",
 *   "title": "Aegis Avenger Titan",
 *   "description": "Great starter ship",
 *   "item_type": "ship",
 *   "item_name": "Aegis Avenger Titan",
 *   "price": 50.00,
 *   "quantity_available": 1,
 *   "photos": ["https://cdn.sc-market.space/..."],
 *   "user_seller_id": "user123",
 *   "contractor_seller_id": null,
 *   "internal": false,
 *   "created_at": "2024-01-01T00:00:00.000Z",
 *   "updated_at": "2024-01-01T00:00:00.000Z"
 * }
 */
export interface MarketListing {
  /** Unique identifier for the listing */
  listing_id: string
  /** Type of listing */
  listing_type: "unique" | "aggregate" | "multiple"
  /** Sale type */
  sale_type: "sale" | "auction"
  /** Current status */
  status: "active" | "sold" | "archived" | "expired"
  /** Listing title */
  title: string
  /** Listing description */
  description: string | null
  /** Type of item being sold */
  item_type: string
  /** Name of the item */
  item_name: string
  /** Price in USD */
  price: number
  /** Available quantity */
  quantity_available: number
  /** Array of photo URLs */
  photos: string[]
  /** User seller ID (if sold by user) */
  user_seller_id: string | null
  /** Contractor seller ID (if sold by contractor) */
  contractor_seller_id: string | null
  /** Whether listing is internal to contractor */
  internal: boolean
  /** ISO 8601 timestamp when created */
  created_at: string
  /** ISO 8601 timestamp when last updated */
  updated_at: string
  /** Expiration timestamp for auction listings */
  expires_at?: string | null
  /** Minimum bid increment for auction listings */
  minimum_bid_increment?: number | null
  /** Current highest bid for auction listings */
  current_bid?: number | null
}

/**
 * Payload for creating a new market listing
 *
 * @example
 * {
 *   "listing_type": "unique",
 *   "sale_type": "sale",
 *   "title": "Aegis Avenger Titan",
 *   "description": "Great starter ship",
 *   "item_type": "ship",
 *   "item_name": "Aegis Avenger Titan",
 *   "price": 50.00,
 *   "quantity_available": 1,
 *   "photos": ["https://cdn.sc-market.space/..."],
 *   "internal": false
 * }
 */
export interface CreateMarketListingPayload {
  /** Type of listing */
  listing_type: "unique" | "aggregate" | "multiple"
  /** Sale type */
  sale_type: "sale" | "auction"
  /** Listing title */
  title: string
  /** Listing description */
  description?: string | null
  /** Type of item being sold */
  item_type: string
  /** Name of the item */
  item_name: string
  /** Price in USD */
  price: number
  /** Available quantity */
  quantity_available: number
  /** Array of photo URLs */
  photos?: string[]
  /** Whether listing is internal to contractor */
  internal?: boolean
  /** Contractor ID (if creating for contractor) */
  contractor_seller_id?: string | null
  /** Auction expiration (for auction listings) */
  expires_at?: string | null
  /** Minimum bid increment (for auction listings) */
  minimum_bid_increment?: number | null
}

/**
 * Payload for updating a market listing
 * All fields are optional
 *
 * @example
 * {
 *   "title": "Updated Title",
 *   "price": 55.00,
 *   "quantity_available": 2
 * }
 */
export interface UpdateMarketListingPayload {
  /** Updated status */
  status?: "active" | "sold" | "archived" | "expired"
  /** Updated title */
  title?: string
  /** Updated description */
  description?: string | null
  /** Updated item type */
  item_type?: string
  /** Updated item name */
  item_name?: string
  /** Updated price */
  price?: number
  /** Updated quantity */
  quantity_available?: number
  /** Updated photos */
  photos?: string[]
  /** Updated minimum bid increment */
  minimum_bid_increment?: number | null
  /** Updated internal flag */
  internal?: boolean
}

/**
 * Response containing multiple market listings
 *
 * @example
 * {
 *   "data": {
 *     "listings": [...],
 *     "total": 100,
 *     "page": 1,
 *     "limit": 20
 *   }
 * }
 */
export interface MarketListingsResponse
  extends ApiResponse<{
    listings: MarketListing[]
    total: number
    page: number
    limit: number
  }> {}

/**
 * Response containing a single market listing
 *
 * @example
 * {
 *   "data": {
 *     "listing": {...}
 *   }
 * }
 */
export interface MarketListingResponse
  extends ApiResponse<{
    listing: MarketListing
  }> {}

/**
 * Listing statistics
 *
 * @example
 * {
 *   "listing_id": "550e8400-e29b-41d4-a716-446655440000",
 *   "views": 150,
 *   "orders": 5,
 *   "revenue": 250.00
 * }
 */
export interface ListingStats {
  /** Listing ID */
  listing_id: string
  /** Total views */
  views: number
  /** Total orders */
  orders: number
  /** Total revenue */
  revenue: number
}

/**
 * Response containing listing statistics
 *
 * @example
 * {
 *   "data": {
 *     "stats": [...]
 *   }
 * }
 */
export interface ListingStatsResponse
  extends ApiResponse<{
    stats: ListingStats[]
  }> {}

/**
 * Payload for updating listing quantity
 *
 * @example
 * {
 *   "quantity_available": 5
 * }
 */
export interface UpdateQuantityPayload {
  /** New quantity available */
  quantity_available: number
}

/**
 * Response for quantity update
 *
 * @example
 * {
 *   "data": {
 *     "listing_id": "550e8400-e29b-41d4-a716-446655440000",
 *     "quantity_available": 5
 *   }
 * }
 */
export interface UpdateQuantityResponse
  extends ApiResponse<{
    listing_id: string
    quantity_available: number
  }> {}

/**
 * Response for listing refresh
 *
 * @example
 * {
 *   "data": {
 *     "listing_id": "550e8400-e29b-41d4-a716-446655440000",
 *     "expires_at": "2024-12-31T23:59:59.000Z"
 *   }
 * }
 */
export interface RefreshListingResponse
  extends ApiResponse<{
    listing_id: string
    expires_at: string
  }> {}

/**
 * Payload for placing a bid on an auction
 *
 * @example
 * {
 *   "bid_amount": 100.00
 * }
 */
export interface PlaceBidPayload {
  /** Bid amount in USD */
  bid_amount: number
}

/**
 * Bid entity
 *
 * @example
 * {
 *   "bid_id": "550e8400-e29b-41d4-a716-446655440000",
 *   "listing_id": "550e8400-e29b-41d4-a716-446655440000",
 *   "user_id": "user123",
 *   "bid_amount": 100.00,
 *   "created_at": "2024-01-01T00:00:00.000Z"
 * }
 */
export interface Bid {
  /** Unique identifier for the bid */
  bid_id: string
  /** Listing ID */
  listing_id: string
  /** User ID who placed the bid */
  user_id: string
  /** Bid amount in USD */
  bid_amount: number
  /** ISO 8601 timestamp when created */
  created_at: string
}

/**
 * Response for placing a bid
 *
 * @example
 * {
 *   "data": {
 *     "bid": {...}
 *   }
 * }
 */
export interface PlaceBidResponse
  extends ApiResponse<{
    bid: Bid
  }> {}

/**
 * Response for tracking a view
 *
 * @example
 * {
 *   "data": {
 *     "success": true
 *   }
 * }
 */
export interface TrackViewResponse
  extends ApiResponse<{
    success: boolean
  }> {}

/**
 * Photo upload response
 *
 * @example
 * {
 *   "data": {
 *     "photos": ["https://cdn.sc-market.space/..."]
 *   }
 * }
 */
export interface UploadPhotosResponse
  extends ApiResponse<{
    photos: string[]
  }> {}
