/**
 * TypeScript interfaces for Game Data Crafting API
 *
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 *
 * Requirements: 20.1-20.6, 21.1-21.6, 31.1-31.6, 45.1-45.10, 51.1-51.10, 52.1-52.10
 */

// ============================================================================
// Quality Calculation Types
// ============================================================================

/**
 * Input material for crafting calculation
 */
export interface CraftingInputMaterial {
  /** Game item UUID */
  game_item_id: string

  /** Quantity of material */
  quantity: number

  /** Quality tier (1-5) */
  quality_tier: number

  /** Precise quality value (0-100) */
  quality_value: number
}

/**
 * Request for quality calculation endpoint
 */
export interface CalculateQualityRequest {
  /** Blueprint UUID */
  blueprint_id: string

  /** Input materials with quality values */
  input_materials: CraftingInputMaterial[]
}

/**
 * Quality contribution breakdown for a single material
 */
export interface QualityContribution {
  /** Material name */
  material_name: string

  /** Quality tier (1-5) */
  quality_tier: number

  /** Quality value (0-100) */
  quality_value: number

  /** Weight in calculation */
  weight: number

  /** Contribution to final quality */
  contribution: number
}

/**
 * Response for quality calculation endpoint
 */
export interface CalculateQualityResponse {
  /** Output quality tier (1-5) */
  output_quality_tier: number

  /** Output quality value (0-100) */
  output_quality_value: number

  /** Output quantity */
  output_quantity: number

  /** Calculation breakdown */
  calculation_breakdown: {
    /** Formula type used (weighted_average, minimum, maximum) */
    formula_used: string

    /** Input weights per material */
    input_weights: Record<string, number>

    /** Quality contributions per material */
    quality_contributions: QualityContribution[]
  }

  /** Estimated costs */
  estimated_cost: {
    /** Total material cost */
    material_cost: number

    /** Crafting station fee */
    crafting_station_fee?: number

    /** Total cost */
    total_cost: number
  }

  /** Success probability percentage (0-100) */
  success_probability: number

  /** Critical success chance percentage (0-100) */
  critical_success_chance: number
}

// ============================================================================
// Crafting Simulation Types
// ============================================================================

/**
 * Material variation for simulation
 */
export interface MaterialVariation {
  /** Game item UUID */
  game_item_id: string

  /** Quantity of material */
  quantity: number

  /** Quality tier options to test */
  quality_tiers: number[]
}

/**
 * Request for crafting simulation endpoint
 */
export interface SimulateCraftingRequest {
  /** Blueprint UUID */
  blueprint_id: string

  /** Material variations to test */
  material_variations: MaterialVariation[]
}

/**
 * Single simulation result
 */
export interface SimulationResult {
  /** Material configuration used */
  material_configuration: CraftingInputMaterial[]

  /** Output quality tier */
  output_quality_tier: number

  /** Output quality value */
  output_quality_value: number

  /** Estimated total cost */
  estimated_cost: number
}

/**
 * Response for crafting simulation endpoint
 */
export interface SimulateCraftingResponse {
  /** Blueprint UUID */
  blueprint_id: string

  /** Blueprint name */
  blueprint_name: string

  /** All simulation results */
  simulation_results: SimulationResult[]

  /** Best result (highest quality) */
  best_result: SimulationResult

  /** Worst result (lowest quality) */
  worst_result: SimulationResult

  /** Most cost-effective result */
  most_cost_effective: SimulationResult
}

// ============================================================================
// Crafting Session Types
// ============================================================================

/**
 * Request to record a crafting session
 */
export interface RecordCraftingRequest {
  /** Blueprint UUID */
  blueprint_id: string

  /** Input materials used */
  input_materials: CraftingInputMaterial[]

  /** Output quality tier achieved */
  output_quality_tier: number

  /** Output quality value achieved */
  output_quality_value: number

  /** Output quantity produced */
  output_quantity: number

  /** Was critical success */
  was_critical_success: boolean

  /** Total material cost */
  total_material_cost?: number

  /** Crafting station fee */
  crafting_station_fee?: number
}

/**
 * Response for recording crafting session
 */
export interface RecordCraftingResponse {
  /** Success status */
  success: boolean

  /** Crafting session UUID */
  session_id: string
}

// ============================================================================
// Crafting History Types
// ============================================================================

/**
 * Crafting session history item
 */
export interface CraftingSessionHistory {
  /** Session UUID */
  session_id: string

  /** Blueprint UUID */
  blueprint_id: string

  /** Blueprint name */
  blueprint_name: string

  /** Output item name */
  output_item_name: string

  /** Crafting date */
  crafting_date: string

  /** Input materials used */
  input_materials: CraftingInputMaterial[]

  /** Output quality tier */
  output_quality_tier: number

  /** Output quality value */
  output_quality_value: number

  /** Output quantity */
  output_quantity: number

  /** Was critical success */
  was_critical_success: boolean

  /** Total material cost */
  total_material_cost?: number

  /** Crafting station fee */
  crafting_station_fee?: number
}

/**
 * Response for crafting history endpoint
 */
export interface GetCraftingHistoryResponse {
  /** Crafting sessions */
  history: CraftingSessionHistory[]

  /** Total number of sessions */
  total: number

  /** Current page */
  page: number

  /** Page size */
  page_size: number
}

// ============================================================================
// Crafting Statistics Types
// ============================================================================

/**
 * Statistics for a specific blueprint
 */
export interface BlueprintStatistics {
  /** Blueprint UUID */
  blueprint_id: string

  /** Blueprint name */
  blueprint_name: string

  /** Total crafts */
  total_crafts: number

  /** Average output quality */
  average_quality: number

  /** Success rate percentage */
  success_rate: number

  /** Critical success count */
  critical_successes: number

  /** Total materials spent */
  total_materials_cost: number
}

/**
 * Response for crafting statistics endpoint
 */
export interface GetCraftingStatisticsResponse {
  /** Total crafting sessions */
  total_sessions: number

  /** Total unique blueprints crafted */
  unique_blueprints_crafted: number

  /** Average output quality across all crafts */
  average_output_quality: number

  /** Total critical successes */
  total_critical_successes: number

  /** Critical success rate percentage */
  critical_success_rate: number

  /** Total materials cost */
  total_materials_cost: number

  /** Statistics per blueprint */
  blueprint_statistics: BlueprintStatistics[]
}
