/**
 * Market V2 Domain Types
 * 
 * TypeScript types for the Market V2 system matching the database schema.
 * These types are used by TSOA controllers for type-safe API generation.
 */

// ============================================================================
// Core Domain Types
// ============================================================================

/**
 * Unified listing table (replaces V1's 3-table structure)
 */
export interface Listing {
  listing_id: string;
  seller_id: string;
  seller_type: 'user' | 'contractor';
  
  // Listing metadata
  title: string;
  description: string;
  status: 'active' | 'sold' | 'expired' | 'cancelled';
  visibility: 'public' | 'private' | 'unlisted';
  
  // Sale configuration
  sale_type: 'fixed' | 'auction' | 'negotiable';
  
  // Listing type (replaces separate tables)
  listing_type: 'single' | 'bundle' | 'bulk';
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
}

/**
 * Items being sold in listings
 */
export interface ListingItem {
  item_id: string;
  listing_id: string;
  game_item_id: string;
  
  // Pricing strategy
  pricing_mode: 'unified' | 'per_variant';
  base_price?: number;
  
  // Display order (for bundles)
  display_order: number;
  
  // Denormalized for search (updated by trigger)
  quantity_available: number;
  variant_count: number;
}

/**
 * Unique combinations of variant attributes for game items
 */
export interface ItemVariant {
  variant_id: string;
  game_item_id: string;
  
  // Variant attributes (flexible JSONB)
  attributes: Record<string, any>;
  
  // Computed hash for uniqueness
  attributes_hash: string;
  
  // Display names (auto-generated)
  display_name: string;
  short_name: string;
  
  // Pricing modifiers (optional)
  base_price_modifier?: number;
  fixed_price_override?: number;
  
  created_at: Date;
}

/**
 * Physical inventory units with specific variant attributes
 */
export interface StockLot {
  lot_id: string;
  item_id: string;
  variant_id: string;
  
  // Quantity
  quantity_total: number;
  
  // Location & ownership
  location_id?: string;
  owner_id?: string;
  
  // Status
  listed: boolean;
  notes?: string;
  
  // Crafting metadata (if applicable)
  crafted_by?: string;
  crafted_at?: Date;
  
  created_at: Date;
  updated_at: Date;
}

/**
 * Per-variant pricing when pricing_mode = per_variant
 */
export interface VariantPricing {
  pricing_id: string;
  item_id: string;
  variant_id: string;
  price: number;
  
  created_at: Date;
  updated_at: Date;
}

/**
 * Define available variant attributes and validation rules
 */
export interface VariantType {
  variant_type_id: string;
  name: string;
  display_name: string;
  description?: string;
  
  // Behavior
  affects_pricing: boolean;
  searchable: boolean;
  filterable: boolean;
  
  // Validation
  value_type: 'integer' | 'decimal' | 'string' | 'enum';
  min_value?: number;
  max_value?: number;
  allowed_values?: string[];
  
  // Display
  display_order: number;
  icon?: string;
  
  created_at: Date;
}

// ============================================================================
// API Request Types
// ============================================================================

/**
 * Search listings with filters
 */
export interface SearchListingsRequest {
  text?: string;
  game_item_id?: string;
  quality_tier_min?: number;
  quality_tier_max?: number;
  quality_value_min?: number;
  crafted_only?: boolean;
  price_min?: number;
  price_max?: number;
  page: number;
  page_size: number;
}

/**
 * Create new listing with variants
 */
export interface CreateListingRequest {
  title: string;
  description: string;
  game_item_id: string;
  pricing_mode: 'unified' | 'per_variant';
  base_price?: number;
  lots: Array<{
    quantity: number;
    variant_attributes: VariantAttributes;
    location_id?: string;
    price?: number;
  }>;
}

/**
 * Update listing
 */
export interface UpdateListingRequest {
  title?: string;
  description?: string;
  status?: 'active' | 'sold' | 'expired' | 'cancelled';
  base_price?: number;
  variant_prices?: Array<{
    variant_id: string;
    price: number;
  }>;
}

/**
 * Get my listings request
 */
export interface GetMyListingsRequest {
  status?: 'active' | 'sold' | 'expired' | 'cancelled';
  page: number;
  page_size: number;
  sort_by?: 'created_at' | 'updated_at' | 'price' | 'quantity';
  sort_order?: 'asc' | 'desc';
}

