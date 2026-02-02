/**
 * Re-import specific missing items from CStone
 * Forces re-fetch of items matching specific patterns
 */

import type { Knex } from "knex"
import * as cheerio from "cheerio"
import { normalizeAttributes } from "./attribute-normalizer.js"
import { normalizeItemName } from "./name-normalizer.js"

const CSTONE_API_URL = "https://finder.cstone.space/GetSearch"
const CSTONE_BASE_URL = "https://finder.cstone.space"

const CSTONE_TYPE_MAP: Record<string, string> = {
  "ARMOR - ARMS": "Arms",
  "ARMOR - UNDERSUIT": "Undersuit",
  "ARMOR - HELMET": "Helmet",
  "ARMOR - TORSO": "Torso",
  "ARMOR - LEGS": "Legs",
  "ARMOR - BACKPACK": "Backpack",
}

interface CStoneItem {
  id: string
  name: string
  Sold: number
}

interface CStoneItemDetails {
  manufacturer?: string
  cstoneType?: string
  attributes: Record<string, string>
}

async function fetchItemDetails(
  itemId: string,
  logger: any,
): Promise<CStoneItemDetails | null> {
  try {
    const url = `${CSTONE_BASE_URL}/Search/${itemId}`
    const response = await fetch(url)

    if (response.ok) {
      const html = await response.text()
      const $ = cheerio.load(html)

      const attributes: Record<string, string> = {}
      let manufacturer: string | undefined
      let cstoneType: string | undefined

      const typeHeading = $("h2").first().text().trim()
      if (typeHeading) {
        cstoneType = typeHeading.split("\n")[0].trim()
      }

      $("td").each((i, elem) => {
        const $td = $(elem)
        const text = $td.text().trim()
        const style = $td.attr("style") || ""

        if (style.includes("text-align:right")) {
          const $nextTd = $td.next("td")
          if ($nextTd.length) {
            const value = $nextTd.text().trim()
            if (value) {
              attributes[text] = value
              if (text === "MANUFACTURER") manufacturer = value
            }
          }
        }
      })

      return { manufacturer, cstoneType, attributes }
    }

    return null
  } catch (error) {
    logger.warn(`Failed to fetch details for item ${itemId}`)
    return null
  }
}

async function reimportMissingItems(
  knex: Knex,
  logger: any,
  patterns: string[],
  dryRun: boolean,
) {
  logger.info("Fetching all items from CStone...")

  const response = await fetch(CSTONE_API_URL, {
    headers: { accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(`CStone API error: ${response.status}`)
  }

  const text = await response.text()
  const allItems: CStoneItem[] = JSON.parse(JSON.parse(text))

  logger.info(`Fetched ${allItems.length} items from CStone`)

  // Filter items matching patterns
  const matchingItems = allItems.filter((item) =>
    patterns.some((pattern) =>
      item.name.toLowerCase().includes(pattern.toLowerCase()),
    ),
  )

  logger.info(
    `Found ${matchingItems.length} items matching patterns: ${patterns.join(", ")}`,
  )

  // Get existing items
  const existingByUuid = await knex("game_items")
    .select("id", "name", "cstone_uuid")
    .whereNotNull("cstone_uuid")
    .then((rows: any[]) => new Map(rows.map((r) => [r.cstone_uuid, r])))

  const existingByName = await knex("game_items")
    .select("id", "name", "cstone_uuid")
    .then(
      (rows: any[]) =>
        new Map(rows.map((r) => [normalizeItemName(r.name), r])),
    )

  let imported = 0
  let updated = 0
  let skipped = 0

  for (const item of matchingItems) {
    const normalizedName = normalizeItemName(item.name)
    const existingByUuidItem = existingByUuid.get(item.id)
    const existingByNameItem = existingByName.get(normalizedName)

    // Skip if already exists with correct UUID
    if (existingByUuidItem) {
      logger.debug(`Skipping ${item.name} - already exists with correct UUID`)
      skipped++
      continue
    }

    // Fetch details
    const details = await fetchItemDetails(item.id, logger)
    let itemType = "Item"
    if (details?.cstoneType) {
      itemType = CSTONE_TYPE_MAP[details.cstoneType] || details.cstoneType
    }

    // Update if exists by name
    if (existingByNameItem) {
      if (dryRun) {
        logger.info(
          `[DRY RUN] Would update ${item.name}: cstone_uuid=${item.id}, type=${itemType}`,
        )
        updated++
      } else {
        await knex("game_items")
          .where("id", existingByNameItem.id)
          .update({
            cstone_uuid: item.id,
            type: itemType,
          })

        // Update attributes
        await knex("game_item_attributes")
          .where("game_item_id", existingByNameItem.id)
          .delete()

        if (details?.attributes && Object.keys(details.attributes).length > 0) {
          const normalizedAttrs = normalizeAttributes(details.attributes)
          const attributeRows = Object.entries(normalizedAttrs).map(
            ([name, value]) => ({
              game_item_id: existingByNameItem.id,
              attribute_name: name,
              attribute_value: value,
            }),
          )
          await knex("game_item_attributes").insert(attributeRows)
        }

        logger.info(`Updated ${item.name}`)
        updated++
      }
    } else {
      // Insert new item
      if (dryRun) {
        logger.info(`[DRY RUN] Would import ${item.name}: type=${itemType}`)
        imported++
      } else {
        const [insertedItem] = await knex("game_items")
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

        if (details?.attributes && Object.keys(details.attributes).length > 0) {
          const normalizedAttrs = normalizeAttributes(details.attributes)
          const attributeRows = Object.entries(normalizedAttrs).map(
            ([name, value]) => ({
              game_item_id: insertedItem.id,
              attribute_name: name,
              attribute_value: value,
            }),
          )
          await knex("game_item_attributes").insert(attributeRows)
        }

        logger.info(`Imported ${item.name}`)
        imported++
      }
    }
  }

  logger.info("Re-import completed", { imported, updated, skipped })
  return { imported, updated, skipped }
}

// Main
if (import.meta.url === `file://${process.argv[1]}`) {
  // Simple console logger to avoid service initialization
  const logger = {
    info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ""),
    debug: (msg: string, meta?: any) =>
      console.log(`[DEBUG] ${msg}`, meta || ""),
    warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ""),
    error: (msg: string, meta?: any) =>
      console.error(`[ERROR] ${msg}`, meta || ""),
  }

  const dryRun = process.argv.includes("--dry")
  const patterns = process.argv
    .filter((arg) => !arg.startsWith("--") && !arg.includes("reimport"))
    .slice(2)

  if (patterns.length === 0) {
    logger.error(
      "Usage: npm run reimport-items [--dry] <pattern1> [pattern2...]",
    )
    logger.error("Example: npm run reimport-items overlord cardinal")
    process.exit(1)
  }

  try {
    // Direct knex import to avoid service initialization
    const knexLib = await import("knex")
    const knex = knexLib.default({
      client: "pg",
      connection: process.env.DATABASE_URL,
    })

    await reimportMissingItems(knex, logger, patterns, dryRun)
    await knex.destroy()
    process.exit(0)
  } catch (error) {
    logger.error("Failed to re-import items", { error })
    process.exit(1)
  }
}

export { reimportMissingItems }
