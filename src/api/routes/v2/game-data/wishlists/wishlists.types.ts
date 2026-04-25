/**
 * TypeScript interfaces for Game Data Wishlists API
 *
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 *
 * Requirements: 32.1-32.6, 46.1-46.10, 53.1-53.10
 */

// ============================================================================
// Wishlist Core Types
// ============================================================================

/**
 * Complete wishlist data
 */
export interface Wishlist {
  wishlist_id: string
  user_id: string
  wishlist_name: string
  wishlist_description?: string
  is_public: boolean
  share_token?: string
  organization_id?: string
  is_collaborative: boolean
  created_at: string
  updated_at: string
}

/**
 * How the user intends to acquire this item
 * - "buy": Purchase the finished item from the market
 * - "craft": Craft the item — ingredients will be added to the shopping list
 */
export type AcquisitionMode = "buy" | "craft"

/**
 * Wishlist item with game data
 */
export interface WishlistItem {
  item_id: string
  wishlist_id: string
  game_item_id: string
  desired_quantity: number
  desired_quality_tier?: number
  blueprint_id?: string
  acquisition_mode: AcquisitionMode
  priority: number
  notes?: string
  is_acquired: boolean
  acquired_quantity: number
  created_at: string
  updated_at: string
}

/**
 * Wishlist item with enriched data
 */
export interface WishlistItemWithDetails extends WishlistItem {
  game_item_name: string
  game_item_icon?: string
  game_item_type: string
  blueprint_name?: string
  estimated_cost?: number
  crafting_available: boolean
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request to create a new wishlist
 */
export interface CreateWishlistRequest {
  /** Wishlist name */
  wishlist_name: string

  /** Optional description */
  wishlist_description?: string

  /** Is wishlist public */
  is_public: boolean

  /** Optional organization ID for org wishlists */
  organization_id?: string

  /** Is collaborative (multiple users can edit) */
  is_collaborative: boolean
}

/**
 * Request to update a wishlist
 */
export interface UpdateWishlistRequest {
  /** Updated wishlist name */
  wishlist_name?: string

  /** Updated description */
  wishlist_description?: string

  /** Updated public status */
  is_public?: boolean

  /** Updated collaborative status */
  is_collaborative?: boolean
}

/**
 * Request to add an item to a wishlist
 */
export interface AddWishlistItemRequest {
  /** Game item ID */
  game_item_id: string

  /** Desired quantity */
  desired_quantity: number

  /** Desired quality tier (1-5) */
  desired_quality_tier?: number

  /** Optional blueprint ID if item is craftable */
  blueprint_id?: string

  /** How to acquire: "buy" from market or "craft" from ingredients (default: "buy") */
  acquisition_mode?: AcquisitionMode

  /** Priority level (1-5, higher is more important) */
  priority: number

  /** Optional notes */
  notes?: string
}

/**
 * Request to update a wishlist item
 */
export interface UpdateWishlistItemRequest {
  /** Updated desired quantity */
  desired_quantity?: number

  /** Updated desired quality tier */
  desired_quality_tier?: number

  /** Updated priority */
  priority?: number

  /** Updated notes */
  notes?: string

  /** Updated acquisition mode */
  acquisition_mode?: AcquisitionMode

  /** Updated acquired status */
  is_acquired?: boolean

  /** Updated acquired quantity */
  acquired_quantity?: number
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response for list wishlists endpoint
 */
export interface ListWishlistsResponse {
  wishlists: Array<
    Wishlist & {
      item_count: number
      completed_items: number
      progress_percentage: number
    }
  >
}

/**
 * Response for get wishlist detail endpoint
 */
export interface GetWishlistResponse {
  wishlist: Wishlist
  items: WishlistItemWithDetails[]
  statistics: {
    total_items: number
    completed_items: number
    progress_percentage: number
    total_estimated_cost: number
  }
}

/**
 * Shopping list material requirement
 */
export interface ShoppingListMaterial {
  /** Game item ID */
  game_item_id: string

  /** Game item name */
  game_item_name: string

  /** Game item icon */
  game_item_icon?: string

  /** Total quantity needed across all wishlist items */
  total_quantity_needed: number

  /** Desired quality tier */
  desired_quality_tier?: number

  /** User inventory quantity */
  user_inventory_quantity: number

  /** Quantity still needed */
  quantity_to_acquire: number

  /** Estimated unit price */
  estimated_unit_price?: number

  /** Estimated total cost */
  estimated_total_cost?: number

  /** Acquisition methods (mining, purchase, salvage, etc.) */
  acquisition_methods: string[]

  /** Which wishlist items use this material */
  used_by_items: Array<{
    wishlist_item_id: string
    item_name: string
    quantity_for_this_item: number
  }>
}

/**
 * Response for shopping list generation endpoint
 */
export interface ShoppingListResponse {
  wishlist_id: string
  wishlist_name: string
  materials_needed: ShoppingListMaterial[]
  total_estimated_cost: number
  materials_fully_stocked: number
  materials_partially_stocked: number
  materials_not_stocked: number
}
