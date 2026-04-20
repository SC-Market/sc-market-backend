/**
 * Admin API Types
 *
 * Type definitions for admin endpoints including game data import.
 */

/**
 * Import summary returned by game data import endpoint
 */
export interface ImportGameDataResponse {
  success: boolean
  summary: {
    totalP4KItems: number
    validP4KItems: number
    existingDBItems: number
    matched: number
    matchedExact: number
    matchedCStoneUUID: number
    matchedFuzzy: number
    inserted: number
    updated: number
    nameChanges: number
    fullSetsCreated: number
  }
  errors: string[]
  timestamp: string
}

/**
 * Error response for import failures
 */
export interface ImportErrorResponse {
  success: false
  error: string
  details?: string
  timestamp: string
}
