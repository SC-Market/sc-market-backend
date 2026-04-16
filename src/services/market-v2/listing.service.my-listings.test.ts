/**
 * Unit tests for My Listings functionality in ListingService
 * 
 * Tests getMyListings and updateListing methods
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { ListingService } from "./listing.service.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { v4 as uuidv4 } from "uuid"

const knex = getKnex()

describe("ListingService - My Listings Tests", () => {
  let service: ListingService
  let testUserId: string
  let testGameItemId: string
  let testListingIds: string[] = []

  beforeEach(async () => {
    service = new ListingService(knex)
    testUserId = uuidv4()
    testGameItemId = uuidv4()

    // Create test user
    await knex("accounts").insert({
      user_id: testUserId,
      username: "testuser",
      email: "test@example.com",
      rating: 4.5,
    })

    // Create test game item
    await knex("game_items").insert({
      game_item_id: testGameItemId,
      name: "Test Item",
      type: "weapon",
    })
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
    await knex("game_items").where({ game_item_id: testGameItemId }).del()
    await knex("accounts").where({ user_id: testUserId }).del()
    
    testListingIds = []
  })

  describe("getMyListings", () => {
    it("should return empty array when user has no listings", async () => {
      const result = await service.getMyListings(testUserId, {
        page: 1,
        page_size: 20,
      })

      expect(result.listings).toEqual([])
      expect(result.total).toBe(0)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should return user's listings with variant breakdown", async () => {
      // Create a test listing
      const listing = await service.createListing(testUserId, {
        title: "Test Listing",
        description: "Test Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [
          {
            quantity: 10,
            variant_attributes: { quality_tier: 3, quality_value: 75 },
          },
          {
            quantity: 5,
            variant_attributes: { quality_tier: 4, quality_value: 85 },
          },
        ],
      })

      testListingIds.push(listing.listing_id)

      const result = await service.getMyListings(testUserId, {
        page: 1,
        page_size: 20,
      })

      expect(result.listings).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.listings[0].listing_id).toBe(listing.listing_id)
      expect(result.listings[0].title).toBe("Test Listing")
      expect(result.listings[0].status).toBe("active")
      expect(result.listings[0].variant_count).toBe(2)
      expect(result.listings[0].total_quantity).toBe(15)
      expect(result.listings[0].price_min).toBe(1000)
      expect(result.listings[0].price_max).toBe(1000)
      expect(result.listings[0].quality_tier_min).toBe(3)
      expect(result.listings[0].quality_tier_max).toBe(4)
    })

    it("should filter by status", async () => {
      // Create active listing
      const activeListing = await service.createListing(testUserId, {
        title: "Active Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(activeListing.listing_id)

      // Create sold listing
      const soldListing = await service.createListing(testUserId, {
        title: "Sold Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 2000,
        lots: [{ quantity: 5, variant_attributes: { quality_tier: 4 } }],
      })
      testListingIds.push(soldListing.listing_id)

      // Mark second listing as sold
      await knex("listings")
        .where({ listing_id: soldListing.listing_id })
        .update({ status: "sold" })

      // Filter for active only
      const activeResult = await service.getMyListings(testUserId, {
        status: "active",
        page: 1,
        page_size: 20,
      })

      expect(activeResult.listings).toHaveLength(1)
      expect(activeResult.listings[0].listing_id).toBe(activeListing.listing_id)
      expect(activeResult.listings[0].status).toBe("active")

      // Filter for sold only
      const soldResult = await service.getMyListings(testUserId, {
        status: "sold",
        page: 1,
        page_size: 20,
      })

      expect(soldResult.listings).toHaveLength(1)
      expect(soldResult.listings[0].listing_id).toBe(soldListing.listing_id)
      expect(soldResult.listings[0].status).toBe("sold")
    })

    it("should support pagination", async () => {
      // Create 3 listings
      for (let i = 0; i < 3; i++) {
        const listing = await service.createListing(testUserId, {
          title: `Listing ${i + 1}`,
          description: "Test",
          game_item_id: testGameItemId,
          pricing_mode: "unified",
          base_price: 1000 * (i + 1),
          lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
        })
        testListingIds.push(listing.listing_id)
      }

      // Get page 1 with page_size 2
      const page1 = await service.getMyListings(testUserId, {
        page: 1,
        page_size: 2,
      })

      expect(page1.listings).toHaveLength(2)
      expect(page1.total).toBe(3)
      expect(page1.page).toBe(1)
      expect(page1.page_size).toBe(2)

      // Get page 2
      const page2 = await service.getMyListings(testUserId, {
        page: 2,
        page_size: 2,
      })

      expect(page2.listings).toHaveLength(1)
      expect(page2.total).toBe(3)
      expect(page2.page).toBe(2)
    })

    it("should support sorting by created_at", async () => {
      // Create listings with delays to ensure different timestamps
      const listing1 = await service.createListing(testUserId, {
        title: "First Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(listing1.listing_id)

      await new Promise(resolve => setTimeout(resolve, 10))

      const listing2 = await service.createListing(testUserId, {
        title: "Second Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 2000,
        lots: [{ quantity: 5, variant_attributes: { quality_tier: 4 } }],
      })
      testListingIds.push(listing2.listing_id)

      // Sort by created_at desc (newest first)
      const descResult = await service.getMyListings(testUserId, {
        page: 1,
        page_size: 20,
        sort_by: "created_at",
        sort_order: "desc",
      })

      expect(descResult.listings[0].listing_id).toBe(listing2.listing_id)
      expect(descResult.listings[1].listing_id).toBe(listing1.listing_id)

      // Sort by created_at asc (oldest first)
      const ascResult = await service.getMyListings(testUserId, {
        page: 1,
        page_size: 20,
        sort_by: "created_at",
        sort_order: "asc",
      })

      expect(ascResult.listings[0].listing_id).toBe(listing1.listing_id)
      expect(ascResult.listings[1].listing_id).toBe(listing2.listing_id)
    })

    it("should only return listings owned by the user", async () => {
      const otherUserId = uuidv4()
      
      // Create other user
      await knex("accounts").insert({
        user_id: otherUserId,
        username: "otheruser",
        email: "other@example.com",
        rating: 4.0,
      })

      // Create listing for test user
      const myListing = await service.createListing(testUserId, {
        title: "My Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(myListing.listing_id)

      // Create listing for other user
      const otherListing = await service.createListing(otherUserId, {
        title: "Other Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 2000,
        lots: [{ quantity: 5, variant_attributes: { quality_tier: 4 } }],
      })
      testListingIds.push(otherListing.listing_id)

      // Get my listings
      const result = await service.getMyListings(testUserId, {
        page: 1,
        page_size: 20,
      })

      expect(result.listings).toHaveLength(1)
      expect(result.listings[0].listing_id).toBe(myListing.listing_id)

      // Clean up other user
      await knex("accounts").where({ user_id: otherUserId }).del()
    })
  })

  describe("updateListing", () => {
    it("should update listing title and description", async () => {
      // Create listing
      const listing = await service.createListing(testUserId, {
        title: "Original Title",
        description: "Original Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(listing.listing_id)

      // Update listing
      const updated = await service.updateListing(testUserId, listing.listing_id, {
        title: "Updated Title",
        description: "Updated Description",
      })

      expect(updated.listing.title).toBe("Updated Title")
      expect(updated.listing.description).toBe("Updated Description")
    })

    it("should update base_price for unified pricing", async () => {
      // Create listing
      const listing = await service.createListing(testUserId, {
        title: "Test Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(listing.listing_id)

      // Update base price
      const updated = await service.updateListing(testUserId, listing.listing_id, {
        base_price: 2000,
      })

      expect(updated.items[0].base_price).toBe(2000)
    })

    it("should throw error when updating listing not owned by user", async () => {
      const otherUserId = uuidv4()
      
      // Create other user
      await knex("accounts").insert({
        user_id: otherUserId,
        username: "otheruser",
        email: "other@example.com",
        rating: 4.0,
      })

      // Create listing for other user
      const listing = await service.createListing(otherUserId, {
        title: "Other's Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(listing.listing_id)

      // Try to update as test user
      await expect(
        service.updateListing(testUserId, listing.listing_id, {
          title: "Hacked Title",
        })
      ).rejects.toThrow("You do not have permission to update this listing")

      // Clean up other user
      await knex("accounts").where({ user_id: otherUserId }).del()
    })

    it("should throw error when updating sold listing", async () => {
      // Create listing
      const listing = await service.createListing(testUserId, {
        title: "Test Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(listing.listing_id)

      // Mark as sold
      await knex("listings")
        .where({ listing_id: listing.listing_id })
        .update({ status: "sold" })

      // Try to update
      await expect(
        service.updateListing(testUserId, listing.listing_id, {
          title: "Updated Title",
        })
      ).rejects.toThrow("Cannot update listing with status: sold")
    })

    it("should throw error when updating cancelled listing", async () => {
      // Create listing
      const listing = await service.createListing(testUserId, {
        title: "Test Listing",
        description: "Test",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: { quality_tier: 3 } }],
      })
      testListingIds.push(listing.listing_id)

      // Mark as cancelled
      await knex("listings")
        .where({ listing_id: listing.listing_id })
        .update({ status: "cancelled" })

      // Try to update
      await expect(
        service.updateListing(testUserId, listing.listing_id, {
          title: "Updated Title",
        })
      ).rejects.toThrow("Cannot update listing with status: cancelled")
    })

    it("should throw NotFoundError for non-existent listing", async () => {
      const fakeListingId = uuidv4()

      await expect(
        service.updateListing(testUserId, fakeListingId, {
          title: "Updated Title",
        })
      ).rejects.toThrow("Listing not found")
    })
  })
})
