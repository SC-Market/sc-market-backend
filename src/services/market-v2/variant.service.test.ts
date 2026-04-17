/**
 * Unit tests for Variant Service
 *
 * Tests variant deduplication logic:
 * - Attribute normalization (alphabetical key sorting)
 * - Hash generation (SHA-256)
 * - Display name generation
 * - Short name generation
 * - Get or create variant (deduplication)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  normalizeVariantAttributes,
  generateAttributesHash,
  generateVariantDisplayName,
  generateVariantShortName,
  getOrCreateVariant,
  VariantService,
  type VariantAttributes,
} from "./variant.service.js"
import { getKnex } from "../../clients/database/knex-db.js"

describe("normalizeVariantAttributes", () => {
  it("should sort keys alphabetically", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
      blueprint_tier: 3,
      quality_value: 95.5,
    }

    const normalized = normalizeVariantAttributes(attributes)
    const keys = Object.keys(normalized)

    expect(keys).toEqual(["blueprint_tier", "crafted_source", "quality_tier", "quality_value"])
  })

  it("should preserve attribute values", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    const normalized = normalizeVariantAttributes(attributes)

    expect(normalized.quality_tier).toBe(5)
    expect(normalized.crafted_source).toBe("crafted")
  })

  it("should handle empty attributes", () => {
    const normalized = normalizeVariantAttributes({})
    expect(normalized).toEqual({})
  })

  it("should handle single attribute", () => {
    const normalized = normalizeVariantAttributes({ quality_tier: 3 })
    expect(normalized).toEqual({ quality_tier: 3 })
  })
})

describe("generateAttributesHash", () => {
  it("should generate consistent hash for same attributes", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    const hash1 = generateAttributesHash(attributes)
    const hash2 = generateAttributesHash(attributes)

    expect(hash1).toBe(hash2)
  })

  it("should generate same hash regardless of key order", () => {
    const attributes1: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    const attributes2: VariantAttributes = {
      crafted_source: "crafted",
      quality_tier: 5,
    }

    const hash1 = generateAttributesHash(attributes1)
    const hash2 = generateAttributesHash(attributes2)

    expect(hash1).toBe(hash2)
  })

  it("should generate different hash for different attributes", () => {
    const hash1 = generateAttributesHash({ quality_tier: 5 })
    const hash2 = generateAttributesHash({ quality_tier: 3 })

    expect(hash1).not.toBe(hash2)
  })

  it("should generate 64-character hex string", () => {
    const hash = generateAttributesHash({ quality_tier: 5 })

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash.length).toBe(64)
  })

  it("should handle empty attributes", () => {
    const hash = generateAttributesHash({})
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe("generateVariantDisplayName", () => {
  it("should generate full display name with all attributes", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      quality_value: 95.5,
      crafted_source: "crafted",
      blueprint_tier: 3,
    }

    const displayName = generateVariantDisplayName(attributes)

    expect(displayName).toBe("Tier 5 (95.5%) - Crafted [BP T3]")
  })

  it("should generate display name with tier only", () => {
    const displayName = generateVariantDisplayName({ quality_tier: 3 })
    expect(displayName).toBe("Tier 3")
  })

  it("should generate display name with tier and value", () => {
    const attributes: VariantAttributes = {
      quality_tier: 4,
      quality_value: 87.2,
    }

    const displayName = generateVariantDisplayName(attributes)
    expect(displayName).toBe("Tier 4 (87.2%)")
  })

  it("should generate display name with tier and source", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "looted",
    }

    const displayName = generateVariantDisplayName(attributes)
    expect(displayName).toBe("Tier 5 - Looted")
  })

  it("should capitalize crafted source", () => {
    expect(generateVariantDisplayName({ crafted_source: "crafted" })).toBe("- Crafted")
    expect(generateVariantDisplayName({ crafted_source: "store" })).toBe("- Store")
    expect(generateVariantDisplayName({ crafted_source: "looted" })).toBe("- Looted")
  })

  it("should skip unknown crafted source", () => {
    const attributes: VariantAttributes = {
      quality_tier: 3,
      crafted_source: "unknown",
    }

    const displayName = generateVariantDisplayName(attributes)
    expect(displayName).toBe("Tier 3")
  })

  it("should return 'Standard' for empty attributes", () => {
    const displayName = generateVariantDisplayName({})
    expect(displayName).toBe("Standard")
  })

  it("should handle quality_value of 0", () => {
    const attributes: VariantAttributes = {
      quality_tier: 1,
      quality_value: 0,
    }

    const displayName = generateVariantDisplayName(attributes)
    expect(displayName).toBe("Tier 1 (0.0%)")
  })

  it("should handle quality_value of 100", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      quality_value: 100,
    }

    const displayName = generateVariantDisplayName(attributes)
    expect(displayName).toBe("Tier 5 (100.0%)")
  })
})

describe("generateVariantShortName", () => {
  it("should generate short name with tier and source", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    const shortName = generateVariantShortName(attributes)
    expect(shortName).toBe("T5 C")
  })

  it("should generate short name with tier only", () => {
    const shortName = generateVariantShortName({ quality_tier: 3 })
    expect(shortName).toBe("T3")
  })

  it("should use first letter of crafted source", () => {
    expect(generateVariantShortName({ crafted_source: "crafted" })).toBe("C")
    expect(generateVariantShortName({ crafted_source: "store" })).toBe("S")
    expect(generateVariantShortName({ crafted_source: "looted" })).toBe("L")
  })

  it("should skip unknown crafted source", () => {
    const attributes: VariantAttributes = {
      quality_tier: 3,
      crafted_source: "unknown",
    }

    const shortName = generateVariantShortName(attributes)
    expect(shortName).toBe("T3")
  })

  it("should return 'Std' for empty attributes", () => {
    const shortName = generateVariantShortName({})
    expect(shortName).toBe("Std")
  })

  it("should ignore quality_value in short name", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      quality_value: 95.5,
    }

    const shortName = generateVariantShortName(attributes)
    expect(shortName).toBe("T5")
  })

  it("should ignore blueprint_tier in short name", () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      blueprint_tier: 3,
    }

    const shortName = generateVariantShortName(attributes)
    expect(shortName).toBe("T5")
  })
})

describe("getOrCreateVariant (database integration)", () => {
  const db = getKnex()
  const testGameItemId = "123e4567-e89b-12d3-a456-426614174000"

  beforeEach(async () => {
    // Clean up test data
    await db("item_variants").where({ game_item_id: testGameItemId }).delete()
  })

  afterEach(async () => {
    // Clean up test data
    await db("item_variants").where({ game_item_id: testGameItemId }).delete()
  })

  it("should create new variant when none exists", async () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    const variantId = await getOrCreateVariant(testGameItemId, attributes)

    expect(variantId).toBeTruthy()
    expect(typeof variantId).toBe("string")

    // Verify variant was created in database
    const variant = await db("item_variants").where({ variant_id: variantId }).first()

    expect(variant).toBeTruthy()
    expect(variant.game_item_id).toBe(testGameItemId)
    expect(variant.attributes).toEqual({
      crafted_source: "crafted",
      quality_tier: 5,
    })
    expect(variant.display_name).toBe("Tier 5 - Crafted")
    expect(variant.short_name).toBe("T5 C")
  })

  it("should reuse existing variant with same attributes", async () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    // Create variant first time
    const variantId1 = await getOrCreateVariant(testGameItemId, attributes)

    // Try to create same variant again
    const variantId2 = await getOrCreateVariant(testGameItemId, attributes)

    // Should return same variant ID
    expect(variantId1).toBe(variantId2)

    // Verify only one variant exists
    const variants = await db("item_variants")
      .where({ game_item_id: testGameItemId })
      .select("*")

    expect(variants.length).toBe(1)
  })

  it("should reuse variant regardless of attribute key order", async () => {
    const attributes1: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    const attributes2: VariantAttributes = {
      crafted_source: "crafted",
      quality_tier: 5,
    }

    const variantId1 = await getOrCreateVariant(testGameItemId, attributes1)
    const variantId2 = await getOrCreateVariant(testGameItemId, attributes2)

    expect(variantId1).toBe(variantId2)
  })

  it("should create different variants for different attributes", async () => {
    const variantId1 = await getOrCreateVariant(testGameItemId, { quality_tier: 5 })
    const variantId2 = await getOrCreateVariant(testGameItemId, { quality_tier: 3 })

    expect(variantId1).not.toBe(variantId2)

    // Verify two variants exist
    const variants = await db("item_variants")
      .where({ game_item_id: testGameItemId })
      .select("*")

    expect(variants.length).toBe(2)
  })

  it("should create different variants for different game items", async () => {
    const gameItemId1 = "123e4567-e89b-12d3-a456-426614174000"
    const gameItemId2 = "987fcdeb-51a2-43f7-8d9e-1234567890ab"

    const attributes: VariantAttributes = { quality_tier: 5 }

    const variantId1 = await getOrCreateVariant(gameItemId1, attributes)
    const variantId2 = await getOrCreateVariant(gameItemId2, attributes)

    expect(variantId1).not.toBe(variantId2)

    // Clean up second game item
    await db("item_variants").where({ game_item_id: gameItemId2 }).delete()
  })

  it("should handle empty attributes", async () => {
    const variantId = await getOrCreateVariant(testGameItemId, {})

    expect(variantId).toBeTruthy()

    const variant = await db("item_variants").where({ variant_id: variantId }).first()

    expect(variant.attributes).toEqual({})
    expect(variant.display_name).toBe("Standard")
    expect(variant.short_name).toBe("Std")
  })

  it("should normalize attributes before storing", async () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
      blueprint_tier: 3,
      quality_value: 95.5,
    }

    const variantId = await getOrCreateVariant(testGameItemId, attributes)
    const variant = await db("item_variants").where({ variant_id: variantId }).first()

    // Verify keys are sorted alphabetically
    const keys = Object.keys(variant.attributes)
    expect(keys).toEqual(["blueprint_tier", "crafted_source", "quality_tier", "quality_value"])
  })
})

describe("VariantService class", () => {
  const service = new VariantService()
  const db = getKnex()
  const testGameItemId = "123e4567-e89b-12d3-a456-426614174000"

  beforeEach(async () => {
    await db("item_variants").where({ game_item_id: testGameItemId }).delete()
  })

  afterEach(async () => {
    await db("item_variants").where({ game_item_id: testGameItemId }).delete()
  })

  it("should expose normalizeVariantAttributes method", () => {
    const normalized = service.normalizeVariantAttributes({
      quality_tier: 5,
      crafted_source: "crafted",
    })

    expect(Object.keys(normalized)).toEqual(["crafted_source", "quality_tier"])
  })

  it("should expose generateAttributesHash method", () => {
    const hash = service.generateAttributesHash({ quality_tier: 5 })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("should expose generateVariantDisplayName method", () => {
    const displayName = service.generateVariantDisplayName({ quality_tier: 5 })
    expect(displayName).toBe("Tier 5")
  })

  it("should expose generateVariantShortName method", () => {
    const shortName = service.generateVariantShortName({ quality_tier: 5 })
    expect(shortName).toBe("T5")
  })

  it("should expose getOrCreateVariant method", async () => {
    const variantId = await service.getOrCreateVariant(testGameItemId, { quality_tier: 5 })
    expect(variantId).toBeTruthy()
  })

  it("should get variant by ID", async () => {
    const variantId = await service.getOrCreateVariant(testGameItemId, { quality_tier: 5 })
    const variant = await service.getVariantById(variantId)

    expect(variant).toBeTruthy()
    expect(variant?.variant_id).toBe(variantId)
    expect(variant?.game_item_id).toBe(testGameItemId)
  })

  it("should return null for non-existent variant ID", async () => {
    const variant = await service.getVariantById("00000000-0000-0000-0000-000000000000")
    expect(variant).toBeNull()
  })

  it("should get all variants for game item", async () => {
    await service.getOrCreateVariant(testGameItemId, { quality_tier: 5 })
    await service.getOrCreateVariant(testGameItemId, { quality_tier: 3 })
    await service.getOrCreateVariant(testGameItemId, { quality_tier: 1 })

    const variants = await service.getVariantsByGameItem(testGameItemId)

    expect(variants.length).toBe(3)
    expect(variants.every((v) => v.game_item_id === testGameItemId)).toBe(true)
  })

  it("should find variant by exact attributes", async () => {
    const attributes: VariantAttributes = {
      quality_tier: 5,
      crafted_source: "crafted",
    }

    const variantId = await service.getOrCreateVariant(testGameItemId, attributes)
    const found = await service.findVariantByAttributes(testGameItemId, attributes)

    expect(found).toBeTruthy()
    expect(found?.variant_id).toBe(variantId)
  })

  it("should return null when variant not found by attributes", async () => {
    const found = await service.findVariantByAttributes(testGameItemId, { quality_tier: 99 })
    expect(found).toBeNull()
  })
})
