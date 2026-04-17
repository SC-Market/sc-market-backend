#!/usr/bin/env tsx
/**
 * V1 to V2 Migration Script (Standalone)
 *
 * Standalone version that connects directly to the database without
 * initializing the full application stack.
 *
 * Requirements: 1.4, 58.5
 */

import Knex from "knex"
import * as dotenv from "dotenv"
import * as crypto from "crypto"

// Load environment variables
dotenv.config()

// Parse database configuration
const dbConfig = JSON.parse(process.env.DATABASE_PASS || "{}")

// Create Knex instance
const knex = Knex({
  client: "pg",
  connection: {
    host: dbConfig.host || "localhost",
    user: dbConfig.username || "postgres",
    password: dbConfig.password || "",
    database: dbConfig.dbname || "postgres",
    port: dbConfig.port || 5432,
  },
  pool: {
    min: 0,
    max: 5,
  },
})

interface VariantAttributes {
  quality_tier?: number
  quality_value?: number
  crafted_source?: "crafted" | "store" | "looted" | "unknown"
  blueprint_tier?: number
}

interface MigrationResult {
  success: boolean
  listing_id?: string
  v1_listing_id: string
  error?: string
}

interface MigrationSummary {
  total_attempted: number
  successful: number
  failed: number
  skipped: number
  errors: Array<{
    v1_listing_id: string
    error: string
  }>
}

const DEFAULT_V1_VARIANT_ATTRIBUTES: VariantAttributes = {
  crafted_source: "unknown",
}

/**
 * Normalize variant attributes by sorting keys alphabetically
 */
function normalizeVariantAttributes(
  attributes: VariantAttributes,
): VariantAttributes {
  const normalized: VariantAttributes = {}
  const keys = Object.keys(attributes).sort()

  for (const key of keys) {
    const value = attributes[key as keyof VariantAttributes]
    if (value !== undefined && value !== null) {
      // Type assertion to satisfy TypeScript - we know the key is valid
      (normalized as any)[key] = value
    }
  }

  return normalized
}

/**
 * Generate SHA-256 hash of variant attributes
 */
function generateAttributesHash(attributes: VariantAttributes): string {
  const normalized = normalizeVariantAttributes(attributes)
  const json = JSON.stringify(normalized)
  return crypto.createHash("sha256").update(json).digest("hex")
}

/**
 * Get or create variant with deduplication
 * Handles race conditions by catching duplicate key errors
 */
async function getOrCreateVariant(
  gameItemId: string,
  attributes: VariantAttributes,
): Promise<string> {
  const normalized = normalizeVariantAttributes(attributes)
  const hash = generateAttributesHash(normalized)

  // Try to find existing variant
  const existing = await knex("item_variants")
    .where({
      game_item_id: gameItemId,
      attributes_hash: hash,
    })
    .first()

  if (existing) {
    return existing.variant_id
  }

  // Try to create new variant, handle race condition
  try {
    const [variant] = await knex("item_variants")
      .insert({
        game_item_id: gameItemId,
        attributes: normalized,
        display_name: "Unknown Quality",
        short_name: "Unknown",
      })
      .returning("variant_id")

    return variant.variant_id
  } catch (error: any) {
    // If duplicate key error, another process created it - fetch it
    if (error.code === "23505") {
      const existing = await knex("item_variants")
        .where({
          game_item_id: gameItemId,
          attributes_hash: hash,
        })
        .first()

      if (existing) {
        return existing.variant_id
      }
    }

    throw error
  }
}

/**
 * Migrate a V1 unique listing
 */
