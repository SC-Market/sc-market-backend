#!/usr/bin/env ts-node
/**
 * Script to refresh the market_search_materialized view
 * This should be run after bulk updates to game_item_attributes or market listings
 *
 * Usage:
 *   npm run refresh-view
 *   or
 *   ts-node scripts/refresh-materialized-view.ts
 */

import { database } from "../src/clients/database/knex-db.js"
import logger from "../src/logger/logger.js"

async function refreshMaterializedView() {
  logger.info("Starting materialized view refresh")

  try {
    const startTime = Date.now()

    // Refresh the materialized view
    await database.knex.raw(
      "REFRESH MATERIALIZED VIEW market_search_materialized",
    )

    const duration = Date.now() - startTime

    logger.info("✓ Successfully refreshed market_search_materialized view", {
      durationMs: duration,
      durationSeconds: (duration / 1000).toFixed(2),
    })

    // Verify the view has data
    const result = await database
      .knex("market_search_materialized")
      .count("* as count")
      .first()

    const count = result?.count || 0

    logger.info("Materialized view statistics", {
      totalRows: count,
    })

    // Check if game_item_id column is populated
    const gameItemIdCount = await database
      .knex("market_search_materialized")
      .whereNotNull("game_item_id")
      .count("* as count")
      .first()

    const gameItemIdPopulated = gameItemIdCount?.count || 0

    logger.info("Game item ID column statistics", {
      rowsWithGameItemId: gameItemIdPopulated,
      percentagePopulated:
        Number(count) > 0
          ? ((Number(gameItemIdPopulated) / Number(count)) * 100).toFixed(2) +
            "%"
          : "0%",
    })

    if (Number(gameItemIdPopulated) === 0 && Number(count) > 0) {
      logger.warn("⚠ Warning: game_item_id column is not populated in any rows")
      logger.warn(
        "This may indicate an issue with the market_search_complete view",
      )
    }

    logger.info("=".repeat(60))
    logger.info("Materialized view refresh completed successfully")
    logger.info("=".repeat(60))
  } catch (error) {
    logger.error("✗ Failed to refresh materialized view", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  } finally {
    // Close database connection
    await database.knex.destroy()
  }
}

// Run the refresh if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshMaterializedView()
    .then(() => {
      logger.info("Script completed successfully")
      process.exit(0)
    })
    .catch((error) => {
      logger.error("Script failed", { error })
      process.exit(1)
    })
}

export { refreshMaterializedView }
