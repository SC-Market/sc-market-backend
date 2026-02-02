/**
 * Import Game Items from CStone
 * Fetches items from CStone API and adds new ones to game_items table
 *
 * Usage:
 *   npm run import-cstone-items           # Normal mode
 *   npm run import-cstone-items -- --dry  # Dry run mode
 */

import type { Knex } from "knex"
import * as cheerio from "cheerio"
import { normalizeAttributes } from "./attribute-normalizer.js"

const CSTONE_API_URL = "https://finder.cstone.space/GetSearch"
const CSTONE_BASE_URL = "https://finder.cstone.space"

// Canonical type names from CStone (from package_data.py)
const CSTONE_TYPE_MAP: Record<string, string> = {
  "FPS TOOL": "FPS Tool",
  "ARMOR - ARMS": "Arms",
  "SOUVENIR/FLAIR": "Souvenir/Flair",
  "ARMOR - UNDERSUIT": "Undersuit",
  "CLOTHING - SHIRTS": "Shirts",
  MOBIGLASS: "Mobiglass",
  DRINK: "Food/Drink",
  "MISSILE RACK": "Missile Rack",
  EYEWEAR: "Eyewear",
  EATABLE: "Food/Drink",
  "CLOTHING - HAT": "Hat",
  "HANDHELD MINING MODIFIER": "Handheld Mining Modifier",
  "ARMOR - HELMET": "Helmet",
  "FPS ATTACHMENT": "Weapon Attachment",
  "SHIP FOR SALE/RENTAL": "Ship for Sale/Rental",
  "CLOTHING - GLOVES": "Gloves",
  "MINING HEAD": "Mining Head",
  "SALVAGE MODIFIER": "Salvage Modifier",
  "FPS MELEE WEAPON": "Melee Weapon",
  SHIELD: "Shield",
  CONTAINER: "Container",
  "ARMOR - TORSO": "Torso",
  "FPS MAGAZINE": "Weapon Magazine",
  "QUANTUM DRIVE": "Quantum Drive",
  "CLOTHING - LEGWEAR": "Legwear",
  "MEDICAL PEN": "Medical Pen",
  "FPS TOOL ATTACHMENT": "Tool Attachment",
  "TRACTOR BEAM": "Tractor Beam",
  "CLOTHING - FOOTWEAR": "Footwear",
  "SHIP LIVERY": "Ship Livery",
  "FPS THROWN WEAPON": "Thrown Weapon",
  MISCELLANEOUS: "Other",
  "MINING MODIFIER": "Mining Modifier",
  "FPS FLARE": "Flare",
  "ARMOR - LEGS": "Legs",
  "SALVAGE HEAD": "Salvage Head",
  MISSILE: "Missile",
  "TOWING BEAM": "Towing Beam",
  "FUEL POD": "Fuel Pod",
  "SHIP TURRET OR GIMBAL": "Ship Turret or Gimbal",
  "CLOTHING - JUMPSUITS": "Jumpsuits",
  "SHIP WEAPON": "Ship Weapon",
  "FPS RANGED WEAPON": "Ranged Weapon",
  "FUEL NOZZLE": "Fuel Nozzle",
  COOLER: "Cooler",
  "ARMOR - BACKPACK": "Backpack",
  "CLOTHING - BACKPACK": "Backpack (Clothing)",
  "CLOTHING - JACKETS": "Jackets",
  "POWER PLANT": "Power Plant",
  BOMB: "Bomb",
  "HACKING CHIP": "Hacking Chip",
  DECORATION: "Decoration",
  "SHIP MODULE": "Ship Module",
  "JUMP DRIVE": "Jump Drive",
  "FLIGHT BLADE": "Flight Blade",
  "BOMB LAUNCHER": "Bomb Launcher",
}

interface CStoneItem {
  id: string
  name: string
  Sold: number
}

interface CStoneItemDetails {
  manufacturer?: string
  armorType?: string
  itemType?: string
  cstoneType?: string
  attributes: Record<string, string>
}

interface Logger {
  info: (message: string, meta?: any) => void
  debug: (message: string, meta?: any) => void
  warn: (message: string, meta?: any) => void
  error: (message: string, meta?: any) => void
}