async function migrateUniqueListing(v1Listing: any): Promise<MigrationResult> {
  try {
    if (!v1Listing.game_item_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing game_item_id",
      }
    }

    if (v1Listing.price <= 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid price (must be > 0)",
      }
    }

    if (v1Listing.quantity_available < 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid quantity (must be >= 0)",
      }
    }

    const seller_id = v1Listing.user_seller_id || v1Listing.contractor_seller_id
    const seller_type = v1Listing.user_seller_id ? "user" : "contractor"

    if (!seller_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing seller_id",
      }
    }

    // Check if this listing was already migrated (by checking if a V2 listing exists with same title and seller)
    const existingV2 = await knex("listings")
      .where({
        seller_id,
        seller_type,
        title: v1Listing.title,
      })
      .first()

    if (existingV2) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Already migrated (V2 listing exists with same title and seller)",
      }
    }

    let v2Status = v1Listing.status
    if (v1Listing.status === "inactive" || v1Listing.status === "archived") {
      v2Status = "cancelled"
    }

    let v2SaleType = v1Listing.sale_type
    if (v1Listing.sale_type === "sale") {
      v2SaleType = "fixed"
    }

    // Get or create variant BEFORE starting the listing transaction
    const variantId = await getOrCreateVariant(
      v1Listing.game_item_id,
      DEFAULT_V1_VARIANT_ATTRIBUTES,
    )

    const result = await knex.transaction(async (trx) => {
      const [listing] = await trx("listings")
        .insert({
          seller_id,
          seller_type,
          title: v1Listing.title,
          description: v1Listing.description,
          status: v2Status,
          visibility: v1Listing.internal ? "private" : "public",
          sale_type: v2SaleType,
          listing_type: "single",
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
          expires_at: v1Listing.expiration,
        })
        .returning("*")

      const [listingItem] = await trx("listing_items")
        .insert({
          listing_id: listing.listing_id,
          game_item_id: v1Listing.game_item_id,
          pricing_mode: "unified",
          base_price: v1Listing.price,
          display_order: 0,
          quantity_available: 0,
          variant_count: 0,
        })
        .returning("*")

      if (v1Listing.quantity_available > 0) {
        await trx("listing_item_lots").insert({
          item_id: listingItem.item_id,
          variant_id: variantId,
          quantity_total: v1Listing.quantity_available,
          location_id: null,
          owner_id: seller_id,
          listed: true,
          notes: `Migrated from V1 listing ${v1Listing.listing_id}`,
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
        })
      }

      return {
        success: true,
        listing_id: listing.listing_id,
        v1_listing_id: v1Listing.listing_id,
      }
    })

    return result
  } catch (error) {
    return {
      success: false,
      v1_listing_id: v1Listing.listing_id,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Migrate all V1 unique listings
 */
async function migrateAllUniqueListings(): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    total_attempted: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  const v1Listings = await knex("market_listings as ml")
    .join("market_unique_listings as mul", "ml.listing_id", "mul.listing_id")
    .leftJoin(
      "market_listing_details as mld",
      "mul.details_id",
      "mld.details_id",
    )
    .select(
      "ml.listing_id",
      "ml.sale_type",
      "ml.price",
      "ml.quantity_available",
      "ml.status",
      "ml.internal",
      "ml.user_seller_id",
      "ml.contractor_seller_id",
      "ml.timestamp",
      "ml.expiration",
      "mul.accept_offers",
      "mul.details_id",
      "mld.item_type",
      "mld.title",
      "mld.description",
      "mld.game_item_id",
    )

  summary.total_attempted = v1Listings.length

  for (const v1Listing of v1Listings) {
    const result = await migrateUniqueListing(v1Listing)

    if (result.success) {
      summary.successful++
    } else {
      summary.failed++
      summary.errors.push({
        v1_listing_id: result.v1_listing_id,
        error: result.error || "Unknown error",
      })
    }
  }

  return summary
}

/**
 * Migrate all V1 aggregate listings
 */
async function migrateAllAggregateListings(): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    total_attempted: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  const v1Listings = await knex("market_listings as ml")
    .join(
      "market_aggregate_listings as mal",
      "ml.listing_id",
      "mal.aggregate_listing_id",
    )
    .join("market_aggregates as ma", "mal.aggregate_id", "ma.aggregate_id")
    .leftJoin(
      "market_listing_details as mld",
      "ma.details_id",
      "mld.details_id",
    )
    .select(
      "ml.listing_id",
      "ml.sale_type",
      "ml.price",
      "ml.quantity_available",
      "ml.status",
      "ml.internal",
      "ml.user_seller_id",
      "ml.contractor_seller_id",
      "ml.timestamp",
      "ml.expiration",
      "mal.aggregate_id",
      "ma.details_id",
      "mld.item_type",
      "mld.title",
      "mld.description",
      "mld.game_item_id",
    )

  summary.total_attempted = v1Listings.length

  for (const v1Listing of v1Listings) {
    const result = await migrateUniqueListing(v1Listing) // Reuse same logic

    if (result.success) {
      summary.successful++
    } else {
      summary.failed++
      summary.errors.push({
        v1_listing_id: result.v1_listing_id,
        error: result.error || "Unknown error",
      })
    }
  }

  return summary
}

/**
 * Migrate all V1 multiple listings
 */
