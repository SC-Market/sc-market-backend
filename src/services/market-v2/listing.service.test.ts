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
