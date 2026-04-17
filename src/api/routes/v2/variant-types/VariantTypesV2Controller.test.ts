/**
 * Unit tests for VariantTypesV2Controller
 *
 * Tests the variant types endpoint that returns all variant type definitions.
 * Requirements: 4.4, 4.5
 */

import { describe, it, expect, beforeEach } from "vitest"
import { VariantTypesV2Controller } from "./VariantTypesV2Controller.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { Request } from "express"

describe("VariantTypesV2Controller", () => {
  let controller: VariantTypesV2Controller
  let mockRequest: Partial<Request>
  let knex: ReturnType<typeof getKnex>

  beforeEach(() => {
    knex = getKnex()

    mockRequest = {
      user: {
        user_id: "test-user-id",
        username: "testuser",
        role: "user",
      },
    }
    controller = new VariantTypesV2Controller(mockRequest as Request)
  })

  describe("getVariantTypes", () => {
    it("should return all variant types ordered by display_order", async () => {
      // Execute test
      const result = await controller.getVariantTypes()

      // Assertions
      expect(result).toBeDefined()
      expect(result.variant_types).toBeDefined()
      expect(Array.isArray(result.variant_types)).toBe(true)
      expect(result.total).toBe(result.variant_types.length)

      // Should have at least the 4 seeded variant types
      expect(result.variant_types.length).toBeGreaterThanOrEqual(4)

      // Check that results are ordered by display_order
      for (let i = 1; i < result.variant_types.length; i++) {
        expect(result.variant_types[i].display_order).toBeGreaterThanOrEqual(
          result.variant_types[i - 1].display_order,
        )
      }
    })

    it("should include all required fields for each variant type", async () => {
      const result = await controller.getVariantTypes()

      // Check first variant type has all required fields
      const variantType = result.variant_types[0]
      expect(variantType).toHaveProperty("variant_type_id")
      expect(variantType).toHaveProperty("name")
      expect(variantType).toHaveProperty("display_name")
      expect(variantType).toHaveProperty("affects_pricing")
      expect(variantType).toHaveProperty("searchable")
      expect(variantType).toHaveProperty("filterable")
      expect(variantType).toHaveProperty("value_type")
      expect(variantType).toHaveProperty("display_order")
      expect(variantType).toHaveProperty("created_at")

      // Check types
      expect(typeof variantType.variant_type_id).toBe("string")
      expect(typeof variantType.name).toBe("string")
      expect(typeof variantType.display_name).toBe("string")
      expect(typeof variantType.affects_pricing).toBe("boolean")
      expect(typeof variantType.searchable).toBe("boolean")
      expect(typeof variantType.filterable).toBe("boolean")
      expect(typeof variantType.value_type).toBe("string")
      expect(["integer", "decimal", "string", "enum"]).toContain(
        variantType.value_type,
      )
      expect(typeof variantType.display_order).toBe("number")
      expect(typeof variantType.created_at).toBe("string")
    })

    it("should include quality_tier variant type with correct validation rules", async () => {
      const result = await controller.getVariantTypes()

      const qualityTier = result.variant_types.find(
        (vt) => vt.name === "quality_tier",
      )

      expect(qualityTier).toBeDefined()
      expect(qualityTier?.display_name).toBe("Quality Tier")
      expect(qualityTier?.value_type).toBe("integer")
      expect(qualityTier?.min_value).toBe(1)
      expect(qualityTier?.max_value).toBe(5)
      expect(qualityTier?.affects_pricing).toBe(true)
      expect(qualityTier?.searchable).toBe(true)
      expect(qualityTier?.filterable).toBe(true)
    })

    it("should include quality_value variant type with correct validation rules", async () => {
      const result = await controller.getVariantTypes()

      const qualityValue = result.variant_types.find(
        (vt) => vt.name === "quality_value",
      )

      expect(qualityValue).toBeDefined()
      expect(qualityValue?.display_name).toBe("Quality Value")
      expect(qualityValue?.value_type).toBe("decimal")
      expect(qualityValue?.min_value).toBe(0)
      expect(qualityValue?.max_value).toBe(100)
      expect(qualityValue?.affects_pricing).toBe(true)
      expect(qualityValue?.searchable).toBe(true)
      expect(qualityValue?.filterable).toBe(true)
    })

    it("should include crafted_source variant type with allowed values", async () => {
      const result = await controller.getVariantTypes()

      const craftedSource = result.variant_types.find(
        (vt) => vt.name === "crafted_source",
      )

      expect(craftedSource).toBeDefined()
      expect(craftedSource?.display_name).toBe("Source")
      expect(craftedSource?.value_type).toBe("enum")
      expect(craftedSource?.allowed_values).toBeDefined()
      expect(Array.isArray(craftedSource?.allowed_values)).toBe(true)
      expect(craftedSource?.allowed_values).toContain("crafted")
      expect(craftedSource?.allowed_values).toContain("store")
      expect(craftedSource?.allowed_values).toContain("looted")
      expect(craftedSource?.allowed_values).toContain("unknown")
      expect(craftedSource?.affects_pricing).toBe(true)
      expect(craftedSource?.searchable).toBe(true)
      expect(craftedSource?.filterable).toBe(true)
    })

    it("should include blueprint_tier variant type with correct validation rules", async () => {
      const result = await controller.getVariantTypes()

      const blueprintTier = result.variant_types.find(
        (vt) => vt.name === "blueprint_tier",
      )

      expect(blueprintTier).toBeDefined()
      expect(blueprintTier?.display_name).toBe("Blueprint Tier")
      expect(blueprintTier?.value_type).toBe("integer")
      expect(blueprintTier?.min_value).toBe(1)
      expect(blueprintTier?.max_value).toBe(5)
      expect(blueprintTier?.affects_pricing).toBe(true)
      expect(blueprintTier?.searchable).toBe(true)
      expect(blueprintTier?.filterable).toBe(true)
    })

    it("should return consistent results on multiple calls", async () => {
      const result1 = await controller.getVariantTypes()
      const result2 = await controller.getVariantTypes()

      expect(result1.total).toBe(result2.total)
      expect(result1.variant_types.length).toBe(result2.variant_types.length)

      // Check that variant types are in same order
      for (let i = 0; i < result1.variant_types.length; i++) {
        expect(result1.variant_types[i].name).toBe(result2.variant_types[i].name)
        expect(result1.variant_types[i].display_order).toBe(
          result2.variant_types[i].display_order,
        )
      }
    })

    it("should handle optional fields correctly", async () => {
      const result = await controller.getVariantTypes()

      for (const variantType of result.variant_types) {
        // description is optional
        if (variantType.description !== undefined) {
          expect(typeof variantType.description).toBe("string")
        }

        // min_value and max_value are optional (only for numeric types)
        if (variantType.min_value !== undefined) {
          expect(typeof variantType.min_value).toBe("number")
        }
        if (variantType.max_value !== undefined) {
          expect(typeof variantType.max_value).toBe("number")
        }

        // allowed_values is optional (only for enum types)
        if (variantType.allowed_values !== undefined) {
          expect(Array.isArray(variantType.allowed_values)).toBe(true)
        }

        // icon is optional
        if (variantType.icon !== undefined) {
          expect(typeof variantType.icon).toBe("string")
        }
      }
    })

    it("should return ISO 8601 formatted timestamps", async () => {
      const result = await controller.getVariantTypes()

      for (const variantType of result.variant_types) {
        // Check that created_at is valid ISO 8601 format
        expect(() => new Date(variantType.created_at)).not.toThrow()
        const date = new Date(variantType.created_at)
        expect(date.toISOString()).toBe(variantType.created_at)
      }
    })

    it("should have all variant types with unique names", async () => {
      const result = await controller.getVariantTypes()

      const names = result.variant_types.map((vt) => vt.name)
      const uniqueNames = new Set(names)

      expect(uniqueNames.size).toBe(names.length)
    })

    it("should have all variant types with unique variant_type_ids", async () => {
      const result = await controller.getVariantTypes()

      const ids = result.variant_types.map((vt) => vt.variant_type_id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })
  })
})
