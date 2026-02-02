/**
 * Validate and fix cstone_uuid values in database
 * Checks all items with cstone_uuid against CStone API and fixes mismatches
 */

import type { Knex } from "knex"

const CSTONE_API_URL = "https://finder.cstone.space/GetSearch"

interface CStoneItem {
  id: string
  name: string
}

async function validateAndFixCstoneUuids(
  knex: Knex,
  logger: any,
  dryRun: boolean,
) {
  try {
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

    // Build map of UUID -> name from CStone
    const cstoneMap = new Map<string, string>()
    for (const item of allItems) {
      cstoneMap.set(item.id, item.name)
    }

    logger.info(`Built map of ${cstoneMap.size} CStone UUIDs`)

    // Get all items with cstone_uuid from database
    const dbItems = await knex("game_items")
      .select("id", "name", "cstone_uuid")
      .whereNotNull("cstone_uuid")

    logger.info(`Found ${dbItems.length} items in database with cstone_uuid`)

    let fixed = 0
    let correct = 0
    let notFound = 0

    for (const dbItem of dbItems) {
      const cstoneName = cstoneMap.get(dbItem.cstone_uuid)

      if (!cstoneName) {
        // UUID doesn't exist in CStone
        logger.warn(
          `UUID ${dbItem.cstone_uuid} not found in CStone for item "${dbItem.name}"`,
        )
        notFound++
        continue
      }

      // Normalize names for comparison (case-insensitive, trim whitespace)
      const dbNameNorm = dbItem.name.trim().toLowerCase()
      const cstoneNameNorm = cstoneName.trim().toLowerCase()

      if (dbNameNorm !== cstoneNameNorm) {
        // Mismatch - UUID points to different item
        logger.warn(
          `Mismatch: DB item "${dbItem.name}" has UUID for "${cstoneName}"`,
        )

        if (dryRun) {
          logger.info(
            `[DRY RUN] Would clear cstone_uuid for "${dbItem.name}" (id=${dbItem.id})`,
          )
          fixed++
        } else {
          await knex("game_items")
            .where("id", dbItem.id)
            .update({ cstone_uuid: null })
          logger.info(
            `Cleared cstone_uuid for "${dbItem.name}" (id=${dbItem.id})`,
          )
          fixed++
        }
      } else {
        correct++
      }
    }

    logger.info("Validation complete", {
      total: dbItems.length,
      correct,
      fixed,
      notFound,
    })

    return { correct, fixed, notFound }
  } catch (error) {
    logger.error("Error in validateAndFixCstoneUuids", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

// Main
if (import.meta.url === `file://${process.argv[1]}`) {
  const loggerModule = await import("../src/logger/logger.js")
  const logger = loggerModule.default

  const dryRun = process.argv.includes("--dry")

  try {
    const dbModule = await import("../src/clients/database/knex-db.js")
    const knex = dbModule.database.knex

    await validateAndFixCstoneUuids(knex, logger, dryRun)
    await knex.destroy()
    process.exit(0)
  } catch (error) {
    logger.error("Failed to validate cstone_uuids", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

export { validateAndFixCstoneUuids }
