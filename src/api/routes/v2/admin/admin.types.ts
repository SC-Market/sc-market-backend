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
    missionsProcessed: number
    missionsInserted: number
    missionsUpdated: number
    blueprintsProcessed: number
    blueprintsInserted: number
    blueprintsUpdated: number
    /** In-game shops upserted from shop-inventories.json (0 unless GAME_DATA_IMPORT_SHOPS=true) */
    shopsImported: number
    shopItemsImported: number
    /** Shop inventory rows matched to a game item */
    shopItemsLinked: number
    /** Shops no longer in the game data, deleted */
    shopsRemoved: number
    /** Shop inventory rows no longer in the game data, deleted */
    shopItemsRemoved: number
  }
  /** Warnings from the import steps (skipped records, steps not run) */
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
