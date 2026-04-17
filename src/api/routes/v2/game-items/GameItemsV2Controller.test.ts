/**
 * Unit tests for GameItemsV2Controller
 *
 * Tests the game item listings endpoint with quality distribution.
 * Requirements: 38.1-38.12
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { GameItemsV2Controller } from "./GameItemsV2Controller.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { Request } from "express"
import { v4 as uuidv4 } from "uuid"

// Mock logger
vi.mock("../../../../logger/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe("GameItemsV2Controller", () => {
  let controller: GameItemsV2Controller
  let mockRequest: Partial<Request>
  let knex: ReturnType<typeof getKnex>
  let testGameItemId: string
  let testSellerId: string
  let createdListingIds: string[] = []

  beforeEach(async () => {
    knex = getKnex()
    testGameItemId = uuidv4()
    testSellerId = uuidv4()
    createdListingIds = []

    mockRequest = {
      user: {
        user_id: testSellerId,
        username: "testuser",
        role: "user",
      },
    }
    controller = new GameItemsV2Controller(mockRequest as Request)

    // Create test game item
    await knex("game_items").insert({
      id: testGameItemId,
      name: "Test Weapon",
      type: "weapon",
      image_url: "https://example.com/weapon.png",
    })

    // Create test seller account
    await knex("accounts").insert({
      user_id: testSellerId,
      username: "testseller",
      email: "testseller@example.com",
      password_hash: "hash",
    })
  })

  afterEach(async () => {
    // Clean up test data in reverse order due to foreign key constraints
    if (createdListingIds.length > 0) {
      await knex("variant_pricing")
        .whereIn(
          "item_id",
          knex("listing_items")
            .whereIn("listing_id", createdListingIds)
            .select("item_id"),
        )
        .delete()

      await knex("listing_item_lots")
        .whereIn(
          "item_id",
          knex("listing_items")
            .whereIn("listing_id", createdListingIds)
            .select("item_id"),
        )
        .delete()

      await knex("listing_items")
        .whereIn("listing_id", createdListingIds)
        .delete()

      await knex("listings").whereIn("listing_id", createdListingIds).delete()
    }

    await knex("item_variants")
      .where("game_item_id", testGameItemId)
      .delete()
    await knex("game_items").where("id", testGameItemId).delete()
    await knex("accounts").where("user_id", testSellerId).delete()
  })

  describe("getListings (Requirement 38.11)", () => {
    it("should return game item listings with quality distribution", async () => {
      // Create test listing
      const listingId = uuidv4()
      await knex("listings").insert({
        listing_id: listingId,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Test Listing",
        description: "Test description",
        status: "active",
      })
      createdListingIds.push(listingId)

      const itemId = uuidv4()
      await knex("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3, quality_value: 75.5 },
        display_name: "Tier 3 (75.5%)",
        short_name: "T3",
      })

      await knex("listing_item_lots").insert({
        item_id: itemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      // Execute test
      const result = await controller.getListings(testGameItemId)

      // Assertions
      expect(result).toBeDefined()
      expect(result.game_item).toEqual({
        id: testGameItemId,
        name: "Test Weapon",
        type: "weapon",
        image_url: "https://example.com/weapon.png",
      })

      expect(result.quality_distribution).toHaveLength(1)
      expect(result.quality_distribution[0]).toMatchObject({
        quality_tier: 3,
        quantity_available: 10,
        price_min: 1000,
        price_max: 1000,
        price_avg: 1000,
        seller_count: 1,
        listing_count: 1,
      })

      expect(result.listings).toHaveLength(1)
      expect(result.listings[0]).toMatchObject({
        listing_id: listingId,
        title: "Test Listing",
        seller_name: "testseller",
        price_min: 1000,
        price_max: 1000,
        quantity_available: 10,
        quality_tier_min: 3,
        quality_tier_max: 3,
        variant_count: 1,
      })

      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should throw validation error for invalid quality tier", async () => {
      await expect(controller.getListings(testGameItemId, 6)).rejects.toThrow()
      await expect(controller.getListings(testGameItemId, 0)).rejects.toThrow()
    })

    it("should throw not found error for non-existent game item", async () => {
      await expect(controller.getListings("non-existent-id")).rejects.toThrow()
    })

    it("should return empty listings for game item with no listings", async () => {
      const result = await controller.getListings(testGameItemId)

      expect(result.game_item.id).toBe(testGameItemId)
      expect(result.quality_distribution).toHaveLength(0)
      expect(result.listings).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it("should filter listings by quality tier", async () => {
      // Create listing with tier 3
      const listing1Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing1Id,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Tier 3 Listing",
        status: "active",
      })
      createdListingIds.push(listing1Id)

      const item1Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item1Id,
        listing_id: listing1Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const variant1Id = uuidv4()
      await knex("item_variants").insert({
        variant_id: variant1Id,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      await knex("listing_item_lots").insert({
        item_id: item1Id,
        variant_id: variant1Id,
        quantity_total: 5,
        listed: true,
      })

      // Create listing with tier 5
      const listing2Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing2Id,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Tier 5 Listing",
        status: "active",
      })
      createdListingIds.push(listing2Id)

      const item2Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item2Id,
        listing_id: listing2Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 2000,
      })

      const variant2Id = uuidv4()
      await knex("item_variants").insert({
        variant_id: variant2Id,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      await knex("listing_item_lots").insert({
        item_id: item2Id,
        variant_id: variant2Id,
        quantity_total: 3,
        listed: true,
      })

      // Execute test - filter for tier 3
      const result = await controller.getListings(testGameItemId, 3)

      // Assertions - should only return tier 3 listing
      expect(result.listings).toHaveLength(1)
      expect(result.listings[0].title).toBe("Tier 3 Listing")
      expect(result.listings[0].quality_tier_min).toBe(3)
      expect(result.listings[0].quality_tier_max).toBe(3)

      // Quality distribution should still show all tiers
      expect(result.quality_distribution).toHaveLength(2)
    })

    it("should sort listings by price", async () => {
      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create expensive listing
      const listing1Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing1Id,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Expensive Listing",
        status: "active",
      })
      createdListingIds.push(listing1Id)

      const item1Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item1Id,
        listing_id: listing1Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 5000,
      })

      await knex("listing_item_lots").insert({
        item_id: item1Id,
        variant_id: variantId,
        quantity_total: 1,
        listed: true,
      })

      // Create cheap listing
      const listing2Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing2Id,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Cheap Listing",
        status: "active",
      })
      createdListingIds.push(listing2Id)

      const item2Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item2Id,
        listing_id: listing2Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      await knex("listing_item_lots").insert({
        item_id: item2Id,
        variant_id: variantId,
        quantity_total: 1,
        listed: true,
      })

      // Execute test - sort by price ascending
      const result = await controller.getListings(
        testGameItemId,
        undefined,
        "price",
        "asc",
      )

      // Assertions - cheap listing should be first
      expect(result.listings).toHaveLength(2)
      expect(result.listings[0].title).toBe("Cheap Listing")
      expect(result.listings[0].price_min).toBe(1000)
      expect(result.listings[1].title).toBe("Expensive Listing")
      expect(result.listings[1].price_min).toBe(5000)
    })

    it("should paginate results correctly", async () => {
      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create 5 listings
      for (let i = 1; i <= 5; i++) {
        const listingId = uuidv4()
        await knex("listings").insert({
          listing_id: listingId,
          seller_id: testSellerId,
          seller_type: "user",
          title: `Listing ${i}`,
          status: "active",
        })
        createdListingIds.push(listingId)

        const itemId = uuidv4()
        await knex("listing_items").insert({
          item_id: itemId,
          listing_id: listingId,
          game_item_id: testGameItemId,
          pricing_mode: "unified",
          base_price: 1000 * i,
        })

        await knex("listing_item_lots").insert({
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 1,
          listed: true,
        })
      }

      // Execute test - page 1, page_size 2
      const result1 = await controller.getListings(
        testGameItemId,
        undefined,
        "price",
        "asc",
        1,
        2,
      )

      // Assertions for page 1
      expect(result1.listings).toHaveLength(2)
      expect(result1.total).toBe(5)
      expect(result1.page).toBe(1)
      expect(result1.page_size).toBe(2)
      expect(result1.listings[0].title).toBe("Listing 1")
      expect(result1.listings[1].title).toBe("Listing 2")

      // Execute test - page 2, page_size 2
      const result2 = await controller.getListings(
        testGameItemId,
        undefined,
        "price",
        "asc",
        2,
        2,
      )

      // Assertions for page 2
      expect(result2.listings).toHaveLength(2)
      expect(result2.total).toBe(5)
      expect(result2.page).toBe(2)
      expect(result2.listings[0].title).toBe("Listing 3")
      expect(result2.listings[1].title).toBe("Listing 4")
    })

    it("should compute quality distribution with multiple tiers", async () => {
      // Create variants for tiers 1, 3, 5
      const variants = []
      for (const tier of [1, 3, 5]) {
        const variantId = uuidv4()
        await knex("item_variants").insert({
          variant_id: variantId,
          game_item_id: testGameItemId,
          attributes: { quality_tier: tier },
          display_name: `Tier ${tier}`,
        })
        variants.push({ tier, variantId })
      }

      // Create listings for each tier
      for (const { tier, variantId } of variants) {
        const listingId = uuidv4()
        await knex("listings").insert({
          listing_id: listingId,
          seller_id: testSellerId,
          seller_type: "user",
          title: `Tier ${tier} Listing`,
          status: "active",
        })
        createdListingIds.push(listingId)

        const itemId = uuidv4()
        await knex("listing_items").insert({
          item_id: itemId,
          listing_id: listingId,
          game_item_id: testGameItemId,
          pricing_mode: "unified",
          base_price: 1000 * tier,
        })

        await knex("listing_item_lots").insert({
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 10 * tier,
          listed: true,
        })
      }

      // Execute test
      const result = await controller.getListings(testGameItemId)

      // Assertions - quality distribution should have 3 tiers
      expect(result.quality_distribution).toHaveLength(3)

      // Check tier 1
      expect(result.quality_distribution[0]).toMatchObject({
        quality_tier: 1,
        quantity_available: 10,
        price_min: 1000,
        price_max: 1000,
        price_avg: 1000,
      })

      // Check tier 3
      expect(result.quality_distribution[1]).toMatchObject({
        quality_tier: 3,
        quantity_available: 30,
        price_min: 3000,
        price_max: 3000,
        price_avg: 3000,
      })

      // Check tier 5
      expect(result.quality_distribution[2]).toMatchObject({
        quality_tier: 5,
        quantity_available: 50,
        price_min: 5000,
        price_max: 5000,
        price_avg: 5000,
      })
    })

    it("should handle per-variant pricing correctly", async () => {
      const listingId = uuidv4()
      await knex("listings").insert({
        listing_id: listingId,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Per Variant Pricing Listing",
        status: "active",
      })
      createdListingIds.push(listingId)

      const itemId = uuidv4()
      await knex("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: testGameItemId,
        pricing_mode: "per_variant",
        base_price: null,
      })

      // Create two variants with different prices
      const variant1Id = uuidv4()
      await knex("item_variants").insert({
        variant_id: variant1Id,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant2Id = uuidv4()
      await knex("item_variants").insert({
        variant_id: variant2Id,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      await knex("listing_item_lots").insert({
        item_id: itemId,
        variant_id: variant1Id,
        quantity_total: 10,
        listed: true,
      })

      await knex("listing_item_lots").insert({
        item_id: itemId,
        variant_id: variant2Id,
        quantity_total: 5,
        listed: true,
      })

      // Create variant pricing
      await knex("variant_pricing").insert({
        item_id: itemId,
        variant_id: variant1Id,
        price: 2000,
      })

      await knex("variant_pricing").insert({
        item_id: itemId,
        variant_id: variant2Id,
        price: 5000,
      })

      // Execute test
      const result = await controller.getListings(testGameItemId)

      // Assertions - quality distribution should reflect per-variant prices
      expect(result.quality_distribution).toHaveLength(2)

      const tier3 = result.quality_distribution.find((d) => d.quality_tier === 3)
      expect(tier3).toMatchObject({
        quality_tier: 3,
        quantity_available: 10,
        price_min: 2000,
        price_max: 2000,
        price_avg: 2000,
      })

      const tier5 = result.quality_distribution.find((d) => d.quality_tier === 5)
      expect(tier5).toMatchObject({
        quality_tier: 5,
        quantity_available: 5,
        price_min: 5000,
        price_max: 5000,
        price_avg: 5000,
      })

      // Listing should show price range
      expect(result.listings[0].price_min).toBe(2000)
      expect(result.listings[0].price_max).toBe(5000)
    })

    it("should only return active listings", async () => {
      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create active listing
      const activeListing = uuidv4()
      await knex("listings").insert({
        listing_id: activeListing,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Active Listing",
        status: "active",
      })
      createdListingIds.push(activeListing)

      const activeItemId = uuidv4()
      await knex("listing_items").insert({
        item_id: activeItemId,
        listing_id: activeListing,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      await knex("listing_item_lots").insert({
        item_id: activeItemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      // Create sold listing
      const soldListing = uuidv4()
      await knex("listings").insert({
        listing_id: soldListing,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Sold Listing",
        status: "sold",
      })
      createdListingIds.push(soldListing)

      const soldItemId = uuidv4()
      await knex("listing_items").insert({
        item_id: soldItemId,
        listing_id: soldListing,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      await knex("listing_item_lots").insert({
        item_id: soldItemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      // Execute test
      const result = await controller.getListings(testGameItemId)

      // Assertions - should only return active listing
      expect(result.listings).toHaveLength(1)
      expect(result.listings[0].title).toBe("Active Listing")
      expect(result.listings[0].listing_id).toBe(activeListing)
    })

    it("should compute average price correctly in quality distribution", async () => {
      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create 3 listings with different prices for same tier
      for (let i = 0; i < 3; i++) {
        const listingId = uuidv4()
        await knex("listings").insert({
          listing_id: listingId,
          seller_id: testSellerId,
          seller_type: "user",
          title: `Listing ${i}`,
          status: "active",
        })
        createdListingIds.push(listingId)

        const itemId = uuidv4()
        await knex("listing_items").insert({
          item_id: itemId,
          listing_id: listingId,
          game_item_id: testGameItemId,
          pricing_mode: "unified",
          base_price: 1000 * (i + 1), // 1000, 2000, 3000
        })

        await knex("listing_item_lots").insert({
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        })
      }

      const result = await controller.getListings(testGameItemId)

      expect(result.quality_distribution).toHaveLength(1)
      expect(result.quality_distribution[0].price_min).toBe(1000)
      expect(result.quality_distribution[0].price_max).toBe(3000)
      expect(result.quality_distribution[0].price_avg).toBe(2000) // Average of 1000, 2000, 3000
    })

    it("should count unique sellers correctly in quality distribution", async () => {
      const seller2Id = uuidv4()
      await knex("accounts").insert({
        user_id: seller2Id,
        username: "seller2",
        email: "seller2@example.com",
        password_hash: "hash",
      })

      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create 2 listings from seller1
      for (let i = 0; i < 2; i++) {
        const listingId = uuidv4()
        await knex("listings").insert({
          listing_id: listingId,
          seller_id: testSellerId,
          seller_type: "user",
          title: `Seller1 Listing ${i}`,
          status: "active",
        })
        createdListingIds.push(listingId)

        const itemId = uuidv4()
        await knex("listing_items").insert({
          item_id: itemId,
          listing_id: listingId,
          game_item_id: testGameItemId,
          pricing_mode: "unified",
          base_price: 1000,
        })

        await knex("listing_item_lots").insert({
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        })
      }

      // Create 1 listing from seller2
      const listing3Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing3Id,
        seller_id: seller2Id,
        seller_type: "user",
        title: "Seller2 Listing",
        status: "active",
      })
      createdListingIds.push(listing3Id)

      const item3Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item3Id,
        listing_id: listing3Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      await knex("listing_item_lots").insert({
        item_id: item3Id,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      const result = await controller.getListings(testGameItemId)

      expect(result.quality_distribution).toHaveLength(1)
      expect(result.quality_distribution[0].seller_count).toBe(2) // 2 unique sellers
      expect(result.quality_distribution[0].listing_count).toBe(3) // 3 total listings

      // Cleanup
      await knex("accounts").where("user_id", seller2Id).delete()
    })

    it("should sort quality distribution by tier ascending", async () => {
      // Create variants for tiers 5, 1, 3 (out of order)
      const tiers = [5, 1, 3]
      for (const tier of tiers) {
        const variantId = uuidv4()
        await knex("item_variants").insert({
          variant_id: variantId,
          game_item_id: testGameItemId,
          attributes: { quality_tier: tier },
          display_name: `Tier ${tier}`,
        })

        const listingId = uuidv4()
        await knex("listings").insert({
          listing_id: listingId,
          seller_id: testSellerId,
          seller_type: "user",
          title: `Tier ${tier} Listing`,
          status: "active",
        })
        createdListingIds.push(listingId)

        const itemId = uuidv4()
        await knex("listing_items").insert({
          item_id: itemId,
          listing_id: listingId,
          game_item_id: testGameItemId,
          pricing_mode: "unified",
          base_price: 1000 * tier,
        })

        await knex("listing_item_lots").insert({
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        })
      }

      const result = await controller.getListings(testGameItemId)

      expect(result.quality_distribution).toHaveLength(3)
      // Should be sorted by tier: 1, 3, 5
      expect(result.quality_distribution[0].quality_tier).toBe(1)
      expect(result.quality_distribution[1].quality_tier).toBe(3)
      expect(result.quality_distribution[2].quality_tier).toBe(5)
    })

    it("should include game item metadata in response", async () => {
      const result = await controller.getListings(testGameItemId)

      expect(result.game_item).toBeDefined()
      expect(result.game_item.id).toBe(testGameItemId)
      expect(result.game_item.name).toBe("Test Weapon")
      expect(result.game_item.type).toBe("weapon")
      expect(result.game_item.image_url).toBe("https://example.com/weapon.png")
    })

    it("should handle mixed pricing modes in quality distribution", async () => {
      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create unified pricing listing
      const listing1Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing1Id,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Unified Listing",
        status: "active",
      })
      createdListingIds.push(listing1Id)

      const item1Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item1Id,
        listing_id: listing1Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      await knex("listing_item_lots").insert({
        item_id: item1Id,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      // Create per-variant pricing listing
      const listing2Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing2Id,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Per Variant Listing",
        status: "active",
      })
      createdListingIds.push(listing2Id)

      const item2Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item2Id,
        listing_id: listing2Id,
        game_item_id: testGameItemId,
        pricing_mode: "per_variant",
        base_price: null,
      })

      await knex("listing_item_lots").insert({
        item_id: item2Id,
        variant_id: variantId,
        quantity_total: 5,
        listed: true,
      })

      await knex("variant_pricing").insert({
        item_id: item2Id,
        variant_id: variantId,
        price: 1500,
      })

      const result = await controller.getListings(testGameItemId)

      expect(result.quality_distribution).toHaveLength(1)
      expect(result.quality_distribution[0].price_min).toBe(1000)
      expect(result.quality_distribution[0].price_max).toBe(1500)
      expect(result.quality_distribution[0].quantity_available).toBe(15)
    })

    it("should validate page and page_size parameters", async () => {
      // Test invalid page
      await expect(
        controller.getListings(testGameItemId, undefined, "price", "asc", 0, 20),
      ).rejects.toThrow()

      // Test invalid page_size
      await expect(
        controller.getListings(testGameItemId, undefined, "price", "asc", 1, 0),
      ).rejects.toThrow()

      // Test page_size exceeding maximum
      await expect(
        controller.getListings(testGameItemId, undefined, "price", "asc", 1, 101),
      ).rejects.toThrow()
    })

    it("should support sorting by seller rating", async () => {
      const seller2Id = uuidv4()
      await knex("accounts").insert({
        user_id: seller2Id,
        username: "seller2",
        email: "seller2@example.com",
        password_hash: "hash",
        rating: 4.5,
      })

      await knex("accounts")
        .where("user_id", testSellerId)
        .update({ rating: 3.0 })

      const variantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: testGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create listing from low-rated seller
      const listing1Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing1Id,
        seller_id: testSellerId,
        seller_type: "user",
        title: "Low Rated Seller",
        status: "active",
      })
      createdListingIds.push(listing1Id)

      const item1Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item1Id,
        listing_id: listing1Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      await knex("listing_item_lots").insert({
        item_id: item1Id,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      // Create listing from high-rated seller
      const listing2Id = uuidv4()
      await knex("listings").insert({
        listing_id: listing2Id,
        seller_id: seller2Id,
        seller_type: "user",
        title: "High Rated Seller",
        status: "active",
      })
      createdListingIds.push(listing2Id)

      const item2Id = uuidv4()
      await knex("listing_items").insert({
        item_id: item2Id,
        listing_id: listing2Id,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      await knex("listing_item_lots").insert({
        item_id: item2Id,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      // Sort by seller rating descending
      const result = await controller.getListings(
        testGameItemId,
        undefined,
        "seller_rating",
        "desc",
      )

      expect(result.listings).toHaveLength(2)
      expect(result.listings[0].title).toBe("High Rated Seller")
      expect(result.listings[1].title).toBe("Low Rated Seller")

      // Cleanup
      await knex("accounts").where("user_id", seller2Id).delete()
    })
  })
})
