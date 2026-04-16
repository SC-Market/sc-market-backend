/**
 * Property tests and unit tests for VariantService
 *
 * These tests validate the correctness properties of variant management,
 * including deduplication, attribute order independence, serialization,
 * and validation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { VariantService } from "./variant.service.js"
import { MarketV2Repository } from "./repository.js"
import { VariantValidationError } from "./errors.js"
import type { DBItemVariant, DBVariantType, VariantAttributes } from "./types.js"

// Mock the repository
vi.mock("./repository.js")
vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(() => ({} as any)),
}))

describe("Market V2 - Property 4: Variant Deduplication", () => {
  let service: VariantService
  let mockRepository: MarketV2Repository

  beforeEach(() => {
    vi.clearAllMocks()
    service = new VariantService()
    mockRepository = service["repository"]
    service.clearCache()
  })

  /**
   * Property 4: Variant Deduplication
   * Validates: Requirements 5.3, 24.2
   *
   * For any variant attributes, calling getOrCreateVariant twice with the same
   * attributes SHALL return the same variant_id both times.
   */

  it("should return same variant_id when creating variant with identical attributes twice", async () => {
    const gameItemId = "game-item-123"
    const attributes: VariantAttributes = {
      quality_tier: 3,
      quality_value: 75,
      crafted_source: "crafted",
    }

    const existingVariant: DBItemVariant = {
      variant_id: "variant-abc",
      game_item_id: gameItemId,
      attributes,
      attributes_hash: "hash123",
      display_name: "Tier 3 (75%) (Crafted)",
      short_name: "T3-C",
      base_price_modifier: null,
      fixed_price_override: null,
      created_at: new Date(),
    }

    // Mock variant types for validation
    const mockVariantTypes: DBVariantType[] = [
      {
        variant_type_id: "vt1",
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
      },
      {
        variant_type_id: "vt2",
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
      },
      {
        variant_type_id: "vt3",
        name: "crafted_source",
        display_name: "Source",
        description: null,
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "enum",
        min_value: null,
        max_value: null,
        allowed_values: ["crafted", "store", "looted", "unknown"],
        display_order: 3,
        icon: null,
        created_at: new Date(),
      },
    ]

    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )

    // First call: variant exists
    vi.spyOn(mockRepository, "findVariantByHash").mockResolvedValue(
      existingVariant,
    )

    const result1 = await service.getOrCreateVariant({
      game_item_id: gameItemId,
      attributes,
    })

    // Second call: variant still exists
    const result2 = await service.getOrCreateVariant({
      game_item_id: gameItemId,
      attributes,
    })

    // Verify same variant_id returned both times
    expect(result1.variant_id).toBe(existingVariant.variant_id)
    expect(result2.variant_id).toBe(existingVariant.variant_id)
    expect(result1.variant_id).toBe(result2.variant_id)

    // Verify createVariant was never called (variant already existed)
    expect(mockRepository.createVariant).not.toHaveBeenCalled()
  })

  it("should create variant only once when called multiple times with same attributes", async () => {
    const gameItemId = "game-item-456"
    const attributes: VariantAttributes = {
      quality_tier: 5,
      quality_value: 95,
    }

    const createdVariant: DBItemVariant = {
      variant_id: "variant-xyz",
      game_item_id: gameItemId,
      attributes,
      attributes_hash: "hash456",
      display_name: "Tier 5 (95%)",
      short_name: "T5",
      base_price_modifier: null,
      fixed_price_override: null,
      created_at: new Date(),
    }

    const mockVariantTypes: DBVariantType[] = [
      {
        variant_type_id: "vt1",
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
      },
      {
        variant_type_id: "vt2",
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
      },
    ]

    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )

    // First call: variant doesn't exist, create it
    vi.spyOn(mockRepository, "findVariantByHash")
      .mockResolvedValueOnce(null) // First call: not found
      .mockResolvedValue(createdVariant) // Subsequent calls: found

    vi.spyOn(mockRepository, "createVariant").mockResolvedValue(createdVariant)

    const result1 = await service.getOrCreateVariant({
      game_item_id: gameItemId,
      attributes,
    })

    const result2 = await service.getOrCreateVariant({
      game_item_id: gameItemId,
      attributes,
    })

    // Verify same variant_id returned both times
    expect(result1.variant_id).toBe(createdVariant.variant_id)
    expect(result2.variant_id).toBe(createdVariant.variant_id)

    // Verify createVariant was called only once
    expect(mockRepository.createVariant).toHaveBeenCalledTimes(1)
  })
})

