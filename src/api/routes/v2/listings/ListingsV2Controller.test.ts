/**
 * Unit tests for ListingsV2Controller
 *
 * Tests listing creation with variants:
 * - Valid listing creation with unified pricing
 * - Valid listing creation with per-variant pricing
 * - Validation errors for invalid inputs
 * - Transaction atomicity
 * - Variant deduplication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ListingsV2Controller } from "./ListingsV2Controller.js"
import { CreateListingRequest } from "../types/listings.types.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { Request as ExpressRequest } from "express"

describe("ListingsV2Controller.createListing", () => {
  const db = getKnex()
  const testUserId = "test-user-123"
  const testGameItemId = "game-item-456"
  let createdListingIds: string[] = []

  // Mock Express request with authenticated user
  const createMockRequest = (): Partial<ExpressRequest> => ({
    user: {
      user_id: testUserId,
      username: "testuser",
      role: "user",
    } as any,
  })

  beforeEach(async () => {
    createdListingIds = []
  })

  afterEach(async () => {
    // Clean up created listings
    if (createdListingIds.length > 0) {
      // Delete in reverse order due to foreign key constraints
      await db("listing_item_lots")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("variant_pricing")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("listing_items").whereIn("listing_id", createdListingIds).delete()

      await db("listings").whereIn("listing_id", createdListingIds).delete()
    }
  })

  describe("Unified Pricing Mode", () => {
    it("should create listing with unified pricing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Test Listing - Unified Pricing",
        description: "This is a test listing with unified pricing",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 5,
              crafted_source: "crafted",
            },
          },
          {
            quantity: 5,
            variant_attributes: {
              quality_tier: 3,
              crafted_source: "store",
            },
          },
        ],
      }

      const response = await controller.createListing(
        request,
        createMockRequest() as ExpressRequest,
      )

      createdListingIds.push(response.listing_id)

      // Verify response
      expect(response.listing_id).toBeTruthy()
      expect(response.seller_id).toBe(testUserId)
      expect(response.seller_type).toBe("user")
      expect(response.title).toBe(request.title)
      expect(response.description).toBe(request.description)
      expect(response.status).toBe("active")

      // Verify listing in database
      const listing = await db("listings")
        .where({ listing_id: response.listing_id })
        .first()

      expect(listing).toBeTruthy()
      expect(listing.seller_id).toBe(testUserId)
      expect(listing.title).toBe(request.title)

      // Verify listing_items
      const listingItems = await db("listing_items")
        .where({ listing_id: response.listing_id })
        .select("*")

      expect(listingItems.length).toBe(1)
      expect(listingItems[0].pricing_mode).toBe("unified")
      expect(listingItems[0].base_price).toBe(1000)

      // Verify stock lots created
      const stockLots = await db("listing_item_lots")
        .where({ item_id: listingItems[0].item_id })
        .select("*")

      expect(stockLots.length).toBe(2)
      expect(stockLots.some((lot) => lot.quantity_total === 10)).toBe(true)
      expect(stockLots.some((lot) => lot.quantity_total === 5)).toBe(true)

      // Verify no variant pricing records (unified mode)
      const variantPricing = await db("variant_pricing")
        .where({ item_id: listingItems[0].item_id })
        .select("*")

      expect(variantPricing.length).toBe(0)
    })

    it("should create listing with empty variant attributes", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Test Listing - Standard Variant",
        description: "Listing with standard variant (no quality attributes)",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 500,
        lots: [
          {
            quantity: 20,
            variant_attributes: {},
          },
        ],
      }

      const response = await controller.createListing(
        request,
        createMockRequest() as ExpressRequest,
      )

      createdListingIds.push(response.listing_id)

      expect(response.listing_id).toBeTruthy()

      // Verify stock lot created with standard variant
      const listingItems = await db("listing_items")
        .where({ listing_id: response.listing_id })
        .first()

      const stockLots = await db("listing_item_lots")
        .where({ item_id: listingItems.item_id })
        .select("*")

      expect(stockLots.length).toBe(1)
      expect(stockLots[0].quantity_total).toBe(20)
    })
  })

  describe("Per-Variant Pricing Mode", () => {
    it("should create listing with per-variant pricing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Test Listing - Per-Variant Pricing",
        description: "This is a test listing with per-variant pricing",
        game_item_id: testGameItemId,
        pricing_mode: "per_variant",
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 5,
              quality_value: 95.5,
              crafted_source: "crafted",
            },
            price: 2000,
          },
          {
            quantity: 5,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 65.0,
              crafted_source: "store",
            },
            price: 1000,
          },
        ],
      }

      const response = await controller.createListing(
        request,
        createMockRequest() as ExpressRequest,
      )

      createdListingIds.push(response.listing_id)

      expect(response.listing_id).toBeTruthy()

      // Verify listing_items
      const listingItems = await db("listing_items")
        .where({ listing_id: response.listing_id })
        .first()

      expect(listingItems.pricing_mode).toBe("per_variant")
      expect(listingItems.base_price).toBeNull()

      // Verify variant pricing records created
      const variantPricing = await db("variant_pricing")
        .where({ item_id: listingItems.item_id })
        .select("*")

      expect(variantPricing.length).toBe(2)
      expect(variantPricing.some((vp) => vp.price === 2000)).toBe(true)
      expect(variantPricing.some((vp) => vp.price === 1000)).toBe(true)
    })
  })

  describe("Variant Deduplication", () => {
    it("should reuse existing variants with same attributes", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const sharedAttributes = {
        quality_tier: 5,
        crafted_source: "crafted" as const,
      }

      // Create first listing
      const request1: CreateListingRequest = {
        title: "First Listing",
        description: "First listing with T5 crafted",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [
          {
            quantity: 10,
            variant_attributes: sharedAttributes,
          },
        ],
      }

      const response1 = await controller.createListing(
        request1,
        createMockRequest() as ExpressRequest,
      )
      createdListingIds.push(response1.listing_id)

      // Get variant ID from first listing
      const listingItems1 = await db("listing_items")
        .where({ listing_id: response1.listing_id })
        .first()

      const stockLots1 = await db("listing_item_lots")
        .where({ item_id: listingItems1.item_id })
        .first()

      const variantId1 = stockLots1.variant_id

      // Create second listing with same variant attributes
      const request2: CreateListingRequest = {
        title: "Second Listing",
        description: "Second listing with T5 crafted",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1200,
        lots: [
          {
            quantity: 5,
            variant_attributes: sharedAttributes,
          },
        ],
      }

      const response2 = await controller.createListing(
        request2,
        createMockRequest() as ExpressRequest,
      )
      createdListingIds.push(response2.listing_id)

      // Get variant ID from second listing
      const listingItems2 = await db("listing_items")
        .where({ listing_id: response2.listing_id })
        .first()

      const stockLots2 = await db("listing_item_lots")
        .where({ item_id: listingItems2.item_id })
        .first()

      const variantId2 = stockLots2.variant_id

      // Verify same variant was reused
      expect(variantId1).toBe(variantId2)
    })
  })

  describe("Validation", () => {
    it("should reject listing without title", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject listing with title over 500 characters", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "A".repeat(501),
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject listing without description", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject unified pricing without base_price", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        lots: [{ quantity: 10, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject per-variant pricing without lot prices", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "per_variant",
        lots: [{ quantity: 10, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject listing without lots", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject lot with zero quantity", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 0, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject lot with negative quantity", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: -5, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject quality_tier outside 1-5 range", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [
          {
            quantity: 10,
            variant_attributes: { quality_tier: 6 },
          },
        ],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject quality_value outside 0-100 range", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [
          {
            quantity: 10,
            variant_attributes: { quality_value: 101 },
          },
        ],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject invalid crafted_source", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [
          {
            quantity: 10,
            variant_attributes: { crafted_source: "invalid" as any },
          },
        ],
      }

      await expect(
        controller.createListing(request, createMockRequest() as ExpressRequest),
      ).rejects.toThrow()
    })
  })

  describe("Authentication", () => {
    it("should require authentication", async () => {
      const controller = new ListingsV2Controller({} as ExpressRequest)

      const request: CreateListingRequest = {
        title: "Title",
        description: "Description",
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [{ quantity: 10, variant_attributes: {} }],
      }

      await expect(
        controller.createListing(request, {} as ExpressRequest),
      ).rejects.toThrow()
    })
  })
})

describe("ListingsV2Controller.getListingDetail", () => {
  const db = getKnex()
  const testUserId = "test-user-detail-123"
  const testGameItemId = "game-item-detail-1"
  let createdListingIds: string[] = []

  // Mock Express request
  const createMockRequest = (): Partial<ExpressRequest> => ({
    user: {
      user_id: testUserId,
      username: "testuser",
      role: "user",
    } as any,
  })

  // Helper to create test listing
  const createTestListing = async (
    title: string,
    description: string,
    pricingMode: "unified" | "per_variant",
    basePrice: number | undefined,
    lots: Array<{
      quantity: number
      quality_tier?: number
      quality_value?: number
      crafted_source?: "crafted" | "store" | "looted" | "unknown"
      price?: number
      location_id?: string
    }>,
  ): Promise<string> => {
    const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

    const request: CreateListingRequest = {
      title,
      description,
      game_item_id: testGameItemId,
      pricing_mode: pricingMode,
      base_price: basePrice,
      lots: lots.map((lot) => ({
        quantity: lot.quantity,
        variant_attributes: {
          quality_tier: lot.quality_tier,
          quality_value: lot.quality_value,
          crafted_source: lot.crafted_source,
        },
        price: lot.price,
        location_id: lot.location_id,
      })),
    }

    const response = await controller.createListing(
      request,
      createMockRequest() as ExpressRequest,
    )

    createdListingIds.push(response.listing_id)
    return response.listing_id
  }

  afterEach(async () => {
    // Clean up created listings
    if (createdListingIds.length > 0) {
      await db("listing_item_lots")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("variant_pricing")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("listing_items").whereIn("listing_id", createdListingIds).delete()

      await db("listings").whereIn("listing_id", createdListingIds).delete()
    }

    createdListingIds = []
  })

  describe("Basic Retrieval", () => {
    it("should retrieve listing detail with unified pricing", async () => {
      const controller = new ListingsV2Controller()

      // Create test listing
      const listingId = await createTestListing(
        "Test Listing Detail",
        "This is a test listing for detail retrieval",
        "unified",
        1000,
        [
          { quantity: 10, quality_tier: 5, crafted_source: "crafted" },
          { quantity: 5, quality_tier: 3, crafted_source: "store" },
        ],
      )

      // Retrieve listing detail
      const response = await controller.getListingDetail(listingId)

      // Verify listing metadata
      expect(response.listing).toBeTruthy()
      expect(response.listing.listing_id).toBe(listingId)
      expect(response.listing.title).toBe("Test Listing Detail")
      expect(response.listing.description).toBe(
        "This is a test listing for detail retrieval",
      )
      expect(response.listing.status).toBe("active")
      expect(response.listing.seller_id).toBe(testUserId)
      expect(response.listing.seller_type).toBe("user")

      // Verify timestamps
      expect(response.listing.created_at).toBeTruthy()
      expect(response.listing.updated_at).toBeTruthy()

      // Verify seller information
      expect(response.seller).toBeTruthy()
      expect(response.seller.id).toBe(testUserId)
      expect(response.seller.type).toBe("user")
      expect(typeof response.seller.rating).toBe("number")

      // Verify items
      expect(response.items).toBeTruthy()
      expect(response.items.length).toBe(1)

      const item = response.items[0]
      expect(item.item_id).toBeTruthy()
      expect(item.game_item.id).toBe(testGameItemId)
      expect(item.pricing_mode).toBe("unified")
      expect(item.base_price).toBe(1000)

      // Verify variants
      expect(item.variants).toBeTruthy()
      expect(item.variants.length).toBe(2)

      // Check that both variants have correct pricing (unified)
      item.variants.forEach((variant) => {
        expect(variant.price).toBe(1000)
        expect(variant.quantity).toBeGreaterThan(0)
        expect(variant.display_name).toBeTruthy()
        expect(variant.short_name).toBeTruthy()
        expect(variant.attributes).toBeTruthy()
      })
    })

    it("should retrieve listing detail with per-variant pricing", async () => {
      const controller = new ListingsV2Controller()

      // Create test listing with per-variant pricing
      const listingId = await createTestListing(
        "Per-Variant Pricing Listing",
        "Listing with different prices per variant",
        "per_variant",
        undefined,
        [
          {
            quantity: 10,
            quality_tier: 5,
            quality_value: 95.5,
            crafted_source: "crafted",
            price: 2000,
          },
          {
            quantity: 5,
            quality_tier: 3,
            quality_value: 65.0,
            crafted_source: "store",
            price: 1000,
          },
        ],
      )

      // Retrieve listing detail
      const response = await controller.getListingDetail(listingId)

      // Verify pricing mode
      const item = response.items[0]
      expect(item.pricing_mode).toBe("per_variant")
      expect(item.base_price).toBeNull()

      // Verify variants have different prices
      expect(item.variants.length).toBe(2)

      const tier5Variant = item.variants.find(
        (v) => v.attributes.quality_tier === 5,
      )
      const tier3Variant = item.variants.find(
        (v) => v.attributes.quality_tier === 3,
      )

      expect(tier5Variant).toBeTruthy()
      expect(tier5Variant!.price).toBe(2000)
      expect(tier5Variant!.quantity).toBe(10)

      expect(tier3Variant).toBeTruthy()
      expect(tier3Variant!.price).toBe(1000)
      expect(tier3Variant!.quantity).toBe(5)
    })

    it("should return 404 for non-existent listing", async () => {
      const controller = new ListingsV2Controller()

      const nonExistentId = "00000000-0000-0000-0000-000000000000"

      await expect(controller.getListingDetail(nonExistentId)).rejects.toThrow()
    })
  })

  describe("Variant Details", () => {
    it("should include variant attributes", async () => {
      const controller = new ListingsV2Controller()

      const listingId = await createTestListing(
        "Variant Attributes Test",
        "Testing variant attribute display",
        "unified",
        1500,
        [
          {
            quantity: 8,
            quality_tier: 5,
            quality_value: 98.2,
            crafted_source: "crafted",
          },
          {
            quantity: 12,
            quality_tier: 2,
            quality_value: 45.0,
            crafted_source: "looted",
          },
        ],
      )

      const response = await controller.getListingDetail(listingId)
      const item = response.items[0]

      expect(item.variants.length).toBe(2)

      // Verify tier 5 variant
      const tier5 = item.variants.find((v) => v.attributes.quality_tier === 5)
      expect(tier5).toBeTruthy()
      expect(tier5!.attributes.quality_tier).toBe(5)
      expect(tier5!.attributes.quality_value).toBe(98.2)
      expect(tier5!.attributes.crafted_source).toBe("crafted")
      expect(tier5!.quantity).toBe(8)

      // Verify tier 2 variant
      const tier2 = item.variants.find((v) => v.attributes.quality_tier === 2)
      expect(tier2).toBeTruthy()
      expect(tier2!.attributes.quality_tier).toBe(2)
      expect(tier2!.attributes.quality_value).toBe(45.0)
      expect(tier2!.attributes.crafted_source).toBe("looted")
      expect(tier2!.quantity).toBe(12)
    })

    it("should include display_name and short_name", async () => {
      const controller = new ListingsV2Controller()

      const listingId = await createTestListing(
        "Display Names Test",
        "Testing display name generation",
        "unified",
        1000,
        [{ quantity: 5, quality_tier: 4, crafted_source: "crafted" }],
      )

      const response = await controller.getListingDetail(listingId)
      const item = response.items[0]
      const variant = item.variants[0]

      expect(variant.display_name).toBeTruthy()
      expect(variant.short_name).toBeTruthy()
      expect(typeof variant.display_name).toBe("string")
      expect(typeof variant.short_name).toBe("string")
    })

    it("should aggregate quantities for same variant across multiple lots", async () => {
      const controller = new ListingsV2Controller()

      // Create listing with same variant in multiple lots
      const listingId = await createTestListing(
        "Quantity Aggregation Test",
        "Testing quantity aggregation",
        "unified",
        1000,
        [
          { quantity: 10, quality_tier: 5, crafted_source: "crafted" },
          { quantity: 5, quality_tier: 5, crafted_source: "crafted" }, // Same variant
          { quantity: 8, quality_tier: 3, crafted_source: "store" },
        ],
      )

      const response = await controller.getListingDetail(listingId)
      const item = response.items[0]

      // Should have 2 unique variants (tier 5 and tier 3)
      expect(item.variants.length).toBe(2)

      // Tier 5 should have aggregated quantity of 15 (10 + 5)
      const tier5 = item.variants.find((v) => v.attributes.quality_tier === 5)
      expect(tier5).toBeTruthy()
      expect(tier5!.quantity).toBe(15)

      // Tier 3 should have quantity of 8
      const tier3 = item.variants.find((v) => v.attributes.quality_tier === 3)
      expect(tier3).toBeTruthy()
      expect(tier3!.quantity).toBe(8)
    })
  })

  describe("Location Information", () => {
    it("should include location information when available", async () => {
      const controller = new ListingsV2Controller()

      // First, create a test location
      const [location] = await db("locations")
        .insert({
          name: "Test Warehouse A",
          type: "warehouse",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*")

      try {
        const listingId = await createTestListing(
          "Location Test",
          "Testing location display",
          "unified",
          1000,
          [
            {
              quantity: 10,
              quality_tier: 5,
              crafted_source: "crafted",
              location_id: location.location_id,
            },
          ],
        )

        const response = await controller.getListingDetail(listingId)
        const item = response.items[0]
        const variant = item.variants[0]

        expect(variant.locations).toBeTruthy()
        expect(variant.locations.length).toBeGreaterThan(0)
        expect(variant.locations).toContain("Test Warehouse A")
      } finally {
        // Clean up test location
        await db("locations").where("location_id", location.location_id).delete()
      }
    })

    it("should aggregate locations for same variant across multiple lots", async () => {
      const controller = new ListingsV2Controller()

      // Create two test locations
      const [location1] = await db("locations")
        .insert({
          name: "Warehouse A",
          type: "warehouse",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*")

      const [location2] = await db("locations")
        .insert({
          name: "Warehouse B",
          type: "warehouse",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*")

      try {
        const listingId = await createTestListing(
          "Multiple Locations Test",
          "Testing multiple location aggregation",
          "unified",
          1000,
          [
            {
              quantity: 10,
              quality_tier: 5,
              crafted_source: "crafted",
              location_id: location1.location_id,
            },
            {
              quantity: 5,
              quality_tier: 5,
              crafted_source: "crafted",
              location_id: location2.location_id,
            },
          ],
        )

        const response = await controller.getListingDetail(listingId)
        const item = response.items[0]
        const variant = item.variants[0]

        expect(variant.locations.length).toBe(2)
        expect(variant.locations).toContain("Warehouse A")
        expect(variant.locations).toContain("Warehouse B")
      } finally {
        // Clean up test locations
        await db("locations")
          .whereIn("location_id", [location1.location_id, location2.location_id])
          .delete()
      }
    })

    it("should handle variants without locations", async () => {
      const controller = new ListingsV2Controller()

      const listingId = await createTestListing(
        "No Location Test",
        "Testing variants without location",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5, crafted_source: "crafted" }],
      )

      const response = await controller.getListingDetail(listingId)
      const item = response.items[0]
      const variant = item.variants[0]

      expect(variant.locations).toBeTruthy()
      expect(Array.isArray(variant.locations)).toBe(true)
      expect(variant.locations.length).toBe(0)
    })
  })

  describe("Response Structure", () => {
    it("should include all required listing fields", async () => {
      const controller = new ListingsV2Controller()

      const listingId = await createTestListing(
        "Complete Response Test",
        "Testing complete response structure",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5, crafted_source: "crafted" }],
      )

      const response = await controller.getListingDetail(listingId)

      // Verify top-level structure
      expect(response).toHaveProperty("listing")
      expect(response).toHaveProperty("seller")
      expect(response).toHaveProperty("items")

      // Verify listing fields
      expect(response.listing).toHaveProperty("listing_id")
      expect(response.listing).toHaveProperty("seller_id")
      expect(response.listing).toHaveProperty("seller_type")
      expect(response.listing).toHaveProperty("title")
      expect(response.listing).toHaveProperty("description")
      expect(response.listing).toHaveProperty("status")
      expect(response.listing).toHaveProperty("visibility")
      expect(response.listing).toHaveProperty("sale_type")
      expect(response.listing).toHaveProperty("listing_type")
      expect(response.listing).toHaveProperty("created_at")
      expect(response.listing).toHaveProperty("updated_at")

      // Verify seller fields
      expect(response.seller).toHaveProperty("id")
      expect(response.seller).toHaveProperty("name")
      expect(response.seller).toHaveProperty("type")
      expect(response.seller).toHaveProperty("rating")

      // Verify item fields
      expect(response.items.length).toBeGreaterThan(0)
      const item = response.items[0]
      expect(item).toHaveProperty("item_id")
      expect(item).toHaveProperty("game_item")
      expect(item).toHaveProperty("pricing_mode")
      expect(item).toHaveProperty("variants")

      // Verify game_item fields
      expect(item.game_item).toHaveProperty("id")
      expect(item.game_item).toHaveProperty("name")
      expect(item.game_item).toHaveProperty("type")

      // Verify variant fields
      expect(item.variants.length).toBeGreaterThan(0)
      const variant = item.variants[0]
      expect(variant).toHaveProperty("variant_id")
      expect(variant).toHaveProperty("attributes")
      expect(variant).toHaveProperty("display_name")
      expect(variant).toHaveProperty("short_name")
      expect(variant).toHaveProperty("quantity")
      expect(variant).toHaveProperty("price")
      expect(variant).toHaveProperty("locations")
    })

    it("should handle listings with empty variant attributes", async () => {
      const controller = new ListingsV2Controller()

      const listingId = await createTestListing(
        "Empty Attributes Test",
        "Testing empty variant attributes",
        "unified",
        500,
        [{ quantity: 20 }], // No quality attributes
      )

      const response = await controller.getListingDetail(listingId)
      const item = response.items[0]

      expect(item.variants.length).toBe(1)
      const variant = item.variants[0]

      expect(variant.attributes).toBeTruthy()
      expect(variant.quantity).toBe(20)
      expect(variant.price).toBe(500)
    })
  })

  describe("Edge Cases", () => {
    it("should handle listing with no variants (all lots unlisted)", async () => {
      const controller = new ListingsV2Controller()

      // Create listing
      const listingId = await createTestListing(
        "Unlisted Lots Test",
        "Testing listing with unlisted lots",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5, crafted_source: "crafted" }],
      )

      // Unlist all lots
      await db("listing_item_lots")
        .whereIn(
          "item_id",
          db("listing_items").where("listing_id", listingId).select("item_id"),
        )
        .update({ listed: false })

      const response = await controller.getListingDetail(listingId)
      const item = response.items[0]

      // Should have no variants since all lots are unlisted
      expect(item.variants.length).toBe(0)
    })

    it("should handle very long descriptions", async () => {
      const controller = new ListingsV2Controller()

      const longDescription = "A".repeat(5000)

      const listingId = await createTestListing(
        "Long Description Test",
        longDescription,
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5, crafted_source: "crafted" }],
      )

      const response = await controller.getListingDetail(listingId)

      expect(response.listing.description).toBe(longDescription)
      expect(response.listing.description.length).toBe(5000)
    })

    it("should handle listing with many variants", async () => {
      const controller = new ListingsV2Controller()

      // Create listing with 5 different quality tiers
      const listingId = await createTestListing(
        "Many Variants Test",
        "Testing listing with many variants",
        "per_variant",
        undefined,
        [
          { quantity: 10, quality_tier: 5, crafted_source: "crafted", price: 5000 },
          { quantity: 10, quality_tier: 4, crafted_source: "crafted", price: 4000 },
          { quantity: 10, quality_tier: 3, crafted_source: "store", price: 3000 },
          { quantity: 10, quality_tier: 2, crafted_source: "looted", price: 2000 },
          { quantity: 10, quality_tier: 1, crafted_source: "unknown", price: 1000 },
        ],
      )

      const response = await controller.getListingDetail(listingId)
      const item = response.items[0]

      expect(item.variants.length).toBe(5)

      // Verify all quality tiers are present
      const qualityTiers = item.variants.map((v) => v.attributes?.quality_tier).sort()
      expect(qualityTiers).toEqual([1, 2, 3, 4, 5])

      // Verify prices are correct
      item.variants.forEach((variant) => {
        const expectedPrice = (variant.attributes?.quality_tier ?? 1) * 1000
        expect(variant.price).toBe(expectedPrice)
      })
    })
  })
})

describe("ListingsV2Controller.searchListings", () => {
  const db = getKnex()
  const testUserId = "test-user-search-123"
  const testGameItemId1 = "game-item-search-1"
  const testGameItemId2 = "game-item-search-2"
  let createdListingIds: string[] = []

  // Mock Express request
  const createMockRequest = (): Partial<ExpressRequest> => ({
    user: {
      user_id: testUserId,
      username: "testuser",
      role: "user",
    } as any,
  })

  // Helper to create test listing
  const createTestListing = async (
    title: string,
    gameItemId: string,
    basePrice: number,
    lots: Array<{
      quantity: number
      quality_tier?: number
      price?: number
    }>,
  ): Promise<string> => {
    const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

    const request: CreateListingRequest = {
      title,
      description: `Description for ${title}`,
      game_item_id: gameItemId,
      pricing_mode: lots.some((l) => l.price !== undefined) ? "per_variant" : "unified",
      base_price: lots.some((l) => l.price !== undefined) ? undefined : basePrice,
      lots: lots.map((lot) => ({
        quantity: lot.quantity,
        variant_attributes: lot.quality_tier
          ? { quality_tier: lot.quality_tier }
          : {},
        price: lot.price,
      })),
    }

    const response = await controller.createListing(
      request,
      createMockRequest() as ExpressRequest,
    )

    createdListingIds.push(response.listing_id)
    return response.listing_id
  }

  beforeEach(async () => {
    createdListingIds = []

    // Create test listings with various attributes
    await createTestListing("High Quality Sword", testGameItemId1, 2000, [
      { quantity: 5, quality_tier: 5 },
      { quantity: 3, quality_tier: 4 },
    ])

    await createTestListing("Medium Quality Sword", testGameItemId1, 1000, [
      { quantity: 10, quality_tier: 3 },
      { quantity: 5, quality_tier: 2 },
    ])

    await createTestListing("Low Quality Sword", testGameItemId1, 500, [
      { quantity: 20, quality_tier: 1 },
    ])

    await createTestListing("High Quality Shield", testGameItemId2, 1500, [
      { quantity: 8, quality_tier: 5 },
    ])

    await createTestListing(
      "Variable Price Armor",
      testGameItemId1,
      0,
      [
        { quantity: 5, quality_tier: 5, price: 3000 },
        { quantity: 10, quality_tier: 3, price: 1500 },
      ],
    )
  })

  afterEach(async () => {
    // Clean up created listings
    if (createdListingIds.length > 0) {
      await db("listing_item_lots")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("variant_pricing")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("listing_items").whereIn("listing_id", createdListingIds).delete()

      await db("listings").whereIn("listing_id", createdListingIds).delete()
    }
  })

  describe("Basic Search", () => {
    it("should return all listings without filters", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings()

      expect(response.listings.length).toBeGreaterThan(0)
      expect(response.total).toBeGreaterThan(0)
      expect(response.page).toBe(1)
      expect(response.page_size).toBe(20)
    })

    it("should return listings with pagination", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        2,
      )

      expect(response.listings.length).toBeLessThanOrEqual(2)
      expect(response.page).toBe(1)
      expect(response.page_size).toBe(2)
    })

    it("should respect max page_size of 100", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        200,
      )

      expect(response.page_size).toBe(100)
    })

    it("should handle page 2 correctly", async () => {
      const controller = new ListingsV2Controller()

      const page1 = await controller.searchListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        2,
      )

      const page2 = await controller.searchListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        2,
        2,
      )

      expect(page2.page).toBe(2)
      // Ensure different results (if enough listings exist)
      if (page1.total > 2) {
        expect(page1.listings[0].listing_id).not.toBe(page2.listings[0]?.listing_id)
      }
    })
  })

  describe("Full-Text Search", () => {
    it("should filter by text search", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings("Sword")

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        expect(listing.title.toLowerCase()).toContain("sword")
      })
    })

    it("should return empty results for non-matching text", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings("NonExistentItemXYZ123")

      expect(response.listings.length).toBe(0)
      expect(response.total).toBe(0)
    })

    it("should handle text search with multiple words", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings("High Quality")

      expect(response.listings.length).toBeGreaterThan(0)
    })
  })

  describe("Game Item Filter", () => {
    it("should filter by game_item_id", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
      )

      expect(response.listings.length).toBeGreaterThan(0)
      // All results should be for testGameItemId1
      // We can't directly verify game_item_id in response, but we can check count
      expect(response.listings.length).toBeGreaterThanOrEqual(3) // We created 3 listings for item1
    })

    it("should return empty results for non-existent game_item_id", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        "non-existent-game-item-id",
      )

      expect(response.listings.length).toBe(0)
      expect(response.total).toBe(0)
    })
  })

  describe("Quality Tier Filters", () => {
    it("should filter by quality_tier_min", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        5, // quality_tier_min
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        // Listings should have quality_tier_max >= 5
        if (listing.quality_tier_max !== undefined) {
          expect(listing.quality_tier_max).toBeGreaterThanOrEqual(5)
        }
      })
    })

    it("should filter by quality_tier_max", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        2, // quality_tier_max
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        // Listings should have quality_tier_min <= 2
        if (listing.quality_tier_min !== undefined) {
          expect(listing.quality_tier_min).toBeLessThanOrEqual(2)
        }
      })
    })

    it("should filter by quality tier range", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        3, // quality_tier_min
        4, // quality_tier_max
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        // Listings should overlap with range [3, 4]
        if (
          listing.quality_tier_min !== undefined &&
          listing.quality_tier_max !== undefined
        ) {
          expect(listing.quality_tier_max).toBeGreaterThanOrEqual(3)
          expect(listing.quality_tier_min).toBeLessThanOrEqual(4)
        }
      })
    })

    it("should reject quality_tier_min < 1", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(undefined, undefined, 0),
      ).rejects.toThrow()
    })

    it("should reject quality_tier_min > 5", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(undefined, undefined, 6),
      ).rejects.toThrow()
    })

    it("should reject quality_tier_max < 1", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(undefined, undefined, undefined, 0),
      ).rejects.toThrow()
    })

    it("should reject quality_tier_max > 5", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(undefined, undefined, undefined, 6),
      ).rejects.toThrow()
    })

    it("should reject quality_tier_min > quality_tier_max", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(undefined, undefined, 4, 2),
      ).rejects.toThrow()
    })
  })

  describe("Price Filters", () => {
    it("should filter by price_min", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        undefined,
        1500, // price_min
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        // Listings should have price_max >= 1500
        expect(listing.price_max).toBeGreaterThanOrEqual(1500)
      })
    })

    it("should filter by price_max", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        undefined,
        undefined,
        1000, // price_max
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        // Listings should have price_min <= 1000
        expect(listing.price_min).toBeLessThanOrEqual(1000)
      })
    })

    it("should filter by price range", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        undefined,
        800, // price_min
        1500, // price_max
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        // Listings should overlap with range [800, 1500]
        expect(listing.price_max).toBeGreaterThanOrEqual(800)
        expect(listing.price_min).toBeLessThanOrEqual(1500)
      })
    })

    it("should reject negative price_min", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(undefined, undefined, undefined, undefined, -100),
      ).rejects.toThrow()
    })

    it("should reject negative price_max", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          -100,
        ),
      ).rejects.toThrow()
    })

    it("should reject price_min > price_max", async () => {
      const controller = new ListingsV2Controller()

      await expect(
        controller.searchListings(
          undefined,
          undefined,
          undefined,
          undefined,
          2000,
          1000,
        ),
      ).rejects.toThrow()
    })
  })

  describe("Sorting", () => {
    it("should sort by created_at desc (default)", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
      )

      expect(response.listings.length).toBeGreaterThan(1)
      // Verify descending order
      for (let i = 0; i < response.listings.length - 1; i++) {
        const current = new Date(response.listings[i].created_at)
        const next = new Date(response.listings[i + 1].created_at)
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime())
      }
    })

    it("should sort by created_at asc", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
        "created_at",
        "asc",
      )

      expect(response.listings.length).toBeGreaterThan(1)
      // Verify ascending order
      for (let i = 0; i < response.listings.length - 1; i++) {
        const current = new Date(response.listings[i].created_at)
        const next = new Date(response.listings[i + 1].created_at)
        expect(current.getTime()).toBeLessThanOrEqual(next.getTime())
      }
    })

    it("should sort by price asc", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
        "price",
        "asc",
      )

      expect(response.listings.length).toBeGreaterThan(1)
      // Verify ascending order by price_min
      for (let i = 0; i < response.listings.length - 1; i++) {
        expect(response.listings[i].price_min).toBeLessThanOrEqual(
          response.listings[i + 1].price_min,
        )
      }
    })

    it("should sort by price desc", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
        "price",
        "desc",
      )

      expect(response.listings.length).toBeGreaterThan(1)
      // Verify descending order by price_min
      for (let i = 0; i < response.listings.length - 1; i++) {
        expect(response.listings[i].price_min).toBeGreaterThanOrEqual(
          response.listings[i + 1].price_min,
        )
      }
    })

    it("should sort by quality desc", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
        "quality",
        "desc",
      )

      expect(response.listings.length).toBeGreaterThan(1)
      // Verify descending order by quality_tier_max
      for (let i = 0; i < response.listings.length - 1; i++) {
        const currentQuality = response.listings[i].quality_tier_max || 0
        const nextQuality = response.listings[i + 1].quality_tier_max || 0
        expect(currentQuality).toBeGreaterThanOrEqual(nextQuality)
      }
    })
  })

  describe("Combined Filters", () => {
    it("should apply multiple filters together", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        "Sword",
        testGameItemId1,
        3, // quality_tier_min
        5, // quality_tier_max
        500, // price_min
        2500, // price_max
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        expect(listing.title.toLowerCase()).toContain("sword")
        if (listing.quality_tier_max !== undefined) {
          expect(listing.quality_tier_max).toBeGreaterThanOrEqual(3)
        }
        if (listing.quality_tier_min !== undefined) {
          expect(listing.quality_tier_min).toBeLessThanOrEqual(5)
        }
        expect(listing.price_max).toBeGreaterThanOrEqual(500)
        expect(listing.price_min).toBeLessThanOrEqual(2500)
      })
    })
  })

  describe("Response Structure", () => {
    it("should include all required fields in response", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
      )

      expect(response).toHaveProperty("listings")
      expect(response).toHaveProperty("total")
      expect(response).toHaveProperty("page")
      expect(response).toHaveProperty("page_size")

      if (response.listings.length > 0) {
        const listing = response.listings[0]
        expect(listing).toHaveProperty("listing_id")
        expect(listing).toHaveProperty("title")
        expect(listing).toHaveProperty("seller_name")
        expect(listing).toHaveProperty("seller_rating")
        expect(listing).toHaveProperty("price_min")
        expect(listing).toHaveProperty("price_max")
        expect(listing).toHaveProperty("quantity_available")
        expect(listing).toHaveProperty("variant_count")
        expect(listing).toHaveProperty("created_at")
      }
    })

    it("should include variant_count in results", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        "High Quality Sword",
      )

      expect(response.listings.length).toBeGreaterThan(0)
      const listing = response.listings[0]
      expect(listing.variant_count).toBeGreaterThan(0)
    })

    it("should include seller information", async () => {
      const controller = new ListingsV2Controller()

      const response = await controller.searchListings(
        undefined,
        testGameItemId1,
      )

      expect(response.listings.length).toBeGreaterThan(0)
      response.listings.forEach((listing) => {
        expect(listing.seller_name).toBeTruthy()
        expect(typeof listing.seller_rating).toBe("number")
      })
    })
  })
})

describe("ListingsV2Controller.updateListing", () => {
  const db = getKnex()
  const testUserId = "test-user-update-123"
  const testGameItemId = "game-item-update-1"
  let createdListingIds: string[] = []

  // Mock Express request
  const createMockRequest = (): Partial<ExpressRequest> => ({
    user: {
      user_id: testUserId,
      username: "testuser",
      role: "user",
    } as any,
  })

  // Helper to create test listing
  const createTestListing = async (
    title: string,
    description: string,
    pricingMode: "unified" | "per_variant",
    basePrice: number | undefined,
    lots: Array<{
      quantity: number
      quality_tier?: number
      quality_value?: number
      crafted_source?: "crafted" | "store" | "looted" | "unknown"
      price?: number
    }>,
  ): Promise<string> => {
    const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

    const request: CreateListingRequest = {
      title,
      description,
      game_item_id: testGameItemId,
      pricing_mode: pricingMode,
      base_price: basePrice,
      lots: lots.map((lot) => ({
        quantity: lot.quantity,
        variant_attributes: {
          quality_tier: lot.quality_tier,
          quality_value: lot.quality_value,
          crafted_source: lot.crafted_source,
        },
        price: lot.price,
      })),
    }

    const response = await controller.createListing(
      request,
      createMockRequest() as ExpressRequest,
    )

    createdListingIds.push(response.listing_id)
    return response.listing_id
  }

  afterEach(async () => {
    // Clean up created listings
    if (createdListingIds.length > 0) {
      await db("listing_item_lots")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("variant_pricing")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("listing_items").whereIn("listing_id", createdListingIds).delete()

      await db("listings").whereIn("listing_id", createdListingIds).delete()
    }

    createdListingIds = []
  })

  describe("Update Title and Description", () => {
    it("should update listing title", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      // Create test listing
      const listingId = await createTestListing(
        "Original Title",
        "Original Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      // Update title
      const response = await controller.updateListing(
        listingId,
        { title: "Updated Title" },
        createMockRequest() as ExpressRequest,
      )

      expect(response.listing.title).toBe("Updated Title")
      expect(response.listing.description).toBe("Original Description")

      // Verify in database
      const listing = await db("listings").where({ listing_id: listingId }).first()
      expect(listing.title).toBe("Updated Title")
    })

    it("should update listing description", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Title",
        "Original Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      const response = await controller.updateListing(
        listingId,
        { description: "Updated Description" },
        createMockRequest() as ExpressRequest,
      )

      expect(response.listing.title).toBe("Test Title")
      expect(response.listing.description).toBe("Updated Description")

      // Verify in database
      const listing = await db("listings").where({ listing_id: listingId }).first()
      expect(listing.description).toBe("Updated Description")
    })

    it("should update both title and description", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Original Title",
        "Original Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      const response = await controller.updateListing(
        listingId,
        {
          title: "New Title",
          description: "New Description",
        },
        createMockRequest() as ExpressRequest,
      )

      expect(response.listing.title).toBe("New Title")
      expect(response.listing.description).toBe("New Description")
    })

    it("should reject empty title", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Original Title",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          { title: "" },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject title over 500 characters", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Original Title",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          { title: "A".repeat(501) },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject empty description", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Title",
        "Original Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          { description: "" },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })
  })

  describe("Update Unified Pricing", () => {
    it("should update base_price for unified pricing mode", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [
          { quantity: 10, quality_tier: 5 },
          { quantity: 5, quality_tier: 3 },
        ],
      )

      const response = await controller.updateListing(
        listingId,
        { base_price: 1500 },
        createMockRequest() as ExpressRequest,
      )

      // Verify all variants now have the new price
      expect(response.items[0].base_price).toBe(1500)
      response.items[0].variants.forEach((variant) => {
        expect(variant.price).toBe(1500)
      })

      // Verify in database
      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      expect(listingItem.base_price).toBe(1500)
    })

    it("should reject base_price update for per_variant pricing mode", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "per_variant",
        undefined,
        [
          { quantity: 10, quality_tier: 5, price: 2000 },
          { quantity: 5, quality_tier: 3, price: 1000 },
        ],
      )

      await expect(
        controller.updateListing(
          listingId,
          { base_price: 1500 },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject negative base_price", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          { base_price: -100 },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject zero base_price", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          { base_price: 0 },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })
  })

  describe("Update Per-Variant Pricing", () => {
    it("should update per-variant prices", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "per_variant",
        undefined,
        [
          { quantity: 10, quality_tier: 5, price: 2000 },
          { quantity: 5, quality_tier: 3, price: 1000 },
        ],
      )

      // Get variant IDs
      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      const lots = await db("listing_item_lots")
        .join("item_variants", "listing_item_lots.variant_id", "item_variants.variant_id")
        .where({ item_id: listingItem.item_id })
        .select("listing_item_lots.variant_id", "item_variants.attributes")

      const tier5Variant = lots.find((lot: any) => lot.attributes.quality_tier === 5)
      const tier3Variant = lots.find((lot: any) => lot.attributes.quality_tier === 3)

      // Update prices
      const response = await controller.updateListing(
        listingId,
        {
          variant_prices: [
            { variant_id: tier5Variant.variant_id, price: 2500 },
            { variant_id: tier3Variant.variant_id, price: 1200 },
          ],
        },
        createMockRequest() as ExpressRequest,
      )

      // Verify updated prices
      const updatedTier5 = response.items[0].variants.find(
        (v) => v.attributes.quality_tier === 5,
      )
      const updatedTier3 = response.items[0].variants.find(
        (v) => v.attributes.quality_tier === 3,
      )

      expect(updatedTier5?.price).toBe(2500)
      expect(updatedTier3?.price).toBe(1200)
    })

    it("should reject variant_prices update for unified pricing mode", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          {
            variant_prices: [{ variant_id: "some-variant-id", price: 1500 }],
          },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject negative variant price", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "per_variant",
        undefined,
        [{ quantity: 10, quality_tier: 5, price: 2000 }],
      )

      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      const lot = await db("listing_item_lots")
        .where({ item_id: listingItem.item_id })
        .first()

      await expect(
        controller.updateListing(
          listingId,
          {
            variant_prices: [{ variant_id: lot.variant_id, price: -100 }],
          },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject variant not in listing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "per_variant",
        undefined,
        [{ quantity: 10, quality_tier: 5, price: 2000 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          {
            variant_prices: [
              { variant_id: "00000000-0000-0000-0000-000000000000", price: 1500 },
            ],
          },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })
  })

  describe("Update Stock Lots", () => {
    it("should update stock lot quantity", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      // Get lot ID
      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      const lot = await db("listing_item_lots")
        .where({ item_id: listingItem.item_id })
        .first()

      // Update quantity
      const response = await controller.updateListing(
        listingId,
        {
          lot_updates: [{ lot_id: lot.lot_id, quantity_total: 20 }],
        },
        createMockRequest() as ExpressRequest,
      )

      // Verify updated quantity
      expect(response.items[0].variants[0].quantity).toBe(20)

      // Verify in database
      const updatedLot = await db("listing_item_lots")
        .where({ lot_id: lot.lot_id })
        .first()

      expect(updatedLot.quantity_total).toBe(20)
    })

    it("should update stock lot listed status", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      // Get lot ID
      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      const lot = await db("listing_item_lots")
        .where({ item_id: listingItem.item_id })
        .first()

      // Update listed status to false
      await controller.updateListing(
        listingId,
        {
          lot_updates: [{ lot_id: lot.lot_id, listed: false }],
        },
        createMockRequest() as ExpressRequest,
      )

      // Verify in database
      const updatedLot = await db("listing_item_lots")
        .where({ lot_id: lot.lot_id })
        .first()

      expect(updatedLot.listed).toBe(false)
    })

    it("should update stock lot location", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      // Create test location
      const [location] = await db("locations")
        .insert({
          name: "New Warehouse",
          type: "warehouse",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*")

      try {
        const listingId = await createTestListing(
          "Test Listing",
          "Description",
          "unified",
          1000,
          [{ quantity: 10, quality_tier: 5 }],
        )

        // Get lot ID
        const listingItem = await db("listing_items")
          .join("listings", "listing_items.listing_id", "listings.listing_id")
          .where({ "listings.listing_id": listingId })
          .select("listing_items.*")
          .first()

        const lot = await db("listing_item_lots")
          .where({ item_id: listingItem.item_id })
          .first()

        // Update location
        await controller.updateListing(
          listingId,
          {
            lot_updates: [{ lot_id: lot.lot_id, location_id: location.location_id }],
          },
          createMockRequest() as ExpressRequest,
        )

        // Verify in database
        const updatedLot = await db("listing_item_lots")
          .where({ lot_id: lot.lot_id })
          .first()

        expect(updatedLot.location_id).toBe(location.location_id)
      } finally {
        // Clean up test location
        await db("locations").where("location_id", location.location_id).delete()
      }
    })

    it("should update multiple lot properties at once", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      // Get lot ID
      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      const lot = await db("listing_item_lots")
        .where({ item_id: listingItem.item_id })
        .first()

      // Update multiple properties
      await controller.updateListing(
        listingId,
        {
          lot_updates: [
            {
              lot_id: lot.lot_id,
              quantity_total: 25,
              listed: false,
            },
          ],
        },
        createMockRequest() as ExpressRequest,
      )

      // Verify in database
      const updatedLot = await db("listing_item_lots")
        .where({ lot_id: lot.lot_id })
        .first()

      expect(updatedLot.quantity_total).toBe(25)
      expect(updatedLot.listed).toBe(false)
    })

    it("should reject negative quantity", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      const lot = await db("listing_item_lots")
        .where({ item_id: listingItem.item_id })
        .first()

      await expect(
        controller.updateListing(
          listingId,
          {
            lot_updates: [{ lot_id: lot.lot_id, quantity_total: -5 }],
          },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject lot not in listing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      await expect(
        controller.updateListing(
          listingId,
          {
            lot_updates: [
              {
                lot_id: "00000000-0000-0000-0000-000000000000",
                quantity_total: 20,
              },
            ],
          },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })
  })

  describe("Ownership and Status Validation", () => {
    it("should reject update from non-owner", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      // Create controller with different user
      const otherUserRequest: Partial<ExpressRequest> = {
        user: {
          user_id: "other-user-456",
          username: "otheruser",
          role: "user",
        } as any,
      }

      const otherController = new ListingsV2Controller(
        otherUserRequest as ExpressRequest,
      )

      await expect(
        otherController.updateListing(
          listingId,
          { title: "Hacked Title" },
          otherUserRequest as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject update for sold listing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      // Mark listing as sold
      await db("listings").where({ listing_id: listingId }).update({ status: "sold" })

      await expect(
        controller.updateListing(
          listingId,
          { title: "Updated Title" },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should reject update for cancelled listing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      // Mark listing as cancelled
      await db("listings")
        .where({ listing_id: listingId })
        .update({ status: "cancelled" })

      await expect(
        controller.updateListing(
          listingId,
          { title: "Updated Title" },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should allow update for active listing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const response = await controller.updateListing(
        listingId,
        { title: "Updated Title" },
        createMockRequest() as ExpressRequest,
      )

      expect(response.listing.title).toBe("Updated Title")
    })

    it("should return 404 for non-existent listing", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const nonExistentId = "00000000-0000-0000-0000-000000000000"

      await expect(
        controller.updateListing(
          nonExistentId,
          { title: "Updated Title" },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })

    it("should require authentication", async () => {
      const controller = new ListingsV2Controller({} as ExpressRequest)

      const listingId = await createTestListing(
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await expect(
        controller.updateListing(listingId, { title: "Updated Title" }, {} as ExpressRequest),
      ).rejects.toThrow()
    })
  })

  describe("Combined Updates", () => {
    it("should update multiple fields in single request", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Original Title",
        "Original Description",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      // Get lot ID
      const listingItem = await db("listing_items")
        .join("listings", "listing_items.listing_id", "listings.listing_id")
        .where({ "listings.listing_id": listingId })
        .select("listing_items.*")
        .first()

      const lot = await db("listing_item_lots")
        .where({ item_id: listingItem.item_id })
        .first()

      // Update everything at once
      const response = await controller.updateListing(
        listingId,
        {
          title: "New Title",
          description: "New Description",
          base_price: 1500,
          lot_updates: [{ lot_id: lot.lot_id, quantity_total: 20 }],
        },
        createMockRequest() as ExpressRequest,
      )

      expect(response.listing.title).toBe("New Title")
      expect(response.listing.description).toBe("New Description")
      expect(response.items[0].base_price).toBe(1500)
      expect(response.items[0].variants[0].quantity).toBe(20)
    })

    it("should handle empty update request", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Test Title",
        "Test Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      // Update with no changes
      const response = await controller.updateListing(
        listingId,
        {},
        createMockRequest() as ExpressRequest,
      )

      // Should return current listing unchanged
      expect(response.listing.title).toBe("Test Title")
      expect(response.listing.description).toBe("Test Description")
      expect(response.items[0].base_price).toBe(1000)
    })
  })

  describe("Transaction Atomicity", () => {
    it("should rollback all changes if validation fails", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const listingId = await createTestListing(
        "Original Title",
        "Original Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      // Try to update with invalid data (negative price)
      await expect(
        controller.updateListing(
          listingId,
          {
            title: "New Title",
            base_price: -100, // Invalid
          },
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()

      // Verify title was not updated (transaction rolled back)
      const listing = await db("listings").where({ listing_id: listingId }).first()
      expect(listing.title).toBe("Original Title")
    })
  })
})

describe("ListingsV2Controller.getMyListings", () => {
  const db = getKnex()
  const testUserId = "test-user-my-listings-123"
  const otherUserId = "other-user-456"
  const testGameItemId = "game-item-my-listings-1"
  let createdListingIds: string[] = []

  // Mock Express request
  const createMockRequest = (userId: string = testUserId): Partial<ExpressRequest> => ({
    user: {
      user_id: userId,
      username: "testuser",
      role: "user",
    } as any,
  })

  // Helper to create test listing
  const createTestListing = async (
    userId: string,
    title: string,
    description: string,
    pricingMode: "unified" | "per_variant",
    basePrice: number | undefined,
    lots: Array<{
      quantity: number
      quality_tier?: number
      price?: number
    }>,
    status: "active" | "sold" | "expired" | "cancelled" = "active",
  ): Promise<string> => {
    const controller = new ListingsV2Controller(createMockRequest(userId) as ExpressRequest)

    const request: CreateListingRequest = {
      title,
      description,
      game_item_id: testGameItemId,
      pricing_mode: pricingMode,
      base_price: basePrice,
      lots: lots.map((lot) => ({
        quantity: lot.quantity,
        variant_attributes: {
          quality_tier: lot.quality_tier,
        },
        price: lot.price,
      })),
    }

    const response = await controller.createListing(
      request,
      createMockRequest(userId) as ExpressRequest,
    )

    createdListingIds.push(response.listing_id)

    // Update status if not active
    if (status !== "active") {
      await db("listings")
        .where({ listing_id: response.listing_id })
        .update({ status })
    }

    return response.listing_id
  }

  afterEach(async () => {
    // Clean up created listings
    if (createdListingIds.length > 0) {
      await db("listing_item_lots")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("variant_pricing")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("listing_items").whereIn("listing_id", createdListingIds).delete()

      await db("listings").whereIn("listing_id", createdListingIds).delete()
    }

    createdListingIds = []
  })

  describe("Basic Retrieval", () => {
    it("should retrieve user's listings", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      // Create test listings for current user
      await createTestListing(
        testUserId,
        "My Listing 1",
        "Description 1",
        "unified",
        1000,
        [{ quantity: 10, quality_tier: 5 }],
      )

      await createTestListing(
        testUserId,
        "My Listing 2",
        "Description 2",
        "unified",
        1500,
        [{ quantity: 5, quality_tier: 3 }],
      )

      // Create listing for other user (should not be returned)
      await createTestListing(
        otherUserId,
        "Other User Listing",
        "Other Description",
        "unified",
        2000,
        [{ quantity: 20 }],
      )

      // Fetch my listings
      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      // Should only return current user's listings
      expect(response.listings.length).toBe(2)
      expect(response.total).toBe(2)
      expect(response.page).toBe(1)
      expect(response.page_size).toBe(20)

      // Verify listing data
      const listing1 = response.listings.find((l) => l.title === "My Listing 1")
      expect(listing1).toBeTruthy()
      expect(listing1!.status).toBe("active")
      expect(listing1!.variant_count).toBe(1)
      expect(listing1!.quantity_available).toBe(10)
      expect(listing1!.price_min).toBe(1000)
      expect(listing1!.price_max).toBe(1000)
      expect(listing1!.quality_tier_min).toBe(5)
      expect(listing1!.quality_tier_max).toBe(5)

      const listing2 = response.listings.find((l) => l.title === "My Listing 2")
      expect(listing2).toBeTruthy()
      expect(listing2!.quantity_available).toBe(5)
      expect(listing2!.price_min).toBe(1500)
    })

    it("should return empty array when user has no listings", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings).toEqual([])
      expect(response.total).toBe(0)
      expect(response.page).toBe(1)
      expect(response.page_size).toBe(20)
    })

    it("should include variant breakdown information", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      // Create listing with multiple variants
      await createTestListing(
        testUserId,
        "Multi-Variant Listing",
        "Multiple quality tiers",
        "per_variant",
        undefined,
        [
          { quantity: 10, quality_tier: 5, price: 2000 },
          { quantity: 5, quality_tier: 3, price: 1000 },
          { quantity: 8, quality_tier: 1, price: 500 },
        ],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings.length).toBe(1)

      const listing = response.listings[0]
      expect(listing.variant_count).toBe(3)
      expect(listing.quantity_available).toBe(23) // 10 + 5 + 8
      expect(listing.price_min).toBe(500)
      expect(listing.price_max).toBe(2000)
      expect(listing.quality_tier_min).toBe(1)
      expect(listing.quality_tier_max).toBe(5)
    })
  })

  describe("Status Filtering", () => {
    it("should filter by active status", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Active Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "active",
      )

      await createTestListing(
        testUserId,
        "Sold Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "sold",
      )

      const response = await controller.getMyListings(
        "active",
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings.length).toBe(1)
      expect(response.listings[0].title).toBe("Active Listing")
      expect(response.listings[0].status).toBe("active")
    })

    it("should filter by sold status", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Active Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "active",
      )

      await createTestListing(
        testUserId,
        "Sold Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "sold",
      )

      const response = await controller.getMyListings(
        "sold",
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings.length).toBe(1)
      expect(response.listings[0].title).toBe("Sold Listing")
      expect(response.listings[0].status).toBe("sold")
    })

    it("should filter by expired status", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Expired Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "expired",
      )

      const response = await controller.getMyListings(
        "expired",
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings.length).toBe(1)
      expect(response.listings[0].status).toBe("expired")
    })

    it("should filter by cancelled status", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Cancelled Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "cancelled",
      )

      const response = await controller.getMyListings(
        "cancelled",
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings.length).toBe(1)
      expect(response.listings[0].status).toBe("cancelled")
    })

    it("should return all statuses when no filter provided", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Active Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "active",
      )

      await createTestListing(
        testUserId,
        "Sold Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "sold",
      )

      await createTestListing(
        testUserId,
        "Expired Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
        "expired",
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings.length).toBe(3)
      expect(response.total).toBe(3)
    })
  })

  describe("Pagination", () => {
    it("should paginate results", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      // Create 5 listings
      for (let i = 1; i <= 5; i++) {
        await createTestListing(
          testUserId,
          `Listing ${i}`,
          `Description ${i}`,
          "unified",
          1000 * i,
          [{ quantity: 10 }],
        )
      }

      // Get first page (2 items per page)
      const page1 = await controller.getMyListings(
        undefined,
        1,
        2,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(page1.listings.length).toBe(2)
      expect(page1.total).toBe(5)
      expect(page1.page).toBe(1)
      expect(page1.page_size).toBe(2)

      // Get second page
      const page2 = await controller.getMyListings(
        undefined,
        2,
        2,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(page2.listings.length).toBe(2)
      expect(page2.total).toBe(5)
      expect(page2.page).toBe(2)
      expect(page2.page_size).toBe(2)

      // Get third page (only 1 item)
      const page3 = await controller.getMyListings(
        undefined,
        3,
        2,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(page3.listings.length).toBe(1)
      expect(page3.total).toBe(5)
      expect(page3.page).toBe(3)
      expect(page3.page_size).toBe(2)
    })

    it("should use default page size of 20", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.page_size).toBe(20)
    })

    it("should enforce maximum page size of 100", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        1,
        200, // Request 200, should be capped at 100
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.page_size).toBe(100)
    })

    it("should handle page beyond available results", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        10, // Page 10 when only 1 listing exists
        20,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings.length).toBe(0)
      expect(response.total).toBe(1)
      expect(response.page).toBe(10)
    })
  })

  describe("Sorting", () => {
    it("should sort by created_at descending (default)", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      // Create listings with delays to ensure different timestamps
      const id1 = await createTestListing(
        testUserId,
        "First Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const id2 = await createTestListing(
        testUserId,
        "Second Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const id3 = await createTestListing(
        testUserId,
        "Third Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      // Should be in reverse chronological order (newest first)
      expect(response.listings[0].listing_id).toBe(id3)
      expect(response.listings[1].listing_id).toBe(id2)
      expect(response.listings[2].listing_id).toBe(id1)
    })

    it("should sort by created_at ascending", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const id1 = await createTestListing(
        testUserId,
        "First Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const id2 = await createTestListing(
        testUserId,
        "Second Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        "created_at",
        "asc",
        createMockRequest() as ExpressRequest,
      )

      // Should be in chronological order (oldest first)
      expect(response.listings[0].listing_id).toBe(id1)
      expect(response.listings[1].listing_id).toBe(id2)
    })

    it("should sort by price ascending", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Expensive Listing",
        "Description",
        "unified",
        3000,
        [{ quantity: 10 }],
      )

      await createTestListing(
        testUserId,
        "Cheap Listing",
        "Description",
        "unified",
        500,
        [{ quantity: 10 }],
      )

      await createTestListing(
        testUserId,
        "Medium Listing",
        "Description",
        "unified",
        1500,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        "price",
        "asc",
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings[0].title).toBe("Cheap Listing")
      expect(response.listings[0].price_min).toBe(500)
      expect(response.listings[1].title).toBe("Medium Listing")
      expect(response.listings[1].price_min).toBe(1500)
      expect(response.listings[2].title).toBe("Expensive Listing")
      expect(response.listings[2].price_min).toBe(3000)
    })

    it("should sort by price descending", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Expensive Listing",
        "Description",
        "unified",
        3000,
        [{ quantity: 10 }],
      )

      await createTestListing(
        testUserId,
        "Cheap Listing",
        "Description",
        "unified",
        500,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        "price",
        "desc",
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings[0].title).toBe("Expensive Listing")
      expect(response.listings[1].title).toBe("Cheap Listing")
    })

    it("should sort by quantity ascending", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Large Stock",
        "Description",
        "unified",
        1000,
        [{ quantity: 100 }],
      )

      await createTestListing(
        testUserId,
        "Small Stock",
        "Description",
        "unified",
        1000,
        [{ quantity: 5 }],
      )

      await createTestListing(
        testUserId,
        "Medium Stock",
        "Description",
        "unified",
        1000,
        [{ quantity: 50 }],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        "quantity",
        "asc",
        createMockRequest() as ExpressRequest,
      )

      expect(response.listings[0].title).toBe("Small Stock")
      expect(response.listings[0].quantity_available).toBe(5)
      expect(response.listings[1].title).toBe("Medium Stock")
      expect(response.listings[1].quantity_available).toBe(50)
      expect(response.listings[2].title).toBe("Large Stock")
      expect(response.listings[2].quantity_available).toBe(100)
    })

    it("should sort by updated_at descending", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      const id1 = await createTestListing(
        testUserId,
        "First Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const id2 = await createTestListing(
        testUserId,
        "Second Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      // Update first listing to make it most recently updated
      await new Promise((resolve) => setTimeout(resolve, 100))
      await db("listings")
        .where({ listing_id: id1 })
        .update({ updated_at: new Date() })

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        "updated_at",
        "desc",
        createMockRequest() as ExpressRequest,
      )

      // First listing should be first (most recently updated)
      expect(response.listings[0].listing_id).toBe(id1)
      expect(response.listings[1].listing_id).toBe(id2)
    })
  })

  describe("Authentication", () => {
    it("should require authentication", async () => {
      const controller = new ListingsV2Controller({} as ExpressRequest)

      await expect(
        controller.getMyListings(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          {} as ExpressRequest,
        ),
      ).rejects.toThrow()
    })
  })

  describe("Validation", () => {
    it("should reject invalid status", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await expect(
        controller.getMyListings(
          "invalid" as any,
          undefined,
          undefined,
          undefined,
          undefined,
          createMockRequest() as ExpressRequest,
        ),
      ).rejects.toThrow()
    })
  })

  describe("Timestamps", () => {
    it("should include ISO 8601 timestamps", async () => {
      const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

      await createTestListing(
        testUserId,
        "Test Listing",
        "Description",
        "unified",
        1000,
        [{ quantity: 10 }],
      )

      const response = await controller.getMyListings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockRequest() as ExpressRequest,
      )

      const listing = response.listings[0]
      expect(listing.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(listing.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })
})
