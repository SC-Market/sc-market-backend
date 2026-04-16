/**
 * Unit tests for VariantTypeService
 *
 * Tests variant type retrieval functionality including:
 * - Retrieval of all variant types
 * - Retrieval of single variant type
 * - 404 error handling for non-existent variant type
 *
 * Requirements: 16.1, 16.2, 16.3
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { VariantTypeService } from "./variant-type.service.js"
import { MarketV2Repository } from "./repository.js"
import { NotFoundError } from "../../api/routes/v1/util/errors.js"

// Mock the repository
vi.mock("./repository.js")
vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(() => vi.fn() as any),
}))

describe("VariantTypeService - Unit Tests", () => {
  let service: VariantTypeService
  let mockRepository: MarketV2Repository

  beforeEach(() => {
    vi.clearAllMocks()
    service = new VariantTypeService()
    mockRepository = service["repository"]
  })

  describe("getAllVariantTypes", () => {
    /**
     * Test retrieval of all variant types
     * Requirements: 16.1, 16.2, 16.3
     */
    it("should return all variant types ordered by display_order", async () => {
      const mockVariantTypes = [
        {
          variant_type_id: "vt1",
          name: "quality_tier",
          display_name: "Quality Tier",
          description: "Item quality tier from 1 to 5",
          affects_pricing: true,
          searchable: true,
          filterable: true,
          value_type: "integer",
          min_value: 1,
          max_value: 5,
          allowed_values: ["1", "2", "3", "4", "5"],
          display_order: 1,
          icon: "star",
          created_at: new Date("2024-01-01"),
        },
        {
          variant_type_id: "vt2",
          name: "quality_value",
          display_name: "Quality Value",
          description: "Precise quality value from 0 to 100",
          affects_pricing: true,
          searchable: true,
          filterable: true,
          value_type: "decimal",
          min_value: 0,
          max_value: 100,
          allowed_values: undefined,
          display_order: 2,
          icon: "percent",
          created_at: new Date("2024-01-01"),
        },
        {
          variant_type_id: "vt3",
          name: "crafted_source",
          display_name: "Source",
          description: "How the item was obtained",
          affects_pricing: true,
          searchable: true,
          filterable: true,
          value_type: "enum",
          min_value: undefined,
          max_value: undefined,
          allowed_values: ["crafted", "store", "looted", "unknown"],
          display_order: 3,
          icon: "hammer",
          created_at: new Date("2024-01-01"),
        },
        {
          variant_type_id: "vt4",
          name: "blueprint_tier",
          display_name: "Blueprint Tier",
          description: "Blueprint quality tier",
          affects_pricing: true,
          searchable: true,
          filterable: true,
          value_type: "integer",
          min_value: 1,
          max_value: 5,
          allowed_values: ["1", "2", "3", "4", "5"],
          display_order: 4,
          icon: "blueprint",
          created_at: new Date("2024-01-01"),
        },
      ]

      vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
        mockVariantTypes as any,
      )

      const result = await service.getAllVariantTypes()

      expect(result).toEqual(mockVariantTypes)
      expect(result).toHaveLength(4)

      // Verify ordered by display_order
      expect(result[0].display_order).toBe(1)
      expect(result[1].display_order).toBe(2)
      expect(result[2].display_order).toBe(3)
      expect(result[3].display_order).toBe(4)

      // Verify repository method was called
      expect(mockRepository.getAllVariantTypes).toHaveBeenCalledTimes(1)
    })

    it("should return empty array when no variant types exist", async () => {
      vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue([])

      const result = await service.getAllVariantTypes()

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })

    it("should include validation rules in response", async () => {
      const mockVariantType = {
        variant_type_id: "vt1",
        name: "quality_tier",
        display_name: "Quality Tier",
        description: "Item quality tier",
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "integer",
        min_value: 1,
        max_value: 5,
        allowed_values: ["1", "2", "3", "4", "5"],
        display_order: 1,
        icon: "star",
        created_at: new Date("2024-01-01"),
      }

      vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue([
        mockVariantType as any,
      ])

      const result = await service.getAllVariantTypes()

      expect(result[0].min_value).toBe(1)
      expect(result[0].max_value).toBe(5)
      expect(result[0].allowed_values).toEqual(["1", "2", "3", "4", "5"])
      expect(result[0].value_type).toBe("integer")
    })

    it("should handle database errors gracefully", async () => {
      const dbError = new Error("Database connection failed")
      vi.spyOn(mockRepository, "getAllVariantTypes").mockRejectedValue(dbError)

      await expect(service.getAllVariantTypes()).rejects.toThrow(
        "Database connection failed",
      )
    })
  })

  describe("getVariantTypeById", () => {
    /**
     * Test retrieval of single variant type
     * Requirements: 16.1
     */
    it("should return variant type details for valid ID", async () => {
      const variantTypeId = "vt-123"
      const mockVariantType = {
        variant_type_id: variantTypeId,
        name: "quality_tier",
        display_name: "Quality Tier",
        description: "Item quality tier from 1 to 5",
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "integer",
        min_value: 1,
        max_value: 5,
        allowed_values: ["1", "2", "3", "4", "5"],
        display_order: 1,
        icon: "star",
        created_at: new Date("2024-01-01"),
      }

      // Mock knex query chain
      const mockFirst = vi.fn().mockResolvedValue(mockVariantType)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      const result = await service.getVariantTypeById(variantTypeId)

      expect(result).toEqual(mockVariantType)
      expect(result.variant_type_id).toBe(variantTypeId)
    })

    /**
     * Test 404 error for non-existent variant type
     * Requirements: 16.1
     */
    it("should throw NotFoundError for non-existent variant type", async () => {
      const variantTypeId = "non-existent-id"

      // Mock knex query chain returning null
      const mockFirst = vi.fn().mockResolvedValue(null)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      await expect(service.getVariantTypeById(variantTypeId)).rejects.toThrow(
        NotFoundError,
      )

      try {
        await service.getVariantTypeById(variantTypeId)
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError)
        if (error instanceof NotFoundError) {
          expect(error.message).toContain("VariantType")
          expect(error.message).toContain(variantTypeId)
        }
      }
    })

    it("should include all validation rules in response", async () => {
      const variantTypeId = "vt-enum"
      const mockVariantType = {
        variant_type_id: variantTypeId,
        name: "crafted_source",
        display_name: "Source",
        description: "How the item was obtained",
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "enum",
        min_value: undefined,
        max_value: undefined,
        allowed_values: ["crafted", "store", "looted", "unknown"],
        display_order: 3,
        icon: "hammer",
        created_at: new Date("2024-01-01"),
      }

      // Mock knex query chain
      const mockFirst = vi.fn().mockResolvedValue(mockVariantType)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      const result = await service.getVariantTypeById(variantTypeId)

      expect(result.value_type).toBe("enum")
      expect(result.allowed_values).toEqual([
        "crafted",
        "store",
        "looted",
        "unknown",
      ])
      expect(result.min_value).toBeUndefined()
      expect(result.max_value).toBeUndefined()
    })

    it("should handle database errors gracefully", async () => {
      const variantTypeId = "vt-error"
      const dbError = new Error("Database query failed")

      // Mock knex query chain throwing error
      const mockFirst = vi.fn().mockRejectedValue(dbError)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      await expect(service.getVariantTypeById(variantTypeId)).rejects.toThrow(
        "Database query failed",
      )
    })

    it("should preserve NotFoundError when thrown", async () => {
      const variantTypeId = "vt-missing"

      // Mock knex query chain returning null
      const mockFirst = vi.fn().mockResolvedValue(null)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      let caughtError: Error | null = null
      try {
        await service.getVariantTypeById(variantTypeId)
      } catch (error) {
        caughtError = error as Error
      }

      expect(caughtError).toBeInstanceOf(NotFoundError)
      expect(caughtError?.message).toContain("VariantType")
    })
  })

  describe("Variant Type Validation Rules", () => {
    it("should return integer type with min/max values", async () => {
      const mockVariantType = {
        variant_type_id: "vt-int",
        name: "quality_tier",
        display_name: "Quality Tier",
        description: null,
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "integer",
        min_value: 1,
        max_value: 5,
        allowed_values: ["1", "2", "3", "4", "5"],
        display_order: 1,
        icon: null,
        created_at: new Date(),
      }

      // Mock knex query chain
      const mockFirst = vi.fn().mockResolvedValue(mockVariantType)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      const result = await service.getVariantTypeById("vt-int")

      expect(result.value_type).toBe("integer")
      expect(result.min_value).toBe(1)
      expect(result.max_value).toBe(5)
    })

    it("should return decimal type with min/max values", async () => {
      const mockVariantType = {
        variant_type_id: "vt-decimal",
        name: "quality_value",
        display_name: "Quality Value",
        description: null,
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "decimal",
        min_value: 0,
        max_value: 100,
        allowed_values: null,
        display_order: 2,
        icon: null,
        created_at: new Date(),
      }

      // Mock knex query chain
      const mockFirst = vi.fn().mockResolvedValue(mockVariantType)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      const result = await service.getVariantTypeById("vt-decimal")

      expect(result.value_type).toBe("decimal")
      expect(result.min_value).toBe(0)
      expect(result.max_value).toBe(100)
    })

    it("should return enum type with allowed values", async () => {
      const mockVariantType = {
        variant_type_id: "vt-enum",
        name: "crafted_source",
        display_name: "Source",
        description: null,
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "enum",
        min_value: undefined,
        max_value: undefined,
        allowed_values: ["crafted", "store", "looted", "unknown"],
        display_order: 3,
        icon: null,
        created_at: new Date(),
      }

      // Mock knex query chain
      const mockFirst = vi.fn().mockResolvedValue(mockVariantType)
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst })
      service["knex"] = vi.fn().mockReturnValue({ where: mockWhere }) as any

      const result = await service.getVariantTypeById("vt-enum")

      expect(result.value_type).toBe("enum")
      expect(result.allowed_values).toEqual([
        "crafted",
        "store",
        "looted",
        "unknown",
      ])
      expect(result.min_value).toBeUndefined()
      expect(result.max_value).toBeUndefined()
    })
  })
})
