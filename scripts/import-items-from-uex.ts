/**
 * Import Game Items from UEXCorp
 * Fetches items from UEX API and adds new ones to game_items table
 *
 * Usage:
 *   npm run import-uex-items           # Normal mode
 *   npm run import-uex-items -- --dry  # Dry run mode
 */

import { database } from "../src/clients/database/knex-db.js"
import logger from "../src/logger/logger.js"

const UEXCORP_BASE_URL = "https://api.uexcorp.uk/2.0"
const DRY_RUN =
  process.argv.includes("--dry") || process.argv.includes("--dry-run")

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
  logger.info("Starting UEX item import", { dryRun: DRY_RUN })

  if (DRY_RUN) {
    logger.info("DRY RUN MODE - No database changes will be made")
  }

  try {
    // Fetch all categories first
    const categoriesResponse = await fetch(`${UEXCORP_BASE_URL}/categories`, {
      headers: { accept: "application/json" },
    })

    if (!categoriesResponse.ok) {
      throw new Error(`UEX categories API error: ${categoriesResponse.status}`)
    }

    const categoriesData = await categoriesResponse.json()

    if (!categoriesData.data || !Array.isArray(categoriesData.data)) {
      throw new Error("Invalid categories response from UEX API")
    }

    logger.info(`Found ${categoriesData.data.length} categories`)

    // Get existing items from our database
    const existingItems = await database
      .knex("game_items")
      .select("name")
      .then((rows) => new Set(rows.map((r) => r.name.toLowerCase())))

    let imported = 0
    let skipped = 0
    const allItems: UEXItem[] = []

    // Fetch items from each category
    for (const category of categoriesData.data) {
      const response = await fetch(
        `${UEXCORP_BASE_URL}/items?id_category=${category.id}`,
        {
          headers: { accept: "application/json" },
        },
      )

      if (!response.ok) {
        logger.warn(`Failed to fetch items for category ${category.id}`)
        continue
      }

      const data = await response.json()
      if (data.data && Array.isArray(data.data)) {
        allItems.push(...data.data)
      }
    }

    logger.info(`Fetched ${allItems.length} total items from UEX`)

    // Get existing items with their IDs for updating
    const existingItemsMap = await database
      .knex("game_items")
      .select("id", "name", "uex_uuid")
      .then(
        (rows) =>
          new Map(
            rows.map((r) => [
              r.name.toLowerCase(),
              { id: r.id, uex_uuid: r.uex_uuid },
            ]),
          ),
      )

    let updated = 0

    for (const item of allItems) {
      if (!item.name) {
        skipped++
        continue
      }

      const existingItem = existingItemsMap.get(item.name.toLowerCase())

      // If item exists and doesn't have uex_uuid, update it
      if (existingItem && !existingItem.uex_uuid && item.uuid) {
        try {
          if (DRY_RUN) {
            logger.info(`[DRY RUN] Would update uex_uuid for: ${item.name}`)
            updated++
          } else {
            await database
              .knex("game_items")
              .where("id", existingItem.id)
              .update({ uex_uuid: item.uuid })

            updated++
            logger.debug(`Updated uex_uuid for: ${item.name}`)
          }
        } catch (error) {
          logger.warn(`Failed to update uex_uuid for: ${item.name}`)
        }
        continue
      }

      // Skip if already exists
      if (existingItem) {
        skipped++
        continue
      }

      // Map UEX category/section to our item type
      const itemType = mapUEXCategoryToType(item.category, item.section)

      try {
        if (DRY_RUN) {
          logger.info(`[DRY RUN] Would import: ${item.name}`, {
            type: itemType,
            category: item.category,
            section: item.section,
          })
          imported++
        } else {
          await database.knex("game_items").insert({
            name: item.name,
            type: itemType,
            description:
              `${item.section || ""} ${item.category || ""}`.trim() || null,
            image_url: item.screenshot || null,
            uex_uuid: item.uuid || null,
          })

          imported++
          logger.debug(`Imported item: ${item.name}`)
        }
      } catch (error) {
        logger.warn(`Failed to import item: ${item.name}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    logger.info("UEX item import completed", {
      dryRun: DRY_RUN,
      total: allItems.length,
      imported,
      updated,
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
  section: string | null,
): string | null {
  const cat = category?.toLowerCase()
  const sec = section?.toLowerCase()

  // Ship components
  if (sec?.includes("quantum") || cat?.includes("quantum"))
    return "Quantum Drive"
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
  if (sec?.includes("commodity") || cat?.includes("commodity"))
    return "Commodity"

  // Default to category or section
  return category || section || null
}

importItemsFromUEX()
