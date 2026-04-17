#!/usr/bin/env tsx
/**
 * V1 to V2 Migration Script
 *
 * Executes the V1ToV2MigrationService to migrate all V1 listings to V2 format.
 * This script:
 * - Reads V1 listings (read-only, no modifications to V1 tables)
 * - Creates V2 listings with default variants
 * - Logs migration progress and errors
 * - Verifies V1 tables remain unchanged
 *
 * Requirements: 1.4, 58.5
 *
 * Usage:
 *   npm run migrate:v1-to-v2
 *   or
 *   tsx scripts/run-v1-to-v2-migration.ts
 */

import { getKnex } from "../src/clients/database/knex-db.js"
import { v1ToV2MigrationService } from "../src/services/market-v2/migration.service.js"

interface V1TableCounts {
  unique_listings: number
  aggregate_listings: number
  multiple_listings: number
  total: number
}

/**
 * Get row counts from V1 tables before migration
 */
async function getV1TableCounts(): Promise<V1TableCounts> {
  const db = getKnex()

  const [uniqueCount] = await db("market_unique_listings").count("* as count")
  const [aggregateCount] = await db("market_aggregate_listings").count(
    "* as count",
  )
  const [multipleCount] = await db("market_multiple_listings").count(
    "* as count",
  )

  return {
    unique_listings: Number(uniqueCount.count),
    aggregate_listings: Number(aggregateCount.count),
    multiple_listings: Number(multipleCount.count),
    total:
      Number(uniqueCount.count) +
      Number(aggregateCount.count) +
      Number(multipleCount.count),
  }
}

/**
 * Verify V1 tables remain unchanged after migration
 */
async function verifyV1TablesUnchanged(
  beforeCounts: V1TableCounts,
): Promise<boolean> {
  const afterCounts = await getV1TableCounts()

  const unchanged =
    beforeCounts.unique_listings === afterCounts.unique_listings &&
    beforeCounts.aggregate_listings === afterCounts.aggregate_listings &&
    beforeCounts.multiple_listings === afterCounts.multiple_listings

  if (!unchanged) {
    console.error("❌ V1 tables were modified during migration!")
    console.error("Before:", beforeCounts)
    console.error("After:", afterCounts)
    return false
  }

  console.log("✅ V1 tables remain unchanged")
  return true
}

/**
 * Get row count from V2 listings table
 */
async function getV2ListingCount(): Promise<number> {
  const db = getKnex()
  const [result] = await db("listings").count("* as count")
  return Number(result.count)
}

/**
 * Main migration execution
 */
async function main() {
  console.log("🚀 Starting V1 to V2 migration...")
  console.log("=" .repeat(60))

  try {
    // 1. Get V1 table counts before migration
    console.log("\n📊 Counting V1 listings...")
    const beforeCounts = await getV1TableCounts()
    console.log(`  Unique listings: ${beforeCounts.unique_listings}`)
    console.log(`  Aggregate listings: ${beforeCounts.aggregate_listings}`)
    console.log(`  Multiple listings: ${beforeCounts.multiple_listings}`)
    console.log(`  Total V1 listings: ${beforeCounts.total}`)

    // 2. Get V2 listing count before migration
    const v2CountBefore = await getV2ListingCount()
    console.log(`\n📊 V2 listings before migration: ${v2CountBefore}`)

    // 3. Execute migration
    console.log("\n🔄 Migrating V1 listings to V2...")
    const startTime = Date.now()

    const summary = await v1ToV2MigrationService.migrateAllListings()

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // 4. Display migration results
    console.log("\n" + "=".repeat(60))
    console.log("📈 Migration Summary")
    console.log("=".repeat(60))
    console.log(`  Total attempted: ${summary.total_attempted}`)
    console.log(`  ✅ Successful: ${summary.successful}`)
    console.log(`  ❌ Failed: ${summary.failed}`)
    console.log(`  ⏭️  Skipped: ${summary.skipped}`)
    console.log(`  ⏱️  Duration: ${duration}s`)

    // 5. Display errors if any
    if (summary.errors.length > 0) {
      console.log("\n❌ Migration Errors:")
      console.log("=".repeat(60))
      summary.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. V1 Listing ${error.v1_listing_id}:`)
        console.log(`     ${error.error}`)
      })
    }

    // 6. Verify V1 tables remain unchanged
    console.log("\n🔍 Verifying V1 tables remain unchanged...")
    const v1Unchanged = await verifyV1TablesUnchanged(beforeCounts)

    // 7. Get V2 listing count after migration
    const v2CountAfter = await getV2ListingCount()
    console.log(`\n📊 V2 listings after migration: ${v2CountAfter}`)
    console.log(
      `   New V2 listings created: ${v2CountAfter - v2CountBefore}`,
    )

    // 8. Final status
    console.log("\n" + "=".repeat(60))
    if (summary.failed === 0 && v1Unchanged) {
      console.log("✅ Migration completed successfully!")
      console.log(
        `   ${summary.successful} listings migrated from V1 to V2`,
      )
      console.log("   V1 tables remain unchanged (read-only)")
      process.exit(0)
    } else {
      console.log("⚠️  Migration completed with issues:")
      if (summary.failed > 0) {
        console.log(`   ${summary.failed} listings failed to migrate`)
      }
      if (!v1Unchanged) {
        console.log("   V1 tables were modified (should be read-only)")
      }
      process.exit(1)
    }
  } catch (error) {
    console.error("\n❌ Migration failed with error:")
    console.error(error)
    process.exit(1)
  }
}

// Execute migration
main()
