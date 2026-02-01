#!/usr/bin/env ts-node
/**
 * Script to import attributes for all existing game items
 * Fetches UEX data in bulk once, then matches items by name
 *
 * Usage:
 *   npm run import-attributes           # Normal mode
 *   npm run import-attributes -- --dry  # Dry run mode
 */

import { database } from "../src/clients/database/knex-db.js"
import logger from "../src/logger/logger.js"
import type {
  AttributeDefinition,
  GameItemAttribute,
} from "../src/api/routes/v1/attributes/types.js"

const DRY_RUN =
  process.argv.includes("--dry") || process.argv.includes("--dry-run")
const UEXCORP_BASE_URL = "https://api.uexcorp.uk/2.0"

interface GameItem {
  id: string
  name: string
  type: string
}

interface UEXItem {
  id: number
  name: string
  size?: string
  color?: string
  quality?: string
  company_name?: string
}

interface UEXAttribute {
  attribute_name: string
  value: string
}

async function importAllAttributes() {
  logger.info("Starting bulk attribute import", { dryRun: DRY_RUN })

  if (DRY_RUN) {
    logger.info("DRY RUN MODE - No database changes will be made")
  }

  try {
    // Fetch all game items
    const gameItems = await database
      .knex<GameItem>("game_items")
      .select("id", "name", "type")
      .orderBy("name")

    logger.info(`Found ${gameItems.length} game items`)

    if (gameItems.length === 0) {
      logger.warn("No game items found")
      return
    }

    // Fetch all UEX data once
    logger.info("Fetching UEX data...")
    const categoriesResponse = await fetch(`${UEXCORP_BASE_URL}/categories`, {
      headers: { accept: "application/json" },
    })

    if (!categoriesResponse.ok) {
      throw new Error(`UEX API error: ${categoriesResponse.status}`)
    }

    const categoriesData = await categoriesResponse.json()
    const categories = categoriesData.data || []

    logger.info(`Found ${categories.length} categories`)

    // Build UEX item map
    const uexItemMap = new Map<string, UEXItem>()

    for (const category of categories) {
      const itemsResponse = await fetch(
        `${UEXCORP_BASE_URL}/items?id_category=${category.id}`,
        { headers: { accept: "application/json" } },
      )

      if (!itemsResponse.ok) continue

      const itemsData = await itemsResponse.json()
      if (itemsData.data && Array.isArray(itemsData.data)) {
        for (const item of itemsData.data) {
          if (item.name) {
            uexItemMap.set(item.name.toLowerCase(), item)
          }
        }
      }
    }

    logger.info(`Loaded ${uexItemMap.size} UEX items`)

    let successCount = 0
    let failureCount = 0
    let totalAttributesImported = 0
    let noMatchCount = 0

    // Process each game item
    for (let i = 0; i < gameItems.length; i++) {
      const item = gameItems[i]
      const progress = `[${i + 1}/${gameItems.length}]`

      const uexItem = uexItemMap.get(item.name.toLowerCase())

      if (!uexItem) {
        noMatchCount++
        logger.debug(`${progress} No match: ${item.name}`)
        continue
      }

      try {
        // Fetch attributes
        const attrsResponse = await fetch(
          `${UEXCORP_BASE_URL}/items_attributes?id_item=${uexItem.id}`,
          { headers: { accept: "application/json" } },
        )

        if (!attrsResponse.ok) {
          failureCount++
          continue
        }

        const attrsData = await attrsResponse.json()
        const attributes: UEXAttribute[] = attrsData.data || []

        const records: Array<{ attribute_name: string; value: string }> = []

        // Basic attributes
        if (uexItem.size)
          records.push({ attribute_name: "size", value: uexItem.size })
        if (uexItem.color)
          records.push({ attribute_name: "color", value: uexItem.color })
        if (uexItem.quality)
          records.push({
            attribute_name: "grade",
            value: mapQuality(uexItem.quality),
          })
        if (uexItem.company_name)
          records.push({
            attribute_name: "manufacturer",
            value: uexItem.company_name,
          })

        // Detailed attributes
        for (const attr of attributes) {
          if (!attr.attribute_name || !attr.value) continue

          const attrName = attr.attribute_name.toLowerCase()
          if (attrName.includes("class")) {
            records.push({ attribute_name: "class", value: attr.value })
          } else if (attrName.includes("type")) {
            records.push({
              attribute_name: "component_type",
              value: attr.value,
            })
          } else if (attrName.includes("manufacturer")) {
            records.push({ attribute_name: "manufacturer", value: attr.value })
          } else {
            records.push({ attribute_name: attrName, value: attr.value })
          }
        }

        if (records.length === 0) continue

        if (DRY_RUN) {
          logger.info(
            `${progress} [DRY RUN] ${records.length} attrs: ${item.name}`,
          )
          successCount++
          totalAttributesImported += records.length
        } else {
          await database
            .knex("game_item_attributes")
            .where("game_item_id", item.id)
            .delete()

          for (const record of records) {
            // Check if attribute definition exists
            let attrDef = await database
              .knex<AttributeDefinition>("attribute_definitions")
              .where("attribute_name", record.attribute_name)
              .first()

            if (!attrDef) {
              // Create new attribute definition
              await database.knex("attribute_definitions").insert({
                attribute_name: record.attribute_name,
                display_name: record.attribute_name,
                attribute_type: "text",
                display_order: 0,
              })
            }

            // Insert attribute value
            await database
              .knex<GameItemAttribute>("game_item_attributes")
              .insert({
                game_item_id: item.id,
                attribute_name: record.attribute_name,
                attribute_value: record.value,
              })
          }

          successCount++
          totalAttributesImported += records.length
          logger.info(`${progress} ✓ ${records.length} attrs: ${item.name}`)
        }
      } catch (error) {
        failureCount++
        logger.warn(`${progress} Error: ${item.name}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    logger.info("Import completed", {
      dryRun: DRY_RUN,
      total: gameItems.length,
      success: successCount,
      failure: failureCount,
      noMatch: noMatchCount,
      totalAttributesImported,
    })

    process.exit(0)
  } catch (error) {
    logger.error("Import failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    process.exit(1)
  }
}

function mapQuality(quality: string): string {
  const q = quality.toLowerCase()
  if (q.includes("military") || q.includes("a")) return "A"
  if (q.includes("industrial") || q.includes("b")) return "B"
  if (q.includes("civilian") || q.includes("c")) return "C"
  return quality
}

importAllAttributes()
