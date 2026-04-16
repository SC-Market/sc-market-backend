/**
 * Property tests for ListingService
 *
 * These tests validate transaction atomicity and search filter correctness
 * using property-based testing with fast-check.
 *
 * NOTE: These tests require a real database connection and are skipped in the
 * default test suite. To run these tests, set up a test database and remove
 * the .skip modifier.
 *
 * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 26.2
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

describe.skip("Market V2 - Property 19: Search Filter - Quality Tier Min (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 19: Search Filter - Quality Tier Min
   *
   * For any search with quality_tier_min filter, all returned listings SHALL
   * have quality_tier_max >= quality_tier_min.
   *
   * Validates: Requirements 22.1
   */
  it("Property 19: quality tier min filter returns only listings with quality_tier_max >= quality_tier_min", async () => {
    // Create listings with various quality tiers
    const qualityTiers = [1, 2, 3, 4, 5]
    
    for (const tier of qualityTiers) {
      const request: CreateListingRequest = {
        title: `Listing with Quality Tier ${tier}`,
        description: "Test listing for quality tier filter",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 50000,
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: tier,
              quality_value: tier * 20,
              crafted_source: "crafted",
            },
          },
        ],
      }

      const listing = await service.createListing(testUserId, request)
      createdListingIds.push(listing.listing_id)
    }

    // Test with various quality_tier_min values
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (quality_tier_min) => {
          const results = await service.searchListings({
            quality_tier_min,
            page: 1,
            page_size: 100,
          })

          // Verify all results have quality_tier_max >= quality_tier_min
          for (const listing of results.listings) {
            expect(listing.quality_tier_max).toBeGreaterThanOrEqual(
              quality_tier_min,
            )
          }
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe.skip("Market V2 - Property 20: Search Filter - Quality Tier Max (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 20: Search Filter - Quality Tier Max
   *
   * For any search with quality_tier_max filter, all returned listings SHALL
   * have quality_tier_min <= quality_tier_max.
   *
   * Validates: Requirements 22.2
   */
  it("Property 20: quality tier max filter returns only listings with quality_tier_min <= quality_tier_max", async () => {
    // Create listings with various quality tiers
    const qualityTiers = [1, 2, 3, 4, 5]
    
    for (const tier of qualityTiers) {
      const request: CreateListingRequest = {
        title: `Listing with Quality Tier ${tier}`,
        description: "Test listing for quality tier filter",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 50000,
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: tier,
              quality_value: tier * 20,
              crafted_source: "crafted",
            },
          },
        ],
      }

      const listing = await service.createListing(testUserId, request)
      createdListingIds.push(listing.listing_id)
    }

    // Test with various quality_tier_max values
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (quality_tier_max) => {
          const results = await service.searchListings({
            quality_tier_max,
            page: 1,
            page_size: 100,
          })

          // Verify all results have quality_tier_min <= quality_tier_max
          for (const listing of results.listings) {
            expect(listing.quality_tier_min).toBeLessThanOrEqual(
              quality_tier_max,
            )
          }
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe.skip("Market V2 - Property 21: Search Filter - Price Min (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 21: Search Filter - Price Min
   *
   * For any search with price_min filter, all returned listings SHALL
   * have price_max >= price_min.
   *
   * Validates: Requirements 22.3
   */
  it("Property 21: price min filter returns only listings with price_max >= price_min", async () => {
    // Create listings with various prices
    const prices = [10000, 25000, 50000, 75000, 100000]
    
    for (const price of prices) {
      const request: CreateListingRequest = {
        title: `Listing with Price ${price}`,
        description: "Test listing for price filter",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: price,
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
      }

      const listing = await service.createListing(testUserId, request)
      createdListingIds.push(listing.listing_id)
    }

    // Test with various price_min values
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5000, max: 120000 }),
        async (price_min) => {
          const results = await service.searchListings({
            price_min,
            page: 1,
            page_size: 100,
          })

          // Verify all results have price_max >= price_min
          for (const listing of results.listings) {
            expect(listing.price_max).toBeGreaterThanOrEqual(price_min)
          }
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe.skip("Market V2 - Property 22: Search Filter - Price Max (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 22: Search Filter - Price Max
   *
   * For any search with price_max filter, all returned listings SHALL
   * have price_min <= price_max.
   *
   * Validates: Requirements 22.4
   */
  it("Property 22: price max filter returns only listings with price_min <= price_max", async () => {
    // Create listings with various prices
    const prices = [10000, 25000, 50000, 75000, 100000]
    
    for (const price of prices) {
      const request: CreateListingRequest = {
        title: `Listing with Price ${price}`,
        description: "Test listing for price filter",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: price,
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
      }

      const listing = await service.createListing(testUserId, request)
      createdListingIds.push(listing.listing_id)
    }

    // Test with various price_max values
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5000, max: 120000 }),
        async (price_max) => {
          const results = await service.searchListings({
            price_max,
            page: 1,
            page_size: 100,
          })

          // Verify all results have price_min <= price_max
          for (const listing of results.listings) {
            expect(listing.price_min).toBeLessThanOrEqual(price_max)
          }
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe.skip("Market V2 - Property 23: Search Filter Composition (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 23: Search Filter Composition
   *
   * For any search with multiple filters, all returned listings SHALL
   * satisfy ALL filters simultaneously (AND logic).
   *
   * Validates: Requirements 22.5
   */
  it("Property 23: multiple filters are combined with AND logic", async () => {
    // Create listings with various combinations of quality tiers and prices
    const combinations = [
      { tier: 1, price: 10000 },
      { tier: 2, price: 25000 },
      { tier: 3, price: 50000 },
      { tier: 4, price: 75000 },
      { tier: 5, price: 100000 },
    ]
    
    for (const combo of combinations) {
      const request: CreateListingRequest = {
        title: `Listing T${combo.tier} P${combo.price}`,
        description: "Test listing for filter composition",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: combo.price,
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: combo.tier,
              quality_value: combo.tier * 20,
              crafted_source: "crafted",
            },
          },
        ],
      }

      const listing = await service.createListing(testUserId, request)
      createdListingIds.push(listing.listing_id)
    }

    // Test with various filter combinations
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          quality_tier_min: fc.option(fc.integer({ min: 1, max: 5 })),
          quality_tier_max: fc.option(fc.integer({ min: 1, max: 5 })),
          price_min: fc.option(fc.integer({ min: 5000, max: 60000 })),
          price_max: fc.option(fc.integer({ min: 40000, max: 120000 })),
        }),
        async (filters) => {
          const results = await service.searchListings({
            quality_tier_min: filters.quality_tier_min ?? undefined,
            quality_tier_max: filters.quality_tier_max ?? undefined,
            price_min: filters.price_min ?? undefined,
            price_max: filters.price_max ?? undefined,
            page: 1,
            page_size: 100,
          })

          // Verify all results satisfy all filters
          for (const listing of results.listings) {
            // Quality tier min filter
            if (filters.quality_tier_min !== null && filters.quality_tier_min !== undefined) {
              expect(listing.quality_tier_max).toBeGreaterThanOrEqual(
                filters.quality_tier_min,
              )
            }

            // Quality tier max filter
            if (filters.quality_tier_max !== null && filters.quality_tier_max !== undefined) {
              expect(listing.quality_tier_min).toBeLessThanOrEqual(
                filters.quality_tier_max,
              )
            }

            // Price min filter
            if (filters.price_min !== null && filters.price_min !== undefined) {
              expect(listing.price_max).toBeGreaterThanOrEqual(
                filters.price_min,
              )
            }

            // Price max filter
            if (filters.price_max !== null && filters.price_max !== undefined) {
              expect(listing.price_min).toBeLessThanOrEqual(filters.price_max)
            }
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})

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
    base_price: fc.option(fc.integer({ min: 1000, max: 1000000 }), { nil: undefined }),
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
    location_id: fc.option(fc.uuid(), { nil: undefined }),
    price: fc.option(fc.integer({ min: 1000, max: 1000000 }), { nil: undefined }),
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
    blueprint_tier: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
  })
}

describe.skip("Market V2 - Property 10: Unified Pricing Consistency (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 10: Unified Pricing Consistency
   *
   * For any listing with pricing_mode='unified', all variants SHALL have
   * the same price equal to base_price.
   *
   * Validates: Requirements 7.2, 25.1
   */
  it("Property 10: unified pricing - all variants have same price equal to base_price", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          base_price: fc.integer({ min: 1000, max: 1000000 }),
          variants: fc.array(arbitraryVariantAttributes(), {
            minLength: 2,
            maxLength: 5,
          }),
        }),
        async ({ base_price, variants }) => {
          // Create listing with unified pricing and multiple variants
          const request: CreateListingRequest = {
            title: "Unified Pricing Test Listing",
            description: "Testing unified pricing consistency",
            game_item_id: testGameItemId,
            pricing_mode: "unified",
            base_price,
            lots: variants.map((attrs) => ({
              quantity: 10,
              variant_attributes: attrs,
            })),
          }

          const listing = await service.createListing(testUserId, request)
          createdListingIds.push(listing.listing_id)

          // Fetch listing detail
          const detail = await service.getListingDetail(listing.listing_id)

          // Verify all variants have the same price equal to base_price
          for (const item of detail.items) {
            expect(item.pricing_mode).toBe("unified")
            expect(item.base_price).toBe(base_price)

            for (const variant of item.variants) {
              expect(variant.price).toBe(base_price)
            }
          }
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe.skip("Market V2 - Property 11: Per-Variant Pricing Lookup (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 11: Per-Variant Pricing Lookup
   *
   * For any listing with pricing_mode='per_variant' and any variant in that
   * listing, the variant's price SHALL come from the variant_pricing table.
   *
   * Validates: Requirements 7.3, 25.2
   */
  it("Property 11: per-variant pricing - each variant price comes from variant_pricing table", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            variant_attributes: arbitraryVariantAttributes(),
            price: fc.integer({ min: 1000, max: 1000000 }),
          }),
          { minLength: 2, maxLength: 5 },
        ),
        async (variantsWithPrices) => {
          // Create listing with per_variant pricing
          const request: CreateListingRequest = {
            title: "Per-Variant Pricing Test Listing",
            description: "Testing per-variant pricing lookup",
            game_item_id: testGameItemId,
            pricing_mode: "per_variant",
            lots: variantsWithPrices.map((v) => ({
              quantity: 10,
              variant_attributes: v.variant_attributes,
              price: v.price,
            })),
          }

          const listing = await service.createListing(testUserId, request)
          createdListingIds.push(listing.listing_id)

          // Fetch listing detail
          const detail = await service.getListingDetail(listing.listing_id)

          // Verify each variant's price matches what was specified
          for (const item of detail.items) {
            expect(item.pricing_mode).toBe("per_variant")

            for (const variant of item.variants) {
              // Find the corresponding input variant
              const inputVariant = variantsWithPrices.find((v) => {
                // Compare attributes (simplified comparison)
                return (
                  v.variant_attributes.quality_tier ===
                    variant.attributes.quality_tier &&
                  v.variant_attributes.crafted_source ===
                    variant.attributes.crafted_source
                )
              })

              if (inputVariant) {
                expect(variant.price).toBe(inputVariant.price)
              }
            }
          }
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe.skip("Market V2 - Property 12: Price Range Computation (Integration)", () => {
  let knex: Knex
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    service = new ListingService(knex)
    createdListingIds = []

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
    if (createdListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", createdListingIds).del()
    }
    if (testUserId) {
      await knex("accounts").where("user_id", testUserId).del()
    }
    if (testGameItemId) {
      await knex("item_variants").where("game_item_id", testGameItemId).del()
      await knex("game_items").where("game_item_id", testGameItemId).del()
    }
  })

  /**
   * Feature: market-v2-parallel-system
   * Property 12: Price Range Computation
   *
   * For any listing, price_min SHALL equal the minimum variant price and
   * price_max SHALL equal the maximum variant price.
   *
   * Validates: Requirements 7.5, 25.4, 25.5
   */
  it("Property 12: price range - price_min equals minimum and price_max equals maximum", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            variant_attributes: arbitraryVariantAttributes(),
            price: fc.integer({ min: 1000, max: 1000000 }),
          }),
          { minLength: 2, maxLength: 5 },
        ),
        async (variantsWithPrices) => {
          // Create listing with per_variant pricing and different prices
          const request: CreateListingRequest = {
            title: "Price Range Test Listing",
            description: "Testing price range computation",
            game_item_id: testGameItemId,
            pricing_mode: "per_variant",
            lots: variantsWithPrices.map((v) => ({
              quantity: 10,
              variant_attributes: v.variant_attributes,
              price: v.price,
            })),
          }

          const listing = await service.createListing(testUserId, request)
          createdListingIds.push(listing.listing_id)

          // Compute expected min and max prices
          const prices = variantsWithPrices.map((v) => v.price)
          const expectedMinPrice = Math.min(...prices)
          const expectedMaxPrice = Math.max(...prices)

          // Search for the listing to get price_min and price_max
          const searchResults = await service.searchListings({
            game_item_id: testGameItemId,
            page: 1,
            page_size: 100,
          })

          const searchListing = searchResults.listings.find(
            (l) => l.listing_id === listing.listing_id,
          )

          expect(searchListing).toBeDefined()
          if (searchListing) {
            expect(searchListing.price_min).toBe(expectedMinPrice)
            expect(searchListing.price_max).toBe(expectedMaxPrice)
          }
        },
      ),
      { numRuns: 20 },
    )
  })

  it("Property 12: price range - unified pricing has price_min equal to price_max", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          base_price: fc.integer({ min: 1000, max: 1000000 }),
          variants: fc.array(arbitraryVariantAttributes(), {
            minLength: 2,
            maxLength: 5,
          }),
        }),
        async ({ base_price, variants }) => {
          // Create listing with unified pricing
          const request: CreateListingRequest = {
            title: "Unified Price Range Test Listing",
            description: "Testing price range with unified pricing",
            game_item_id: testGameItemId,
            pricing_mode: "unified",
            base_price,
            lots: variants.map((attrs) => ({
              quantity: 10,
              variant_attributes: attrs,
            })),
          }

          const listing = await service.createListing(testUserId, request)
          createdListingIds.push(listing.listing_id)

          // Search for the listing to get price_min and price_max
          const searchResults = await service.searchListings({
            game_item_id: testGameItemId,
            page: 1,
            page_size: 100,
          })

          const searchListing = searchResults.listings.find(
            (l) => l.listing_id === listing.listing_id,
          )

          expect(searchListing).toBeDefined()
          if (searchListing) {
            // For unified pricing, min and max should be equal to base_price
            expect(searchListing.price_min).toBe(base_price)
            expect(searchListing.price_max).toBe(base_price)
          }
        },
      ),
      { numRuns: 20 },
    )
  })
})
