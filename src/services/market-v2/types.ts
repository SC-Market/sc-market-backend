/**
 * Market V2 Types and Interfaces
 *
 * Defines the data structures for the V2 market system with variant support.
 */

/**
 * Database representation of a variant type
 */
export interface DBVariantType {
  variant_type_id: string
  name: string
  display_name: string
  description: string | null
  affects_pricing: boolean
  searchable: boolean
  filterable: boolean
  value_type: "integer" | "decimal" | "string" | "enum"
  min_value: number | null
  max_value: number | null
  allowed_values: string[] | null
  display_order: number
  icon: string | null
  created_at: Date
}

/**
 * Database representation of an item variant
 */
export interface DBItemVariant {
  variant_id: string
  game_item_id: string
  attributes: Record<string, any>
  attributes_hash: string
  display_name: string | null
  short_name: string | null
  base_price_modifier: number | null
  fixed_price_override: number | null
  created_at: Date
}

/**
 * Variant attributes (flexible structure)
 */
export interface VariantAttributes {
  quality_tier?: number
  quality_value?: number
  crafted_source?: "crafted" | "store" | "looted" | "unknown"
  blueprint_tier?: number
  [key: string]: any // Allow additional attributes
}

/**
 * Input for creating or finding a variant
 */
export interface GetOrCreateVariantInput {
  game_item_id: string
  attributes: VariantAttributes
}

/**
 * Validation error details
 */
export interface ValidationError {
  attribute: string
  value: any
  message: string
  expected?: {
    type?: string
    min?: number
    max?: number
    allowed_values?: string[]
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}
