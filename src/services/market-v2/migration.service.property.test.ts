/**
 * Property tests for MigrationService
 *
 * These tests validate V1 data immutability, migration completeness,
 * metadata preservation, and default variant creation using property-based
 * testing with fast-check.
 *
 * NOTE: These tests require a real database connection and are skipped in the
 * default test suite. To run these tests, set up a test database and remove
 * the .skip modifier.
 *
 * Requirements: 1.4, 1.6, 11.1, 11.2, 11.3, 11.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { MigrationService } from "./migration.service.js"
import { getKnex } from "../../clients/database/knex-db.js"
import type { Knex } from "knex"

describe.skip("Market V2 - Migration Property Tests (Integration)", () => {
  let knex: Knex
  let service: MigrationService
  let testUserIds: string[] = []
  let testGameItemIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new MigrationService(knex)

    // Clean up any existing V2 data
    await knex("stock_lots").del()
    await knex("listing_items").del()
    await knex("listings").del()
    await knex("item_variants").del()
  })

  afterEach(async () => {
    // Clean up test data
    await knex("stock_lots").del()
    await knex("listing_items").del()
    await knex("listings").del()
    await knex("item_variants").del()

    // Clean up V1 test data
    for (const userId of testUserIds) {
      await knex("market_unique_listings")
        .whereIn(
          "listing_id",
          knex("market_listings").select("listing_id").where("user_seller_id", userId),
        )
        .del()
      await knex("market_listings").where("user_seller_id", userId).del()
    }

    for (const gameItemId of testGameItemIds) {
      await knex("market_listing_details")
        .where("game_item_id", gameItemId)
        .del()
      await knex("game_items").where("game_item_id", gameItemId).del()
    }

    testUserIds = []
    testGameItemIds = []
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 1: V1 Data Immutability During V2 Operations
   *
   * For any V2 operation (including migration), V1 tables SHALL remain
   * completely unchanged. No rows added, modified, or deleted.
   *
   * **Validates: Requirements 1.4, 1.6, 11.5**
   */
  it("Property 1: V1 data immutability - V1 tables unchanged after migration", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of test listings to create
        async (numListings) => {
          // Create test data in V1 tables
          const testData = await createV1TestData(numListings)
          testUserIds.push(...testData.userIds)
          testGameItemIds.push(...testData.gameItemIds)

          // Snapshot V1 tables before migration
          const v1SnapshotBefore = await snapshotV1Tables(knex)

          // Run migration
          await service.runMigration()

          // Snapshot V1 tables after migration
          const v1SnapshotAfter = await snapshotV1Tables(knex)

          // Verify V1 tables unchanged
          expect(v1SnapshotAfter.unique_listings_count).toBe(
            v1SnapshotBefore.unique_listings_count,
          )
          expect(v1SnapshotAfter.aggregate_listings_count).toBe(
            v1SnapshotBefore.aggregate_listings_count,
          )
          expect(v1SnapshotAfter.multiple_listings_count).toBe(
            v1SnapshotBefore.multiple_listings_count,
          )
          expect(v1SnapshotAfter.unique_listings_checksum).toBe(
            v1SnapshotBefore.unique_listings_checksum,
          )
          expect(v1SnapshotAfter.aggregate_listings_checksum).toBe(
            v1SnapshotBefore.aggregate_listings_checksum,
          )
          expect(v1SnapshotAfter.multiple_listings_checksum).toBe(
            v1SnapshotBefore.multiple_listings_checksum,
          )
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 24: Migration Completeness
   *
   * For any set of V1 listings, after migration, every V1 listing SHALL have
   * a corresponding V2 listing with the same listing_id.
   *
   * **Validates: Requirements 11.1**
   */
  it("Property 24: migration completeness - all V1 listings have V2 equivalents", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of test listings
        async (numListings) => {
          // Create test data in V1 tables
          const testData = await createV1TestData(numListings)
          testUserIds.push(...testData.userIds)
          testGameItemIds.push(...testData.gameItemIds)

          // Get V1 listing IDs
          const v1ListingIds = testData.listingIds

          // Run migration
          await service.runMigration()

          // Verify all V1 listings exist in V2
          for (const listingId of v1ListingIds) {
            const v2Listing = await knex("listings")
              .where("listing_id", listingId)
              .first()

            expect(v2Listing).toBeDefined()
            expect(v2Listing?.listing_id).toBe(listingId)
          }

          // Verify count matches
          const v2Count = await knex("listings")
            .whereIn("listing_id", v1ListingIds)
            .count("* as count")

          expect(parseInt(String(v2Count[0].count), 10)).toBe(
            v1ListingIds.length,
          )
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 26: Migration Metadata Preservation
   *
   * For any V1 listing with metadata (title, description, seller, status,
   * timestamps), after migration, the V2 listing SHALL preserve all metadata
   * fields accurately.
   *
   * **Validates: Requirements 11.3**
   */
  it("Property 26: migration metadata preservation - all metadata preserved in V2", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.string({ minLength: 1, maxLength: 500 }),
          price: fc.integer({ min: 1, max: 1000000 }),
          quantity: fc.integer({ min: 1, max: 100 }),
        }),
        async (metadata) => {
          // Create test data with specific metadata
          const testData = await createV1TestDataWithMetadata(metadata)
          testUserIds.push(testData.userId)
          testGameItemIds.push(testData.gameItemId)

          // Run migration
          await service.runMigration()

          // Verify metadata preserved in V2
          const v2Listing = await knex("listings")
            .where("listing_id", testData.listingId)
            .first()

          expect(v2Listing).toBeDefined()
          expect(v2Listing?.title).toBe(metadata.title)
          expect(v2Listing?.description).toBe(metadata.description)
          expect(v2Listing?.seller_id).toBe(testData.userId)
          expect(v2Listing?.status).toBe("active")

          // Verify listing_item has correct price
          const listingItem = await knex("listing_items")
            .where("listing_id", testData.listingId)
            .first()

          expect(listingItem).toBeDefined()
          expect(parseInt(String(listingItem?.base_price), 10)).toBe(
            metadata.price,
          )
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 25: Migration Default Variants
   *
   * For any V1 item without quality data, after migration, a default variant
   * SHALL be created with quality_tier=1, quality_value=25,
   * crafted_source='store'.
   *
   * **Validates: Requirements 11.2**
   */
  it("Property 25: migration default variants - correct default attributes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of test items
        async (numItems) => {
          // Create test data
          const testData = await createV1TestData(numItems)
          testUserIds.push(...testData.userIds)
          testGameItemIds.push(...testData.gameItemIds)

          // Run migration
          await service.runMigration()

          // Verify default variants created for all game items
          for (const gameItemId of testData.gameItemIds) {
            const variant = await knex("item_variants")
              .where("game_item_id", gameItemId)
              .first()

            expect(variant).toBeDefined()
            expect(variant?.attributes).toBeDefined()
            expect(variant?.attributes.quality_tier).toBe(1)
            expect(variant?.attributes.quality_value).toBe(25)
            expect(variant?.attributes.crafted_source).toBe("store")
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  // Helper functions

  async function createV1TestData(numListings: number) {
    const userIds: string[] = []
    const gameItemIds: string[] = []
    const listingIds: string[] = []

    for (let i = 0; i < numListings; i++) {
      // Create test user
      const [user] = await knex("accounts")
        .insert({
          username: `test_migration_user_${Date.now()}_${i}`,
          email: `test_migration_${Date.now()}_${i}@example.com`,
          password_hash: "test_hash",
        })
        .returning("user_id")
      userIds.push(user.user_id)

      // Create test game item
      const [gameItem] = await knex("game_items")
        .insert({
          name: `Test Migration Item ${Date.now()}_${i}`,
          type: "weapon",
        })
        .returning("game_item_id")
      gameItemIds.push(gameItem.game_item_id)

      // Create listing details
      const [details] = await knex("market_listing_details")
        .insert({
          item_type: "weapon",
          title: `Test Listing ${Date.now()}_${i}`,
          description: `Test description ${i}`,
          game_item_id: gameItem.game_item_id,
        })
        .returning("details_id")

      // Create market listing
      const [listing] = await knex("market_listings")
        .insert({
          sale_type: "fixed",
          price: 1000 + i * 100,
          quantity_available: 10,
          status: "active",
          user_seller_id: user.user_id,
        })
        .returning("listing_id")
      listingIds.push(listing.listing_id)

      // Create unique listing
      await knex("market_unique_listings").insert({
        listing_id: listing.listing_id,
        accept_offers: true,
        details_id: details.details_id,
      })
    }

    return { userIds, gameItemIds, listingIds }
  }

  async function createV1TestDataWithMetadata(metadata: {
    title: string
    description: string
    price: number
    quantity: number
  }) {
    // Create test user
    const [user] = await knex("accounts")
      .insert({
        username: `test_metadata_user_${Date.now()}`,
        email: `test_metadata_${Date.now()}@example.com`,
        password_hash: "test_hash",
      })
      .returning("user_id")

    // Create test game item
    const [gameItem] = await knex("game_items")
      .insert({
        name: `Test Metadata Item ${Date.now()}`,
        type: "weapon",
      })
      .returning("game_item_id")

    // Create listing details with specific metadata
    const [details] = await knex("market_listing_details")
      .insert({
        item_type: "weapon",
        title: metadata.title,
        description: metadata.description,
        game_item_id: gameItem.game_item_id,
      })
      .returning("details_id")

    // Create market listing with specific price and quantity
    const [listing] = await knex("market_listings")
      .insert({
        sale_type: "fixed",
        price: metadata.price,
        quantity_available: metadata.quantity,
        status: "active",
        user_seller_id: user.user_id,
      })
      .returning("listing_id")

    // Create unique listing
    await knex("market_unique_listings").insert({
      listing_id: listing.listing_id,
      accept_offers: true,
      details_id: details.details_id,
    })

    return {
      userId: user.user_id,
      gameItemId: gameItem.game_item_id,
      listingId: listing.listing_id,
    }
  }

  async function snapshotV1Tables(knex: Knex) {
    // Count unique listings
    const [{ count: uniqueCount }] = await knex("market_unique_listings")
      .count("* as count")

    // Count aggregate listings
    const [{ count: aggregateCount }] = await knex(
      "market_aggregate_listings_legacy",
    ).count("* as count")

    // Count multiple listings
    const [{ count: multipleCount }] = await knex(
      "market_multiple_listings",
    ).count("* as count")

    // Compute checksums
    const uniqueChecksum = await computeTableChecksum(
      knex,
      "market_unique_listings",
      "listing_id",
    )
    const aggregateChecksum = await computeTableChecksum(
      knex,
      "market_aggregate_listings_legacy",
      "listing_id",
    )
    const multipleChecksum = await computeTableChecksum(
      knex,
      "market_multiple_listings",
      "multiple_listing_id",
    )

    return {
      unique_listings_count: parseInt(String(uniqueCount), 10),
      aggregate_listings_count: parseInt(String(aggregateCount), 10),
      multiple_listings_count: parseInt(String(multipleCount), 10),
      unique_listings_checksum: uniqueChecksum,
      aggregate_listings_checksum: aggregateChecksum,
      multiple_listings_checksum: multipleChecksum,
    }
  }

  async function computeTableChecksum(
    knex: Knex,
    tableName: string,
    idColumn: string,
  ): Promise<string> {
    const result = await knex.raw(
      `
      SELECT md5(string_agg(${idColumn}::text, ',' ORDER BY ${idColumn})) as checksum
      FROM ${tableName}
      `,
    )

    return result.rows[0]?.checksum || "empty"
  }
})
