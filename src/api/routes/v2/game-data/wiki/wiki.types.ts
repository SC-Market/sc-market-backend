/**
 * Wiki API Types
 *
 * Type definitions for the Game Database Wiki endpoints.
 */

import type { GameItemMarketPrice } from "../../types/game-items.types.js"

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
  /**
   * Manufacturer display name (e.g. "Aegis Dynamics") resolved from
   * wiki_manufacturers the same way GET /game-data/wiki/manufacturers resolves
   * `display_name`. Null when the manufacturer is unknown or unset.
   */
  manufacturer_name: string | null
  /**
   * Raw `game_items.manufacturer` code (e.g. "behr"), the value the
   * `manufacturer` search filter takes and the key manufacturer logos are
   * looked up by. Null when the item has no manufacturer.
   */
  manufacturer_code: string | null
  image_url?: string
  thumbnail_path?: string
  display_type?: string
}

/** An in-game NPC shop that sells and/or buys an item (Data.p4k shop inventories) */
export interface WikiItemShop {
  shop_id: string
  shop_name: string
  shop_location: string
  /** Price the shop sells the item to players for, in aUEC; null if it doesn't sell it */
  buy_price: number | null
  /** Price the shop pays players for the item, in aUEC; null if it doesn't buy it */
  sell_price: number | null
}

export interface WikiItemShopsResponse {
  /** Shops that stock the item, cheapest first; empty when no shop does */
  shops: WikiItemShop[]
}

export interface WikiItemDetail {
  id: string
  name: string
  type?: string
  sub_type?: string
  size?: string
  grade?: string
  manufacturer?: string
  /**
   * Manufacturer display name (e.g. "Aegis Dynamics") resolved from
   * wiki_manufacturers the same way GET /game-data/wiki/manufacturers resolves
   * `display_name`. Null when the manufacturer is unknown or unset.
   */
  manufacturer_name: string | null
  image_url?: string
  thumbnail_path?: string
  display_type?: string
  p4k_id?: string
  p4k_file?: string
  name_key?: string
  /** Key/value attributes from game_item_attributes (values are stored as text) */
  attributes: Record<string, string>
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
  ship_code?: string
  manufacturer?: string
  /**
   * Manufacturer display name (e.g. "Aegis Dynamics") resolved from
   * wiki_manufacturers the same way GET /game-data/wiki/manufacturers resolves
   * `display_name`. Null when the manufacturer is unknown or unset.
   */
  manufacturer_name: string | null
  focus?: string
  size?: string
  image_url?: string
  crew_size?: number
  career?: string
  role?: string
  length_m?: number
  width_m?: number
  height_m?: number
}

export interface WikiShipDetail {
  id: string
  name: string
  ship_code?: string
  manufacturer?: string
  /**
   * Manufacturer display name (e.g. "Aegis Dynamics") resolved from
   * wiki_manufacturers the same way GET /game-data/wiki/manufacturers resolves
   * `display_name`. Null when the manufacturer is unknown or unset.
   */
  manufacturer_name: string | null
  focus?: string
  size?: string
  description?: string
  movement_class?: string
  image_url?: string
  /** Raw `default_loadout` attribute value from game_item_attributes (stored as text) */
  default_loadout?: string
  /** Key/value attributes from game_item_attributes (values are stored as text) */
  attributes: Record<string, string>
  crew_size?: number
  career?: string
  role?: string
  length_m?: number
  width_m?: number
  height_m?: number
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
  navIcon: string | null
  description: string | null
  parentId: string | null
  jurisdiction: string | null
  respawnType: string | null
  size: number | null
  qtArrivalRadius: number | null
  qtObstructionRadius: number | null
  amenities: string[]
  children: WikiLocationNode[]
}

// ============================================================================
// Manufacturer Types
// ============================================================================

export interface WikiManufacturerSearchResult {
  manufacturer: string
  display_name: string | null
  item_count: number
}

export interface WikiManufacturerDetail {
  manufacturer: string
  display_name: string | null
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

// ============================================================================
// Comparison tables
// ============================================================================

/** A comparison table: ship components, FPS weapons or one armour slot. */
export type WikiCompareCategory =
  | "quantum-drive"
  | "shield"
  | "power-plant"
  | "cooler"
  | "radar"
  | "jump-drive"
  | "ship-weapon"
  | "missile"
  | "countermeasure"
  | "mining-head"
  | "fps-weapon"
  | "helmet"
  | "torso"
  | "arms"
  | "legs"
  | "undersuit"
  | "backpack"

/** One stat column of a comparison table. */
export interface WikiCompareColumn {
  /** Stat key; also the key into each row's `stats` */
  key: string
  /** "text" stats (fire modes, laser power ranges) are not ranked */
  kind: "number" | "text"
  /** Which way is better, for highlighting the best value; null when neither */
  better: "higher" | "lower" | null
  /** Display unit (a symbol, never translated); null when unitless */
  unit: "s" | "m" | "m/s" | "rpm" | "°C" | "%" | "µSCU" | null
}

/** One game item of a comparison table. */
export interface WikiCompareRow {
  id: string
  name: string
  size: number | null
  /** Component grade A-D; null for categories without grades */
  grade: string | null
  /** Class (Military, Ballistic Cannon, Heavy, ...), as the game data names it */
  class: string | null
  /** The game's sub-type (Small, Torpedo, ...), null when the data has none */
  sub_type: string | null
  /** Manufacturer display name */
  manufacturer: string | null
  /** Manufacturer code (game_items.manufacturer), e.g. "behr" */
  manufacturer_code: string | null
  image_url: string | null
  thumbnail_path: string | null
  /** Stat key → value; a stat the item lacks is absent. Text when the data isn't a plain number. */
  stats: { [key: string]: number | string }
  /** null when nobody sells the item on SC Market */
  market: GameItemMarketPrice | null
}

/** GET /game-data/wiki/compare/{category} */
export interface WikiCompareResponse {
  category: WikiCompareCategory
  group: "ship" | "fps"
  /** Only stats some items have and that differ between items */
  columns: WikiCompareColumn[]
  /** Every item of the category, by name */
  items: WikiCompareRow[]
  /** When the document was computed (ISO 8601); market prices are as of then */
  as_of: string
}
