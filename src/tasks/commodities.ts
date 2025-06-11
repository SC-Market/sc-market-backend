import { database } from "../clients/database/knex-db.js"
import { DBMarketItem } from "../clients/database/db-models.js"
import knex from "knex"

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
  const response = await fetch(UEX_COMMODITIES_ENDPOINT)

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data: CommodityResponse = await response.json()
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

      console.log(
        `Successfully inserted new commodity: ${commodityData.name} (ID: ${gameItemId.id})`,
      )
      return gameItemId.id
    } catch (error) {
      // Rollback the transaction on error
      await trx.rollback()
      console.error(
        "Failed to insert new commodity:",
        error instanceof Error ? error.message : "Unknown error",
      )
      return null
    }
  } catch (error) {
    console.error(
      "Transaction error:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return null
  }
}

/**
 * Fetches commodity data from UEX API and inserts new commodities into the database
 */
export async function fetchAndInsertCommodities(): Promise<void> {
  const commodities = await fetchCommodities()

  if (!commodities) {
    console.log("Unable to fetch commodities. No items will be inserted.")
    return
  }

  console.log(`Fetched ${commodities.data.length} commodities. Processing...`)

  // Track success and failure counts
  let successCount = 0
  let skipCount = 0
  let failureCount = 0

  // Process each commodity
  for (const commodity of commodities.data) {
    // Insert the new commodity (checking for existence is handled inside insertNewCommodity)
    const id = await insertNewCommodity(commodity)

    if (id) {
      successCount++
    } else if (id === null) {
      skipCount++
    } else {
      failureCount++
    }
  }

  console.log(
    `Commodity insertion complete. Successful: ${successCount}, Skipped: ${skipCount}, Failed: ${failureCount}`,
  )
}
