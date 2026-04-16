/**
 * Unit tests for ListingService
 *
 * Tests validate listing creation validation logic, search edge cases, and error handling.
 * Full integration tests with database transactions are in separate integration test files.
 *
 * Requirements: 9.1, 13.1, 13.2, 13.3, 13.4, 14.6, 28.1
 */

import { describe, it, expect, beforeEach } from "vitest"
import { ListingService } from "./listing.service.js"
import { ValidationError } from "../../api/routes/v1/util/errors.js"
import type { CreateListingRequest } from "../../api/routes/v2/types/market-v2-types.js"

describe("ListingService - Validation Tests", () => {
  let service: ListingService

  beforeEach(() => {
    service = new ListingService()
  })

  describe("createListing - Validation", () => {
    /**
     * Test validation errors
     * Validates: Requirements 28.1
     */
    it("should throw validation error when title is missing", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
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
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when title is too long", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "a".repeat(501), // 501 characters
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
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
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when description is missing", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "",
        game_item_id: "00000000-0000-0000-0000-000000000002",
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
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when game_item_id is missing", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "",
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
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when pricing_mode is invalid", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: any = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
        pricing_mode: "invalid_mode",
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
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when lots array is empty", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
        pricing_mode: "unified",
        base_price: 50000,
        lots: [],
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when base_price missing in unified mode", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
        pricing_mode: "unified",
        // Missing base_price!
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

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when quantity is zero", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
        pricing_mode: "unified",
        base_price: 50000,
        lots: [
          {
            quantity: 0,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
          },
        ],
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when quantity is negative", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
        pricing_mode: "unified",
        base_price: 50000,
        lots: [
          {
            quantity: -5,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
          },
        ],
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when variant_attributes is missing", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: any = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
        pricing_mode: "unified",
        base_price: 50000,
        lots: [
          {
            quantity: 10,
            // Missing variant_attributes!
          },
        ],
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })

    it("should throw validation error when price missing in per_variant mode", async () => {
      const userId = "00000000-0000-0000-0000-000000000001"
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000002",
        pricing_mode: "per_variant",
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
            // Missing price!
          },
        ],
      }

      await expect(service.createListing(userId, request)).rejects.toThrow(
        ValidationError,
      )
    })
  })
})

