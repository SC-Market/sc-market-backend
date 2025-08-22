import { database } from "../clients/database/knex-db.js"
import { DBMarketItem } from "../clients/database/db-models.js"
import knex from "knex"
import logger from "../logger/logger.js"

interface CommodityResponse {
  status: string
  http_code: number
  data: CommodityData[]
}

interface CommodityData {
  id: number
  id_parent: number
  name: string
  code: string
  kind: string
  weight_scu: number
  price_buy: number
  price_sell: number
  is_available: number
  is_available_live: number
  is_visible: number
  is_extractable: number
  is_mineral: number
  is_raw: number
  is_refined: number
  is_refinable: number
  is_harvestable: number
  is_buyable: number
  is_sellable: number
  is_temporary: number
  is_illegal: number
  is_volatile_qt: number
  is_volatile_time: number
  is_inert: number
  is_explosive: number
  is_fuel: number
  is_buggy: number
  wiki: string
  date_added: number
  date_modified: number
}

const UEX_COMMODITIES_ENDPOINT = "https://api.uexcorp.space/2.0/commodities"

async function fetchCommodities(): Promise<CommodityResponse> {
  logger.debug("Starting commodity fetch", {
    endpoint: UEX_COMMODITIES_ENDPOINT,
    timestamp: new Date().toISOString(),
  })

  let response: Response
  try {
    response = await fetch(UEX_COMMODITIES_ENDPOINT)
    logger.debug("Fetch request completed", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        server: response.headers.get("server"),
        date: response.headers.get("date"),
      },
    })
  } catch (error) {
    logger.error("Network error during commodity fetch", {
      endpoint: UEX_COMMODITIES_ENDPOINT,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  if (!response.ok) {
    const errorDetails = {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
    }

    // Try to get response body for more details
    let responseBody: string | undefined
    try {
      responseBody = await response.text()
      logger.error("HTTP error response body", {
        ...errorDetails,
        responseBody: responseBody.substring(0, 1000), // Limit to first 1000 chars
      })
    } catch (bodyError) {
      logger.error("Failed to read error response body", {
        ...errorDetails,
        bodyError: bodyError instanceof Error ? bodyError.message : "Unknown error",
      })
    }

    throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`)
  }

  let data: CommodityResponse
  try {
    const responseText = await response.text()
    logger.debug("Response received", {
      contentLength: responseText.length,
      contentPreview: responseText.substring(0, 200), // First 200 chars for debugging
    })

    data = JSON.parse(responseText) as CommodityResponse
    logger.debug("JSON parsing successful", {
      status: data.status,
      httpCode: data.http_code,
      dataLength: data.data?.length || 0,
      hasValidStructure: !!(data.status && data.http_code && Array.isArray(data.data)),
    })
  } catch (error) {
    logger.error("Failed to parse JSON response", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  // Validate the response structure
  if (!data.data || !Array.isArray(data.data)) {
    logger.error("Invalid response structure", {
      hasData: !!data.data,
      dataType: typeof data.data,
      isArray: Array.isArray(data.data),
      responseKeys: Object.keys(data),
    })
    throw new Error("Invalid response structure: missing or invalid data array")
  }

  logger.debug("Commodity fetch completed successfully", {
    totalCommodities: data.data.length,
    responseStatus: data.status,
    httpCode: data.http_code,
  })

  return data
}

/**
 * Inserts a new commodity item into the database using data fetched from UEX API
 * @param commodityData The commodity data to insert
 * @returns The ID of the newly inserted item, null if insertion fails or item already exists
 */
export async function insertNewCommodity(
  commodityData: CommodityData,
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
          description: `${commodityData.name} (${commodityData.code}) - ${commodityData.kind} commodity`,
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
          description: `${commodityData.name} (${commodityData.code}) - ${commodityData.kind} commodity`,
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
        }
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
  
  let commodities: CommodityResponse | undefined
  try {
    commodities = await fetchCommodities()
  } catch (error: any) {
    logger.error("Failed to fetch commodities", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: UEX_COMMODITIES_ENDPOINT,
    })
    commodities = undefined
  }

  if (!commodities) {
    logger.error("Unable to fetch commodities. No items will be inserted.", {
      reason: "Commodity fetch returned undefined",
    })
    return
  }

  logger.debug(`Fetched ${commodities.data.length} commodities. Processing...`, {
    totalCommodities: commodities.data.length,
    responseStatus: commodities.status,
    httpCode: commodities.http_code,
  })

  // Track success and failure counts
  let successCount = 0
  let skipCount = 0
  let failureCount = 0

  // Process each commodity
  for (const commodity of commodities.data) {
    logger.debug("Processing commodity", {
      name: commodity.name,
      code: commodity.code,
      kind: commodity.kind,
      id: commodity.id,
    })

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
      logger.debug("Skipped existing commodity", {
        name: commodity.name,
        reason: "Already exists in database",
      })
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
      totalFetched: commodities.data.length,
    }
  )
}