describe("Market V2 - Property 31: Attribute Order Independence", () => {
  let service: VariantService
  let mockRepository: MarketV2Repository

  beforeEach(() => {
    vi.clearAllMocks()
    service = new VariantService()
    mockRepository = service["repository"]
    service.clearCache()
  })

  /**
   * Property 31: Attribute Order Independence
   * Validates: Requirements 24.5
   *
   * For any two attribute objects with the same keys and values but different
   * key orders, they SHALL be treated as identical variants.
   */

  it("should treat attributes with different key orders as identical", async () => {
    const gameItemId = "game-item-789"

    // Same attributes, different key order
    const attributes1: VariantAttributes = {
      quality_tier: 3,
      quality_value: 75,
      crafted_source: "crafted",
    }

    const attributes2: VariantAttributes = {
      crafted_source: "crafted",
      quality_tier: 3,
      quality_value: 75,
    }

    const existingVariant: DBItemVariant = {
      variant_id: "variant-same",
      game_item_id: gameItemId,
      attributes: { crafted_source: "crafted", quality_tier: 3, quality_value: 75 },
      attributes_hash: "hash-same",
      display_name: "Tier 3 (75%) (Crafted)",
      short_name: "T3-C",
      base_price_modifier: null,
      fixed_price_override: null,
      created_at: new Date(),
    }

    const mockVariantTypes: DBVariantType[] = [
      {
        variant_type_id: "vt1",
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
      },
      {
        variant_type_id: "vt2",
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
      },
      {
        variant_type_id: "vt3",
        name: "crafted_source",
        display_name: "Source",
        description: null,
        affects_pricing: true,
        searchable: true,
        filterable: true,
        value_type: "enum",
        min_value: null,
        max_value: null,
        allowed_values: ["crafted", "store", "looted", "unknown"],
        display_order: 3,
        icon: null,
        created_at: new Date(),
      },
    ]

    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )
    vi.spyOn(mockRepository, "findVariantByHash").mockResolvedValue(
      existingVariant,
    )

    const result1 = await service.getOrCreateVariant({
      game_item_id: gameItemId,
      attributes: attributes1,
    })

    const result2 = await service.getOrCreateVariant({
      game_item_id: gameItemId,
      attributes: attributes2,
    })

    // Verify same variant returned for both attribute orders
    expect(result1.variant_id).toBe(result2.variant_id)
    expect(result1.variant_id).toBe(existingVariant.variant_id)
  })

  it("should normalize attribute keys alphabetically", () => {
    const service = new VariantService()

    const attributes: VariantAttributes = {
      quality_value: 75,
      crafted_source: "crafted",
      quality_tier: 3,
    }

    const normalized = service["normalizeAttributes"](attributes)

    // Verify keys are in alphabetical order
    const keys = Object.keys(normalized)
    expect(keys).toEqual(["crafted_source", "quality_tier", "quality_value"])

    // Verify values are preserved
    expect(normalized.crafted_source).toBe("crafted")
    expect(normalized.quality_tier).toBe(3)
    expect(normalized.quality_value).toBe(75)
  })
})

describe("Market V2 - Property 28: Variant Serialization Round-Trip", () => {
  let service: VariantService

  beforeEach(() => {
    service = new VariantService()
  })

  /**
   * Property 28: Variant Serialization Round-Trip
   * Validates: Requirements 21.3
   *
   * For any valid variant attributes object, serializing and then parsing
   * SHALL return an equivalent object: parse(serialize(x)) equals x
   */

  it("should preserve attributes through JSON serialization round-trip", () => {
    const attributes: VariantAttributes = {
      quality_tier: 3,
      quality_value: 75.5,
      crafted_source: "crafted",
      blueprint_tier: 2,
    }

    // Serialize
    const normalized = service["normalizeAttributes"](attributes)
    const canonical = service["getCanonicalJson"](normalized)

    // Parse
    const parsed = JSON.parse(canonical)

    // Verify round-trip preserves all values
    expect(parsed.quality_tier).toBe(attributes.quality_tier)
    expect(parsed.quality_value).toBe(attributes.quality_value)
    expect(parsed.crafted_source).toBe(attributes.crafted_source)
    expect(parsed.blueprint_tier).toBe(attributes.blueprint_tier)
  })

  it("should produce consistent hash for same attributes", () => {
    const attributes: VariantAttributes = {
      quality_tier: 4,
      quality_value: 88,
    }

    const normalized1 = service["normalizeAttributes"](attributes)
    const canonical1 = service["getCanonicalJson"](normalized1)
    const hash1 = service["computeAttributesHash"](canonical1)

    const normalized2 = service["normalizeAttributes"](attributes)
    const canonical2 = service["getCanonicalJson"](normalized2)
    const hash2 = service["computeAttributesHash"](canonical2)

    // Verify same hash produced
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA256 produces 64 hex characters
  })

  it("should produce different hash for different attributes", () => {
    const attributes1: VariantAttributes = {
      quality_tier: 3,
      quality_value: 75,
    }

    const attributes2: VariantAttributes = {
      quality_tier: 3,
      quality_value: 76, // Different value
    }

    const normalized1 = service["normalizeAttributes"](attributes1)
    const canonical1 = service["getCanonicalJson"](normalized1)
    const hash1 = service["computeAttributesHash"](canonical1)

    const normalized2 = service["normalizeAttributes"](attributes2)
    const canonical2 = service["getCanonicalJson"](normalized2)
    const hash2 = service["computeAttributesHash"](canonical2)

    // Verify different hashes produced
    expect(hash1).not.toBe(hash2)
  })
})

