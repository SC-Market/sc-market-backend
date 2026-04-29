/**
 * TypeScript interfaces for Market V2 Listings API
 * 
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 * 
 * Requirements: 9.7, 9.8
 */

// ============================================================================
// Variant Attributes
// ============================================================================

/**
 * Flexible JSONB attributes for item variants
 * Supports quality tiers, crafting source, and future extensibility
 */
export interface VariantAttributes {
  /** Quality tier from 1 (lowest) to 5 (highest) */
  quality_tier?: number;
  
  /** Precise quality value from 0 to 1000 */
  quality_value?: number;
  
  /** How the item was obtained */
  crafted_source?: 'crafted' | 'store' | 'looted' | 'unknown' | 'duped';
  
  /** Blueprint quality tier for craftable items (1-5) */
  blueprint_tier?: number;
}

// ============================================================================
// Bulk Discount Tiers
// ============================================================================

/**
 * A single bulk discount tier: buy at least min_quantity to get discount_percent off
 */
export interface BulkDiscountTier {
  /** Minimum quantity to qualify for this discount */
  min_quantity: number;
  /** Discount percentage (0-100) */
  discount_percent: number;
}

// ============================================================================
// Create Listing Request Types
// ============================================================================

/**
 * Input for creating a stock lot with variant attributes
 */
export interface StockLotInput {
  /** Quantity of items in this lot (must be > 0) */
  quantity: number;
  
  /** Variant attributes for this lot */
  variant_attributes: VariantAttributes;
  
  /** Optional location ID where items are stored */
  location_id?: string;
  
  /** Price for this variant (required if pricing_mode is 'per_variant') */
  price?: number;
}

/**
 * Request body for creating a new listing
 */
export interface CreateListingRequest {
  /** Listing title (max 500 chars) */
  title: string;
  
  /** Listing description (markdown supported) */
  description: string;
  
  /** Game item UUID being sold */
  game_item_id: string;
  
  /** Pricing strategy: unified price for all variants or per-variant pricing */
  pricing_mode: 'unified' | 'per_variant';
  
  /** Base price for all variants (required if pricing_mode is 'unified') */
  base_price?: number;
  
  /** Array of stock lots with variant attributes */
  lots: StockLotInput[];

  /** Optional array of image resource UUIDs to attach as photos */
  photo_resource_ids?: string[];

  /** Pickup method: how the buyer receives the item */
  pickup_method?: 'delivery' | 'pickup' | 'any';

  /** Quantity unit: 'unit' for discrete items, 'scu' for cargo measured in cSCU */
  quantity_unit?: 'unit' | 'scu';

  /** Minimum quantity per order for this listing */
  min_order_quantity?: number;
  /** Maximum quantity per order for this listing */
  max_order_quantity?: number;
  /** Minimum order value (aUEC) for this listing */
  min_order_value?: number;
  /** Maximum order value (aUEC) for this listing */
  max_order_value?: number;

  /** Optional bulk discount tiers sorted by min_quantity ascending */
  bulk_discount_tiers?: BulkDiscountTier[];

  /** Optional contractor spectrum_id — if provided, listing is created on behalf of the org */
  contractor_spectrum_id?: string;

  /** Sale type: fixed price, auction, or negotiable */
  sale_type?: 'fixed' | 'auction' | 'negotiable';

  /** Auction details — required when sale_type is 'auction' */
  auction_details?: {
    /** When the auction ends (ISO 8601) */
    end_time: string;
    /** Minimum bid increment in aUEC */
    min_bid_increment: number;
    /** Optional buyout price in aUEC */
    buyout_price?: number;
    /** Optional reserve price — auction won't sell below this */
    reserve_price?: number;
  };

  /** Initial listing status (default: 'active'). Use 'inactive' for draft/prep. */
  status?: 'active' | 'inactive';
}

// ============================================================================
// Search Listings Request/Response Types
// ============================================================================

/**
 * Query parameters for searching listings
 */
export interface SearchListingsRequest {
  /** Full-text search query */
  text?: string;
  
  /** Filter by specific game item UUID */
  game_item_id?: string;
  
  /** Minimum quality tier (1-5) */
  quality_tier_min?: number;
  
  /** Maximum quality tier (1-5) */
  quality_tier_max?: number;
  
  /** Minimum price filter */
  price_min?: number;
  
  /** Maximum price filter */
  price_max?: number;
  
  /** Page number for pagination (default: 1) */
  page?: number;
  
  /** Number of results per page (default: 20, max: 100) */
  page_size?: number;
  
  /** Filter by game item type/category */
  item_type?: string;
  
  /** Minimum quantity available */
  quantity_min?: number;
  
  /** Filter by listing status (default: active only) */
  status?: 'active' | 'inactive' | 'sold' | 'expired' | 'cancelled';
  
  /** Sort field (default: created_at) */
  sort_by?: 'created_at' | 'updated_at' | 'price' | 'quality' | 'seller_rating' | 'quantity';
  
  /** Sort order */
  sort_order?: 'asc' | 'desc';

