/**
 * TypeScript interfaces for Game Data Resources API
 *
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 *
 * Requirements: 44.1-44.10
 */

// ============================================================================
// Resource Search Types
// ============================================================================

/**
 * Query parameters for resource search endpoint
 */
export interface SearchResourcesRequest {
  /** Full-text search on resource name */
  text?: string

  /** Filter by resource category */
  resource_category?: string

  /** Filter by resource subcategory */
  resource_subcategory?: string

  /** Filter by acquisition method (can_be_mined, can_be_purchased, can_be_salvaged, can_be_looted) */
  acquisition_method?: "mined" | "purchased" | "salvaged" | "looted"

  /** Game version ID (defaults to active LIVE version) */
  version_id?: string

  /** Page number for pagination (default: 1) */
  page?: number

  /** Number of results per page (default: 20, max: 100) */
  page_size?: number
}

/**
 * Resource search result item
 */
export interface ResourceSearchResult {
  /** Resource UUID */
  resource_id: string

  /** Game item ID */
  game_item_id: string

  /** Resource name */
  resource_name: string

  /** Resource icon URL */
  resource_icon?: string

  /** Resource category */
  resource_category: string

  /** Resource subcategory */
  resource_subcategory?: string

  /** Maximum stack size */
  max_stack_size?: number

  /** Base value in UEC */
  base_value?: number

  /** Can be mined */
  can_be_mined: boolean

  /** Can be purchased */
  can_be_purchased: boolean

  /** Can be salvaged */
  can_be_salvaged: boolean

  /** Can be looted */
  can_be_looted: boolean

  /** Number of blueprints that require this resource */
  blueprint_count: number
}

/**
 * Response for resource search endpoint
 */
export interface SearchResourcesResponse {
  /** Resource search results */
  resources: ResourceSearchResult[]

  /** Total number of resources matching filters */
  total: number

  /** Current page number */
  page: number

  /** Page size */
  page_size: number
}

// ============================================================================
// Resource Detail Types
// ============================================================================

/**
 * Mining location information
 */
export interface MiningLocation {
  /** Star system */
  star_system?: string

  /** Planet or moon */
  planet_moon?: string

  /** Location detail */
  location_detail?: string

  /** Abundance level */
  abundance?: string
}

/**
 * Purchase location information
 */
export interface PurchaseLocation {
  /** Star system */
  star_system?: string

  /** Planet or moon */
  planet_moon?: string

  /** Station or outpost */
  station?: string

  /** Average price */
  average_price?: number
}

/**
 * Complete resource data
 */
export interface Resource {
  resource_id: string
  version_id: string
  game_item_id: string
  resource_name: string
  resource_icon?: string
  resource_category: string
  resource_subcategory?: string
  max_stack_size?: number
  base_value?: number
  can_be_mined: boolean
  can_be_purchased: boolean
  can_be_salvaged: boolean
  can_be_looted: boolean
  mining_locations?: MiningLocation[]
  purchase_locations?: PurchaseLocation[]
  created_at: string
  updated_at: string
}

/**
 * Blueprint that requires this resource
 */
export interface BlueprintRequiringResource {
  /** Blueprint UUID */
  blueprint_id: string

  /** Blueprint name */
  blueprint_name: string

  /** Output item name */
  output_item_name: string

  /** Output item icon */
  output_item_icon?: string

  /** Quantity required */
  quantity_required: number

  /** Minimum quality tier */
  min_quality_tier?: number

  /** Recommended quality tier */
  recommended_quality_tier?: number
}

/**
 * Response for resource detail endpoint
 */
export interface ResourceDetailResponse {
  /** Complete resource data */
  resource: Resource

  /** Blueprints that require this resource */
  blueprints_requiring: BlueprintRequiringResource[]

  /** Market price data (if available) */
  market_price?: {
    min_price?: number
    max_price?: number
    average_price?: number
    last_updated?: string
  }
}

// ============================================================================
// Resource Categories Types
// ============================================================================

/**
 * Resource category with count
 */
export interface ResourceCategory {
  /** Category name */
  category: string

  /** Subcategory name */
  subcategory?: string

  /** Number of resources in this category */
  count: number
}
