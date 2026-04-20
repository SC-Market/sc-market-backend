/**
 * TypeScript interfaces for Game Data Versions API
 *
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 *
 * Requirements: 13.1-13.6, 45.1-45.10
 */

// ============================================================================
// Game Version Types
// ============================================================================

/**
 * Game version data
 */
export interface GameVersion {
  /** Version UUID */
  version_id: string

  /** Version type (LIVE, PTU, EPTU) */
  version_type: "LIVE" | "PTU" | "EPTU"

  /** Version number (e.g., "4.7.0") */
  version_number: string

  /** Build number (e.g., "11592622") */
  build_number?: string

  /** Release date */
  release_date?: string

  /** Is this version currently active */
  is_active: boolean

  /** Last data update timestamp */
  last_data_update?: string

  /** Created timestamp */
  created_at: string

  /** Updated timestamp */
  updated_at: string
}

/**
 * Active versions response
 */
export interface ActiveVersionsResponse {
  /** Active LIVE version */
  LIVE?: GameVersion

  /** Active PTU version */
  PTU?: GameVersion

  /** Active EPTU version */
  EPTU?: GameVersion
}

/**
 * Select version request body
 */
export interface SelectVersionRequest {
  /** Version ID to select */
  version_id: string
}

/**
 * Select version response
 */
export interface SelectVersionResponse {
  /** Success status */
  success: boolean

  /** Selected version */
  version?: GameVersion
}