describe("Market V2 - Variant Validation Unit Tests", () => {
  let service: VariantService
  let mockRepository: MarketV2Repository

  beforeEach(() => {
    vi.clearAllMocks()
    service = new VariantService()
    mockRepository = service["repository"]
    service.clearCache()
  })

  const mockVariantTypes: DBVariantType[] = [
    {
      variant_type_id: "vt1",
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
    },
    {
      variant_type_id: "vt2",
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
    },
    {
      variant_type_id: "vt3",
      name: "crafted_source",
      display_name: "Source",
      description: null,
      affects_pricing: true,
      searchable: true,
      filterable: true,
      value_type: "enum",
      min_value: null,
      max_value: null,
      allowed_values: ["crafted", "store", "looted", "unknown"],
      display_order: 3,
      icon: null,
      created_at: new Date(),
    },
  ]

  it("should reject quality_tier values outside 1-5 range", async () => {
    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )

    // Test below minimum
    const attributes1: VariantAttributes = { quality_tier: 0 }
    const result1 = await service["validateAttributes"](attributes1)
    expect(result1.valid).toBe(false)
    expect(result1.errors).toHaveLength(1)
    expect(result1.errors[0].attribute).toBe("quality_tier")
    expect(result1.errors[0].message).toContain("below minimum")

    // Test above maximum
    const attributes2: VariantAttributes = { quality_tier: 6 }
    const result2 = await service["validateAttributes"](attributes2)
    expect(result2.valid).toBe(false)
    expect(result2.errors).toHaveLength(1)
    expect(result2.errors[0].attribute).toBe("quality_tier")
    expect(result2.errors[0].message).toContain("above maximum")
  })

  it("should reject quality_value values outside 0-100 range", async () => {
    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )

    // Test below minimum
    const attributes1: VariantAttributes = { quality_value: -1 }
    const result1 = await service["validateAttributes"](attributes1)
    expect(result1.valid).toBe(false)
    expect(result1.errors).toHaveLength(1)
    expect(result1.errors[0].attribute).toBe("quality_value")
    expect(result1.errors[0].message).toContain("below minimum")

    // Test above maximum
    const attributes2: VariantAttributes = { quality_value: 101 }
    const result2 = await service["validateAttributes"](attributes2)
    expect(result2.valid).toBe(false)
    expect(result2.errors).toHaveLength(1)
    expect(result2.errors[0].attribute).toBe("quality_value")
    expect(result2.errors[0].message).toContain("above maximum")
  })

  it("should reject invalid crafted_source enum values", async () => {
    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )

    const attributes: VariantAttributes = { crafted_source: "invalid" as any }
    const result = await service["validateAttributes"](attributes)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].attribute).toBe("crafted_source")
    expect(result.errors[0].message).toContain("not in allowed values")
  })

  it("should handle optional attributes gracefully", async () => {
    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )

    // Only provide quality_tier, omit other optional attributes
    const attributes: VariantAttributes = { quality_tier: 3 }
    const result = await service["validateAttributes"](attributes)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should accept valid attribute combinations", async () => {
    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )

    const attributes: VariantAttributes = {
      quality_tier: 3,
      quality_value: 75,
      crafted_source: "crafted",
    }

    const result = await service["validateAttributes"](attributes)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should throw VariantValidationError when creating variant with invalid attributes", async () => {
    vi.spyOn(mockRepository, "getAllVariantTypes").mockResolvedValue(
      mockVariantTypes,
    )
    vi.spyOn(mockRepository, "findVariantByHash").mockResolvedValue(null)

    const gameItemId = "game-item-invalid"
    const attributes: VariantAttributes = {
      quality_tier: 10, // Invalid: outside range
    }

    await expect(
      service.getOrCreateVariant({
        game_item_id: gameItemId,
        attributes,
      }),
    ).rejects.toThrow(VariantValidationError)
  })
})
