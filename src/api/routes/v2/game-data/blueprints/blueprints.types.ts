/**
 * TypeScript interfaces for Game Data Blueprints API
 *
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 *
 * Requirements: 19.1-19.6, 43.1-43.10, 50.1-50.10
 */

// ============================================================================
// Blueprint Search Types
// ============================================================================

/**
 * Query parameters for blueprint search endpoint
 */
export interface SearchBlueprintsRequest {
  /** Full-text search on blueprint name */
  text?: string

  /** Filter by item category */
  item_category?: string

  /** Filter by item subcategory */
  item_subcategory?: string

  /** Filter by rarity */
  rarity?: string

  /** Filter by tier (1-5) */
  tier?: number

  /** Filter by crafting station type */
  crafting_station_type?: string

  /** Filter by output game item ID */
  output_game_item_id?: string

  /** Filter to show only user-owned blueprints */
  user_owned_only?: boolean

  /** Game version ID (defaults to active LIVE version) */
  version_id?: string

  /** Page number for pagination (default: 1) */
  page?: number

  /** Number of results per page (default: 20, max: 100) */
  page_size?: number
}

/**
 * Blueprint search result item
 */
export interface BlueprintSearchResult {
  /** Blueprint UUID */
  blueprint_id: string

  /** Blueprint code (internal name for URL-friendly links) */
  blueprint_code: string

  /** Blueprint name */
  blueprint_name: string

  /** Output item name */
  output_item_name: string

  /** Output item icon URL */
  output_item_icon?: string

  /** Item category */
  item_category?: string

  /** Item subcategory */
  item_subcategory?: string

  /** Manufacturer name */
  manufacturer?: string

  /** Blueprint source (default, mission_reward) */
  source?: string

  /** Rarity */
  rarity?: string

  /** Tier (1-5) */
  tier?: number

  /** Number of ingredients */
  ingredient_count: number

  /** Ingredient summaries */
  ingredients: {
    name: string
    sub_type?: string
    icon_url?: string
    quantity_required: number
  }[]

  /** Number of missions that reward this blueprint */
  mission_count: number

  /** Crafting time in seconds */
  crafting_time_seconds?: number

  /** Distinct modifier property names (e.g. ["damagemitigation", "mintemp"]) */
  modifier_properties?: string[]

  /** Does user own this blueprint */
  user_owns?: boolean
}

/**
 * Response for blueprint search endpoint
 */
export interface SearchBlueprintsResponse {
  /** Blueprint search results */
  blueprints: BlueprintSearchResult[]

  /** Total number of blueprints matching filters */
  total: number

  /** Current page number */
  page: number

  /** Page size */
  page_size: number
}

// ============================================================================
// Blueprint Detail Types
// ============================================================================

/**
 * Complete blueprint data
 */
export interface Blueprint {
  blueprint_id: string
  version_id: string
  blueprint_code: string
  blueprint_name: string
  blueprint_description?: string
  output_game_item_id: string
  output_quantity: number
  item_category?: string
  item_subcategory?: string
  rarity?: string
  tier?: number
  crafting_station_type?: string
  crafting_time_seconds?: number
  required_skill_level?: number
  icon_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Game item reference
 */
export interface GameItem {
  /** Game item UUID */
  game_item_id: string

  /** Item name */
  name: string

  /** Item type */
  type: string

  /** Item sub-type (e.g., mineral, metal, gas for commodities) */
  sub_type?: string

  /** Icon URL */
  icon_url?: string
}

/**
 * Blueprint ingredient with market data
 */
export interface BlueprintIngredient {
  /** Ingredient UUID */
  ingredient_id: string

  /** Game item reference */
  game_item: GameItem

  /** Required quantity */
  quantity_required: number

  /** Minimum quality tier (1-5) */
  min_quality_tier?: number

  /** Recommended quality tier (1-5) */
  recommended_quality_tier?: number

  /** Is alternative ingredient */
  is_alternative: boolean

  /** Alternative group ID */
  alternative_group?: number

  /** Slot name for linking to slot modifiers */
  slot_name?: string

  /** Slot display name */
  slot_display_name?: string

  /** Minimum market price */
  market_price_min?: number

  /** Maximum market price */
  market_price_max?: number

  /** User inventory quantity */
  user_inventory_quantity?: number
}

/**
 * Mission that rewards this blueprint
 */
export interface MissionRewardingBlueprint {
  /** Mission UUID */
  mission_id: string

  /** Mission name */
  mission_name: string

  /** Drop probability percentage (0-100) */
  drop_probability: number

  /** Star system */
  star_system?: string
}

/**
 * User acquisition data
 */
export interface UserBlueprintAcquisition {
  /** Acquisition date */
  acquisition_date: string

  /** Acquisition method */
  acquisition_method?: string

  /** Acquisition location */
  acquisition_location?: string

  /** Acquisition notes */
  acquisition_notes?: string
}

/**
 * Response for blueprint detail endpoint
 */
export interface BlueprintDetailResponse {
  /** Complete blueprint data */
  blueprint: Blueprint

  /** Output item reference */
  output_item: GameItem

  /** Ingredients required */
  ingredients: BlueprintIngredient[]

  /** Missions that reward this blueprint */
  missions_rewarding: MissionRewardingBlueprint[]

  /** Crafting recipe (if available) */
  crafting_recipe?: {
    quality_calculation_type: string
    min_output_quality_tier: number
    max_output_quality_tier: number
  }

  /** Per-slot quality modifiers (how ingredient quality affects output stats) */
  slot_modifiers: SlotModifier[]

  /** Output item base attributes (damage resistance, temperature, etc.) */
  item_attributes: Record<string, string>

  /** Does user own this blueprint */
  user_owns?: boolean

  /** User acquisition data */
  user_acquisition?: UserBlueprintAcquisition
}

// ============================================================================
// Blueprint Categories Types
// ============================================================================

/**
 * Blueprint category with count
 */
export interface BlueprintCategory {
  /** Category name */
  category: string

  /** Subcategory name */
  subcategory?: string

  /** Number of blueprints in this category */
  count: number
}


/** Quality modifier curve for a blueprint ingredient slot */
export interface SlotModifier {
  slot_name: string
  slot_display_name: string
  /** Property affected (e.g., "damagemitigation", "mintemp", "maxtemp") */
  property: string
  start_quality: number
  end_quality: number
  /** Modifier value at start_quality (e.g., 0.9 = ×0.9) */
  modifier_at_start: number
  /** Modifier value at end_quality (e.g., 1.1 = ×1.1) */
  modifier_at_end: number
}
