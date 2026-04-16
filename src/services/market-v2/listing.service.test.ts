/**
 * Unit tests for ListingService
 *
 * Tests validate listing creation validation logic and error handling.
 * Full integration tests with database transactions are in separate integration test files.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 28.1
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