/**
 * Get stock lots request
 */
export interface GetStockLotsRequest {
  listing_id?: string;
  game_item_id?: string;
  location_id?: string;
  quality_tier_min?: number;
  quality_tier_max?: number;
  page: number;
  page_size: number;
}

/**
 * Update stock lot request
 */
export interface UpdateStockLotRequest {
  quantity_total?: number;
  listed?: boolean;
  location_id?: string;
  notes?: string;
}

/**
 * Bulk stock update request
 */
export interface BulkStockUpdateRequest {
  stock_lot_ids: string[];
  operation: 'update_quantity' | 'list' | 'unlist' | 'transfer_location';
  quantity_delta?: number;
  listed?: boolean;
  location_id?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Search results with pagination
 */
export interface SearchListingsResponse {
  listings: Array<{
    listing_id: string;
    title: string;
    seller_name: string;
    seller_rating: number;
    price_min: number;
    price_max: number;
    quantity_available: number;
    quality_tier_min: number;
    quality_tier_max: number;
    variant_count: number;
    created_at: Date;
  }>;
  total: number;
  page: number;
  page_size: number;
}

/**
 * Listing detail with variant breakdown
 */
export interface ListingDetailResponse {
  listing: Listing;
  seller: {
    id: string;
    name: string;
    type: 'user' | 'contractor';
    rating: number;
  };
  items: Array<{
    item_id: string;
    game_item: {
      game_item_id: string;
      name: string;
      type: string;
      icon_url?: string;
    };
    pricing_mode: 'unified' | 'per_variant';
    base_price?: number;
    variants: Array<{
      variant_id: string;
      attributes: Record<string, any>;
      display_name: string;
      short_name: string;
      quantity: number;
      price: number;
      locations?: string[];
    }>;
  }>;
}

/**
 * My listings response with pagination
 */
export interface MyListingsResponse {
  listings: Array<{
    listing_id: string;
    title: string;
    status: string;
    created_at: Date;
    variant_count: number;
    total_quantity: number;
    price_min: number;
    price_max: number;
    quality_tier_min: number;
    quality_tier_max: number;
  }>;
  total: number;
  page: number;
  page_size: number;
}

/**
 * Stock lot detail response
 */
export interface StockLotDetail {
  lot_id: string;
  item_id: string;
  listing: {
    listing_id: string;
    title: string;
  };
  game_item: {
    game_item_id: string;
    name: string;
    type: string;
  };
  variant: {
    variant_id: string;
    display_name: string;
    short_name: string;
    attributes: Record<string, any>;
    quality_tier: number;
  };
  quantity_total: number;
  location_id?: string;
  listed: boolean;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Stock lots response with pagination
 */
export interface StockLotsResponse {
  stock_lots: StockLotDetail[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Bulk stock update response
 */
export interface BulkStockUpdateResponse {
  successful: number;
  failed: number;
  errors: Array<{
    lot_id: string;
    error: string;
  }>;
}

/**
 * Variant types list response
 */
export interface VariantTypesResponse {
  variant_types: VariantType[];
}

/**
 * Single variant type response
 */
export interface VariantTypeResponse {
  variant_type: VariantType;
}

// ============================================================================
// Error Response Types
// ============================================================================

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: Date;
    request_id?: string;
    validationErrors?: Array<{
      field: string;
      message: string;
    }>;
  };
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Variant attributes structure
 */
export interface VariantAttributes {
  quality_tier?: number;
  quality_value?: number;
  crafted_source?: 'crafted' | 'store' | 'looted' | 'unknown';
  blueprint_tier?: number;
  [key: string]: any;
}

/**
 * Seller information
 */
export interface SellerInfo {
  id: string;
  name: string;
  type: 'user' | 'contractor';
  rating: number;
}

/**
 * Game item information
 */
export interface GameItemInfo {
  game_item_id: string;
  name: string;
  type: string;
  icon_url?: string;
}

// ============================================================================
// Cart Types
// ============================================================================

/**
 * Cart item in database
 */
export interface CartItemV2 {
  cart_item_id: string;
  user_id: string;
  seller_id: string;              // NEW: For multi-seller support
  listing_id: string;
  item_id: string;
  variant_id: string;
  quantity: number;
  price_per_unit: number;
  price_updated_at: Date;
  buyer_note?: string;             // NEW: Per-seller notes
  created_at: Date;
  updated_at: Date;
}

/**
 * Cart seller grouping (for multi-seller carts)
 */
export interface CartSellerV2 {
  seller_id: string;
  seller_name: string;
  seller_type: 'user' | 'contractor';
  buyer_note?: string;
  items: Array<{
    cart_item_id: string;
    listing: {
      listing_id: string;
      title: string;
    };
    game_item: {
      game_item_id: string;
      name: string;
      type: string;
    };
    variant: {
      variant_id: string;
      display_name: string;
      attributes: Record<string, any>;
      quality_tier: number;
    };
    quantity: number;
    price_per_unit: number;
    current_price: number;
    is_price_stale: boolean;
    is_available: boolean;
  }>;
  subtotal: number;
  stale_items_count: number;
  unavailable_items_count: number;
  availability_required?: boolean;
  availability_set?: boolean;
  order_limits?: {
    min_order_size?: string;
    max_order_size?: string;
    min_order_value?: string;
    max_order_value?: string;
  };
}

/**
 * Cart detail response with variant information and seller grouping
 */
export interface CartDetailV2 {
  sellers: CartSellerV2[];         // NEW: Grouped by seller
  total_price: number;
  stale_items_count: number;
  unavailable_items_count: number;
}

/**
 * Add to cart request
 */
export interface AddToCartRequest {
  listing_id: string;
  variant_id: string;
  quantity: number;
}

/**
 * Update cart item request
 */
export interface UpdateCartItemRequest {
  quantity: number;
}

/**
 * Update cart notes request
 */
export interface UpdateCartNotesRequest {
  seller_id: string;
  buyer_note: string;
}

/**
 * Checkout cart request
 */
export interface CheckoutCartRequest {
  seller_id: string;               // NEW: Checkout specific seller
  accept_price_changes?: boolean;
  offer_amount?: number;           // NEW: Custom offer amount
  buyer_note?: string;             // NEW: Buyer's notes for seller
}

/**
 * Checkout cart response
 */
export interface CheckoutCartResponse {
  offer_id: string;                // NEW: Offer ID (not order_id - offers must be accepted first)
  session_id: string;              // NEW: For navigation to offer page
  discord_invite?: string;         // NEW: Discord invite code
  items_removed: string[];
  price_changes: Array<{
    cart_item_id: string;
    old_price: number;
    new_price: number;
    percentage_change: number;
  }>;
}

// ============================================================================
// Order Types
// ============================================================================

/**
 * Order item in database
 */
export interface OrderItemV2 {
  order_item_id: string;
  order_id: string;
  listing_id: string;
  item_id: string;
  variant_id: string;
  quantity: number;
  price_per_unit: number;
  fulfillment_status: 'pending' | 'fulfilled' | 'cancelled';
  created_at: Date;
}

/**
 * Order detail with variant information
 */
export interface OrderDetailV2 {
  order: {
    order_id: string;
    buyer_id: string;
    seller_id: string;
    status: string;
    total_price: number;
    created_at: Date;
  };
  buyer: {
    id: string;
    name: string;
    type: 'user' | 'contractor';
    rating: number;
  };
  seller: {
    id: string;
    name: string;
    type: 'user' | 'contractor';
    rating: number;
  };
  items: Array<{
    order_item_id: string;
    game_item: {
      game_item_id: string;
      name: string;
      type: string;
    };
    variant: {
      variant_id: string;
      display_name: string;
      attributes: Record<string, any>;
      quality_tier: number;
    };
    quantity: number;
    price_per_unit: number;
    fulfillment_status: string;
  }>;
}

/**
 * Create order request
 */
export interface CreateOrderRequest {
  items: Array<{
    listing_id: string;
    variant_id: string;
    quantity: number;
  }>;
}

/**
 * Get orders request
 */
export interface GetOrdersRequest {
  role?: 'buyer' | 'seller';
  status?: string;
  quality_tier?: number;
  date_from?: Date;
  date_to?: Date;
  page: number;
  page_size: number;
  sort_by?: 'created_at' | 'total_price' | 'quality_tier';
  sort_order?: 'asc' | 'desc';
}
