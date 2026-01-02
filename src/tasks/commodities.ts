import { database } from "../clients/database/knex-db.js"
import { DBMarketItem } from "../clients/database/db-models.js"
import knex from "knex"
import logger from "../logger/logger.js"
import { fetchCommodities } from "../services/uex/uex.service.js"
import { UEXCommodity } from "../services/uex/uex.service.types.js"

/**
 * Inserts a new commodity item into the database using data fetched from UEX API
 * @param commodityData The commodity data to insert
 * @returns The ID of the newly inserted item, null if insertion fails or item already exists
 */
export async function insertNewCommodity(
  commodityData: UEXCommodity,
): Promise<string | null> {
  try {
    // Check if the commodity already exists before starting a transaction
    const existingItem = await database
      .knex("game_items")
      .where("name", commodityData.name)
      .first()

    if (existingItem) {
      return null
    }

    // Start a transaction to ensure data consistency
    const trx = await database.knex.transaction()

    try {
      // Insert into game_items first
      const [gameItemId] = await trx("game_items")
        .insert({
          name: commodityData.name,
          image_url: null,
          type: "Commodity",
          description: `${commodityData.name} (${commodityData.code}) - ${commodityData.kind || "commodity"}`,
        })
        .returning<[{ id: string }]>("id")
        .onConflict(["name"]) // Handle potential race conditions
        .ignore()

      // If insert was ignored due to conflict, return null
      if (!gameItemId) {
        await trx.commit()
        return null
      }

      // Insert market_listing_details with reference to the game item
      const [detailsId] = await trx("market_listing_details")
        .insert({
          item_type: "Commodity",
          title: commodityData.name,
          description: `${commodityData.name} (${commodityData.code}) - ${commodityData.kind || "commodity"}`,
          game_item_id: gameItemId.id,
        })
        .returning<[{ details_id: string }]>("details_id")

      // Update the game_items record with the details_id
      await trx("game_items")
        .where("id", gameItemId.id)
        .update({ details_id: detailsId.details_id })

      // Commit the transaction
      await trx.commit()

      logger.debug(
        `Successfully inserted new commodity: ${commodityData.name} (ID: ${gameItemId.id})`,
        {
          commodityName: commodityData.name,
          commodityCode: commodityData.code,
          gameItemId: gameItemId.id,
          detailsId: detailsId.details_id,
        },
      )
      return gameItemId.id
    } catch (error) {
      // Rollback the transaction on error
      await trx.rollback()
      logger.error("Failed to insert new commodity", {
        commodityName: commodityData.name,
        commodityCode: commodityData.code,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      })
      return null
    }
  } catch (error) {
    logger.error("Transaction error during commodity insertion", {
      commodityName: commodityData.name,
      commodityCode: commodityData.code,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    return null
  }
}

/**
 * Fetches commodity data from UEX API and inserts new commodities into the database
 */
export async function fetchAndInsertCommodities(): Promise<void> {
  logger.debug("Starting fetchAndInsertCommodities process")

  let commodities: UEXCommodity[] | undefined
  try {
    commodities = await fetchCommodities()
  } catch (error: any) {
    logger.error("Failed to fetch commodities from UEX", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    commodities = undefined
  }

  if (!commodities) {
    logger.error("Unable to fetch commodities. No items will be inserted.", {
      reason: "Commodity fetch returned undefined",
    })
    return
  }

  logger.debug(`Fetched ${commodities.length} commodities. Processing...`, {
    totalCommodities: commodities.length,
  })

  // Track success and failure counts
  let successCount = 0
  let skipCount = 0
  let failureCount = 0

  // Process each commodity
  for (const commodity of commodities) {
    // Insert the new commodity (checking for existence is handled inside insertNewCommodity)
    const id = await insertNewCommodity(commodity)

    if (id) {
      successCount++
      logger.debug("Successfully inserted commodity", {
        name: commodity.name,
        insertedId: id,
      })
    } else if (id === null) {
      skipCount++
    } else {
      failureCount++
      logger.error("Failed to insert commodity", {
        name: commodity.name,
        code: commodity.code,
        reason: "Insert operation failed",
      })
    }
  }

  logger.debug(
    `Commodity insertion complete. Successful: ${successCount}, Skipped: ${skipCount}, Failed: ${failureCount}`,
    {
      successCount,
      skipCount,
      failureCount,
      totalProcessed: successCount + skipCount + failureCount,
      totalFetched: commodities.length,
    },
  )
}
