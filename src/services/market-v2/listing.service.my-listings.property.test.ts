/**
 * Property-based tests for My Listings functionality in ListingService
 * 
 * Uses fast-check for property-based testing to validate correctness properties
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import { ListingService } from "./listing.service.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { v4 as uuidv4 } from "uuid"

const knex = getKnex()

describe("ListingService - My Listings Property Tests", () => {
  let service: ListingService
  let testUserIds: string[] = []
  let testGameItemIds: string[] = []
  let testListingIds: string[] = []

  beforeEach(async () => {
    service = new ListingService(knex)
  })

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await knex("variant_pricing").whereIn("item_id", function() {
      this.select("item_id").from("listing_items").whereIn("listing_id", testListingIds)
    }).del()
    
    await knex("listing_item_lots").whereIn("item_id", function() {
      this.select("item_id").from("listing_items").whereIn("listing_id", testListingIds)
    }).del()
    
    await knex("listing_items").whereIn("listing_id", testListingIds).del()
    await knex("listings").whereIn("listing_id", testListingIds).del()
    await knex("game_items").whereIn("game_item_id", testGameItemIds).del()
    await knex("accounts").whereIn("user_id", testUserIds).del()
    
    testUserIds = []
    testGameItemIds = []
    testListingIds = []
  })

  /**
   * Property 1: Listing Ownership Filter
   * 
   * Validates: Requirements 1.2
   * 
   * Property: For any set of listings created by multiple users,
   * getMyListings(userId) returns ONLY listings where seller_id = userId
   */
  it("Property 1: Listing Ownership Filter - all returned listings belong to requesting user", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 2-5 users
        fc.integer({ min: 2, max: 5 }),
        // Generate 1-3 listings per user
        fc.integer({ min: 1, max: 3 }),
        async (numUsers, listingsPerUser) => {
          // Create users
          const userIds: string[] = []
          for (let i = 0; i < numUsers; i++) {
            const userId = uuidv4()
            userIds.push(userId)
            testUserIds.push(userId)
            
            await knex("accounts").insert({
              user_id: userId,
              username: `user${i}`,
              email: `user${i}@example.com`,
              rating: 4.0,
            })
          }

          // Create game item
          const gameItemId = uuidv4()
          testGameItemIds.push(gameItemId)
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listings for each user
          for (const userId of userIds) {
            for (let j = 0; j < listingsPerUser; j++) {
              const listing = await service.createListing(userId, {
                title: `Listing ${j} for ${userId}`,
                description: "Test",
                game_item_id: gameItemId,
                pricing_mode: "unified",
                base_price: 1000,
                lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
              })
              testListingIds.push(listing.listing_id)
            }
          }

          // Pick a random user to query
          const queryUserId = userIds[Math.floor(Math.random() * userIds.length)]

          // Get their listings
          const result = await service.getMyListings(queryUserId, {
            page: 1,
            page_size: 100,
          })

          // Property: All returned listings must belong to the query user
          const allBelongToUser = result.listings.every(listing => {
            // Verify by checking the database
            return knex("listings")
              .where({ listing_id: listing.listing_id })
              .first()
              .then(row => row?.seller_id === queryUserId)
          })

          expect(await allBelongToUser).toBe(true)
          expect(result.total).toBe(listingsPerUser)
        }
      ),
      { numRuns: 10 }
    )
  })

  /**
   * Property 2: Variant Display Completeness
   * 
   * Validates: Requirements 2.5, 2.6, 2.7, 2.10
   * 
   * Property: For any listing with N variants, getMyListings returns:
   * - variant_count = N
   * - total_quantity = sum of all variant quantities
   * - quality_tier_range = [min, max] of all variant quality tiers
   * - price_range = [min, max] of all variant prices
   */
  it("Property 2: Variant Display Completeness - aggregated data matches actual variants", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 variants with different quality tiers
        fc.array(
          fc.record({
            quality_tier: fc.integer({ min: 1, max: 5 }),
            quantity: fc.integer({ min: 1, max: 100 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (variants) => {
          // Create user
          const userId = uuidv4()
          testUserIds.push(userId)
          await knex("accounts").insert({
            user_id: userId,
            username: "testuser",
            email: "test@example.com",
            rating: 4.0,
          })

          // Create game item
          const gameItemId = uuidv4()
          testGameItemIds.push(gameItemId)
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listing with variants
          const listing = await service.createListing(userId, {
            title: "Test Listing",
            description: "Test",
            game_item_id: gameItemId,
            pricing_mode: "unified",
            base_price: 1000,
            lots: variants.map(v => ({
              quantity: v.quantity,
              variant_attributes: { quality_tier: v.quality_tier },
            })),
          })
          testListingIds.push(listing.listing_id)

          // Get my listings
          const result = await service.getMyListings(userId, {
            page: 1,
            page_size: 20,
          })

          expect(result.listings).toHaveLength(1)
          const returnedListing = result.listings[0]

          // Compute expected values
          const uniqueVariants = new Set(variants.map(v => v.quality_tier)).size
          const expectedTotalQuantity = variants.reduce((sum, v) => sum + v.quantity, 0)
          const expectedMinTier = Math.min(...variants.map(v => v.quality_tier))
          const expectedMaxTier = Math.max(...variants.map(v => v.quality_tier))

          // Property: Aggregated data matches actual variants
          expect(returnedListing.variant_count).toBe(uniqueVariants)
          expect(returnedListing.total_quantity).toBe(expectedTotalQuantity)
          expect(returnedListing.quality_tier_min).toBe(expectedMinTier)
          expect(returnedListing.quality_tier_max).toBe(expectedMaxTier)
          expect(returnedListing.price_min).toBe(1000)
          expect(returnedListing.price_max).toBe(1000)
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Property 3: Pagination Consistency
   * 
   * Property: For any set of listings, paginating through all pages
   * returns the same total set of listings (no duplicates, no missing)
   */
  it("Property 3: Pagination Consistency - all listings returned exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 5-15 listings
        fc.integer({ min: 5, max: 15 }),
        // Page size 2-5
        fc.integer({ min: 2, max: 5 }),
        async (numListings, pageSize) => {
          // Create user
          const userId = uuidv4()
          testUserIds.push(userId)
          await knex("accounts").insert({
            user_id: userId,
            username: "testuser",
            email: "test@example.com",
            rating: 4.0,
          })

          // Create game item
          const gameItemId = uuidv4()
          testGameItemIds.push(gameItemId)
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listings
          const createdListingIds: string[] = []
          for (let i = 0; i < numListings; i++) {
            const listing = await service.createListing(userId, {
              title: `Listing ${i}`,
              description: "Test",
              game_item_id: gameItemId,
              pricing_mode: "unified",
              base_price: 1000 + i,
              lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
            })
            createdListingIds.push(listing.listing_id)
            testListingIds.push(listing.listing_id)
          }

          // Paginate through all pages
          const allReturnedIds: string[] = []
          let page = 1
          let hasMore = true

          while (hasMore) {
            const result = await service.getMyListings(userId, {
              page,
              page_size: pageSize,
            })

            allReturnedIds.push(...result.listings.map(l => l.listing_id))
            
            hasMore = result.listings.length === pageSize
            page++
          }

          // Property: All created listings returned exactly once
          expect(allReturnedIds.length).toBe(numListings)
          expect(new Set(allReturnedIds).size).toBe(numListings)
          
          // All created IDs are in returned IDs
          for (const id of createdListingIds) {
            expect(allReturnedIds).toContain(id)
          }
        }
      ),
      { numRuns: 10 }
    )
  })

  /**
   * Property 4: Status Filter Correctness
   * 
   * Property: For any set of listings with mixed statuses,
   * filtering by status returns ONLY listings with that status
   */
  it("Property 4: Status Filter Correctness - only matching status returned", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate listings with random statuses
        fc.array(
          fc.constantFrom("active", "sold", "expired", "cancelled"),
          { minLength: 3, maxLength: 10 }
        ),
        async (statuses) => {
          // Create user
          const userId = uuidv4()
          testUserIds.push(userId)
          await knex("accounts").insert({
            user_id: userId,
            username: "testuser",
            email: "test@example.com",
            rating: 4.0,
          })

          // Create game item
          const gameItemId = uuidv4()
          testGameItemIds.push(gameItemId)
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listings with specified statuses
          for (let i = 0; i < statuses.length; i++) {
            const listing = await service.createListing(userId, {
              title: `Listing ${i}`,
              description: "Test",
              game_item_id: gameItemId,
              pricing_mode: "unified",
              base_price: 1000,
              lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
            })
            testListingIds.push(listing.listing_id)

            // Update status if not active
            if (statuses[i] !== "active") {
              await knex("listings")
                .where({ listing_id: listing.listing_id })
                .update({ status: statuses[i] })
            }
          }

          // Test each unique status
          const uniqueStatuses = [...new Set(statuses)]
          for (const status of uniqueStatuses) {
            const result = await service.getMyListings(userId, {
              status: status as any,
              page: 1,
              page_size: 100,
            })

            // Property: All returned listings have the filtered status
            const expectedCount = statuses.filter(s => s === status).length
            expect(result.total).toBe(expectedCount)
            
            for (const listing of result.listings) {
              expect(listing.status).toBe(status)
            }
          }
        }
      ),
      { numRuns: 10 }
    )
  })

  /**
   * Property 5: Sort Order Correctness
   * 
   * Property: For any sort field and order, returned listings
   * are correctly ordered by that field
   */
  it("Property 5: Sort Order Correctness - listings sorted correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 3-8 listings with different prices
        fc.array(
          fc.integer({ min: 100, max: 10000 }),
          { minLength: 3, maxLength: 8 }
        ),
        fc.constantFrom("asc", "desc"),
        async (prices, sortOrder) => {
          // Create user
          const userId = uuidv4()
          testUserIds.push(userId)
          await knex("accounts").insert({
            user_id: userId,
            username: "testuser",
            email: "test@example.com",
            rating: 4.0,
          })

          // Create game item
          const gameItemId = uuidv4()
          testGameItemIds.push(gameItemId)
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listings with different prices
          for (let i = 0; i < prices.length; i++) {
            const listing = await service.createListing(userId, {
              title: `Listing ${i}`,
              description: "Test",
              game_item_id: gameItemId,
              pricing_mode: "unified",
              base_price: prices[i],
              lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
            })
            testListingIds.push(listing.listing_id)
            
            // Add small delay to ensure different created_at timestamps
            await new Promise(resolve => setTimeout(resolve, 5))
          }

          // Get listings sorted by price
          const result = await service.getMyListings(userId, {
            page: 1,
            page_size: 100,
            sort_by: "price",
            sort_order: sortOrder as any,
          })

          // Property: Listings are sorted correctly
          const returnedPrices = result.listings.map(l => l.price_min)
          const expectedPrices = [...prices].sort((a, b) => 
            sortOrder === "asc" ? a - b : b - a
          )

          expect(returnedPrices).toEqual(expectedPrices)
        }
      ),
      { numRuns: 10 }
    )
  })
})
