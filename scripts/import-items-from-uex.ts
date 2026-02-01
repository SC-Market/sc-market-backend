/**
 * Import Game Items from UEXCorp
 * Fetches items from UEX API and adds new ones to game_items table
 */

import { database } from "../src/clients/database/knex-db.js"
import logger from "../src/logger/logger.js"

const UEXCORP_BASE_URL = "https://api.uexcorp.uk/2.0"

interface UEXItem {
  id: number
  name: string
  uuid: string | null
  size: string | null
  color: string | null
  company_name: string | null
  category: string | null
  section: string | null
  screenshot: string
}

async function importItemsFromUEX() {
  logger.info("Starting UEX item import")

  try {
    // Fetch all items from UEX
    const response = await fetch(`${UEXCORP_BASE_URL}/items`, {
      headers: { accept: "application/json" },
    })

    if (!response.ok) {
      throw new Error(`UEX API error: ${response.status}`)
    }

    const data = await response.json()

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid response from UEX API")
    }

    const uexItems: UEXItem[] = data.data

    logger.info(`Fetched ${uexItems.length} items from UEX`)

    // Get existing items from our database
    const existingItems = await database.knex("game_items")
      .select("name")
      .then((rows) => new Set(rows.map((r) => r.name.toLowerCase())))

    let imported = 0
    let skipped = 0

    for (const item of uexItems) {
      if (!item.name) {
        skipped++
        continue
      }

      // Skip if already exists (case-insensitive)
      if (existingItems.has(item.name.toLowerCase())) {
        skipped++
        continue
      }

      // Map UEX category/section to our item type
      const itemType = mapUEXCategoryToType(item.category, item.section)

      try {
        await database.knex("game_items").insert({
          name: item.name,
          type: itemType,
          description: `${item.section || ""} ${item.category || ""}`.trim() || null,
          image_url: item.screenshot || null,
          cstone_uuid: item.uuid || null,
        })

        imported++
        logger.debug(`Imported item: ${item.name}`)
      } catch (error) {
        logger.warn(`Failed to import item: ${item.name}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    logger.info("UEX item import completed", {
      total: uexItems.length,
      imported,
      skipped,
    })

    process.exit(0)
  } catch (error) {
    logger.error("Failed to import items from UEX", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

/**
 * Maps UEX category/section to our item type
 */
function mapUEXCategoryToType(
  category: string | null,
  section: string | null
): string | null {
  const cat = category?.toLowerCase()
  const sec = section?.toLowerCase()

  // Ship components
  if (sec?.includes("quantum") || cat?.includes("quantum")) return "Quantum Drive"
  if (sec?.includes("cooler") || cat?.includes("cooler")) return "Cooler"
  if (sec?.includes("power") || cat?.includes("power")) return "Power Plant"
  if (sec?.includes("shield") || cat?.includes("shield")) return "Shield"
  if (sec?.includes("weapon") || cat?.includes("weapon")) return "Ship Weapon"

  // FPS items
  if (sec?.includes("armor") || cat?.includes("armor")) return "FPS Armor"
  if (sec?.includes("weapon") && sec?.includes("fps")) return "FPS Weapon"
  if (sec?.includes("undersuit")) return "Undersuit"

  // Mining/Industrial
  if (sec?.includes("mining")) return "Mining Head"
  if (sec?.includes("salvage")) return "Salvage Head"

  // Commodities
  if (sec?.includes("commodity") || cat?.includes("commodity")) return "Commodity"

  // Default to category or section
  return category || section || null
}

importItemsFromUEX()
