#!/usr/bin/env tsx
/**
 * Merge duplicate game items
 * Automatically detects duplicates using name normalization
 * Merges all related data (attributes, listings, buy orders, price history)
 * from duplicate items into the canonical item, then deletes duplicates
 *
 * Usage:
 *   npm run merge-duplicates           # Normal mode
 *   npm run merge-duplicates -- --dry  # Dry run mode
 */

import { database } from "../src/clients/database/knex-db.js"
import logger from "../src/logger/logger.js"
import { normalizeItemName } from "./name-normalizer.js"

const DRY_RUN =
  process.argv.includes("--dry") || process.argv.includes("--dry-run")

async function mergeDuplicates() {
  logger.info("Starting duplicate merge", { dryRun: DRY_RUN })

  if (DRY_RUN) {
    logger.info("DRY RUN MODE - No database changes will be made")
  }

  // Get all items
  const allItems = await database
    .knex("game_items")
    .select("id", "name", "uex_uuid", "cstone_uuid")

  // Group by normalized name
  const itemsByNormalizedName = new Map<
    string,
    Array<{ id: string; name: string; uex_uuid: string; cstone_uuid: string }>
  >()

  for (const item of allItems) {
    const normalized = normalizeItemName(item.name)
    if (!itemsByNormalizedName.has(normalized)) {
      itemsByNormalizedName.set(normalized, [])
    }
    itemsByNormalizedName.get(normalized)!.push(item)
  }

  // Find duplicates (groups with more than one item)
  const duplicateGroups = Array.from(itemsByNormalizedName.entries())
    .filter(([, items]) => items.length > 1)
    .map(([normalized, items]) => ({ normalized, items }))

  if (duplicateGroups.length === 0) {
    logger.info("No duplicates found")
    await database.knex.destroy()
    process.exit(0)
  }

  logger.info(`Found ${duplicateGroups.length} duplicate groups`)

  let merged = 0
  let errors = 0

  for (const { normalized, items } of duplicateGroups) {
    try {
      // Choose target: prefer item with UUID, then first item
      const target = items.find((i) => i.cstone_uuid || i.uex_uuid) || items[0]
      const sources = items.filter((i) => i.id !== target.id)

      logger.info(`Processing duplicate group: "${normalized}"`, {
        target: target.name,
        sources: sources.map((s) => s.name),
      })

      for (const source of sources) {
        // Get counts of related data
        const [attrCount, listingCount, buyOrderCount, priceHistoryCount] =
          await Promise.all([
            database
              .knex("game_item_attributes")
              .where("game_item_id", source.id)
              .count("* as count")
              .first()
              .then((r) => Number(r?.count || 0)),
            database
              .knex("market_listing_details")
              .where("game_item_id", source.id)
              .count("* as count")
              .first()
              .then((r) => Number(r?.count || 0)),
            database
              .knex("market_buy_orders")
              .where("game_item_id", source.id)
              .count("* as count")
              .first()
              .then((r) => Number(r?.count || 0)),
            database
              .knex("market_price_history")
              .where("game_item_id", source.id)
              .count("* as count")
              .first()
              .then((r) => Number(r?.count || 0)),
          ])

        if (DRY_RUN) {
          logger.info(
            `[DRY RUN] Would merge: "${source.name}" → "${target.name}"`,
            {
              sourceId: source.id,
              targetId: target.id,
              attributes: attrCount,
              listings: listingCount,
              buyOrders: buyOrderCount,
              priceHistory: priceHistoryCount,
            },
          )
          merged++
        } else {
          // Perform merge in transaction
          await database.knex.transaction(async (trx) => {
            // Merge attributes (avoid duplicates)
            const sourceAttrs = await trx("game_item_attributes")
              .where("game_item_id", source.id)
              .select("attribute_name", "attribute_value")

            for (const attr of sourceAttrs) {
              await trx("game_item_attributes")
                .insert({
                  game_item_id: target.id,
                  attribute_name: attr.attribute_name,
                  attribute_value: attr.attribute_value,
                })
                .onConflict(["game_item_id", "attribute_name"])
                .ignore()
            }

            await trx("game_item_attributes")
              .where("game_item_id", source.id)
              .delete()

            // Update market_listing_details
            await trx("market_listing_details")
              .where("game_item_id", source.id)
              .update({ game_item_id: target.id })

            // Update market_buy_orders
            await trx("market_buy_orders")
              .where("game_item_id", source.id)
              .update({ game_item_id: target.id })

            // Merge price history (keep most recent for each date)
            const sourcePrices = await trx("market_price_history")
              .where("game_item_id", source.id)
              .select("price", "quantity_available", "date")

            for (const price of sourcePrices) {
              await trx("market_price_history")
                .insert({
                  game_item_id: target.id,
                  price: price.price,
                  quantity_available: price.quantity_available,
                  date: price.date,
                })
                .onConflict(["game_item_id", "date"])
                .merge()
            }

            await trx("market_price_history")
              .where("game_item_id", source.id)
              .delete()

            // Delete source item
            await trx("game_items").where("id", source.id).delete()
          })

          logger.info(`Merged: "${source.name}" → "${target.name}"`, {
            sourceId: source.id,
            targetId: target.id,
            attributes: attrCount,
            listings: listingCount,
            buyOrders: buyOrderCount,
            priceHistory: priceHistoryCount,
          })
          merged++
        }
      }
    } catch (error) {
      logger.error("Failed to merge duplicate group", {
        normalized,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      errors++
    }
  }

  logger.info("Duplicate merge completed", {
    dryRun: DRY_RUN,
    groups: duplicateGroups.length,
    merged,
    errors,
  })

  await database.knex.destroy()
  process.exit(errors > 0 ? 1 : 0)
}

mergeDuplicates()
