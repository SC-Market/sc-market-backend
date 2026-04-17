/**
 * Unit tests for AnalyticsV2Controller
 *
 * Tests the price history endpoint with various filters and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { AnalyticsV2Controller } from "./AnalyticsV2Controller.js"
import { Request } from "express"
import { v4 as uuidv4 } from "uuid"

describe("AnalyticsV2Controller", () => {
  let controller: AnalyticsV2Controller
  let db: ReturnType<typeof getKnex>

  beforeEach(() => {
    db = getKnex()
    controller = new AnalyticsV2Controller()
  })

  afterEach(async () => {
    // Clean up test data
    await db("variant_pricing").delete()
    await db("listing_item_lots").delete()
    await db("item_variants").delete()
    await db("listing_items").delete()
    await db("listings").delete()
    await db("game_items").where("name", "like", "Test%").delete()
  })

  describe("getPriceHistory", () => {
    it("should require game_item_id parameter", async () => {
      await expect(
        controller.getPriceHistory("", undefined, undefined, undefined, undefined),
      ).rejects.toThrow("game_item_id is required")
    })

    it("should validate quality_tier range", async () => {
      const gameItemId = "550e8400-e29b-41d4-a716-446655440000"

      await expect(
        controller.getPriceHistory(gameItemId, 0, undefined, undefined, undefined),
      ).rejects.toThrow("Invalid quality_tier")

      await expect(
        controller.getPriceHistory(gameItemId, 6, undefined, undefined, undefined),
      ).rejects.toThrow("Invalid quality_tier")
    })

    it("should validate date range", async () => {
      const gameItemId = "550e8400-e29b-41d4-a716-446655440000"
      const startDate = "2024-01-02T00:00:00Z"
      const endDate = "2024-01-01T00:00:00Z"

      await expect(
        controller.getPriceHistory(
          gameItemId,
          undefined,
          startDate,
          endDate,
          undefined,
        ),
      ).rejects.toThrow("Invalid date range")
    })

    it("should return 404 for non-existent game item", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000"

      await expect(
        controller.getPriceHistory(
          nonExistentId,
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ).rejects.toThrow("Game item not found")
    })

    it("should return empty data for game item with no price history", async () => {
      // Create a game item
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Item",
        type: "weapon",
      })

      const result = await controller.getPriceHistory(
        gameItemId,
        undefined,
        undefined,
        undefined,
        undefined,
      )

      expect(result.game_item_id).toBe(gameItemId)
      expect(result.game_item_name).toBe("Test Item")
      expect(result.data).toEqual([])
      expect(result.interval).toBe("day")
    })

    it("should return price history with aggregated data", async () => {
      // Create test data: game item, listing, variants, and pricing
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440001",
        seller_type: "user",
        title: "Test Listing",
        description: "Test description",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "per_variant",
      })

      // Create variants with different quality tiers
      const variant1Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant1Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant2Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant2Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      // Create pricing records
      const now = new Date()
      await db("variant_pricing").insert([
        {
          item_id: itemId,
          variant_id: variant1Id,
          price: 1000,
          created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        },
        {
          item_id: itemId,
          variant_id: variant1Id,
          price: 1200,
          created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        },
        {
          item_id: itemId,
          variant_id: variant2Id,
          price: 2000,
          created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        },
      ])

      const result = await controller.getPriceHistory(
        gameItemId,
        undefined,
        undefined,
        undefined,
        "day",
      )

      expect(result.game_item_id).toBe(gameItemId)
      expect(result.game_item_name).toBe("Test Weapon")
      expect(result.data.length).toBeGreaterThan(0)
      
      // Check that data points have required fields
      result.data.forEach((point) => {
        expect(point).toHaveProperty("timestamp")
        expect(point).toHaveProperty("avg_price")
        expect(point).toHaveProperty("min_price")
        expect(point).toHaveProperty("max_price")
        expect(point).toHaveProperty("volume")
      })
    })

    it("should filter by quality tier", async () => {
      // Create test data
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440001",
        seller_type: "user",
        title: "Test Listing",
        description: "Test description",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "per_variant",
      })

      // Create variants with different quality tiers
      const variant3Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant3Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant5Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant5Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      // Create pricing records
      await db("variant_pricing").insert([
        {
          item_id: itemId,
          variant_id: variant3Id,
          price: 1000,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          price: 2000,
        },
      ])

      // Query for tier 5 only
      const result = await controller.getPriceHistory(
        gameItemId,
        5,
        undefined,
        undefined,
        "day",
      )

      expect(result.game_item_id).toBe(gameItemId)
      
      // All data points should be for quality tier 5
      result.data.forEach((point) => {
        expect(point.quality_tier).toBe(5)
      })
    })

    it("should support different time intervals", async () => {
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Item",
        type: "weapon",
      })

      // Test with hour interval
      const hourResult = await controller.getPriceHistory(
        gameItemId,
        undefined,
        undefined,
        undefined,
        "hour",
      )
      expect(hourResult.interval).toBe("hour")

      // Test with week interval
      const weekResult = await controller.getPriceHistory(
        gameItemId,
        undefined,
        undefined,
        undefined,
        "week",
      )
      expect(weekResult.interval).toBe("week")

      // Test with month interval
      const monthResult = await controller.getPriceHistory(
        gameItemId,
        undefined,
        undefined,
        undefined,
        "month",
      )
      expect(monthResult.interval).toBe("month")
    })

    it("should use default 30-day range when dates not provided", async () => {
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Item",
        type: "weapon",
      })

      const result = await controller.getPriceHistory(
        gameItemId,
        undefined,
        undefined,
        undefined,
        undefined,
      )

      const startDate = new Date(result.start_date)
      const endDate = new Date(result.end_date)
      const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)

      expect(daysDiff).toBeCloseTo(30, 0)
    })
  })

  describe("getQualityDistribution", () => {
    it("should require game_item_id parameter", async () => {
      await expect(
        controller.getQualityDistribution("", undefined, undefined),
      ).rejects.toThrow("game_item_id is required")
    })

    it("should validate date format", async () => {
      const gameItemId = "550e8400-e29b-41d4-a716-446655440000"

      await expect(
        controller.getQualityDistribution(gameItemId, "invalid-date", undefined),
      ).rejects.toThrow("Invalid date format")

      await expect(
        controller.getQualityDistribution(gameItemId, undefined, "invalid-date"),
      ).rejects.toThrow("Invalid date format")
    })

    it("should validate date range", async () => {
      const gameItemId = "550e8400-e29b-41d4-a716-446655440000"
      const startDate = "2024-01-02T00:00:00Z"
      const endDate = "2024-01-01T00:00:00Z"

      await expect(
        controller.getQualityDistribution(gameItemId, startDate, endDate),
      ).rejects.toThrow("Invalid date range")
    })

    it("should return 404 for non-existent game item", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000"

      await expect(
        controller.getQualityDistribution(nonExistentId, undefined, undefined),
      ).rejects.toThrow("Game item not found")
    })

    it("should return empty distribution for game item with no listings", async () => {
      // Create a game item
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Item",
        type: "weapon",
      })

      const result = await controller.getQualityDistribution(
        gameItemId,
        undefined,
        undefined,
      )

      expect(result.game_item_id).toBe(gameItemId)
      expect(result.game_item_name).toBe("Test Item")
      expect(result.distribution).toEqual([])
      expect(result.total_quantity).toBe(0)
    })

    it("should return quality distribution with histogram data", async () => {
      // Create test data: game item, listing, variants, and stock lots
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const seller1Id = "550e8400-e29b-41d4-a716-446655440001"
      const seller2Id = "550e8400-e29b-41d4-a716-446655440002"

      // Create two listings from different sellers
      const listing1Id = uuidv4()
      await db("listings").insert({
        listing_id: listing1Id,
        seller_id: seller1Id,
        seller_type: "user",
        title: "Test Listing 1",
        description: "Test description",
        status: "active",
      })

      const listing2Id = uuidv4()
      await db("listings").insert({
        listing_id: listing2Id,
        seller_id: seller2Id,
        seller_type: "user",
        title: "Test Listing 2",
        description: "Test description",
        status: "active",
      })

      const item1Id = uuidv4()
      await db("listing_items").insert({
        item_id: item1Id,
        listing_id: listing1Id,
        game_item_id: gameItemId,
        pricing_mode: "per_variant",
      })

      const item2Id = uuidv4()
      await db("listing_items").insert({
        item_id: item2Id,
        listing_id: listing2Id,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1500,
      })

      // Create variants with different quality tiers
      const variant3Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant3Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant5Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant5Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      // Create stock lots
      await db("listing_item_lots").insert([
        {
          item_id: item1Id,
          variant_id: variant3Id,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: item1Id,
          variant_id: variant5Id,
          quantity_total: 5,
          listed: true,
        },
        {
          item_id: item2Id,
          variant_id: variant3Id,
          quantity_total: 8,
          listed: true,
        },
      ])

      // Create pricing for per_variant listing
      await db("variant_pricing").insert([
        {
          item_id: item1Id,
          variant_id: variant3Id,
          price: 1000,
        },
        {
          item_id: item1Id,
          variant_id: variant5Id,
          price: 2000,
        },
      ])

      const result = await controller.getQualityDistribution(
        gameItemId,
        undefined,
        undefined,
      )

      expect(result.game_item_id).toBe(gameItemId)
      expect(result.game_item_name).toBe("Test Weapon")
      expect(result.distribution.length).toBe(2) // Tier 3 and Tier 5

      // Check Tier 3 distribution
      const tier3 = result.distribution.find((d) => d.quality_tier === 3)
      expect(tier3).toBeDefined()
      expect(tier3!.quantity_available).toBe(18) // 10 + 8
      expect(tier3!.listing_count).toBe(2) // 2 listings
      expect(tier3!.seller_count).toBe(2) // 2 sellers
      expect(tier3!.min_price).toBe(1000)
      expect(tier3!.max_price).toBe(1500)

      // Check Tier 5 distribution
      const tier5 = result.distribution.find((d) => d.quality_tier === 5)
      expect(tier5).toBeDefined()
      expect(tier5!.quantity_available).toBe(5)
      expect(tier5!.listing_count).toBe(1)
      expect(tier5!.seller_count).toBe(1)
      expect(tier5!.min_price).toBe(2000)
      expect(tier5!.max_price).toBe(2000)

      // Check total quantity
      expect(result.total_quantity).toBe(23) // 18 + 5
    })

    it("should filter by date range", async () => {
      // Create test data
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const now = new Date()
      const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 days ago

      // Create old listing
      const oldListingId = uuidv4()
      await db("listings").insert({
        listing_id: oldListingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440001",
        seller_type: "user",
        title: "Old Listing",
        status: "active",
        created_at: oldDate,
      })

      // Create recent listing
      const recentListingId = uuidv4()
      await db("listings").insert({
        listing_id: recentListingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440002",
        seller_type: "user",
        title: "Recent Listing",
        status: "active",
        created_at: recentDate,
      })

      const oldItemId = uuidv4()
      await db("listing_items").insert({
        item_id: oldItemId,
        listing_id: oldListingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const recentItemId = uuidv4()
      await db("listing_items").insert({
        item_id: recentItemId,
        listing_id: recentListingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1500,
      })

      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      await db("listing_item_lots").insert([
        {
          item_id: oldItemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: recentItemId,
          variant_id: variantId,
          quantity_total: 5,
          listed: true,
        },
      ])

      // Query with date range that excludes old listing
      const startDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      const result = await controller.getQualityDistribution(
        gameItemId,
        startDate.toISOString(),
        now.toISOString(),
      )

      expect(result.distribution.length).toBe(1)
      const tier3 = result.distribution[0]
      expect(tier3.quantity_available).toBe(5) // Only recent listing
      expect(tier3.listing_count).toBe(1)
    })

    it("should exclude unlisted stock lots", async () => {
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440001",
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create listed and unlisted lots
      await db("listing_item_lots").insert([
        {
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 20,
          listed: false, // Not listed
        },
      ])

      const result = await controller.getQualityDistribution(
        gameItemId,
        undefined,
        undefined,
      )

      expect(result.distribution.length).toBe(1)
      expect(result.distribution[0].quantity_available).toBe(10) // Only listed lot
      expect(result.total_quantity).toBe(10)
    })

    it("should exclude inactive listings", async () => {
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      // Create active listing
      const activeListingId = uuidv4()
      await db("listings").insert({
        listing_id: activeListingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440001",
        seller_type: "user",
        title: "Active Listing",
        status: "active",
      })

      // Create sold listing
      const soldListingId = uuidv4()
      await db("listings").insert({
        listing_id: soldListingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440002",
        seller_type: "user",
        title: "Sold Listing",
        status: "sold",
      })

      const activeItemId = uuidv4()
      await db("listing_items").insert({
        item_id: activeItemId,
        listing_id: activeListingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const soldItemId = uuidv4()
      await db("listing_items").insert({
        item_id: soldItemId,
        listing_id: soldListingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1500,
      })

      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      await db("listing_item_lots").insert([
        {
          item_id: activeItemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: soldItemId,
          variant_id: variantId,
          quantity_total: 20,
          listed: true,
        },
      ])

      const result = await controller.getQualityDistribution(
        gameItemId,
        undefined,
        undefined,
      )

      expect(result.distribution.length).toBe(1)
      expect(result.distribution[0].quantity_available).toBe(10) // Only active listing
      expect(result.distribution[0].listing_count).toBe(1)
    })

    it("should handle variants without quality_tier", async () => {
      const gameItemId = uuidv4()
      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: "550e8400-e29b-41d4-a716-446655440001",
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      // Create variant without quality_tier
      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { crafted_source: "store" }, // No quality_tier
        display_name: "Store Item",
      })

      await db("listing_item_lots").insert({
        item_id: itemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      const result = await controller.getQualityDistribution(
        gameItemId,
        undefined,
        undefined,
      )

      // Should exclude variants without quality_tier
      expect(result.distribution).toEqual([])
      expect(result.total_quantity).toBe(0)
    })
  })

  describe("getSellerStats", () => {
    it("should require seller_id parameter", async () => {
      await expect(controller.getSellerStats(undefined)).rejects.toThrow(
        "seller_id is required",
      )
    })

    it("should return empty stats for seller with no sales or inventory", async () => {
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"

      const result = await controller.getSellerStats(sellerId)

      expect(result.seller_id).toBe(sellerId)
      expect(result.sales_by_quality).toEqual([])
      expect(result.inventory_distribution).toEqual([])
      expect(result.price_premiums).toEqual([])
    })

    it("should return sales volume by quality tier", async () => {
      // Create test data: seller, listings, variants, orders
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const buyerId = "550e8400-e29b-41d4-a716-446655440002"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      // Create listing
      const listingId = uuidv4()
      const listingCreatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      await db("listings").insert({
        listing_id: listingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Test Listing",
        status: "active",
        created_at: listingCreatedAt,
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "per_variant",
      })

      // Create variants with different quality tiers
      const variant3Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant3Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant5Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant5Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      // Create pricing
      await db("variant_pricing").insert([
        {
          item_id: itemId,
          variant_id: variant3Id,
          price: 1000,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          price: 2000,
        },
      ])

      // Create orders
      const order1Id = uuidv4()
      const order1CreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      await db("orders").insert({
        order_id: order1Id,
        buyer_id: buyerId,
        seller_id: sellerId,
        status: "completed",
        created_at: order1CreatedAt,
      })

      const order2Id = uuidv4()
      const order2CreatedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      await db("orders").insert({
        order_id: order2Id,
        buyer_id: buyerId,
        seller_id: sellerId,
        status: "completed",
        created_at: order2CreatedAt,
      })

      // Create order items
      await db("order_market_items_v2").insert([
        {
          order_id: order1Id,
          listing_id: listingId,
          item_id: itemId,
          variant_id: variant3Id,
          quantity: 5,
          price_per_unit: 1000,
        },
        {
          order_id: order1Id,
          listing_id: listingId,
          item_id: itemId,
          variant_id: variant5Id,
          quantity: 2,
          price_per_unit: 2000,
        },
        {
          order_id: order2Id,
          listing_id: listingId,
          item_id: itemId,
          variant_id: variant3Id,
          quantity: 3,
          price_per_unit: 1000,
        },
      ])

      const result = await controller.getSellerStats(sellerId)

      expect(result.seller_id).toBe(sellerId)
      expect(result.sales_by_quality.length).toBe(2)

      // Check Tier 3 sales
      const tier3Sales = result.sales_by_quality.find(
        (s) => s.quality_tier === 3,
      )
      expect(tier3Sales).toBeDefined()
      expect(tier3Sales!.volume).toBe(8) // 5 + 3
      expect(tier3Sales!.avg_price).toBe(1000)
      expect(tier3Sales!.avg_time_to_sale_hours).toBeGreaterThan(0)

      // Check Tier 5 sales
      const tier5Sales = result.sales_by_quality.find(
        (s) => s.quality_tier === 5,
      )
      expect(tier5Sales).toBeDefined()
      expect(tier5Sales!.volume).toBe(2)
      expect(tier5Sales!.avg_price).toBe(2000)
      expect(tier5Sales!.avg_time_to_sale_hours).toBeGreaterThan(0)

      // Clean up
      await db("order_market_items_v2")
        .whereIn("order_id", [order1Id, order2Id])
        .delete()
      await db("orders").whereIn("order_id", [order1Id, order2Id]).delete()
    })

    it("should return current inventory distribution by quality tier", async () => {
      // Create test data: seller, listings, variants, stock lots
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      // Create listing
      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "per_variant",
      })

      // Create variants
      const variant1Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant1Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 1 },
        display_name: "Tier 1",
      })

      const variant3Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant3Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant5Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant5Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      // Create pricing
      await db("variant_pricing").insert([
        {
          item_id: itemId,
          variant_id: variant1Id,
          price: 500,
        },
        {
          item_id: itemId,
          variant_id: variant3Id,
          price: 1000,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          price: 2000,
        },
      ])

      // Create stock lots
      await db("listing_item_lots").insert([
        {
          item_id: itemId,
          variant_id: variant1Id,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: itemId,
          variant_id: variant3Id,
          quantity_total: 15,
          listed: true,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          quantity_total: 5,
          listed: true,
        },
      ])

      const result = await controller.getSellerStats(sellerId)

      expect(result.seller_id).toBe(sellerId)
      expect(result.inventory_distribution.length).toBe(3)

      // Check Tier 1 inventory
      const tier1Inv = result.inventory_distribution.find(
        (d) => d.quality_tier === 1,
      )
      expect(tier1Inv).toBeDefined()
      expect(tier1Inv!.quantity_available).toBe(10)
      expect(tier1Inv!.avg_price).toBe(500)

      // Check Tier 3 inventory
      const tier3Inv = result.inventory_distribution.find(
        (d) => d.quality_tier === 3,
      )
      expect(tier3Inv).toBeDefined()
      expect(tier3Inv!.quantity_available).toBe(15)
      expect(tier3Inv!.avg_price).toBe(1000)

      // Check Tier 5 inventory
      const tier5Inv = result.inventory_distribution.find(
        (d) => d.quality_tier === 5,
      )
      expect(tier5Inv).toBeDefined()
      expect(tier5Inv!.quantity_available).toBe(5)
      expect(tier5Inv!.avg_price).toBe(2000)
    })

    it("should calculate price premiums relative to tier 1", async () => {
      // Create test data with tier 1 baseline
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "per_variant",
      })

      // Create variants with tier 1, 3, 5
      const variant1Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant1Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 1 },
        display_name: "Tier 1",
      })

      const variant3Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant3Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant5Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant5Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      // Create pricing: Tier 1 = 1000, Tier 3 = 1500 (+50%), Tier 5 = 2000 (+100%)
      await db("variant_pricing").insert([
        {
          item_id: itemId,
          variant_id: variant1Id,
          price: 1000,
        },
        {
          item_id: itemId,
          variant_id: variant3Id,
          price: 1500,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          price: 2000,
        },
      ])

      // Create stock lots
      await db("listing_item_lots").insert([
        {
          item_id: itemId,
          variant_id: variant1Id,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: itemId,
          variant_id: variant3Id,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          quantity_total: 10,
          listed: true,
        },
      ])

      const result = await controller.getSellerStats(sellerId)

      expect(result.seller_id).toBe(sellerId)
      expect(result.price_premiums.length).toBe(3)

      // Check Tier 1 premium (baseline = 0%)
      const tier1Premium = result.price_premiums.find(
        (p) => p.quality_tier === 1,
      )
      expect(tier1Premium).toBeDefined()
      expect(tier1Premium!.premium_percentage).toBe(0)

      // Check Tier 3 premium (+50%)
      const tier3Premium = result.price_premiums.find(
        (p) => p.quality_tier === 3,
      )
      expect(tier3Premium).toBeDefined()
      expect(tier3Premium!.premium_percentage).toBe(50)

      // Check Tier 5 premium (+100%)
      const tier5Premium = result.price_premiums.find(
        (p) => p.quality_tier === 5,
      )
      expect(tier5Premium).toBeDefined()
      expect(tier5Premium!.premium_percentage).toBe(100)
    })

    it("should calculate price premiums relative to lowest tier when tier 1 not available", async () => {
      // Create test data without tier 1
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "per_variant",
      })

      // Create variants with tier 3, 5 only (no tier 1)
      const variant3Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant3Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      const variant5Id = uuidv4()
      await db("item_variants").insert({
        variant_id: variant5Id,
        game_item_id: gameItemId,
        attributes: { quality_tier: 5 },
        display_name: "Tier 5",
      })

      // Create pricing: Tier 3 = 1000, Tier 5 = 1500 (+50% from tier 3)
      await db("variant_pricing").insert([
        {
          item_id: itemId,
          variant_id: variant3Id,
          price: 1000,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          price: 1500,
        },
      ])

      // Create stock lots
      await db("listing_item_lots").insert([
        {
          item_id: itemId,
          variant_id: variant3Id,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: itemId,
          variant_id: variant5Id,
          quantity_total: 10,
          listed: true,
        },
      ])

      const result = await controller.getSellerStats(sellerId)

      expect(result.seller_id).toBe(sellerId)
      expect(result.price_premiums.length).toBe(2)

      // Check Tier 3 premium (baseline = 0% since it's the lowest)
      const tier3Premium = result.price_premiums.find(
        (p) => p.quality_tier === 3,
      )
      expect(tier3Premium).toBeDefined()
      expect(tier3Premium!.premium_percentage).toBe(0)

      // Check Tier 5 premium (+50% from tier 3)
      const tier5Premium = result.price_premiums.find(
        (p) => p.quality_tier === 5,
      )
      expect(tier5Premium).toBeDefined()
      expect(tier5Premium!.premium_percentage).toBe(50)
    })

    it("should exclude unlisted stock lots from inventory distribution", async () => {
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create listed and unlisted lots
      await db("listing_item_lots").insert([
        {
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 20,
          listed: false, // Not listed
        },
      ])

      const result = await controller.getSellerStats(sellerId)

      expect(result.inventory_distribution.length).toBe(1)
      expect(result.inventory_distribution[0].quantity_available).toBe(10) // Only listed
    })

    it("should exclude inactive listings from inventory distribution", async () => {
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      // Create active listing
      const activeListingId = uuidv4()
      await db("listings").insert({
        listing_id: activeListingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Active Listing",
        status: "active",
      })

      // Create sold listing
      const soldListingId = uuidv4()
      await db("listings").insert({
        listing_id: soldListingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Sold Listing",
        status: "sold",
      })

      const activeItemId = uuidv4()
      await db("listing_items").insert({
        item_id: activeItemId,
        listing_id: activeListingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const soldItemId = uuidv4()
      await db("listing_items").insert({
        item_id: soldItemId,
        listing_id: soldListingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1500,
      })

      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      await db("listing_item_lots").insert([
        {
          item_id: activeItemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        },
        {
          item_id: soldItemId,
          variant_id: variantId,
          quantity_total: 20,
          listed: true,
        },
      ])

      const result = await controller.getSellerStats(sellerId)

      expect(result.inventory_distribution.length).toBe(1)
      expect(result.inventory_distribution[0].quantity_available).toBe(10) // Only active
    })

    it("should calculate time-to-sale correctly", async () => {
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const buyerId = "550e8400-e29b-41d4-a716-446655440002"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      // Create listing 48 hours ago
      const listingId = uuidv4()
      const listingCreatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000)
      await db("listings").insert({
        listing_id: listingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Test Listing",
        status: "active",
        created_at: listingCreatedAt,
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
      })

      // Create order now (48 hours after listing)
      const orderId = uuidv4()
      const orderCreatedAt = new Date()
      await db("orders").insert({
        order_id: orderId,
        buyer_id: buyerId,
        seller_id: sellerId,
        status: "completed",
        created_at: orderCreatedAt,
      })

      await db("order_market_items_v2").insert({
        order_id: orderId,
        listing_id: listingId,
        item_id: itemId,
        variant_id: variantId,
        quantity: 1,
        price_per_unit: 1000,
      })

      const result = await controller.getSellerStats(sellerId)

      expect(result.sales_by_quality.length).toBe(1)
      const tier3Sales = result.sales_by_quality[0]
      expect(tier3Sales.avg_time_to_sale_hours).toBeCloseTo(48, 0)

      // Clean up
      await db("order_market_items_v2").where({ order_id: orderId }).delete()
      await db("orders").where({ order_id: orderId }).delete()
    })

    it("should handle variants without quality_tier", async () => {
      const sellerId = "550e8400-e29b-41d4-a716-446655440001"
      const gameItemId = uuidv4()

      await db("game_items").insert({
        id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      const listingId = uuidv4()
      await db("listings").insert({
        listing_id: listingId,
        seller_id: sellerId,
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })

      const itemId = uuidv4()
      await db("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })

      // Create variant without quality_tier
      const variantId = uuidv4()
      await db("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { crafted_source: "store" }, // No quality_tier
        display_name: "Store Item",
      })

      await db("listing_item_lots").insert({
        item_id: itemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      const result = await controller.getSellerStats(sellerId)

      // Should exclude variants without quality_tier
      expect(result.inventory_distribution).toEqual([])
      expect(result.price_premiums).toEqual([])
    })
  })
})
