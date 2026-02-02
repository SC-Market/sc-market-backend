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

    // Deduplicate by name (lowercase) so we only process each item once.
    // game_items has a unique constraint on name, so inserting the same name twice causes an error.
    // Prefer the entry with a uuid when the same name appears in multiple categories.
    const uniqueItems = new Map<string, UEXItem>()
    for (const item of allItems) {
      const key = item.name?.toLowerCase()
      if (!key) continue
      const existing = uniqueItems.get(key)
      if (existing) {
        const sameNameDifferentUuid =
          item.uuid && existing.uuid && item.uuid !== existing.uuid
        if (sameNameDifferentUuid) {
          logger.info("Same name with different UEX UUIDs, keeping first", {
            name: item.name,
            keptUuid: existing.uuid,
            skippedUuid: item.uuid,
          })
        } else if (item.uuid && !existing.uuid) {
          logger.debug(
            "Same name in multiple categories, preferring entry with uex_uuid",
            {
              name: item.name,
              uuid: item.uuid,
            },
          )
          uniqueItems.set(key, item)
        }
        continue
      }
      uniqueItems.set(key, item)
    }

    logger.info(`After deduplication: ${uniqueItems.size} unique items`)

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
    const coreItems: UEXItem[] = []

    for (const item of uniqueItems.values()) {
      if (!item.name) {
        skipped++
        continue
      }

      // Track core items for generating full sets (both new and existing)
      if (isCoreItem(item.name)) {
        coreItems.push(item)
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

    // Generate Full Set items for each core
    // Check ALL existing cores in database, not just newly imported ones
    const allCoresInDb = await database
      .knex("game_items")
      .select("id", "name", "uex_uuid", "image_url")
      .then((rows) => rows.filter((r) => isCoreItem(r.name)))

    logger.info(`Found ${allCoresInDb.length} total cores in database`)
    let fullSetsCreated = 0

    for (const coreDbItem of allCoresInDb) {
      const fullSetName = `${coreDbItem.name} - Full Set`

      // Skip if full set already exists
      if (existingItemsMap.has(fullSetName.toLowerCase())) {
        continue
      }

      try {
        if (DRY_RUN) {
          logger.info(`[DRY RUN] Would create Full Set: ${fullSetName}`)
          fullSetsCreated++
        } else {
          // Insert the full set item
          const [fullSetItem] = await database
            .knex("game_items")
            .insert({
              name: fullSetName,
              type: "Full Set",
              description: `Full armor set for ${coreDbItem.name}`,
              image_url: coreDbItem.image_url || null,
              uex_uuid: null, // Full sets don't have UEX UUIDs
            })
            .returning("id")

          // Copy attributes from core to full set
          const coreAttributes = await database
            .knex("game_item_attributes")
            .where("game_item_id", coreDbItem.id)
            .select("attribute_name", "attribute_value")

          if (coreAttributes.length > 0) {
            await database.knex("game_item_attributes").insert(
              coreAttributes.map((attr) => ({
                game_item_id: fullSetItem.id,
                attribute_name: attr.attribute_name,
                attribute_value: attr.attribute_value,
              })),
            )
            logger.debug(
              `Copied ${coreAttributes.length} attributes to Full Set: ${fullSetName}`,
            )
          }

          fullSetsCreated++
          logger.debug(`Created Full Set: ${fullSetName}`)
        }
      } catch (error) {
        logger.warn(`Failed to create Full Set: ${fullSetName}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    logger.info("UEX item import completed", {
      dryRun: DRY_RUN,
      totalFetched: allItems.length,
      uniqueItems: uniqueItems.size,
      imported,
      updated,
      skipped,
      fullSetsCreated,
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

/**
 * Checks if an item is an armor core
 * Examples: "Inquisitor Core Black Steel", "DCP Armor Core Hunter Camo", "ORC-mkX Core Iceborn"
 */
function isCoreItem(name: string): boolean {
  const normalized = name.toLowerCase()

  // Match patterns like "X Core Y" (includes "X Armor Core Y" as a subset)
  // Exclude items with "LifeCore", "ThermalCore", etc. (single word cores)
  return (
    normalized.includes(" core ") &&
    !normalized.match(/\b(life|thermal|power|reactor)core\b/)
  )
}

importItemsFromUEX()
