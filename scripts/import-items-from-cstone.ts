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

interface CStoneItem {
  id: string
  name: string
  Sold: number
}

interface CStoneItemDetails {
  manufacturer?: string
  armorType?: string
  itemType?: string
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
    // Try common page patterns
    const patterns = [
      "FPSArmors1",
      "Ships",
      "Vehicles",
      "FPSWeapons",
      "ShipWeapons",
      "ShipComponents",
    ]

    for (const pattern of patterns) {
      const url = `${CSTONE_BASE_URL}/${pattern}/${itemId}`
      const response = await fetch(url)

      if (response.ok) {
        const html = await response.text()
        const $ = cheerio.load(html)

        const attributes: Record<string, string> = {}
        let manufacturer: string | undefined
        let armorType: string | undefined

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

        return {
          manufacturer,
          armorType,
          itemType: pattern,
          attributes,
        }
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

    // In dry run without database, just show what we'd do
    if (dryRun && !knex) {
      logger.info("Dry run without database - showing sample items")
      const sampleItems = allItems.slice(0, 10)
      sampleItems.forEach((item) => {
        logger.info(`Would import: ${item.name}`, { id: item.id })
      })
      logger.info("Import summary", {
        totalItems: allItems.length,
        sampleShown: sampleItems.length,
      })
      return { imported: 0, updated: 0, skipped: 0 }
    }

    // Get existing items from database
    const existingItemsMap = await knex!("game_items")
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
      const existingItem = existingItemsMap.get(item.name.toLowerCase())

      // Update cstone_uuid if item exists but doesn't have one
      if (existingItem && !existingItem.cstone_uuid) {
        if (!dryRun) {
          try {
            await knex!("game_items")
              .where("id", existingItem.id)
              .update({ cstone_uuid: item.id })
            updated++
            logger.debug(`Updated cstone_uuid for: ${item.name}`)
          } catch (error) {
            logger.warn(`Failed to update cstone_uuid for: ${item.name}`)
          }
        }
        continue
      }

      // Skip if already exists
      if (existingItem) {
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

          // Determine item type
          let itemType = "Item"
          if (details?.itemType === "FPSArmors1") {
            itemType = details.armorType || "FPS Armor"
          } else if (details?.itemType === "FPSWeapons") {
            itemType = "FPS Weapon"
          } else if (details?.itemType === "Ships") {
            itemType = "Ship"
          } else if (details?.itemType === "Vehicles") {
            itemType = "Vehicle"
          } else if (details?.itemType === "ShipWeapons") {
            itemType = "Ship Weapon"
          } else if (details?.itemType === "ShipComponents") {
            itemType = "Ship Component"
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