  /** Filter by seller language codes (comma-separated ISO 639-1, matches if seller supports ANY) */
  language_codes?: string;
  /** Filter by listing type */
  listing_type?: 'single' | 'bundle' | 'bulk';
}

/**
 * Individual listing result in search response
 */
export interface ListingSearchResult {
  /** Listing UUID */
  listing_id: string;
  
  /** Listing title */
  title: string;
  
  /** Seller username or contractor name */
  seller_name: string;
  
  /** Seller rating (0-5) */
  seller_rating: number;
  
  /** Minimum price across all variants */
  price_min: number;
  
  /** Maximum price across all variants */
  price_max: number;
  
  /** Total quantity available across all variants */
  quantity_available: number;
  
  /** Minimum quality tier available (1-5) */
  quality_tier_min?: number;
  
  /** Maximum quality tier available (1-5) */
  quality_tier_max?: number;

  /** Minimum quality value available (0-1000) */
  quality_value_min?: number;

  /** Maximum quality value available (0-1000) */
  quality_value_max?: number;
  
  /** Number of unique variants in this listing */
  variant_count: number;
  
  /** Seller type (user or contractor) */
  seller_type: 'user' | 'contractor';
  
  /** Username (for user sellers) or spectrum_id (for contractor sellers) - use for profile links */
  seller_slug: string;
  
  /** ISO 8601 timestamp when listing was created */
  created_at: string;
  
  /** ISO 8601 timestamp when listing was last updated */
  updated_at: string;
  
  /** Game item name */
  game_item_name: string;
  
  /** Game item type/category */
  game_item_type: string;
  
  /** Seller rating count */
  seller_rating_count: number;

  /** Seller's supported languages (ISO 639-1 codes) */
  seller_languages?: string[];

  /** First photo URL (null if no photos) */
  photo?: string;

  /** Pickup method: delivery, pickup, any, or null (not specified) */
  pickup_method?: 'delivery' | 'pickup' | 'any' | null;

  /** Quantity unit: 'unit' or 'scu' */
  quantity_unit: 'unit' | 'scu';

  /** Whether this listing has bulk discount tiers defined */
  has_bulk_discount?: boolean;
}

/**
 * Response for listing search with pagination
 */
export interface SearchListingsResponse {
  /** Array of listing results */
  listings: ListingSearchResult[];
  
  /** Total number of listings matching filters */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Number of results per page */
  page_size: number;
}

// ============================================================================
// Get Listing Detail Response Types
// ============================================================================

/**
 * Core listing metadata
 */
export interface ListingDetail {
  /** Listing UUID */
  listing_id: string;
  
  /** Seller UUID */
  seller_id: string;
  
  /** Type of seller */
  seller_type: 'user' | 'contractor';
  
  /** Listing title */
  title: string;
  
  /** Listing description (markdown) */
  description: string;
  
  /** Current listing status */
  status: 'active' | 'inactive' | 'sold' | 'expired' | 'cancelled';
  
  /** Visibility setting */
  visibility: 'public' | 'private' | 'unlisted';
  
  /** Sale type */
  sale_type: 'fixed' | 'auction' | 'negotiable';
  
  /** Listing type */
  listing_type: 'single' | 'bundle' | 'bulk';
  
  /** ISO 8601 timestamp when listing was created */
  created_at: string;
  
  /** ISO 8601 timestamp when listing was last updated */
  updated_at: string;
  
  /** Optional ISO 8601 timestamp when listing expires */
  expires_at?: string;

  /** Array of photo URLs */
  photos?: string[];

  /** Pickup method: delivery, pickup, any, or null (not specified) */
  pickup_method?: 'delivery' | 'pickup' | 'any' | null;

  /** Quantity unit: 'unit' or 'scu' */
  quantity_unit: 'unit' | 'scu';

  /** Per-listing order limits (null = no limit) */
  min_order_quantity?: number | null;
  max_order_quantity?: number | null;
  min_order_value?: number | null;
  max_order_value?: number | null;

  /** Number of views this listing has received */
  view_count?: number;
}

/**
 * Variant detail with attributes, quantity, and price
 */
export interface VariantDetail {
  /** Variant UUID */
  variant_id: string;
  
  /** Variant attributes (quality tier, crafted source, etc) */
  attributes: VariantAttributes;
  
  /** Human-readable display name (e.g., "Tier 5 (95.5%) - Crafted") */
  display_name: string;
  
  /** Short name for compact display (e.g., "T5 Crafted") */
  short_name: string;
  
  /** Total quantity available for this variant */
  quantity: number;
  
  /** Price for this variant */
  price: number;
  
  /** Location names where this variant is stored */
  locations: string[];
}

/**
 * Game item information
 */
export interface GameItemInfo {
  /** Game item UUID */
  id: string;
  
  /** Item name */
  name: string;
  
  /** Item type/category */
  type: string;
  
  /** Optional item image URL */
  image_url?: string;
}

/**
 * Seller information
 */
export interface SellerInfo {
  /** Seller username or contractor name */
  name: string;
  
  /** Seller type */
  type: 'user' | 'contractor';
  
