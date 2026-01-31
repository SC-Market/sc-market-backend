#!/usr/bin/env tsx

/**
 * Component Attributes Import Script
 * 
 * This script imports component attribute data from external sources:
 * - CStone API (cstone.space) - provides parsed data from descriptions
 * - UEX Corp Space API - provides structured data
 * 
 * After importing, it refreshes the materialized view to make the data
 * available for market search queries.
 * 
 * Usage:
 *   tsx scripts/import-component-attributes.ts
 * 
 * Requirements: 7.1, 7.2, 7.5
 */

import logger from "../src/logger/logger.js"
import { getKnex } from "../src/clients/database/knex-db.js"
import {
  importFromCStone,
  importFromUEX,
} from "../src/services/game-items/game-item-import.service.js"

/**
 * Main import function
 * Orchestrates the import process from both data sources
 */
async function main(): Promise<void> {
  const startTime = Date.now()

  logger.info("Starting component attributes import", {
    timestamp: new Date().toISOString(),
  })

  try {
    // Import from CStone (parsed data + fill gaps)
    logger.info("Step 1/3: Importing from CStone API...")
    const cstoneStats = await importFromCStone()
    logger.info("CStone import completed", {
      stats: cstoneStats,
      duration: `${Date.now() - startTime}ms`,
    })

    // Import from UEX (structured data)
    logger.info("Step 2/3: Importing from UEX Corp Space API...")
    const uexStats = await importFromUEX()
    logger.info("UEX import completed", {
      stats: uexStats,
      duration: `${Date.now() - startTime}ms`,
    })

    // Refresh materialized view
    logger.info("Step 3/3: Refreshing materialized view...")
    const knex = getKnex()
    await knex.raw("REFRESH MATERIALIZED VIEW CONCURRENTLY market_search_materialized")
    logger.info("Materialized view refreshed successfully")

    // Summary
    const totalDuration = Date.now() - startTime
    logger.info("Component attributes import completed successfully", {
      cstoneStats,
      uexStats,
      totalDuration: `${totalDuration}ms`,
      timestamp: new Date().toISOString(),
    })

    console.log("\n=== Import Summary ===")
    console.log(`CStone: ${cstoneStats.successfulUpdates} successful, ${cstoneStats.failedUpdates} failed, ${cstoneStats.skipped} skipped`)
    console.log(`UEX: ${uexStats.successfulUpdates} successful, ${uexStats.failedUpdates} failed, ${uexStats.skipped} skipped`)
    console.log(`Total duration: ${totalDuration}ms`)
    console.log("=====================\n")

    // Exit successfully
    process.exit(0)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined

    logger.error("Component attributes import failed", {
      error: errorMessage,
      stack: errorStack,
      duration: `${Date.now() - startTime}ms`,
    })

    console.error("\n=== Import Failed ===")
    console.error(`Error: ${errorMessage}`)
    if (errorStack) {
      console.error(`Stack: ${errorStack}`)
    }
    console.error("=====================\n")

    // Exit with error code
    process.exit(1)
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection in import script", {
    reason,
    promise,
  })
  console.error("Unhandled promise rejection:", reason)
  process.exit(1)
})

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception in import script", {
    error: error.message,
    stack: error.stack,
  })
  console.error("Uncaught exception:", error)
  process.exit(1)
})

// Run the main function
main()
