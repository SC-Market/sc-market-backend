#!/usr/bin/env ts-node
/**
 * Script to import attributes for all existing game items
 * This script triggers the attribute import service for each game item in the database
 * 
 * Usage:
 *   npm run import-attributes
 *   or
 *   ts-node scripts/import-all-attributes.ts
 */

import { database } from "../src/clients/database/knex-db.js"
import { AttributeImportService } from "../src/services/attribute-import/attribute-import.service.js"
import logger from "../src/logger/logger.js"

interface GameItem {
  id: string
  name: string
  item_type: string
}

async function importAllAttributes() {
  logger.info("Starting bulk attribute import for all game items")

  try {
    // Fetch all game items from the database
    const gameItems = await database.knex<GameItem>("game_items")
      .select("id", "name", "item_type")
      .orderBy("name")

    logger.info(`Found ${gameItems.length} game items to process`)

    if (gameItems.length === 0) {
      logger.warn("No game items found in database")
      return
    }

    // Initialize the import service
    const importService = new AttributeImportService()

    // Track statistics
    let successCount = 0
    let failureCount = 0
    let totalAttributesImported = 0
    const failedItems: Array<{ id: string; name: string; errors: string[] }> = []

    // Process each game item
    for (let i = 0; i < gameItems.length; i++) {
      const item = gameItems[i]
      const progress = `[${i + 1}/${gameItems.length}]`

      logger.info(`${progress} Processing: ${item.name} (${item.item_type})`, {
        gameItemId: item.id,
      })

      try {
        const result = await importService.importAttributesForItem(item.id)

        if (result.success) {
          successCount++
          totalAttributesImported += result.attributesImported

          if (result.attributesImported > 0) {
            logger.info(
              `${progress} ✓ Imported ${result.attributesImported} attributes for: ${item.name}`,
            )
          } else {
            logger.debug(
              `${progress} ○ No attributes found for: ${item.name}`,
            )
          }
        } else {
          failureCount++
          failedItems.push({
            id: item.id,
            name: item.name,
            errors: result.errors,
          })

          logger.warn(
            `${progress} ✗ Failed to import attributes for: ${item.name}`,
            {
              errors: result.errors,
            },
          )
        }
      } catch (error) {
        failureCount++
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error"

        failedItems.push({
          id: item.id,
          name: item.name,
          errors: [errorMessage],
        })

        logger.error(
          `${progress} ✗ Exception while importing: ${item.name}`,
          {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
          },
        )
      }

      // Add a small delay to avoid overwhelming external APIs
      if (i < gameItems.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    // Refresh the materialized view after all imports
    logger.info("Refreshing market search materialized view...")
    try {
      await importService.refreshMaterializedView()
      logger.info("✓ Materialized view refreshed successfully")
    } catch (error) {
      logger.error("✗ Failed to refresh materialized view", {
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }

    // Print summary
    logger.info("=" .repeat(60))
    logger.info("Attribute Import Summary")
    logger.info("=" .repeat(60))
    logger.info(`Total game items processed: ${gameItems.length}`)
    logger.info(`Successful imports: ${successCount}`)
    logger.info(`Failed imports: ${failureCount}`)
    logger.info(`Total attributes imported: ${totalAttributesImported}`)
    logger.info(
      `Average attributes per item: ${(totalAttributesImported / successCount || 0).toFixed(2)}`,
    )

    if (failedItems.length > 0) {
      logger.info("=" .repeat(60))
      logger.info("Failed Items:")
      failedItems.forEach((item) => {
        logger.info(`  - ${item.name} (${item.id})`)
        item.errors.forEach((error) => {
          logger.info(`    Error: ${error}`)
        })
      })
    }

    logger.info("=" .repeat(60))
    logger.info("Bulk attribute import completed")
  } catch (error) {
    logger.error("Fatal error during bulk import", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  } finally {
    // Close database connection
    await database.knex.destroy()
  }
}

// Run the import if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importAllAttributes()
    .then(() => {
      logger.info("Script completed successfully")
      process.exit(0)
    })
    .catch((error) => {
      logger.error("Script failed", { error })
      process.exit(1)
    })
}

export { importAllAttributes }