  /** Username (for users) or spectrum_id (for contractors) - use for profile links */
  slug: string;
  
  /** Seller rating (0-5) */
  rating: number;
  
  /** Optional seller avatar URL */
  avatar_url?: string;

  /** Seller's supported languages (ISO 639-1 codes) */
  languages?: string[];
}

/**
 * Item detail with game item info and variants
 */
export interface ListingItemDetail {
  /** Item UUID */
  item_id: string;
  
  /** Game item information */
  game_item: GameItemInfo;
  
  /** Pricing strategy for this item */
  pricing_mode: 'unified' | 'per_variant';
  
  /** Base price (used when pricing_mode is 'unified') */
  base_price?: number;
  
  /** Array of variants with quantities and prices */
  variants: VariantDetail[];

  /** Bulk discount tiers (null if none defined) */
  bulk_discount_tiers?: BulkDiscountTier[] | null;
}

/**
 * Complete listing detail response with all related data
 */
export interface GetListingDetailResponse {
  /** Core listing metadata */
  listing: ListingDetail;
  
  /** Seller information */
  seller: SellerInfo;
  
  /** Array of items being sold with variant breakdown */
  items: ListingItemDetail[];
}

// ============================================================================
// Update Listing Request Types
// ============================================================================

/**
 * Update for a specific variant's price
 */
export interface VariantPriceUpdate {
  /** Variant UUID */
  variant_id: string;
  
  /** New price for this variant */
  price: number;
}

/**
 * Update for a specific stock lot
 */
export interface LotUpdate {
  /** Stock lot UUID */
  lot_id: string;
  
  /** New total quantity (optional) */
  quantity_total?: number;
  
  /** New listed status (optional) */
  listed?: boolean;
  
  /** New location ID (optional) */
  location_id?: string;
}

/**
 * Request body for updating an existing listing
 */
export interface UpdateListingRequest {
  /** New title (optional) */
  title?: string;

  /** New status (optional) — active, inactive, sold, expired, cancelled */
  status?: 'active' | 'inactive' | 'sold' | 'expired' | 'cancelled';
  
  /** New description (optional) */
  description?: string;
  
  /** New base price for unified pricing mode (optional) */
  base_price?: number;
  
  /** Array of variant price updates for per_variant pricing mode (optional) */
  variant_prices?: VariantPriceUpdate[];
  
  /** Array of stock lot updates (optional) */
  lot_updates?: LotUpdate[];

  /** Pickup method: how the buyer receives the item */
  pickup_method?: 'delivery' | 'pickup' | 'any' | null;

  /** Quantity unit */
  quantity_unit?: 'unit' | 'scu';

  /** Per-listing order limits (null to remove) */
  min_order_quantity?: number | null;
  max_order_quantity?: number | null;
  min_order_value?: number | null;
  max_order_value?: number | null;

  /** Updated bulk discount tiers (pass [] to remove, omit to keep unchanged) */
  bulk_discount_tiers?: BulkDiscountTier[];
}
// ============================================================================

/**
 * Query parameters for fetching user's listings
 */
export interface GetMyListingsRequest {
  /** Filter by listing status */
  status?: 'active' | 'inactive' | 'sold' | 'expired' | 'cancelled';
  
  /** Page number for pagination (default: 1) */
  page?: number;
  
  /** Number of results per page (default: 20, max: 100) */
  page_size?: number;
  
  /** Sort field */
  sort_by?: 'created_at' | 'updated_at' | 'price' | 'quantity';
  
  /** Sort order */
  sort_order?: 'asc' | 'desc';
}

/**
 * Individual listing item in my listings response
 */
export interface MyListingItem {
  /** Listing UUID */
  listing_id: string;
  
  /** Listing title */
  title: string;
  
  /** Current status */
  status: string;
  
  /** ISO 8601 timestamp when listing was created */
  created_at: string;
  
  /** ISO 8601 timestamp when listing was last updated */
  updated_at: string;
  
  /** Number of unique variants */
  variant_count: number;
  
  /** Total quantity available across all variants */
  quantity_available: number;
  
  /** Minimum price across all variants */
  price_min: number;
  
  /** Maximum price across all variants */
  price_max: number;
  
  /** Minimum quality tier available (1-5) */
  quality_tier_min?: number;
  
  /** Maximum quality tier available (1-5) */
  quality_tier_max?: number;

  /** Primary photo URL */
  photo?: string;

  /** ISO 8601 timestamp when listing expires (null if no expiry) */
  expires_at?: string;
}

/**
 * Response for my listings with pagination
 */
export interface GetMyListingsResponse {
  /** Array of user's listings */
  listings: MyListingItem[];
  
  /** Total number of listings matching filters */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Number of results per page */
  page_size: number;
}

/** Aggregated inventory material */
export interface InventoryMaterial {
  game_item_id: string;
  game_item_name: string;
  game_item_type?: string;
  game_item_icon?: string;
  total_quantity: number;
  avg_quality_value?: number;
  max_quality_value?: number;
}

export interface InventorySummaryResponse {
  materials: InventoryMaterial[];
}
