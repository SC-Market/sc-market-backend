/**
 * Buy Orders V2 Type Definitions
 *
 * Type definitions for direct purchase (buy now) functionality in the V2 market system.
 * These types support variant-specific direct purchases bypassing the cart.
 *
 * Task: 4.7 Implement BuyOrdersV2Controller
 */

import { VariantAttributes } from './listings.types.js';

/**
 * Request to create a direct purchase order
 * Bypasses cart and creates order immediately from listing with variant selection
 */
export interface CreateBuyOrderRequest {
  /** UUID of the listing to purchase from */
  listing_id: string;
  
  /** UUID of the specific variant to purchase */
  variant_id: string;
  
  /** Quantity to purchase (must be > 0) */
  quantity: number;
}

/**
 * Variant details for buy order response
 */
export interface BuyOrderVariantDetail {
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
 * Purchase item detail in buy order response
 */
export interface BuyOrderItemDetail {
  /** UUID of the order item */
  order_item_id: string;
  
  /** UUID of the listing */
  listing_id: string;
  
  /** UUID of the listing item */
  item_id: string;
  
  /** Variant details with quality attributes */
  variant: BuyOrderVariantDetail;
  
  /** Quantity purchased */
  quantity: number;
  
  /** Price per unit at time of purchase (snapshot) */
  price_per_unit: number;
  
  /** Subtotal for this item (quantity * price_per_unit) */
  subtotal: number;
}

/**
 * Response from creating a direct purchase order
 */
export interface CreateBuyOrderResponse {
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
  
  /** Purchase item details */
  item: BuyOrderItemDetail;
  
  /** Stock allocation result summary */
  allocation_result?: {
    has_partial_allocations: boolean;
    total_requested: number;
    total_allocated: number;
  };
}
