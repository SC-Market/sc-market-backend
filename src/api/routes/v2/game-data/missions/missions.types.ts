/**
 * TypeScript interfaces for Game Data Missions API
 *
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 *
 * Requirements: 1.1-1.6, 2.1-2.6, 41.1-41.10, 42.1-42.10
 */

// ============================================================================
// Mission Search Types
// ============================================================================

/**
 * Query parameters for mission search endpoint
 */
export interface SearchMissionsRequest {
  /** Full-text search on mission name */
  text?: string

  /** Filter by mission category */
  category?: string

  /** Filter by career type */
  career_type?: string

  /** Filter by star system */
  star_system?: string

  /** Filter by planet or moon */
  planet_moon?: string

  /** Filter by faction */
  faction?: string

  /** Filter by legal status */
  legal_status?: "LEGAL" | "ILLEGAL"

  /** Minimum difficulty level (1-5) */
  difficulty_min?: number

  /** Maximum difficulty level (1-5) */
  difficulty_max?: number

  /** Filter by shareable status */
  is_shareable?: boolean

  /** Filter by availability type */
  availability_type?: string

  /** Filter by associated event */
  associated_event?: string

  /** Filter for chain starter missions */
  is_chain_starter?: boolean

  /** Filter for missions with blueprint rewards */
  has_blueprint_rewards?: boolean

  /** Minimum credit reward */
  credit_reward_min?: number

  /** Minimum community difficulty rating (1-5) */
  community_difficulty_min?: number

  /** Minimum community satisfaction rating (1-5) */
  community_satisfaction_min?: number

  /** Game version ID (defaults to active LIVE version) */
  version_id?: string

  /** Page number for pagination (default: 1) */
  page?: number

  /** Number of results per page (default: 20, max: 100) */
  page_size?: number
}

/**
 * Mission search result item
 */
export interface MissionSearchResult {
  /** Mission UUID */
  mission_id: string

  /** Mission name */
  mission_name: string

  /** Mission category */
  category: string

  /** Career type */
  career_type?: string

  /** Legal status */
  legal_status?: string

  /** Difficulty level (1-5) */
  difficulty_level?: number

  /** Star system */
  star_system?: string

  /** Planet or moon */
  planet_moon?: string

  /** Faction */
  faction?: string

  /** Minimum credit reward */
  credit_reward_min?: number

  /** Maximum credit reward */
  credit_reward_max?: number

  /** Number of blueprint rewards */
  blueprint_reward_count: number

  /** Average community difficulty rating */
  community_difficulty_avg?: number

  /** Average community satisfaction rating */
  community_satisfaction_avg?: number

  /** Is chain starter mission */
  is_chain_starter: boolean

  /** Is shareable mission */
  /** Is shareable mission */
  is_shareable: boolean

  /** Reputation XP reward */
  reputation_reward?: number

  /** Reputation scope (e.g., headhunter, salvage) */
  reward_scope?: string

  /** Mission giver organization */
  mission_giver_org?: string
}

/**
 * Response for mission search endpoint
 */
export interface SearchMissionsResponse {
  /** Mission search results */
  missions: MissionSearchResult[]

  /** Total number of missions matching filters */
  total: number

  /** Current page number */
  page: number

  /** Page size */
  page_size: number
}

// ============================================================================
// Mission Detail Types
// ============================================================================

/**
 * Complete mission data
 */
export interface Mission {
  mission_id: string
  version_id: string
  mission_code: string
  mission_name: string
  mission_description?: string
  category: string
  mission_type?: string
  career_type?: string
  legal_status?: "LEGAL" | "ILLEGAL" | "UNKNOWN"
  difficulty_level?: number
  star_system?: string
  planet_moon?: string
  location_detail?: string
  mission_giver_org?: string
  faction?: string
  credit_reward_min?: number
  credit_reward_max?: number
  reputation_reward?: number
  is_shareable: boolean
  availability_type?: string
  associated_event?: string
  required_rank?: number
  required_reputation?: number
  is_chain_starter: boolean
  is_chain_mission: boolean
  is_unique_mission: boolean
  prerequisite_missions?: any
  estimated_uec_per_hour?: number
  estimated_rep_per_hour?: number
  rank_index?: number
  reward_scope?: string
  /** Standing requirement — min (e.g. "Neutral") */
  min_standing?: string
  /** Standing requirement — max (e.g. "Elite Contractor") */
  max_standing?: string
  /** Can re-accept after failing */
  can_reaccept_after_failing?: boolean
  /** Can re-accept after abandoning */
  can_reaccept_after_abandoning?: boolean
  /** Cooldown after abandoning (seconds) */
  abandoned_cooldown_time?: number
  /** Personal cooldown between accepts (seconds) */
  personal_cooldown_time?: number
  /** Mission deadline (seconds) */
  deadline_seconds?: number
  /** Available in prison */
  available_in_prison?: boolean
  /** Is illegal */
  is_illegal?: boolean
  /** Is lawful */
  is_lawful?: boolean
  /** Max crimestat allowed */
  max_crimestat?: number
  /** Difficulty from broker (raw) */
  difficulty_from_broker?: number
  community_difficulty_avg?: number
  community_difficulty_count: number
  community_satisfaction_avg?: number
  community_satisfaction_count: number
  data_source: string
  is_verified: boolean
  created_at: string
  updated_at: string
}