describe("ListingService - Unit Tests for Listing Creation", () => {
  let service: ListingService

  beforeEach(() => {
    service = new ListingService()
  })

  describe("Validation - Successful Cases", () => {
    /**
     * Test validation passes for unified pricing
     * Validates: Requirements 13.2, 13.3
     */
    it("should pass validation for valid unified pricing request", () => {
      const request: CreateListingRequest = {
        title: "Kastak Arms SMG - Tier 3",
        description: "High quality SMG with excellent craftsmanship",
        game_item_id: "00000000-0000-0000-0000-000000000001",
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
      }

      // Should not throw
      expect(() =>
        service["validateCreateListingRequest"](request),
      ).not.toThrow()
    })

    /**
     * Test validation passes for per_variant pricing
     * Validates: Requirements 13.2, 13.3, 7.4
     */
    it("should pass validation for valid per_variant pricing request", () => {
      const request: CreateListingRequest = {
        title: "Kastak Arms SMG - Multiple Tiers",
        description: "Various quality tiers available",
        game_item_id: "00000000-0000-0000-0000-000000000001",
        pricing_mode: "per_variant",
        lots: [
          {
            quantity: 5,
            variant_attributes: {
              quality_tier: 5,
              quality_value: 95,
              crafted_source: "crafted",
            },
            price: 75000,
          },
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
            price: 50000,
          },
        ],
      }

      // Should not throw
      expect(() =>
        service["validateCreateListingRequest"](request),
      ).not.toThrow()
    })

    /**
     * Test validation passes for multiple variants
     * Validates: Requirements 13.4
     */
    it("should pass validation for request with multiple variants", () => {
      const request: CreateListingRequest = {
        title: "Kastak Arms SMG - Bulk Sale",
        description: "Multiple quality tiers in stock",
        game_item_id: "00000000-0000-0000-0000-000000000001",
        pricing_mode: "unified",
        base_price: 40000,
        lots: [
          {
            quantity: 5,
            variant_attributes: {
              quality_tier: 5,
              quality_value: 95,
              crafted_source: "crafted",
            },
          },
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 4,
              quality_value: 85,
              crafted_source: "crafted",
            },
          },
          {
            quantity: 15,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "store",
            },
          },
        ],
      }

      // Should not throw
      expect(() =>
        service["validateCreateListingRequest"](request),
      ).not.toThrow()
    })
  })

  describe("Validation - Error Cases", () => {
    /**
     * Test validation fails when price missing in per_variant mode for each lot
     * Validates: Requirements 28.1
     */
    it("should throw validation error when price missing in per_variant mode for a lot", () => {
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000001",
        pricing_mode: "per_variant",
        lots: [
          {
            quantity: 10,
            variant_attributes: {
              quality_tier: 3,
              quality_value: 75,
              crafted_source: "crafted",
            },
            // Missing price!
          },
        ],
      }

      try {
        service["validateCreateListingRequest"](request)
        expect.fail("Should have thrown ValidationError")
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        const validationError = error as ValidationError
        expect(validationError.validationErrors).toBeDefined()
        expect(validationError.validationErrors.length).toBeGreaterThan(0)
        expect(
          validationError.validationErrors.some((e) =>
            e.message.includes("Price is required for per_variant pricing mode"),
          ),
        ).toBe(true)
      }
    })

    /**
     * Test validation handles multiple lots correctly
     * Validates: Requirements 13.4
     */
    it("should validate all lots in the request", () => {
      const request: CreateListingRequest = {
        title: "Test Listing",
        description: "Test description",
        game_item_id: "00000000-0000-0000-0000-000000000001",
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
          {
            quantity: 0, // Invalid quantity
            variant_attributes: {
              quality_tier: 4,
              quality_value: 85,
              crafted_source: "crafted",
            },
          },
        ],
      }

      try {
        service["validateCreateListingRequest"](request)
        expect.fail("Should have thrown ValidationError")
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        const validationError = error as ValidationError
        expect(validationError.validationErrors).toBeDefined()
        expect(validationError.validationErrors.length).toBeGreaterThan(0)
        expect(
          validationError.validationErrors.some((e) =>
            e.message.includes("Quantity must be greater than 0"),
          ),
        ).toBe(true)
      }
    })
  })
})

