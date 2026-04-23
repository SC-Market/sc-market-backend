/**
 * Cart V2 Type Definitions
 *
 * Type definitions for shopping cart management in the V2 market system.
 * These types support variant-specific cart items with quality tier tracking.
 *
 * Requirements: 29.1-29.12, 30.1-30.12
 */

import { VariantAttributes } from './listings.types.js';

/**
 * Request to add an item to cart with variant selection
 * Requirement 30.2: Accept listing_id, variant_id, and quantity
 */
export interface AddToCartRequest {
  /** UUID of the listing */
  listing_id: string;
  
  /** UUID of the specific variant to add */
  variant_id: string;
  
  /** Quantity to add (must be > 0) */
  quantity: number;
}

/**
 * Response from adding item to cart
 * Requirement 30.10: Return cart_item_id on success
 */
export interface AddToCartResponse {
  /** UUID of the created cart item */
  cart_item_id: string;
  
  /** Success message */
  message: string;
}

/**
 * Request to update a cart item
 * Requirement 31.2: Accept quantity and variant_id updates
 */
export interface UpdateCartItemRequest {
  /** New quantity (optional, must be > 0 if provided) */
  quantity?: number;
  
  /** New variant selection (optional) */
  variant_id?: string;
}

/**
 * Variant details for cart items (separate from listings to avoid TSOA conflicts)
 */
export interface CartVariantDetail {
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
 * Listing information for cart items
 */
export interface CartListingInfo {
  /** Listing UUID */
  listing_id: string;
  
  /** Listing title */
  title: string;
  
  /** Seller username or contractor name */
  seller_name: string;
  
  /** Seller type */
  seller_type: 'user' | 'contractor';

  /** Seller slug (username or spectrum_id) */
  seller_slug: string;

  /** Seller rating (0-5) */
  seller_rating: number;
  
  /** Current listing status */
  status: string;

  /** ISO 8601 timestamp of seller's next available slot, or null if not set / currently available */
  seller_next_available?: string | null;
}

/**
 * Detailed information about a cart item
 * Requirement 29.8: Include availability and price change indicators
 */
export interface CartItemDetail {
  /** UUID of the cart item */
  cart_item_id: string;
  
  /** Listing information */
  listing: CartListingInfo;
  
  /** Variant details with quality attributes */
  variant: CartVariantDetail;
  
  /** Quantity in cart */
  quantity: number;
  
  /** Price per unit at time of add-to-cart (snapshot) */
  price_per_unit: number;
  
  /** Subtotal for this item (quantity * price_per_unit) */
  subtotal: number;
  
  /** Whether this variant is currently available */
  available: boolean;
  
  /** Whether the price has changed since add-to-cart */
  price_changed: boolean;
  
  /** Current price if price_changed is true */
  current_price?: number;
}

/**
 * Response from getting cart contents
 * Requirement 29.1-29.12: Return cart items with variant details and totals
 */
export interface GetCartResponse {
  /** Array of cart items with variant details */
  items: CartItemDetail[];
  
  /** Total price of all items in cart */
  total_price: number;
  
  /** Total number of items in cart */
  item_count: number;
}

/**
 * Request to checkout cart
 * Requirement 32.2: Accept confirmation for price changes
 */
export interface CheckoutCartRequest {
  /** Required if any prices have changed since add-to-cart */
  confirm_price_changes?: boolean;
  /** Optional note from buyer to seller */
  note?: string;
}

/**
 * Unavailable item information for checkout response
 */
export interface UnavailableCartItem {
  /** Cart item UUID */
  cart_item_id: string;
  
  /** Listing title */
  listing_title: string;
  
  /** Variant display name */
  variant_display_name: string;
  
  /** Reason for unavailability */
  reason: string;
}

/**
 * Response from cart checkout
 * Requirement 32.10: Return order_id and purchase summary
 */
export interface CheckoutCartResponse {
  /** Result status */
  result: string;
  /** UUID of the created offer */
  offer_id: string;
  /** UUID of the offer session */
  session_id: string;
  /** Discord invite code (if available) */
  discord_invite: string | null;
  /** Array of items that could not be purchased (optional) */
  unavailable_items?: UnavailableCartItem[];
}