async function migrateAllMultipleListings(): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    total_attempted: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  const v1Listings = await knex("market_listings as ml")
    .join(
      "market_multiple_listings as mml",
      "ml.listing_id",
      "mml.multiple_listing_id",
    )
    .leftJoin(
      "market_listing_details as mld",
      "mml.details_id",
      "mld.details_id",
    )
    .select(
      "ml.listing_id",
      "ml.sale_type",
      "ml.price",
      "ml.quantity_available",
      "ml.status",
      "ml.internal",
      "ml.user_seller_id",
      "ml.contractor_seller_id",
      "ml.timestamp",
      "ml.expiration",
      "mml.multiple_id",
      "mml.details_id",
      "mld.item_type",
      "mld.title",
      "mld.description",
      "mld.game_item_id",
    )

  summary.total_attempted = v1Listings.length

  for (const v1Listing of v1Listings) {
    const result = await migrateUniqueListing(v1Listing) // Reuse same logic

    if (result.success) {
      summary.successful++
    } else {
      summary.failed++
      summary.errors.push({
        v1_listing_id: result.v1_listing_id,
        error: result.error || "Unknown error",
      })
    }
  }

  return summary
}

/**
 * Get V1 table counts
 */
async function getV1TableCounts() {
  const [uniqueCount] = await knex("market_unique_listings").count("* as count")
  const [aggregateCount] = await knex("market_aggregate_listings").count(
    "* as count",
  )
  const [multipleCount] = await knex("market_multiple_listings").count(
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
 * Get V2 listing count
 */
async function getV2ListingCount(): Promise<number> {
  const [result] = await knex("listings").count("* as count")
  return Number(result.count)
}

/**
 * Main migration execution
 */
async function main() {
  console.log("🚀 Starting V1 to V2 migration...")
  console.log("=".repeat(60))

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

    const uniqueSummary = await migrateAllUniqueListings()
    const aggregateSummary = await migrateAllAggregateListings()
    const multipleSummary = await migrateAllMultipleListings()

    const summary = {
      total_attempted:
        uniqueSummary.total_attempted +
        aggregateSummary.total_attempted +
        multipleSummary.total_attempted,
      successful:
        uniqueSummary.successful +
        aggregateSummary.successful +
        multipleSummary.successful,
      failed:
        uniqueSummary.failed +
        aggregateSummary.failed +
        multipleSummary.failed,
      skipped:
        uniqueSummary.skipped +
        aggregateSummary.skipped +
        multipleSummary.skipped,
      errors: [
        ...uniqueSummary.errors,
        ...aggregateSummary.errors,
        ...multipleSummary.errors,
      ],
    }

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
      summary.errors.slice(0, 10).forEach((error, index) => {
        console.log(`  ${index + 1}. V1 Listing ${error.v1_listing_id}:`)
        console.log(`     ${error.error}`)
      })
      if (summary.errors.length > 10) {
        console.log(`  ... and ${summary.errors.length - 10} more errors`)
      }
    }

    // 6. Verify V1 tables remain unchanged
    console.log("\n🔍 Verifying V1 tables remain unchanged...")
    const afterCounts = await getV1TableCounts()

    const unchanged =
      beforeCounts.unique_listings === afterCounts.unique_listings &&
      beforeCounts.aggregate_listings === afterCounts.aggregate_listings &&
      beforeCounts.multiple_listings === afterCounts.multiple_listings

    if (!unchanged) {
      console.error("❌ V1 tables were modified during migration!")
      console.error("Before:", beforeCounts)
      console.error("After:", afterCounts)
    } else {
      console.log("✅ V1 tables remain unchanged")
    }

    // 7. Get V2 listing count after migration
    const v2CountAfter = await getV2ListingCount()
    console.log(`\n📊 V2 listings after migration: ${v2CountAfter}`)
    console.log(`   New V2 listings created: ${v2CountAfter - v2CountBefore}`)

    // 8. Final status
    console.log("\n" + "=".repeat(60))
    if (summary.failed === 0 && unchanged) {
      console.log("✅ Migration completed successfully!")
      console.log(`   ${summary.successful} listings migrated from V1 to V2`)
      console.log("   V1 tables remain unchanged (read-only)")
      await knex.destroy()
      process.exit(0)
    } else {
      console.log("⚠️  Migration completed with issues:")
      if (summary.failed > 0) {
        console.log(`   ${summary.failed} listings failed to migrate`)
      }
      if (!unchanged) {
        console.log("   V1 tables were modified (should be read-only)")
      }
      await knex.destroy()
      process.exit(1)
    }
  } catch (error) {
    console.error("\n❌ Migration failed with error:")
    console.error(error)
    await knex.destroy()
    process.exit(1)
  }
}

// Execute migration
main()