/**
 * Fetch and parse item details from CStone item page
 */
async function fetchItemDetails(
  itemId: string,
  logger: Logger,
): Promise<CStoneItemDetails | null> {
  try {
    // Use Search endpoint which auto-redirects to the correct category
    const url = `${CSTONE_BASE_URL}/Search/${itemId}`
    const response = await fetch(url)

    if (response.ok) {
      const html = await response.text()
      const $ = cheerio.load(html)

      const attributes: Record<string, string> = {}
      let manufacturer: string | undefined
      let armorType: string | undefined
      let cstoneType: string | undefined

      // Extract type from page heading (h2)
      const typeHeading = $("h2").first().text().trim()
      if (typeHeading) {
        cstoneType = typeHeading.split("\n")[0].trim() // Get first line only
      }

      // Parse table rows - label in right-aligned td, value in left-aligned td
      $("td").each((i, elem) => {
        const $td = $(elem)
        const text = $td.text().trim()
        const style = $td.attr("style") || ""

        // Right-aligned = label
        if (style.includes("text-align:right")) {
          const $nextTd = $td.next("td")
          if ($nextTd.length) {
            const value = $nextTd.text().trim()
            if (value) {
              attributes[text] = value

              // Extract key attributes
              if (text === "MANUFACTURER") manufacturer = value
              if (text === "ARMOR TYPE") armorType = value
            }
          }
        }
      })

      // Determine item type from URL (after redirect)
      let itemType = "Item"
      const urlLower = response.url.toLowerCase()
      if (urlLower.includes("fpsarmors")) {
        itemType = "FPSArmors1"
      } else if (urlLower.includes("fpsweapons")) {
        itemType = "FPSWeapons"
      } else if (urlLower.includes("ships")) {
        itemType = "Ships"
      } else if (urlLower.includes("vehicles")) {
        itemType = "Vehicles"
      } else if (urlLower.includes("shipweapons")) {
        itemType = "ShipWeapons"
      } else if (urlLower.includes("shipcomponents")) {
        itemType = "ShipComponents"
      } else if (urlLower.includes("shipminingheads")) {
        itemType = "ShipMiningHeads"
      }

      return {
        manufacturer,
        armorType,
        itemType,
        cstoneType,
        attributes,
      }
    }

    return null
  } catch (error) {
    logger.warn(`Failed to fetch details for item ${itemId}`)
    return null
  }
}

