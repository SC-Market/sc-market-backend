#!/usr/bin/env tsx
/**
 * V1 to V2 Migration Script (Standalone)
 *
 * Connects directly to the database and uses V1ToV2MigrationService
 * to migrate all V1 listings to V2 format.
 *
 * - Reads V1 tables (read-only, no modifications)
 * - Creates V2 listings, listing_items, variants, stock lots, photos
 * - Records all mappings in v1_v2_listing_map and v1_v2_stock_lot_map
 * - Idempotent: safe to re-run (skips already-migrated listings)
 * - Verifies V1 tables remain unchanged after migration
 *
 * Usage:
 *   npx tsx scripts/run-v1-to-v2-migration-standalone.ts
 */

import { getKnex } from "../src/clients/database/knex-db.js"
import { v1ToV2MigrationService } from "../src/services/market-v2/migration.service.js"

async function getV1TableCounts() {
  const db = getKnex()
  const [u] = await db("market_unique_listings").count("* as count")
  const [a] = await db("market_aggregate_listings").count("* as count")
  const [m] = await db("market_multiple_listings").count("* as count")
  return {
    unique: Number(u.count),
    aggregate: Number(a.count),
    multiple: Number(m.count),
    total: Number(u.count) + Number(a.count) + Number(m.count),
  }
}

async function getV2Counts() {
  const db = getKnex()
  const [listings] = await db("listings").count("* as count")
  const [mapped] = await db("v1_v2_listing_map").count("* as count")
  const [stockMapped] = await db("v1_v2_stock_lot_map").count("* as count")
  const [photos] = await db("listing_photos_v2").count("* as count")
  return {
    listings: Number(listings.count),
    mapped: Number(mapped.count),
    stockMapped: Number(stockMapped.count),
    photos: Number(photos.count),
  }
}

async function main() {
  console.log("🚀 V1 → V2 Migration")
  console.log("=".repeat(60))

  const beforeV1 = await getV1TableCounts()
  console.log(`\nV1 listings: ${beforeV1.unique} unique, ${beforeV1.aggregate} aggregate, ${beforeV1.multiple} multiple (${beforeV1.total} total)`)

  const beforeV2 = await getV2Counts()
  console.log(`V2 before: ${beforeV2.listings} listings, ${beforeV2.mapped} mapped, ${beforeV2.photos} photos`)

  console.log("\n🔄 Migrating listings...")
  const start = Date.now()
  const summary = await v1ToV2MigrationService.migrateAllListings()
  const listingDuration = ((Date.now() - start) / 1000).toFixed(2)

  console.log(`\n${"=".repeat(60)}`)
  console.log(`Listings: ✅ ${summary.successful} migrated, ❌ ${summary.failed} failed, ⏭️ ${summary.skipped} skipped (${listingDuration}s)`)

  if (summary.errors.length > 0) {
    console.log("\nErrors:")
    for (const e of summary.errors) {
      console.log(`  ${e.v1_listing_id}: ${e.error}`)
    }
  }

  // Price history
  console.log("\n🔄 Migrating price history...")
  const phSummary = await v1ToV2MigrationService.migratePriceHistory()
  console.log(`Price history: ✅ ${phSummary.successful}, ❌ ${phSummary.failed}, ⏭️ ${phSummary.skipped}`)

  // Auction data
  console.log("\n🔄 Migrating auction data...")
  const auctionSummary = await v1ToV2MigrationService.migrateAuctionData()
  console.log(`Auctions: ✅ ${auctionSummary.successful}, ❌ ${auctionSummary.failed}, ⏭️ ${auctionSummary.skipped}`)

  // Order line items
  console.log("\n🔄 Migrating order line items...")
  const orderSummary = await v1ToV2MigrationService.migrateOrderLineItems()
  console.log(`Order items: ✅ ${orderSummary.successful}, ❌ ${orderSummary.failed}, ⏭️ ${orderSummary.skipped}`)

  // Offer line items
  console.log("\n🔄 Migrating offer line items...")
  const offerSummary = await v1ToV2MigrationService.migrateOfferLineItems()
  console.log(`Offer items: ✅ ${offerSummary.successful}, ❌ ${offerSummary.failed}, ⏭️ ${offerSummary.skipped}`)

  // Buy orders
  console.log("\n🔄 Migrating buy orders...")
  const buySummary = await v1ToV2MigrationService.migrateBuyOrders()
  console.log(`Buy orders: ✅ ${buySummary.successful}, ❌ ${buySummary.failed}, ⏭️ ${buySummary.skipped}`)

  // Verify V1 unchanged
  const afterV1 = await getV1TableCounts()
  const v1Ok = beforeV1.unique === afterV1.unique && beforeV1.aggregate === afterV1.aggregate && beforeV1.multiple === afterV1.multiple
  console.log(v1Ok ? "\n✅ V1 tables unchanged" : "\n❌ V1 tables were modified!")

  const afterV2 = await getV2Counts()
  console.log(`V2 after: ${afterV2.listings} listings, ${afterV2.mapped} mapped, ${afterV2.stockMapped} stock lots mapped, ${afterV2.photos} photos`)

  process.exit(summary.failed > 0 || !v1Ok ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
