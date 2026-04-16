/**
 * Property tests for ListingService
 *
 * These tests validate transaction atomicity and other universal properties
 * of listing creation using property-based testing with fast-check.
 *
 * NOTE: These tests require a real database connection and are skipped in the
 * default test suite. To run these tests, set up a test database and remove
 * the .skip modifier.
 *
 * Requirements: 26.2
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { ListingService } from "./listing.service.js"
import { getKnex } from "../../clients/database/knex-db.js"
import type { CreateListingRequest } from "../../api/routes/v2/types/market-v2-types.js"
import type { Knex } from "knex"

describe.skip("Market V2 - Property 32: Transaction Atomicity (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)

    // Create test user
    const [user] = await knex("accounts")
      .insert({
        username: `test_user_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        password_hash: "test_hash",
      })
      .returning("user_id")
    testUserId = user.user_id

    // Create test game item
    const [gameItem] = await knex("game_items")
      .insert({
        name: `Test Item ${Date.now()}`,
        type: "weapon",
      })
      .returning("game_item_id")
    testGameItemId = gameItem.game_item_id
  })

  afterEach(async () => {
    // Clean up test data
    if (testUserId) {
      await knex("listings").where("seller_id", testUserId).del()
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 32: Transaction Atomicity
   *
   * For any listing creation operation that fails at any step, no partial data
   * SHALL be committed to the database.
   *
   * Validates: Requirements 26.2
   */
  it("Property 32: transaction atomicity - no partial commits on failure", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryCreateListingRequest(),
        async (requestTemplate) => {
          // Create a valid request first
          const validRequest: CreateListingRequest = {
            ...requestTemplate,
            game_item_id: testGameItemId,
            lots: requestTemplate.lots.map((lot) => ({
              ...lot,
              variant_attributes: {
                quality_tier: 3,
                quality_value: 75,
                crafted_source: "crafted" as const,
              },
            })),
          }

          // Snapshot database state before operation
          const listingsCountBefore = await knex("listings")
            .where("seller_id", testUserId)
            .count("* as count")
          const listingItemsCountBefore = await knex("listing_items").count(
            "* as count",
          )
          const stockLotsCountBefore = await knex("stock_lots").count(
            "* as count",
          )
          const variantPricingCountBefore = await knex("variant_pricing").count(
            "* as count",
          )

          // Now create an invalid request that will fail (invalid game_item_id)
          const invalidRequest: CreateListingRequest = {
            ...validRequest,
            game_item_id: "00000000-0000-0000-0000-000000000000", // Non-existent game item
          }

          // Attempt to create listing with invalid data
          try {
            await service.createListing(testUserId, invalidRequest)
            // If it succeeds, that's unexpected but not a failure of atomicity
          } catch (error) {
            // Expected to fail - now verify no partial data was committed

            // Check listings table
            const listingsCountAfter = await knex("listings")
              .where("seller_id", testUserId)
              .count("* as count")
            expect(listingsCountAfter[0].count).toBe(
              listingsCountBefore[0].count,
            )

            // Check listing_items table
            const listingItemsCountAfter = await knex("listing_items").count(
              "* as count",
            )
            expect(listingItemsCountAfter[0].count).toBe(
              listingItemsCountBefore[0].count,
            )

            // Check stock_lots table
            const stockLotsCountAfter = await knex("stock_lots").count(
              "* as count",
            )
            expect(stockLotsCountAfter[0].count).toBe(
              stockLotsCountBefore[0].count,
            )

            // Check variant_pricing table
            const variantPricingCountAfter = await knex(
              "variant_pricing",
            ).count("* as count")
            expect(variantPricingCountAfter[0].count).toBe(
              variantPricingCountBefore[0].count,
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("Property 32: transaction atomicity - validation errors prevent any commits", async () => {
    // Test with various validation failures
    const invalidRequests: CreateListingRequest[] = [
      // Missing title
      {
        title: "",
        description: "Test description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 50000,
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
          },
        ],
      },
      // Missing description
      {
        title: "Test Listing",
        description: "",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 50000,
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
          },
        ],
      },
      // Empty lots array
      {
        title: "Test Listing",
        description: "Test description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 50000,
        lots: [],
      },
      // Missing base_price in unified mode
      {
        title: "Test Listing",
        description: "Test description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
          },
        ],
      },
    ]

    for (const invalidRequest of invalidRequests) {
      // Snapshot database state
      const listingsCountBefore = await knex("listings")
        .where("seller_id", testUserId)
        .count("* as count")
      const listingItemsCountBefore = await knex("listing_items").count(
        "* as count",
      )
      const stockLotsCountBefore = await knex("stock_lots").count("* as count")

      // Attempt to create listing with invalid data
      try {
        await service.createListing(testUserId, invalidRequest)
      } catch (error) {
        // Expected to fail
      }

      // Verify no data was committed
      const listingsCountAfter = await knex("listings")
        .where("seller_id", testUserId)
        .count("* as count")
      const listingItemsCountAfter = await knex("listing_items").count(
        "* as count",
      )
      const stockLotsCountAfter = await knex("stock_lots").count("* as count")

      expect(listingsCountAfter[0].count).toBe(listingsCountBefore[0].count)
      expect(listingItemsCountAfter[0].count).toBe(
        listingItemsCountBefore[0].count,
      )
      expect(stockLotsCountAfter[0].count).toBe(stockLotsCountBefore[0].count)
    }
  })
})

// ============================================================================
// Arbitrary Generators for Property-Based Testing
// ============================================================================

/**
 * Generate random CreateListingRequest for property testing
 */
function arbitraryCreateListingRequest(): fc.Arbitrary<CreateListingRequest> {
  return fc.record({
    title: fc.string({ minLength: 10, maxLength: 100 }),
    description: fc.string({ minLength: 20, maxLength: 500 }),
    game_item_id: fc.uuid(),
    pricing_mode: fc.constantFrom("unified" as const, "per_variant" as const),
    base_price: fc.option(fc.integer({ min: 1000, max: 1000000 })),
    lots: fc.array(arbitraryLot(), { minLength: 1, maxLength: 5 }),
  })
}

/**
 * Generate random lot for property testing
 */
function arbitraryLot() {
  return fc.record({
    quantity: fc.integer({ min: 1, max: 100 }),
    variant_attributes: arbitraryVariantAttributes(),
    location_id: fc.option(fc.uuid()),
    price: fc.option(fc.integer({ min: 1000, max: 1000000 })),
  })
}

/**
 * Generate random variant attributes for property testing
 */
function arbitraryVariantAttributes() {
  return fc.record({
    quality_tier: fc.integer({ min: 1, max: 5 }),
    quality_value: fc.double({ min: 0, max: 100, noNaN: true }),
    crafted_source: fc.constantFrom(
      "crafted" as const,
      "store" as const,
      "looted" as const,
      "unknown" as const,
    ),
    blueprint_tier: fc.option(fc.integer({ min: 1, max: 5 })),
  })
}
