/**
 * TypeScript interfaces for Market V2 Stock Lots API
 * 
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 * 
 * Requirements: 20.1-20.12, 22.1-22.10
 */

import { VariantAttributes } from './listings.types.js';

// ============================================================================
// Stock Lot Detail Types
// ============================================================================

/**
 * Location information
 */
export interface LocationInfo {
  /** Location UUID */
  location_id: string;
  
  /** Location name */
  name: string;
  
  /** Whether this is a preset location (vs custom) */
  is_preset: boolean;
}

/**
 * Owner information
 */
export interface OwnerInfo {
  /** User UUID */
  user_id: string;
  
  /** Username */
  username: string;
  
  /** Display name */
  display_name?: string;
  
  /** Avatar URL */
  avatar_url?: string;
}

/**
 * Variant information for stock lot
 */
export interface StockLotVariant {
  /** Variant UUID */
  variant_id: string;
  
  /** Variant attributes */
  attributes: VariantAttributes;
  
  /** Display name (e.g., "Tier 5 (95.5%) - Crafted") */
  display_name: string;
  
  /** Short name (e.g., "T5 Crafted") */
  short_name: string;
}

/**
 * Complete stock lot detail
 */
export interface StockLotDetail {
  /** Stock lot UUID */
  lot_id: string;
  
  /** Item UUID this lot belongs to */
  item_id: string;
  
  /** Variant information */
  variant: StockLotVariant;
  
  /** Total quantity in this lot */
  quantity_total: number;
  
  /** Location information (null if unspecified) */
  location: LocationInfo | null;
  
  /** Owner information (null if unassigned) */
  owner: OwnerInfo | null;
  
  /** Whether this lot is listed for sale */
  listed: boolean;
  
  /** Optional notes about this lot */
  notes: string | null;
  
  /** User who crafted this item (if applicable) */
  crafted_by?: string;
  
  /** Timestamp when item was crafted (if applicable) */
  crafted_at?: string;
  
  /** ISO 8601 timestamp when lot was created */
  created_at: string;
  
  /** ISO 8601 timestamp when lot was last updated */
  updated_at: string;
}

// ============================================================================
// Create Stock Lot Request Type
// ============================================================================

/**
 * Request body for creating a stock lot
 */
export interface CreateStockLotRequest {
  /** Listing item UUID */
  item_id: string;
  /** Quantity (must be > 0) */
  quantity: number;
  /** Variant attributes for this lot */
  variant_attributes: VariantAttributes;
  /** Optional location UUID */
  location_id?: string;
  /** Whether to list for sale (default: true) */
  listed?: boolean;
  /** Optional notes */
  notes?: string;
}

// ============================================================================
// Get Stock Lots Request/Response Types
// ============================================================================

/**
 * Query parameters for fetching stock lots
 */
export interface GetStockLotsRequest {
  /** Filter by listing UUID */
  listing_id?: string;
  
  /** Filter by game item UUID */
  game_item_id?: string;
  
  /** Filter by location UUID */
  location_id?: string;
  
  /** Filter by listed status */
  listed?: boolean;
  
  /** Filter by variant UUID */
  variant_id?: string;
  
  /** Minimum quality tier (1-5) */
  quality_tier_min?: number;
  
  /** Maximum quality tier (1-5) */
  quality_tier_max?: number;
  
  /** Page number for pagination (default: 1) */
  page?: number;
  
  /** Number of results per page (default: 20, max: 100) */
  page_size?: number;
}

/**
 * Response for fetching stock lots
 */
export interface GetStockLotsResponse {
  /** Array of stock lots */
  lots: StockLotDetail[];
  
  /** Total number of lots matching filters */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Number of results per page */
  page_size: number;
}

// ============================================================================
// Update Stock Lot Request/Response Types
// ============================================================================

/**
 * Request body for updating a stock lot
 */
export interface UpdateStockLotRequest {
  /** New total quantity (optional) */
  quantity_total?: number;
  
  /** New listed status (optional) */
  listed?: boolean;
  
  /** New location UUID (optional, null to clear) */
  location_id?: string | null;
  
  /** New notes (optional, null to clear) */
  notes?: string | null;
}

/**
 * Response for updating a stock lot
 */
export interface UpdateStockLotResponse {
  /** Updated stock lot */
  lot: StockLotDetail;
}

// ============================================================================
// Bulk Update Request/Response Types
// ============================================================================

/**
 * Individual lot update in bulk operation
 */
export interface BulkLotUpdate {
  /** Stock lot UUID */
  lot_id: string;
  
  /** New total quantity (optional) */
  quantity_total?: number;
  
  /** New listed status (optional) */
  listed?: boolean;
  
  /** New location UUID (optional) */
  location_id?: string | null;
}

/**
 * Request body for bulk stock lot updates
 */
export interface BulkUpdateStockLotsRequest {
  /** Array of lot updates */
  updates: BulkLotUpdate[];
}

/**
 * Result of a single lot update in bulk operation
 */
export interface BulkUpdateResult {
  /** Stock lot UUID */
  lot_id: string;
  
  /** Whether the update succeeded */
  success: boolean;
  
  /** Error message if update failed */
  error?: string;
}

/**
 * Response for bulk stock lot updates
 */
export interface BulkUpdateStockLotsResponse {
  /** Array of update results */
  results: BulkUpdateResult[];
  
  /** Number of successful updates */
  success_count: number;
  
  /** Number of failed updates */
  failure_count: number;
}