describe.skip("ListingService - Search Edge Cases (Integration)", () => {
  let service: ListingService

  beforeEach(() => {
    service = new ListingService()
  })

  describe("searchListings - Edge Cases", () => {
    /**
     * Test empty results when no matches
     * Validates: Requirements 9.1, 14.6
     */
    it("should return empty results when no listings match filters", async () => {
      const results = await service.searchListings({
        quality_tier_min: 10, // Impossible quality tier
        page: 1,
        page_size: 20,
      })

      expect(results.listings).toEqual([])
      expect(results.total).toBe(0)
      expect(results.page).toBe(1)
      expect(results.page_size).toBe(20)
    })

    /**
     * Test pagination with various page sizes
     * Validates: Requirements 14.6
     */
    it("should handle pagination with page_size of 1", async () => {
      const results = await service.searchListings({
        page: 1,
        page_size: 1,
      })

      expect(results.page_size).toBe(1)
      expect(results.listings.length).toBeLessThanOrEqual(1)
    })

    it("should handle pagination with large page_size", async () => {
      const results = await service.searchListings({
        page: 1,
        page_size: 100,
      })

      expect(results.page_size).toBe(100)
      expect(results.listings.length).toBeLessThanOrEqual(100)
    })

    it("should cap page_size at 100", async () => {
      const results = await service.searchListings({
        page: 1,
        page_size: 500, // Should be capped at 100
      })

      expect(results.page_size).toBe(100)
      expect(results.listings.length).toBeLessThanOrEqual(100)
    })

    it("should handle page number less than 1", async () => {
      const results = await service.searchListings({
        page: 0, // Should be normalized to 1
        page_size: 20,
      })

      expect(results.page).toBe(1)
    })

    it("should handle negative page number", async () => {
      const results = await service.searchListings({
        page: -5, // Should be normalized to 1
        page_size: 20,
      })

      expect(results.page).toBe(1)
    })

    it("should handle page_size less than 1", async () => {
      const results = await service.searchListings({
        page: 1,
        page_size: 0, // Should be normalized to 1
      })

      expect(results.page_size).toBe(1)
    })

    it("should handle requesting page beyond available results", async () => {
      const results = await service.searchListings({
        page: 9999, // Very high page number
        page_size: 20,
      })

      expect(results.listings).toEqual([])
      expect(results.page).toBe(9999)
    })

    /**
     * Test full-text search with special characters
     * Validates: Requirements 9.1
     */
    it("should handle full-text search with special characters", async () => {
      const results = await service.searchListings({
        text: "test & special | characters",
        page: 1,
        page_size: 20,
      })

      // Should not throw error
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
      expect(Array.isArray(results.listings)).toBe(true)
    })

    it("should handle full-text search with quotes", async () => {
      const results = await service.searchListings({
        text: '"exact phrase search"',
        page: 1,
        page_size: 20,
      })

      // Should not throw error
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
    })

    it("should handle full-text search with parentheses", async () => {
      const results = await service.searchListings({
        text: "(test) search",
        page: 1,
        page_size: 20,
      })

      // Should not throw error
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
    })

    it("should handle full-text search with asterisks", async () => {
      const results = await service.searchListings({
        text: "test*",
        page: 1,
        page_size: 20,
      })

      // Should not throw error
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
    })

    it("should handle empty text search", async () => {
      const results = await service.searchListings({
        text: "",
        page: 1,
        page_size: 20,
      })

      // Should return all listings (no text filter applied)
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
    })

    it("should handle whitespace-only text search", async () => {
      const results = await service.searchListings({
        text: "   ",
        page: 1,
        page_size: 20,
      })

      // Should return all listings (no text filter applied)
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
    })

    it("should handle multiple spaces in text search", async () => {
      const results = await service.searchListings({
        text: "test    multiple    spaces",
        page: 1,
        page_size: 20,
      })

      // Should not throw error
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
    })

    /**
     * Test filter combinations
     * Validates: Requirements 9.1, 14.6
     */
    it("should handle all filters combined", async () => {
      const results = await service.searchListings({
        text: "weapon",
        game_item_id: "00000000-0000-0000-0000-000000000001",
        quality_tier_min: 2,
        quality_tier_max: 4,
        price_min: 10000,
        price_max: 100000,
        page: 1,
        page_size: 20,
      })

      // Should not throw error
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
      expect(results.total).toBeGreaterThanOrEqual(0)
    })

    it("should handle no filters (return all listings)", async () => {
      const results = await service.searchListings({
        page: 1,
        page_size: 20,
      })

      // Should return all active listings
      expect(results).toBeDefined()
      expect(results.listings).toBeDefined()
      expect(results.total).toBeGreaterThanOrEqual(0)
    })

    it("should handle quality tier range where min > max", async () => {
      const results = await service.searchListings({
        quality_tier_min: 5,
        quality_tier_max: 1, // min > max
        page: 1,
        page_size: 20,
      })

      // Should return empty results (no listings can satisfy this)
      expect(results.listings).toEqual([])
      expect(results.total).toBe(0)
    })

    it("should handle price range where min > max", async () => {
      const results = await service.searchListings({
        price_min: 100000,
        price_max: 10000, // min > max
        page: 1,
        page_size: 20,
      })

      // Should return empty results (no listings can satisfy this)
      expect(results.listings).toEqual([])
      expect(results.total).toBe(0)
    })

    it("should handle invalid UUID for game_item_id", async () => {
      const results = await service.searchListings({
        game_item_id: "00000000-0000-0000-0000-000000000000", // Non-existent
        page: 1,
        page_size: 20,
      })

      // Should return empty results
      expect(results.listings).toEqual([])
      expect(results.total).toBe(0)
    })

    /**
     * Test response structure
     * Validates: Requirements 14.6
     */
    it("should return correct response structure", async () => {
      const results = await service.searchListings({
        page: 1,
        page_size: 20,
      })

      // Verify response structure
      expect(results).toHaveProperty("listings")
      expect(results).toHaveProperty("total")
      expect(results).toHaveProperty("page")
      expect(results).toHaveProperty("page_size")

      expect(Array.isArray(results.listings)).toBe(true)
      expect(typeof results.total).toBe("number")
      expect(typeof results.page).toBe("number")
      expect(typeof results.page_size).toBe("number")
    })

    it("should return listings with correct fields", async () => {
      const results = await service.searchListings({
        page: 1,
        page_size: 1,
      })

      if (results.listings.length > 0) {
        const listing = results.listings[0]

        // Verify listing structure
        expect(listing).toHaveProperty("listing_id")
        expect(listing).toHaveProperty("title")
        expect(listing).toHaveProperty("seller_name")
        expect(listing).toHaveProperty("seller_rating")
        expect(listing).toHaveProperty("price_min")
        expect(listing).toHaveProperty("price_max")
        expect(listing).toHaveProperty("quantity_available")
        expect(listing).toHaveProperty("quality_tier_min")
        expect(listing).toHaveProperty("quality_tier_max")
        expect(listing).toHaveProperty("variant_count")
        expect(listing).toHaveProperty("created_at")

        // Verify field types
        expect(typeof listing.listing_id).toBe("string")
        expect(typeof listing.title).toBe("string")
        expect(typeof listing.seller_name).toBe("string")
        expect(typeof listing.seller_rating).toBe("number")
        expect(typeof listing.price_min).toBe("number")
        expect(typeof listing.price_max).toBe("number")
        expect(typeof listing.quantity_available).toBe("number")
        expect(typeof listing.quality_tier_min).toBe("number")
        expect(typeof listing.quality_tier_max).toBe("number")
        expect(typeof listing.variant_count).toBe("number")
      }
    })
  })
})

