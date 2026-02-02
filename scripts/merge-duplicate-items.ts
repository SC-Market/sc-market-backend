#!/usr/bin/env tsx
/**
 * Merge duplicate game items
 * Merges all related data (attributes, listings, buy orders, price history)
 * from duplicate items into the canonical item, then deletes duplicates
 *
 * Usage:
 *   npm run merge-duplicates           # Normal mode
 *   npm run merge-duplicates -- --dry  # Dry run mode
 */

import { database } from "../src/clients/database/knex-db.js"
import logger from "../src/logger/logger.js"

const DRY_RUN =
  process.argv.includes("--dry") || process.argv.includes("--dry-run")

// Duplicate pairs: [source_id, target_id]
// Source will be merged into target, then deleted
const DUPLICATES: [string, string][] = [
  // Exact duplicates - Year envelopes
  [
    "a59dcc1a-5152-4054-9a56-9b5669273b38",
    "92fb798e-b4dc-458a-b752-4c3df61f3765",
  ], // Year Of The Monkey
  [
    "c326beb6-169f-4f39-94c8-146076bd300a",
    "e432e7be-0677-4341-b851-6aa74256dd9d",
  ], // Year Of The Rooster
  [
    "078a063f-5b99-4b02-8abe-161cf058a312",
    "9b39e511-9554-4fe3-832a-414960369ebf",
  ], // Year Of The Dog
  [
    "ce1e72ac-1476-46ff-a605-43425d6d0a5d",
    "3c478b61-cb45-429b-8abf-a6419baff59d",
  ], // Year Of The Pig

  // medical supplies
  [
    "25373d38-9f6f-4ae1-b5f9-e2615922bfd8",
    "148eaaf6-b15c-4de5-bc65-9c222f2ed81a",
  ],

  // Trailing space duplicates
  [
    "89f8a0f4-0001-41c9-af61-ef2fdd44c4f3",
    "0023af85-eec8-4e2f-80b6-5e3c0d6c5e39",
  ], // Boreal Quasi Grazer Egg
  [
    "39e1a1fb-08d4-4270-a0ed-8799c1124d2c",
    "62594556-2eed-4c1a-9031-6da3e332ca4f",
  ], // CitizenCon '54 Coin
  [
    "d037f147-75d1-445b-b290-7683561979b6",
    "6ea3e248-e64b-45e7-b099-19e3d7f68be8",
  ], // DeconPen
  [
    "3abf5b5b-3480-4c9b-b871-0ed33cf23f4c",
    "3533072a-a853-4f03-9d40-cfaf8042b334",
  ], // DCHS-01
  [
    "410c0c9d-1fd6-4956-91bc-d29ddcca27fe",
    "6311a0c6-d31c-4fbd-877e-fc3f05780824",
  ], // Get Up Coffee
  [
    "b32f8f24-5f65-4531-8760-791872b72962",
    "c24188bc-cc49-4ff5-87eb-ebc083a30ca8",
  ], // Tracer Laser Pointer
  [
    "064a0316-5bc8-46d8-a815-7a6ec285105b",
    "cf1aad44-8147-49ff-8c05-a81677eb2a03",
  ], // Liberator
  [
    "4a73dc64-97f5-4f24-b082-d06f77c91701",
    "c7d6e116-eff1-41ea-a07b-b62fed983c49",
  ], // Pyro RYT Bloodline
  [
    "08bff8a9-8490-4ea8-87db-21858398d3f1",
    "5cf3cc8d-5577-4846-93dc-83b7cdbd14a6",
  ], // Theta Pro
  [
    "51231e43-5160-4e98-8d83-d4646a1b3f8e",
    "6e9c503b-8873-4dee-bd02-b03935d4fd04",
  ], // Venture Undersuit Voyager
  [
    "4e0deba3-da49-4516-b84e-306d5b95bcfe",
    "c17f20e6-ef86-495f-8a76-a43ad98d43c5",
  ], // Vulture Longhorn
  [
    "dce21ce5-dc69-4a43-b41d-a8bc0a689d3b",
    "e0c0bd2c-5c7b-4be9-a9f9-df9505f549ce",
  ], // Microid Arms
  [
    "dd641b88-9dc4-4565-96d2-b0d3c2702abc",
    "0e5fb9e1-79f3-4430-b56f-732b9f072003",
  ], // Pembroke Helmet
  [
    "a20f97d9-b418-4512-8611-0a147024ff5d",
    "cb3d7b19-6221-4595-ae27-eb51e3cd0383",
  ], // Geoffrey Jacket
  [
    "3ee68837-2cba-402d-8ff4-0f370f518b34",
    "0455f052-8ea4-4b66-be4b-ee78bbafc431",
  ], // P8-SC Warhawk
  [
    "0ee555d1-0683-4f72-935b-93e93a42bfb8",
    "8cf63537-c2bf-4a24-aa53-8e5902a34b68",
  ], // FSK-8 Mirage
  [
    "e1fb31c6-8cef-450f-b724-7570c1066281",
    "230e3312-47f4-44ad-bb9e-ac3e0a926163",
  ], // FSK-8 Ghost
  [
    "002dfe9f-5a98-4391-97e1-6244ee10925c",
    "69eb57fd-376f-4e66-b569-a51f93a14cd9",
  ], // Hellion Scattergun
  [
    "c373a1eb-60da-42b1-96ab-177f22168834",
    "80c6e1c3-668a-415a-92e5-951399a1ea51",
  ], // DustUp Core
  [
    "ccc58f8e-ba82-4790-865a-56fe5de8858c",
    "2efac2b1-1258-4889-a7b5-1ded571fb7ee",
  ], // Arrowhead Voyager
  [
    "6f247c27-5744-4dc9-8873-94d01b091ef3",
    "46bfe5be-3e4c-44c5-9d39-ce904958fec8",
  ], // P8-SC Nightstalker
  [
    "ae3d929b-c2a7-4c62-910a-eeae083a2c17",
    "c78d8825-fba1-4415-a253-2cd4c884ede6",
  ], // Inquisitor Core
  [
    "22a6406e-42d1-4577-9fd3-1757fbf796c4",
    "13cfe6e3-9843-4bec-ae0d-dc321a76c287",
  ], // Torreto Pants
  [
    "f7b9ad89-e6e5-4f4a-9b6e-12c757a435f8",
    "15f72479-afb0-4de1-a466-25f66705a231",
  ], // FSK-8 Bloodline
  [
    "2ffad804-7a11-4014-b0ba-e0661a2c2b23",
    "63cc19a2-6083-4c7c-a2dc-8ac7a9064588",
  ], // P8-SC Midnight
  [
    "1d2d7556-9647-4188-aa78-cc59255e3a94",
    "dfa81ae7-dfde-48c9-83fb-2d5c84821aa4",
  ], // MVSA Cannon
  [
    "b8ef4309-0e07-4e94-b2be-e884cb87f841",
    "9086f544-17a8-48c7-9a30-bb8a1c1107cc",
  ], // Venture Undersuit Pathfinder
  [
    "67c6e102-8330-4073-a90a-2d2e50edad3c",
    "7bd17705-fff0-46be-b634-84312700d54d",
  ], // Pyro RYT Mirage
  [
    "d5effdbe-6882-4edb-9721-095c346b7113",
    "192c85f6-8853-40b9-aab8-ab6621513101",
  ], // MSD-212
  [
    "af81c32a-ff68-4a44-a7db-884d757a228b",
    "0efb41a1-25aa-474b-b66e-be5d02e5b9c3",
  ], // Arrowhead Pathfinder
  [
    "7bee687e-113e-4e69-9afd-14eedabe9c37",
    "bcc1195d-2bc1-401a-b8de-9b5ef8655e2a",
  ], // Microid Core
  [
    "df6af42b-a1e8-44f7-b7e0-608bc3bc1b66",
    "9e37f53b-17f4-496b-8c10-15cb44340313",
  ], // Microid Helmet
  [
    "416f8f7a-73c8-4777-ab22-01ea62df107c",
    "d86290e1-7e24-4418-b575-7ac7eb51ee4b",
  ], // Luminalia Stick
  [
    "40afe0df-8d4c-4161-9563-557e6abe7c61",
    "82987a08-97ec-4f74-8093-e0d63513c7b3",
  ], // Pyro RYT Ghost
  [
    "5a8bd1ab-32c0-430e-9752-3f48170b2b4e",
    "2e968292-e8ca-4c6e-a026-69ca35935301",
  ], // LH86 Voyager
  [
    "3a5b0270-266b-49ff-986f-b6ed7fe587dd",
    "726cf320-1961-4ecf-a345-0cd37e5804c6",
  ], // Inquisitor Full Set
  [
    "c5e71057-3788-4622-88e3-7f0c4eb9803d",
    "4e3da8af-9f05-4c4f-a2f4-f81d6b4aacb9",
  ], // Microid Full Set

  // Armor name order variations
  [
    "66d0bbab-18ee-48e7-9016-956200609f09",
    "d9ef0f2d-a374-423a-9ef2-a3d6e93b08e3",
  ], // DCP Core Clawed Steel
  [
    "f9a8cec4-a41b-4a98-933e-cc751562ea29",
    "093586f6-586f-40ea-a4d9-dd66a5b613ef",
  ], // DCP Arms New Dawn
  [
    "32b0724e-b1ac-42ac-a390-cd88d68a797c",
    "4d70d02c-ba04-4756-b703-f502f543be2e",
  ], // DCP Arms Clawed Steel
  [
    "85e7e763-5aab-4f5f-b100-cbb062de948d",
    "71dff091-a8eb-419b-80d9-2f283abb55b6",
  ], // DCP Legs Clawed Steel
  [
    "e6fd12c0-d0c0-4ded-bbe3-cbf49fe0ae5e",
    "7ba591b1-a081-4802-9f86-1c592460e4eb",
  ], // DCP Helmet Clawed Steel
  [
    "1cd2b6cb-2819-41dc-8b09-280f31185036",
    "f3cd9a6c-48c8-4946-bdde-e766c1e5c5f3",
  ], // DCP Core New Dawn
  [
    "191c1ba3-39fe-4c08-8a1d-64219e9e8c26",
    "4b8c531e-cc1c-42c2-8636-b8fe2d861d32",
  ], // DCP Helmet New Dawn
  [
    "6cbecd14-bb0a-4fe7-918c-e8ce1fc7e558",
    "94a2f7df-92f8-44b5-9865-69de901d5778",
  ], // DCP Legs New Dawn
  [
    "eb9b59d7-2353-433f-97e1-bc7fd447fdc8",
    "0e584a3d-1d88-4874-b389-fe088a5dd132",
  ], // Venture Helmet Executive
  [
    "4baddc7f-ecb1-4655-bf7a-2709570e3807",
    "3be9bf05-3673-49d4-b102-e1a6753ed5d0",
  ], // Venture Legs Executive
  [
    "3fd0a7e5-e18c-45c1-9138-aad7b83aa80c",
    "c95301ea-e7bf-47f4-9b5a-0ad0d832bcda",
  ], // Venture Arms Executive
  [
    "86d455d5-6128-4349-9c16-2d689d8d4cd9",
    "16ec4d48-9b1d-478a-be16-8d36bdaeaf4d",
  ], // Venture Core Executive
  [
    "230e2fbf-c4ab-44d7-81ef-35dbf1501c07",
    "93b52ad5-de83-4513-8b00-c40d168c9e50",
  ], // ADP-mk4 Legs Red Alert
  [
    "effda51a-3c36-405c-b8c3-9e66084b95dd",
    "c054252e-e100-4b01-8ec0-819c53303581",
  ], // ADP-mk4 Arms Red Alert
  [
    "b5f52c4e-feb2-42a7-a88b-2d0dc9ed1f50",
    "6ab2b2ba-b591-4945-a292-d7b9130a228a",
  ], // Aril Legs Red Alert
  [
    "cd3d96fa-501b-48af-a8e0-1082e95b1a74",
    "9e52f845-7b50-4e2c-9182-614679f065ec",
  ], // Aril Arms Red Alert
  [
    "68284e83-8cd6-4e20-bac9-0d9ce96a0b00",
    "4ffdda8a-1747-4b0a-ab22-5626dd086053",
  ], // Morozov-SH Arms Red Alert
  [
    "f7f435e6-ba95-4819-9b35-ecb08e471353",
    "6bd7765a-8b3b-4458-b49e-4a301954ae0b",
  ], // Morozov-SH Legs Red Alert
  [
    "f82a43b8-4f44-458a-9087-c26a21062da6",
    "d28528c3-f902-47b0-88b5-b79bc61d8102",
  ], // Morozov-SH Helmet Red Alert
  [
    "cb9652b3-b11d-4dec-92fe-5deb5fddb21e",
    "5ecad13b-cbdb-4e30-95d5-4cab9a6e94ef",
  ], // Morozov-CH Backpack Red Alert
  [
    "921a9eb0-6f89-4025-bad4-7b96ac943ecc",
    "98b9e2d8-8d32-47b5-9f24-61fb15124e68",
  ], // Aves Legs Talon
  [
    "f84ddbc4-3408-4477-9448-fa087e5c98d5",
    "eaadcdc3-6c12-40d2-b54b-e2a2af82fa15",
  ], // Aves Helmet Talon
  [
    "e6220e17-9337-414a-8407-8cc94e5391a4",
    "8a5e2703-bb79-4eac-9ce1-6524736627ed",
  ], // Aves Arms Talon
  [
    "5d12f62c-690f-4243-aa77-80907d2f8bd9",
    "f22c03de-a3e4-4264-90b7-3fc80ea08adc",
  ], // Aves Core Talon
  [
    "b653feb1-72fc-46e4-a018-23b072ef6b95",
    "c955f002-48ae-4705-be3c-086cc8a29818",
  ], // Dust Devil Arms
  [
    "35fe1b8c-4820-4e24-95c9-414ef01f0017",
    "991cda3a-ccc6-401a-abf5-0010177c5335",
  ], // Dust Devil Legs
  [
    "b98a2f5e-56b1-43a6-a6d5-420c78ff407c",
    "c9229ae1-6342-4360-b52a-6ffa8c2d8ed7",
  ], // Dust Devil Core
  [
    "5893eaa4-6e7a-47c8-8b75-ced0ad4433af",
    "af1b64d3-7476-4575-93d2-db81652bbda1",
  ], // Carinite (Pure)
]

