/**
 * Wiki API Types
 *
 * Type definitions for the Game Database Wiki endpoints.
 */

// ============================================================================
// Request Types
// ============================================================================

export interface SearchWikiItemsRequest {
  text?: string
  type?: string
  sub_type?: string
  size?: string
  grade?: string
  manufacturer?: string
  category?: string
  version_id?: string
  page: number
  page_size: number
}

// ============================================================================
// Response Types
// ============================================================================

export interface SearchWikiItemsResponse {
  items: WikiItemSearchResult[]
  total: number
  page: number
  page_size: number
}

export interface WikiItemSearchResult {
  id: string
  name: string
  type?: string
  sub_type?: string
  size?: string
  grade?: string
  manufacturer?: string
  image_url?: string
  thumbnail_path?: string
  display_type?: string
}

export interface WikiItemDetail {
  id: string
  name: string
  type?: string
  sub_type?: string
  size?: string
  grade?: string
  manufacturer?: string
  image_url?: string
  thumbnail_path?: string
  display_type?: string
  p4k_id?: string
  p4k_file?: string
  name_key?: string
  attributes: Record<string, any>
  craftable_from: BlueprintReference[]
  rewarded_by: MissionRewardReference[]
  market_stats: MarketStats
}

export interface BlueprintReference {
  blueprint_id: string
  blueprint_name: string
  rarity?: string
  tier?: number
  crafting_time_seconds?: number
}

export interface MissionRewardReference {
  mission_id: string
  mission_name: string
  star_system?: string
  drop_probability: number
  blueprint_id: string
  blueprint_name: string
}

export interface MarketStats {
  listing_count: number
  min_price?: number
  max_price?: number
  total_quantity: number
}

// ============================================================================
// Ship Types
// ============================================================================

export interface WikiShipSearchResult {
  id: string
  name: string
  manufacturer?: string
  focus?: string
  size?: string
  image_url?: string
}

export interface WikiShipDetail {
  id: string
  name: string
  manufacturer?: string
  focus?: string
  size?: string
  description?: string
  movement_class?: string
  image_url?: string
  default_loadout?: any
  attributes: Record<string, any>
}

// ============================================================================
// Commodity Types
// ============================================================================

export interface WikiCommoditySearchResult {
  resource_id: string
  game_item_id: string
  name: string
  resource_category: string
  resource_subcategory?: string
  can_be_mined: boolean
  can_be_purchased: boolean
  can_be_salvaged: boolean
  can_be_looted: boolean
  image_url?: string
}

// ============================================================================
// Location Types
// ============================================================================

export interface WikiLocationNode {
  id: string
  name: string
  type: string
  parent_id?: string
  children: WikiLocationNode[]
}

// ============================================================================
// Manufacturer Types
// ============================================================================

export interface WikiManufacturerSearchResult {
  manufacturer: string
  item_count: number
}

export interface WikiManufacturerDetail {
  manufacturer: string
  description?: string
  item_count: number
  items: ManufacturerItem[]
}

export interface ManufacturerItem {
  id: string
  name: string
  type?: string
  size?: string
  grade?: string
  image_url?: string
}
