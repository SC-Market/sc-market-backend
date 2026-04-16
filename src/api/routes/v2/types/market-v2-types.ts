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
