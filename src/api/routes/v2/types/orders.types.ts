/**
 * Orders V2 Type Definitions
 *
 * Type definitions for order creation and management in the V2 market system.
 * These types support variant-specific ordering with quality tier tracking.
 *
 * Requirements: 25.1-25.12
 */

import { VariantAttributes } from './listings.types.js';

/**
 * Request to create an order with variant-specific items
 * Requirement 25.2: Accept array of items with listing_id, variant_id, and quantity
 */
export interface CreateOrderRequest {
  /** Array of items to purchase */
  items: OrderItemInput[];
}

/**
 * Individual item in an order request
 */
export interface OrderItemInput {
  /** UUID of the listing */
  listing_id: string;
  
  /** UUID of the specific variant to purchase */
  variant_id: string;
  
  /** Quantity to purchase (must be > 0) */
  quantity: number;
}

/**
 * Response from creating an order
 * Requirement 25.10: Return order_id and order details on success
 */
export interface CreateOrderResponse {
  /** UUID of the created order */
  order_id: string;
  
  /** UUID of the buyer */
  buyer_id: string;
  
  /** UUID of the seller */
  seller_id: string;
  
  /** Total price in aUEC (atomic units) */
  total_price: number;
  
  /** Order status */
  status: string;
  
  /** ISO 8601 timestamp of order creation */
  created_at: string;
  
  /** Array of order items with variant details */
  items: OrderItemDetail[];
  
  /** Stock allocation result summary */
  allocation_result?: {
    has_partial_allocations: boolean;
    total_requested: number;
    total_allocated: number;
  };
}

/**
 * Detailed information about an order item
 * Requirement 25.9: Create order_market_items_v2 entries for each item
 */
export interface OrderItemDetail {
  /** UUID of the order item */
  order_item_id: string;
  
  /** UUID of the listing */
  listing_id: string;
  
  /** UUID of the listing item */
  item_id: string;

  /** Listing title */
  listing_title: string;
  
  /** Variant details with quality attributes */
  variant: OrderVariantDetail;
  
  /** Quantity purchased */
  quantity: number;
  
  /** Price per unit at time of purchase (snapshot) */
  price_per_unit: number;
  
  /** Subtotal for this item (quantity * price_per_unit) */
  subtotal: number;
}

/**
 * Variant details for orders (separate from listings to avoid TSOA conflicts)
 */
export interface OrderVariantDetail {
  /** UUID of the variant */
  variant_id: string;
  
  /** Variant attributes (quality_tier, quality_value, crafted_source, etc) */
  attributes: VariantAttributes;
  
  /** Human-readable display name (e.g., "Tier 5 (95.5%) - Crafted") */
  display_name: string;
  
  /** Short name for compact display (e.g., "T5 Crafted") */
  short_name: string;
}

/**
 * Response from getting order details
 * Requirement 26.1-26.12: Return order metadata with buyer/seller info and variant details
 */
export interface GetOrderDetailResponse {
  /** UUID of the order */
  order_id: string;
  
  /** Buyer information */
  buyer: {
    user_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
  };
  
  /** Seller information */
  seller: {
    user_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
  };
  
  /** Total price in aUEC (atomic units) */
  total_price: number;
  
  /** Order status */
  status: string;

  /** Order kind (Delivery, Escort, etc.) */
  kind: string;

  /** Order title */
  title: string;

  /** Order description */
  description: string;

  /** Payment type */
  payment_type: string;

  /** Offer session ID (if created from offer) */
  offer_session_id?: string | null;
  
  /** ISO 8601 timestamp of order creation */
  created_at: string;
  
  /** ISO 8601 timestamp of last update */
  updated_at: string;
  
  /** V1 market listings with V2 variant enrichment */
  market_listings: OrderMarketListingV2[];

  /** V2-only order items (from order_market_items_v2) */
  items: OrderItemDetail[];
}

/** Market listing in an order, enriched with V2 variant data */
export interface OrderMarketListingV2 {
  listing_id: string;
  quantity: number;
  title: string;
  price: number;
  /** V2 variant items for this listing (empty if no V2 data) */
  v2_variants: OrderVariantItem[];
}

export interface OrderVariantItem {
  order_item_id: string;
  variant_id: string;
  quantity: number;
  price_per_unit: number;
  attributes: VariantAttributes;
  display_name: string;
  short_name: string;
}

/**
 * Request parameters for getting orders list
 * Requirement 45.1-45.5: Filter orders by quality tier with pagination
 */
export interface GetOrdersRequest {
  /** Filter by order status */
  status?: 'pending' | 'completed' | 'cancelled';
  
  /** Filter by role (buyer or seller) */
  role?: 'buyer' | 'seller';
  
  /** Minimum quality tier (1-5) */
  quality_tier_min?: number;
  
  /** Maximum quality tier (1-5) */
  quality_tier_max?: number;
  
  /** Page number for pagination (default: 1) */
  page?: number;
  
  /** Number of results per page (default: 20, max: 100) */
  page_size?: number;
  
  /** Sort field (default: created_at) */
  sort_by?: 'created_at' | 'updated_at' | 'total_price';
  
  /** Sort order (default: desc) */
  sort_order?: 'asc' | 'desc';
}

/**
 * Order preview item for list display
 */
export interface OrderPreview {
  /** UUID of the order */
  order_id: string;
  
  /** Order title (from first listing) */
  title: string;
  
  /** Total price in aUEC */
  total_price: number;
  
  /** Order status */
  status: string;
  
  /** ISO 8601 timestamp of order creation */
  created_at: string;
  
  /** ISO 8601 timestamp of last update */
  updated_at: string;
  
  /** Buyer username */
  buyer_username: string;
  
  /** Seller username */
  seller_username: string;
  
  /** Number of items in order */
  item_count: number;
  
  /** Minimum quality tier across all items */
  quality_tier_min?: number;
  
  /** Maximum quality tier across all items */
  quality_tier_max?: number;
  
  /** Buyer avatar URL */
  buyer_avatar?: string | null;
  
  /** Seller avatar URL */
  seller_avatar?: string | null;
}

/**
 * Response from getting orders list
 */
export interface GetOrdersResponse {
  /** Array of order previews */
  orders: OrderPreview[];
  
  /** Total number of orders matching filters */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Number of results per page */
  page_size: number;
}


/** Order summary for a specific listing */
export interface ListingOrderSummary {
  order_id: string;
  status: string;
  created_at: string;
  buyer_name: string;
  quantity: number;
  price_per_unit: number;
}

/** Offer summary for a specific listing */
export interface ListingOfferSummary {
  session_id: string;
  status: string;
  created_at: string;
  buyer_name: string;
  quantity: number;
  price_per_unit: number;
}

/** Response for orders/offers by listing */
export interface OrdersByListingResponse {
  orders: ListingOrderSummary[];
  offers: ListingOfferSummary[];
}