describe.skip("ListingService - Listing Detail Tests (Integration)", () => {
  let service: ListingService

  beforeEach(() => {
    service = new ListingService()
  })

  describe("getListingDetail - Successful Retrieval", () => {
    /**
     * Test successful retrieval with unified pricing
     * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 7.2, 25.1
     */
    it("should retrieve listing detail with unified pricing", async () => {
      // This test requires a real database with test data
      // Create a test listing first, then retrieve it
      const testListingId = "00000000-0000-0000-0000-000000000001"

      const detail = await service.getListingDetail(testListingId)

      // Verify listing metadata
      expect(detail.listing).toBeDefined()
      expect(detail.listing.listing_id).toBe(testListingId)
      expect(detail.listing.title).toBeDefined()
      expect(detail.listing.description).toBeDefined()
      expect(detail.listing.status).toBeDefined()

      // Verify seller information
      expect(detail.seller).toBeDefined()
      expect(detail.seller.id).toBeDefined()
      expect(detail.seller.name).toBeDefined()
      expect(detail.seller.type).toMatch(/^(user|contractor)$/)
      expect(typeof detail.seller.rating).toBe("number")

      // Verify items array
      expect(detail.items).toBeDefined()
      expect(Array.isArray(detail.items)).toBe(true)
      expect(detail.items.length).toBeGreaterThan(0)

      // Verify first item structure
      const item = detail.items[0]
      expect(item.item_id).toBeDefined()
      expect(item.game_item).toBeDefined()
      expect(item.game_item.game_item_id).toBeDefined()
      expect(item.game_item.name).toBeDefined()
      expect(item.game_item.type).toBeDefined()
      expect(item.pricing_mode).toBe("unified")
      expect(item.base_price).toBeDefined()
      expect(typeof item.base_price).toBe("number")

      // Verify variants array
      expect(item.variants).toBeDefined()
      expect(Array.isArray(item.variants)).toBe(true)
      expect(item.variants.length).toBeGreaterThan(0)

      // Verify variant structure
      const variant = item.variants[0]
      expect(variant.variant_id).toBeDefined()
      expect(variant.attributes).toBeDefined()
      expect(typeof variant.attributes).toBe("object")
      expect(variant.display_name).toBeDefined()
      expect(variant.short_name).toBeDefined()
      expect(typeof variant.quantity).toBe("number")
      expect(typeof variant.price).toBe("number")

      // For unified pricing, all variants should have same price as base_price
      for (const v of item.variants) {
        expect(v.price).toBe(item.base_price)
      }
    })

    /**
     * Test successful retrieval with per_variant pricing
     * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 7.3, 25.2
     */
    it("should retrieve listing detail with per_variant pricing", async () => {
      // This test requires a real database with test data
      // Create a test listing with per_variant pricing first
      const testListingId = "00000000-0000-0000-0000-000000000002"

      const detail = await service.getListingDetail(testListingId)

      // Verify listing metadata
      expect(detail.listing).toBeDefined()
      expect(detail.listing.listing_id).toBe(testListingId)

      // Verify items array
      expect(detail.items).toBeDefined()
      expect(detail.items.length).toBeGreaterThan(0)

      // Verify first item has per_variant pricing
      const item = detail.items[0]
      expect(item.pricing_mode).toBe("per_variant")

      // Verify variants have different prices
      expect(item.variants).toBeDefined()
      expect(item.variants.length).toBeGreaterThan(1)

      // Collect all prices
      const prices = item.variants.map((v) => v.price)
      const uniquePrices = new Set(prices)

      // For per_variant pricing, we expect different prices
      // (though not guaranteed, it's the typical use case)
      expect(uniquePrices.size).toBeGreaterThan(0)
    })

    /**
     * Test variant breakdown includes all required fields
     * Validates: Requirements 15.4, 15.5, 15.6
     */
    it("should include complete variant breakdown with all fields", async () => {
      const testListingId = "00000000-0000-0000-0000-000000000001"

      const detail = await service.getListingDetail(testListingId)

      expect(detail.items.length).toBeGreaterThan(0)

      for (const item of detail.items) {
        expect(item.variants.length).toBeGreaterThan(0)

        for (const variant of item.variants) {
          // Required fields
          expect(variant.variant_id).toBeDefined()
          expect(typeof variant.variant_id).toBe("string")

          expect(variant.attributes).toBeDefined()
          expect(typeof variant.attributes).toBe("object")

          expect(variant.display_name).toBeDefined()
          expect(typeof variant.display_name).toBe("string")

          expect(variant.short_name).toBeDefined()
          expect(typeof variant.short_name).toBe("string")

          expect(variant.quantity).toBeDefined()
          expect(typeof variant.quantity).toBe("number")
          expect(variant.quantity).toBeGreaterThan(0)

          expect(variant.price).toBeDefined()
          expect(typeof variant.price).toBe("number")
          expect(variant.price).toBeGreaterThan(0)

          // Optional fields
          if (variant.locations) {
            expect(Array.isArray(variant.locations)).toBe(true)
          }
        }
      }
    })

    /**
     * Test variant attributes include quality information
     * Validates: Requirements 6.5
     */
    it("should include quality tier information in variant attributes", async () => {
      const testListingId = "00000000-0000-0000-0000-000000000001"

      const detail = await service.getListingDetail(testListingId)

      expect(detail.items.length).toBeGreaterThan(0)

      for (const item of detail.items) {
        for (const variant of item.variants) {
          // Check if quality attributes are present
          if (variant.attributes.quality_tier) {
            expect(typeof variant.attributes.quality_tier).toBe("number")
            expect(variant.attributes.quality_tier).toBeGreaterThanOrEqual(1)
            expect(variant.attributes.quality_tier).toBeLessThanOrEqual(5)
          }

          if (variant.attributes.quality_value) {
            expect(typeof variant.attributes.quality_value).toBe("number")
            expect(variant.attributes.quality_value).toBeGreaterThanOrEqual(0)
            expect(variant.attributes.quality_value).toBeLessThanOrEqual(100)
          }

          if (variant.attributes.crafted_source) {
            expect(typeof variant.attributes.crafted_source).toBe("string")
            expect(["crafted", "store", "looted", "unknown"]).toContain(
              variant.attributes.crafted_source,
            )
          }
        }
      }
    })

    /**
     * Test seller information is complete
     * Validates: Requirements 15.2
     */
    it("should include complete seller information", async () => {
      const testListingId = "00000000-0000-0000-0000-000000000001"

      const detail = await service.getListingDetail(testListingId)

      // Verify seller structure
      expect(detail.seller).toBeDefined()
      expect(detail.seller.id).toBeDefined()
      expect(typeof detail.seller.id).toBe("string")

      expect(detail.seller.name).toBeDefined()
      expect(typeof detail.seller.name).toBe("string")
      expect(detail.seller.name.length).toBeGreaterThan(0)

      expect(detail.seller.type).toBeDefined()
      expect(["user", "contractor"]).toContain(detail.seller.type)

      expect(detail.seller.rating).toBeDefined()
      expect(typeof detail.seller.rating).toBe("number")
      expect(detail.seller.rating).toBeGreaterThanOrEqual(0)
    })

    /**
     * Test game item information is complete
     * Validates: Requirements 15.3
     */
    it("should include complete game item information", async () => {
      const testListingId = "00000000-0000-0000-0000-000000000001"

      const detail = await service.getListingDetail(testListingId)

      expect(detail.items.length).toBeGreaterThan(0)

      for (const item of detail.items) {
        expect(item.game_item).toBeDefined()

        expect(item.game_item.game_item_id).toBeDefined()
        expect(typeof item.game_item.game_item_id).toBe("string")

        expect(item.game_item.name).toBeDefined()
        expect(typeof item.game_item.name).toBe("string")
        expect(item.game_item.name.length).toBeGreaterThan(0)

        expect(item.game_item.type).toBeDefined()
        expect(typeof item.game_item.type).toBe("string")

        // icon_url is optional
        if (item.game_item.icon_url) {
          expect(typeof item.game_item.icon_url).toBe("string")
        }
      }
    })
  })

  describe("getListingDetail - Error Handling", () => {
    /**
     * Test 404 error for non-existent listing
     * Validates: Requirements 28.2
     */
    it("should throw NotFoundError for non-existent listing", async () => {
      const nonExistentId = "00000000-0000-0000-0000-999999999999"

      await expect(service.getListingDetail(nonExistentId)).rejects.toThrow(
        "not found",
      )
    })

    it("should include listing_id in NotFoundError details", async () => {
      const nonExistentId = "00000000-0000-0000-0000-999999999999"

      try {
        await service.getListingDetail(nonExistentId)
        expect.fail("Should have thrown NotFoundError")
      } catch (error: any) {
        expect(error.message).toContain(nonExistentId)
        expect(error.message).toContain("not found")
      }
    })

    it("should handle invalid UUID format gracefully", async () => {
      const invalidId = "not-a-valid-uuid"

      await expect(service.getListingDetail(invalidId)).rejects.toThrow()
    })

    it("should handle empty string listing_id", async () => {
      const emptyId = ""

      await expect(service.getListingDetail(emptyId)).rejects.toThrow()
    })
  })

  describe("getListingDetail - Response Structure", () => {
    /**
     * Test response structure matches ListingDetailResponse type
     * Validates: Requirements 15.1
     */
    it("should return response matching ListingDetailResponse structure", async () => {
      const testListingId = "00000000-0000-0000-0000-000000000001"

      const detail = await service.getListingDetail(testListingId)

      // Top-level structure
      expect(detail).toHaveProperty("listing")
      expect(detail).toHaveProperty("seller")
      expect(detail).toHaveProperty("items")

      // Listing structure
      expect(detail.listing).toHaveProperty("listing_id")
      expect(detail.listing).toHaveProperty("seller_id")
      expect(detail.listing).toHaveProperty("seller_type")
      expect(detail.listing).toHaveProperty("title")
      expect(detail.listing).toHaveProperty("description")
      expect(detail.listing).toHaveProperty("status")
      expect(detail.listing).toHaveProperty("visibility")
      expect(detail.listing).toHaveProperty("sale_type")
      expect(detail.listing).toHaveProperty("listing_type")
      expect(detail.listing).toHaveProperty("created_at")
      expect(detail.listing).toHaveProperty("updated_at")

      // Seller structure
      expect(detail.seller).toHaveProperty("id")
      expect(detail.seller).toHaveProperty("name")
      expect(detail.seller).toHaveProperty("type")
      expect(detail.seller).toHaveProperty("rating")

      // Items array structure
      expect(Array.isArray(detail.items)).toBe(true)
      if (detail.items.length > 0) {
        const item = detail.items[0]
        expect(item).toHaveProperty("item_id")
        expect(item).toHaveProperty("game_item")
        expect(item).toHaveProperty("pricing_mode")
        expect(item).toHaveProperty("variants")

        // Game item structure
        expect(item.game_item).toHaveProperty("game_item_id")
        expect(item.game_item).toHaveProperty("name")
        expect(item.game_item).toHaveProperty("type")

        // Variants array structure
        expect(Array.isArray(item.variants)).toBe(true)
        if (item.variants.length > 0) {
          const variant = item.variants[0]
          expect(variant).toHaveProperty("variant_id")
          expect(variant).toHaveProperty("attributes")
          expect(variant).toHaveProperty("display_name")
          expect(variant).toHaveProperty("short_name")
          expect(variant).toHaveProperty("quantity")
          expect(variant).toHaveProperty("price")
        }
      }
    })
  })
})
