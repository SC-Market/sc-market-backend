/**
 * TypeScript interfaces for Market V2 Variant Types API
 * 
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 * 
 * Requirements: 4.4, 4.5
 */

// ============================================================================
// Variant Types Response Types
// ============================================================================

/**
 * Variant type definition with validation rules
 */
export interface VariantType {
  /** Unique identifier for the variant type */
  variant_type_id: string;
  
  /** Internal name (e.g., 'quality_tier', 'quality_value') */
  name: string;
  
  /** Display name for UI (e.g., 'Quality Tier', 'Quality Value') */
  display_name: string;
  
  /** Description of the variant type */
  description?: string;
  
  /** Whether this attribute affects pricing */
  affects_pricing: boolean;
  
  /** Whether this attribute is searchable */
  searchable: boolean;
  
  /** Whether this attribute is filterable */
  filterable: boolean;
  
  /** Data type of the value ('integer', 'decimal', 'string', 'enum') */
  value_type: 'integer' | 'decimal' | 'string' | 'enum';
  
  /** Minimum allowed value (for numeric types) */
  min_value?: number;
  
  /** Maximum allowed value (for numeric types) */
  max_value?: number;
  
  /** Allowed values (for enum types) */
  allowed_values?: string[];
  
  /** Display order for UI presentation */
  display_order: number;
  
  /** Optional icon identifier */
  icon?: string;
  
  /** Creation timestamp */
  created_at: string;
}

/**
 * Response for GET /api/v2/variant-types endpoint
 */
export interface GetVariantTypesResponse {
  /** Array of variant type definitions */
  variant_types: VariantType[];
  
  /** Total count of variant types */
  total: number;
}