async function importItemsFromCStone(
  knex: Knex | null,
  logger: Logger,
  dryRun: boolean,
  limit?: number,
) {
  logger.info("Starting CStone item import", { dryRun })

  if (dryRun) {
    logger.info("DRY RUN MODE - No database changes will be made")
  }

  try {
    // Fetch all items from CStone
    const response = await fetch(CSTONE_API_URL, {
      headers: { accept: "application/json" },
    })

    if (!response.ok) {
      throw new Error(`CStone API error: ${response.status}`)
    }

    const contentType = response.headers.get("content-type")
    logger.debug("CStone API headers", { contentType, status: response.status })

    const text = await response.text()

    // CStone API returns double-encoded JSON
    const allItems: CStoneItem[] = JSON.parse(JSON.parse(text))

    logger.debug("CStone API response", {
      isArray: Array.isArray(allItems),
      type: typeof allItems,
      length: Array.isArray(allItems) ? allItems.length : "N/A",
    })

    if (!Array.isArray(allItems)) {
      throw new Error("Invalid response from CStone API")
    }

    logger.info(`Fetched ${allItems.length} total items from CStone`)

    // Get existing items from database (or empty map in dry run)
    const existingItemsMap = knex
      ? await knex("game_items")
          .select("id", "name", "cstone_uuid")
          .then(
            (rows) =>
              new Map(
                rows.map((r) => [
                  r.name.toLowerCase(),
                  { id: r.id, name: r.name, cstone_uuid: r.cstone_uuid },
                ]),
              ),
          )
      : new Map()

    // Also create a map by cstone_uuid for quick lookup
    const existingByUuidMap = knex
      ? await knex("game_items")
          .select("id", "name", "cstone_uuid")
          .whereNotNull("cstone_uuid")
          .then((rows) => new Map(rows.map((r) => [r.cstone_uuid, r])))
      : new Map()

    // Deduplicate by name (lowercase)
    const uniqueItems = new Map<string, CStoneItem>()
    for (const item of allItems) {
      const key = item.name?.toLowerCase()
      if (!key) continue
      const existing = uniqueItems.get(key)
      if (existing) {
        // Keep first occurrence
        continue
      }
      uniqueItems.set(key, item)
    }

    logger.info(`After deduplication: ${uniqueItems.size} unique items`)

    let imported = 0
    let updated = 0
    let skipped = 0

    // Process each unique item
    for (const [, item] of uniqueItems) {
      const existingByName = existingItemsMap.get(item.name.toLowerCase())
      const existingByUuid = existingByUuidMap.get(item.id)

      // Skip if already exists with correct cstone_uuid
      if (existingByUuid) {
        skipped++
        continue
      }

      // Update cstone_uuid if item exists by name but doesn't have uuid
      if (existingByName && !existingByName.cstone_uuid) {
        if (!dryRun) {
          try {
            await knex!("game_items")
              .where("id", existingByName.id)
              .update({ cstone_uuid: item.id })
            updated++
            logger.debug(`Updated cstone_uuid for: ${item.name}`)
          } catch (error) {
            logger.warn(`Failed to update cstone_uuid for: ${item.name}`)
          }
        } else {
          logger.info(`[DRY RUN] Would update cstone_uuid for: ${item.name}`)
          updated++
        }
        continue
      }

      // Skip if already exists by name
      if (existingByName) {
        skipped++
        continue
      }

      // New item - fetch details and insert
      try {
        if (dryRun) {
          logger.info(`[DRY RUN] Would import: ${item.name}`)
          imported++
        } else {
          // Fetch item details from HTML page
          const details = await fetchItemDetails(item.id, logger)

          // Determine item type using canonical CStone type map
          let itemType = "Item"
          if (details?.cstoneType) {
            // Use canonical type from map, or the raw type if not in map
            itemType = CSTONE_TYPE_MAP[details.cstoneType] || details.cstoneType
          }

          // Insert game item
          const [insertedItem] = await knex!("game_items")
            .insert({
              name: item.name,
              type: itemType,
              description: details?.manufacturer
                ? `Manufactured by ${details.manufacturer}`
                : null,
              image_url: null,
              cstone_uuid: item.id,
            })
            .returning("id")

          // Insert attributes if we have them
          if (
            details?.attributes &&
            Object.keys(details.attributes).length > 0
          ) {
            // Normalize attribute names and values
            const normalizedAttrs = normalizeAttributes(details.attributes)

            const attributeRows = Object.entries(normalizedAttrs).map(
              ([name, value]) => ({
                game_item_id: insertedItem.id,
                attribute_name: name,
                attribute_value: value,
              }),
            )

            await knex!("game_item_attributes").insert(attributeRows)
            logger.debug(
              `Imported ${item.name} with ${attributeRows.length} attributes`,
            )
          } else {
            logger.debug(`Imported item: ${item.name}`)
          }

          imported++
        }
      } catch (error) {
        logger.warn(`Failed to import item: ${item.name}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    logger.info("CStone item import completed", {
      dryRun,
      totalFetched: allItems.length,
      uniqueItems: uniqueItems.size,
      imported,
      updated,
      skipped,
    })

    return { imported, updated, skipped }
  } catch (error) {
    logger.error("Failed to import items from CStone", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

// Main entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const loggerModule = await import("../src/logger/logger.js")
  const logger = loggerModule.default

  const dryRun =
    process.argv.includes("--dry") || process.argv.includes("--dry-run")

  let db = null

  // Only connect to database if not in dry run mode
  if (!dryRun) {
    const knexModule = await import("knex")
    const knex = knexModule.default
    db = knex({
      client: "pg",
      connection: process.env.DATABASE_URL,
    })
  }

  try {
    await importItemsFromCStone(db, logger, dryRun)
    if (db) await db.destroy()
    process.exit(0)
  } catch (error) {
    if (db) await db.destroy()
    process.exit(1)
  }
}

export { importItemsFromCStone }
