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
    /**
     * Already-imported items renamed, by name source transition, e.g.
     * { "key_derived->derived": 26, "key_derived->cig": 38 }
     */
    itemRenamesBySource: { [transition: string]: number }
    /** Item names not given because another item has the name (each listed in errors; retried next import) */
    itemNameConflicts: number
    fullSetsCreated: number
    missionsProcessed: number
    missionsInserted: number
    missionsUpdated: number
    blueprintsProcessed: number
    blueprintsInserted: number
    blueprintsUpdated: number
    /** Ship records in the game data */
    shipsProcessed: number
    /** New game_items rows created for ships */
    shipsInserted: number
    /** Ships written to the ship wiki */
    shipsImported: number
    /** Ships rejected by validation or the database; each one is listed in errors */
    shipsFailed: number
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