async function mergeDuplicates() {
  logger.info("Starting duplicate merge", { dryRun: DRY_RUN })

  if (DRY_RUN) {
    logger.info("DRY RUN MODE - No database changes will be made")
  }

  let merged = 0
  let errors = 0

  for (const [sourceId, targetId] of DUPLICATES) {
    try {
      // Get item names for logging
      const [sourceItem, targetItem] = await Promise.all([
        database.knex("game_items").where("id", sourceId).first("name"),
        database.knex("game_items").where("id", targetId).first("name"),
      ])

      if (!sourceItem || !targetItem) {
        logger.warn("Item not found", { sourceId, targetId })
        errors++
        continue
      }

      // Get counts of related data
      const [attrCount, listingCount, buyOrderCount, priceHistoryCount] =
        await Promise.all([
          database
            .knex("game_item_attributes")
            .where("game_item_id", sourceId)
            .count("* as count")
            .first()
            .then((r) => Number(r?.count || 0)),
          database
            .knex("market_listing_details")
            .where("game_item_id", sourceId)
            .count("* as count")
            .first()
            .then((r) => Number(r?.count || 0)),
          database
            .knex("market_buy_orders")
            .where("game_item_id", sourceId)
            .count("* as count")
            .first()
            .then((r) => Number(r?.count || 0)),
          database
            .knex("market_price_history")
            .where("game_item_id", sourceId)
            .count("* as count")
            .first()
            .then((r) => Number(r?.count || 0)),
        ])

      if (DRY_RUN) {
        logger.info(
          `[DRY RUN] Would merge: "${sourceItem.name}" → "${targetItem.name}"`,
          {
            sourceId,
            targetId,
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
            .where("game_item_id", sourceId)
            .select("attribute_name", "attribute_value")

          for (const attr of sourceAttrs) {
            await trx("game_item_attributes")
              .insert({
                game_item_id: targetId,
                attribute_name: attr.attribute_name,
                attribute_value: attr.attribute_value,
              })
              .onConflict(["game_item_id", "attribute_name"])
              .ignore()
          }

          await trx("game_item_attributes")
            .where("game_item_id", sourceId)
            .delete()

          // Update market_listing_details
          await trx("market_listing_details")
            .where("game_item_id", sourceId)
            .update({ game_item_id: targetId })

          // Update market_buy_orders
          await trx("market_buy_orders")
            .where("game_item_id", sourceId)
            .update({ game_item_id: targetId })

          // Merge price history (keep most recent for each date)
          const sourcePrices = await trx("market_price_history")
            .where("game_item_id", sourceId)
            .select("price", "quantity_available", "date")

          for (const price of sourcePrices) {
            await trx("market_price_history")
              .insert({
                game_item_id: targetId,
                price: price.price,
                quantity_available: price.quantity_available,
                date: price.date,
              })
              .onConflict(["game_item_id", "date"])
              .merge()
          }

          await trx("market_price_history")
            .where("game_item_id", sourceId)
            .delete()

          // Delete source item
          await trx("game_items").where("id", sourceId).delete()
        })

        logger.info(`Merged: "${sourceItem.name}" → "${targetItem.name}"`, {
          sourceId,
          targetId,
          attributes: attrCount,
          listings: listingCount,
          buyOrders: buyOrderCount,
          priceHistory: priceHistoryCount,
        })
        merged++
      }
    } catch (error) {
      logger.error("Failed to merge items", {
        sourceId,
        targetId,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      errors++
    }
  }

  logger.info("Duplicate merge completed", {
    dryRun: DRY_RUN,
    total: DUPLICATES.length,
    merged,
    errors,
  })

  await database.knex.destroy()
  process.exit(errors > 0 ? 1 : 0)
}

mergeDuplicates()