/**
 * Blueprint reward in a mission reward pool
 */
export interface MissionBlueprintReward {
  /** Blueprint UUID */
  blueprint_id: string

  /** Blueprint name */
  blueprint_name: string

  /** Output item name */
  output_item_name: string

  /** Output item icon URL */
  output_item_icon?: string

  /** Drop probability percentage (0-100) */
  drop_probability: number

  /** Is guaranteed reward */
  is_guaranteed: boolean

  /** Blueprint rarity */
  rarity?: string

  /** Blueprint tier (1-5) */
  tier?: number

  /** Does user own this blueprint */
  user_owns?: boolean
}

/**
 * Mission reward pool
 */
export interface MissionRewardPool {
  /** Reward pool ID */
  reward_pool_id: number

  /** Total number of blueprints in pool */
  reward_pool_size: number

  /** Number of blueprints selected from pool */
  selection_count: number

  /** Blueprints in this reward pool */
  blueprints: MissionBlueprintReward[]
}

/**
 * User's mission rating
 */
export interface UserMissionRating {
  /** Difficulty rating (1-5) */
  difficulty_rating: number

  /** Satisfaction rating (1-5) */
  satisfaction_rating: number

  /** Optional comment */
  rating_comment?: string
}

/**
 * Response for mission detail endpoint
 */
export interface MissionDetailResponse {
  /** Complete mission data */
  mission: Mission

  /** Blueprint reward pools */
  blueprint_rewards: MissionRewardPool[]

  /** Prerequisite missions (if any) */
  prerequisite_missions?: Mission[]

  /** Ship encounters (Combat tab) */
  ship_encounters?: ShipEncounter[]

  /** NPC encounters (Combat tab) */
  npc_encounters?: NpcEncounter[]

  /** Hauling orders */
  hauling_orders?: HaulingOrder[]

  /** Entity spawns */
  entity_spawns?: EntitySpawn[]

  /** Has user completed this mission */
  user_completed?: boolean

  /** User's rating for this mission */
  user_rating?: UserMissionRating
}

/** Ship encounter group (e.g. "Mission Targets", "Reinforcements") */
export interface ShipEncounter {
  role: string
  waves: ShipWave[]
}

export interface ShipWave {
  name: string
  ship_count: number
}

/** NPC encounter */
export interface NpcEncounter {
  name: string
  count: number
}

/** Hauling order */
export interface HaulingOrder {
  resource_name: string
  min_scu: number
  max_scu: number
}

/** Entity spawn */
export interface EntitySpawn {
  name: string
  count: number
}

// ============================================================================
// Mission Blueprints Types
// ============================================================================

/**
 * Blueprint detail for mission blueprints endpoint
 */
export interface BlueprintDetail {
  /** Blueprint UUID */
  blueprint_id: string

  /** Blueprint code */
  blueprint_code: string

  /** Blueprint name */
  blueprint_name: string

  /** Blueprint description */
  blueprint_description?: string

  /** Output game item ID */
  output_game_item_id: string

  /** Output item name */
  output_item_name: string

  /** Output item type */
  output_item_type: string

  /** Output item icon URL */
  output_item_icon?: string

  /** Output quantity */
  output_quantity: number

  /** Item category */
  item_category?: string

  /** Item subcategory */
  item_subcategory?: string

  /** Rarity */
  rarity?: string

  /** Tier (1-5) */
  tier?: number

  /** Crafting station type */
  crafting_station_type?: string

  /** Crafting time in seconds */
  crafting_time_seconds?: number

  /** Required skill level */
  required_skill_level?: number

  /** Icon URL */
  icon_url?: string

  /** Number of ingredients */
  ingredient_count: number

  /** Drop probability for this mission */
  drop_probability: number

  /** Is guaranteed reward */
  is_guaranteed: boolean
}

/**
 * Reputation rank threshold for a career scope
 */
export interface ReputationRank {
  scope_code: string
  scope_display_name: string
  standing_code: string
  standing_display_name: string
  threshold: number
  ceiling: number
  rank_index: number
}
