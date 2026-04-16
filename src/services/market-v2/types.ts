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

/**
 * Database representation of a listing item lot (stock lot)
 */
export interface DBListingItemLot {
  lot_id: string
  item_id: string
  variant_id: string
  quantity_total: number
  location_id: string | null
  owner_id: string | null
  listed: boolean
  notes: string | null
  crafted_by: string | null
  crafted_at: Date | null
  created_at: Date
  updated_at: Date
}

/**
 * Stock allocation record
 */
export interface StockAllocation {
  lot_id: string
  variant_id: string
  quantity_allocated: number
  allocated_at: Date
}

/**
 * Stock allocation result
 */
export interface StockAllocationResult {
  allocations: StockAllocation[]
  total_allocated: number
}

/**
 * Availability check result
 */
export interface AvailabilityCheckResult {
  available: boolean
  available_quantity: number
  variant_id: string
}

/**
 * Validation result for cart add operation
 */
export interface CartAddValidationResult {
  valid: boolean
  error_message?: string
  alternative_variants?: AlternativeVariant[]
}

/**
 * Alternative variant suggestion
 */
export interface AlternativeVariant {
  variant_id: string
  display_name: string
  quality_tier: number
  available_quantity: number
  price: number
}

/**
 * Validation result for order creation
 */
export interface OrderCreationValidationResult {
  valid: boolean
  item_errors: ItemValidationError[]
}

/**
 * Per-item validation error
 */
export interface ItemValidationError {
  item_id: string
  variant_id: string
  error_message: string
  requested_quantity: number
  available_quantity: number
}

/**
 * Cart checkout validation result
 */
export interface CartCheckoutValidationResult {
  valid_items: ValidCartItem[]
  removed_items: RemovedCartItem[]
  price_changes: CartItemPrice[]
}

/**
 * Valid cart item for checkout
 */
export interface ValidCartItem {
  cart_item_id: string
  item_id: string
  variant_id: string
  listing_id: string
  quantity: number
  price_per_unit: number
}

/**
 * Removed cart item (unavailable)
 */
export interface RemovedCartItem {
  cart_item_id: string
  item_id: string
  variant_id: string
  reason: string
}

/**
 * Cart item with price information
 */
export interface CartItemPrice {
  cart_item_id: string
  item_id: string
  variant_id: string
  listing_id: string
  price_per_unit: number
  price_updated_at: Date
  current_price: number
  is_stale: boolean
  percentage_change: number
}
