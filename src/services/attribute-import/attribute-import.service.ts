/**
 * Attribute Import Service
 * Orchestrates importing game item attributes from multiple external sources
 */

import logger from "../../logger/logger.js"
import { database } from "../../clients/database/knex-db.js"
import { upsertGameItemAttribute } from "../../api/routes/v1/attributes/database.js"
import {
  AttributeImporter,
  AttributeRecord,
} from "./attribute-import.types.js"
import { CStoneImporter } from "./cstone-importer.js"
import { UEXCorpImporter } from "./uexcorp-importer.js"

/**
 * Result of an import operation for a single game item
 */
export interface ImportResult {
  gameItemId: string
  success: boolean
  attributesImported: number
  errors: string[]
}

/**
 * Service for importing game item attributes from external data sources
 */
export class AttributeImportService {
  private importers: AttributeImporter[]

  constructor(importers?: AttributeImporter[]) {
    // Default to all available importers if none provided
    this.importers = importers || [new CStoneImporter(), new UEXCorpImporter()]
  }

  /**
   * Import attributes for a single game item from all configured sources
   * @param gameItemId - The game item UUID to import attributes for
   * @returns Import result with success status and error details
   */
  async importAttributesForItem(gameItemId: string, dryRun = false): Promise<ImportResult> {
    logger.info("Starting attribute import for game item", {
      gameItemId,
      importerCount: this.importers.length,
      dryRun,
    })

    const result: ImportResult = {
      gameItemId,
      success: true,
      attributesImported: 0,
      errors: [],
    }

    // Try each importer in sequence
    for (const importer of this.importers) {
      try {
        logger.debug("Attempting import from source", {
          gameItemId,
          source: importer.source,
          dryRun,
        })

        // Fetch attributes from external source
        const externalData = await importer.fetchItemAttributes(gameItemId)

        // Map to internal schema
        const records = importer.mapToInternalSchema(externalData)

        // Set the game_item_id for each record
        const recordsWithId = records.map((record) => ({
          ...record,
          game_item_id: gameItemId,
        }))

        if (dryRun) {
          // In dry run mode, just count what would be imported
          result.attributesImported += recordsWithId.length
          logger.info("[DRY RUN] Would import attributes from source", {
            gameItemId,
            source: importer.source,
            attributesCount: recordsWithId.length,
            attributes: recordsWithId,
          })
        } else {
          // Upsert attributes into database
          const importedCount = await this.upsertAttributes(
            gameItemId,
            recordsWithId,
          )

          result.attributesImported += importedCount

          logger.info("Successfully imported attributes from source", {
            gameItemId,
            source: importer.source,
            attributesImported: importedCount,
          })
        }
      } catch (error) {
        const errorMessage = `Failed to import from ${importer.source}: ${error instanceof Error ? error.message : "Unknown error"}`

        logger.warn("Import failed for source, continuing with next", {
          gameItemId,
          source: importer.source,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        })

        result.errors.push(errorMessage)
        // Continue with next importer - don't fail the entire import
      }
    }

    // Mark as failed if no attributes were imported and there were errors
    if (result.attributesImported === 0 && result.errors.length > 0) {
      result.success = false
    }

    logger.info("Completed attribute import for game item", {
      gameItemId,
      success: result.success,
      totalAttributesImported: result.attributesImported,
      errorCount: result.errors.length,
      dryRun,
    })

    return result
  }

  /**
   * Import attributes for multiple game items
   * @param gameItemIds - Array of game item UUIDs
   * @returns Array of import results
   */
  async importAttributesForItems(
    gameItemIds: string[],
  ): Promise<ImportResult[]> {
    logger.info("Starting batch attribute import", {
      itemCount: gameItemIds.length,
    })

    const results: ImportResult[] = []

    for (const gameItemId of gameItemIds) {
      const result = await this.importAttributesForItem(gameItemId)
      results.push(result)
    }

    const successCount = results.filter((r) => r.success).length
    const totalAttributesImported = results.reduce(
      (sum, r) => sum + r.attributesImported,
      0,
    )

    logger.info("Completed batch attribute import", {
      totalItems: gameItemIds.length,
      successfulItems: successCount,
      failedItems: gameItemIds.length - successCount,
      totalAttributesImported,
    })

    return results
  }

  /**
   * Upsert attribute records into the database
   * Handles errors gracefully and continues with remaining attributes
   */
  private async upsertAttributes(
    gameItemId: string,
    records: AttributeRecord[],
  ): Promise<number> {
    let successCount = 0

    for (const record of records) {
      try {
        await upsertGameItemAttribute(gameItemId, {
          attribute_name: record.attribute_name,
          attribute_value: record.attribute_value,
        })
        successCount++
      } catch (error) {
        logger.error("Failed to upsert attribute", {
          gameItemId,
          attributeName: record.attribute_name,
          attributeValue: record.attribute_value,
          error: error instanceof Error ? error.message : "Unknown error",
        })
        // Continue with next attribute
      }
    }

    return successCount
  }

  /**
   * Refresh the market search materialized view after import
   * This ensures imported attributes are available in search results
   */
  async refreshMaterializedView(): Promise<void> {
    logger.info("Refreshing market search materialized view")

    try {
      await database.knex.raw("REFRESH MATERIALIZED VIEW market_search_materialized")

      logger.info("Successfully refreshed materialized view")
    } catch (error) {
      logger.error("Failed to refresh materialized view", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }
}
