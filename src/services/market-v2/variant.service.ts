/**
 * Variant Service
 *
 * Manages item variants with deduplication:
 * - Normalizes variant attributes by sorting keys alphabetically
 * - Generates SHA-256 hash for deduplication
 * - Creates or reuses variants based on attributes hash
 * - Generates human-readable display names and short names
 *
 * Requirements: 4.2, 4.3, 4.6
 */

import { getKnex } from "../../clients/database/knex-db.js"
import crypto from "crypto"

export interface VariantAttributes {
  quality_tier?: number // 1-5
  quality_value?: number // 0-1000
  crafted_source?: "crafted" | "store" | "looted" | "unknown" | "duped"
  blueprint_tier?: number // 1-5
  [key: string]: any // Future extensibility
}

export interface ItemVariant {
  variant_id: string
  game_item_id: string | null
  attributes: VariantAttributes
  attributes_hash: string
  display_name: string
  short_name: string
  base_price_modifier?: number
  fixed_price_override?: number
  created_at: Date
}

/**
 * Normalizes variant attributes by sorting keys alphabetically.
 * This ensures consistent hashing regardless of key order.
 *
 * Requirement 4.7: Normalize attribute order before hashing for consistency
 *
 * @param attributes - Raw variant attributes
 * @returns Normalized attributes with sorted keys
 *
 * @example
 * normalizeVariantAttributes({ quality_tier: 5, crafted_source: "crafted" })
 * // Returns: { crafted_source: "crafted", quality_tier: 5 }
 */
export function normalizeVariantAttributes(
  attributes: VariantAttributes,
): VariantAttributes {
  const sortedKeys = Object.keys(attributes).sort()
  const normalized: VariantAttributes = {}

  for (const key of sortedKeys) {
    normalized[key] = attributes[key]
  }

  return normalized
}

/**
 * Generates SHA-256 hash of normalized variant attributes.
 * Used for deduplication - same attributes always produce same hash.
 *
 * Requirement 4.2: Generate attributes_hash for deduplication
 *
 * @param attributes - Variant attributes to hash
 * @returns 64-character hex string (SHA-256 hash)
 *
 * @example
 * generateAttributesHash({ quality_tier: 5, crafted_source: "crafted" })
 * // Returns: "a1b2c3d4..." (64-char hex string)
 */
export function generateAttributesHash(attributes: VariantAttributes): string {
  const normalized = normalizeVariantAttributes(attributes)
  const json = JSON.stringify(normalized)
  return crypto.createHash("sha256").update(json).digest("hex")
}

/**
 * Generates human-readable display name from variant attributes.
 * Format: "Tier {tier} ({value}%) - {source}" or variations.
 *
 * Requirement 4.6: Generate display_name from attributes
 *
 * @param attributes - Variant attributes
 * @returns Display name (e.g., "Tier 5 (95.5%) - Crafted")
 *
 * @example
 * generateVariantDisplayName({ quality_tier: 5, quality_value: 95.5, crafted_source: "crafted" })
 * // Returns: "Tier 5 (95.5%) - Crafted"
 *
 * @example
 * generateVariantDisplayName({ quality_tier: 3 })
 * // Returns: "Tier 3"
 *
 * @example
 * generateVariantDisplayName({})
 * // Returns: "Standard"
 */
export function generateVariantDisplayName(attributes: VariantAttributes): string {
  const parts: string[] = []

  if (attributes.quality_tier) {
    parts.push(`Tier ${attributes.quality_tier}`)

    if (attributes.quality_value !== undefined && attributes.quality_value !== null) {
      parts.push(`(${attributes.quality_value.toFixed(1)}%)`)
    }
  }

  if (attributes.crafted_source && attributes.crafted_source !== "unknown") {
    const sourceCapitalized =
      attributes.crafted_source.charAt(0).toUpperCase() +
      attributes.crafted_source.slice(1)
    parts.push(parts.length ? `- ${sourceCapitalized}` : sourceCapitalized)
  }

  if (attributes.blueprint_tier) {
    parts.push(`[BP T${attributes.blueprint_tier}]`)
  }

  return parts.length > 0 ? parts.join(" ") : "Standard"
}

/**
 * Generates short name for compact display from variant attributes.
 * Format: "T{tier} {source_initial}" or variations.
 *
 * Requirement 4.6: Generate short_name from attributes
 *
 * @param attributes - Variant attributes
 * @returns Short name (e.g., "T5 C")
 *
 * @example
 * generateVariantShortName({ quality_tier: 5, crafted_source: "crafted" })
 * // Returns: "T5 C"
 *
 * @example
 * generateVariantShortName({ quality_tier: 3 })
 * // Returns: "T3"
 *
 * @example
 * generateVariantShortName({})
 * // Returns: "Std"
 */
export function generateVariantShortName(attributes: VariantAttributes): string {
  const parts: string[] = []

  if (attributes.quality_tier) {
    parts.push(`T${attributes.quality_tier}`)
  }

  if (attributes.crafted_source && attributes.crafted_source !== "unknown") {
    parts.push(attributes.crafted_source.charAt(0).toUpperCase())
  }

  return parts.length > 0 ? parts.join(" ") : "Std"
}

/**
 * Gets existing variant or creates new one with deduplication.
 * Uses attributes_hash to prevent duplicate variants with same attributes.
 *
 * Requirements:
 * - 4.2: Generate attributes_hash for deduplication
 * - 4.3: Reuse existing variant when attributes match
 * - 4.6: Generate display_name and short_name
 * - 4.7: Normalize attribute order before hashing
 *
 * @param gameItemId - UUID of the game item
 * @param attributes - Variant attributes
 * @returns UUID of existing or newly created variant
 *
 * @example
 * const variantId = await getOrCreateVariant(
 *   "123e4567-e89b-12d3-a456-426614174000",
 *   { quality_tier: 5, crafted_source: "crafted" }
 * )
 * // Returns: "987fcdeb-51a2-43f7-8d9e-1234567890ab"
 */
export async function getOrCreateVariant(
  gameItemId: string | null,
  attributes: VariantAttributes,
): Promise<string> {
  const db = getKnex()

  // Normalize and hash attributes
  const normalized = normalizeVariantAttributes(attributes)
  const hash = generateAttributesHash(normalized)

  // Try to find existing variant with same game_item_id and attributes_hash
  const existing = await db<ItemVariant>("item_variants")
    .where({
      attributes_hash: hash,
    })
    .modify((qb) => {
      if (gameItemId) qb.where("game_item_id", gameItemId)
      else qb.whereNull("game_item_id")
    })
    .first()

  if (existing) {
    return existing.variant_id
  }

  // Create new variant — use onConflict to handle race conditions
  const [variant] = await db<ItemVariant>("item_variants")
    .insert({
      game_item_id: gameItemId || null,
      attributes: normalized,
      attributes_hash: hash,
      display_name: generateVariantDisplayName(normalized),
      short_name: generateVariantShortName(normalized),
      created_at: new Date(),
    })
    .onConflict(["game_item_id", "attributes_hash"])
    .merge(["display_name", "short_name"])
    .returning("*")

  return variant.variant_id
}

export class VariantService {
  /**
   * Normalizes variant attributes by sorting keys alphabetically.
   */
  normalizeVariantAttributes(attributes: VariantAttributes): VariantAttributes {
    return normalizeVariantAttributes(attributes)
  }

  /**
   * Generates SHA-256 hash of normalized variant attributes.
   */
  generateAttributesHash(attributes: VariantAttributes): string {
    return generateAttributesHash(attributes)
  }

  /**
   * Generates human-readable display name from variant attributes.
   */
  generateVariantDisplayName(attributes: VariantAttributes): string {
    return generateVariantDisplayName(attributes)
  }

  /**
   * Generates short name for compact display from variant attributes.
   */
  generateVariantShortName(attributes: VariantAttributes): string {
    return generateVariantShortName(attributes)
  }

  /**
   * Gets existing variant or creates new one with deduplication.
   */
  async getOrCreateVariant(
    gameItemId: string,
    attributes: VariantAttributes,
  ): Promise<string> {
    return getOrCreateVariant(gameItemId, attributes)
  }

  /**
   * Gets variant by ID.
   */
  async getVariantById(variantId: string): Promise<ItemVariant | null> {
    const db = getKnex()
    const variant = await db<ItemVariant>("item_variants")
      .where({ variant_id: variantId })
      .first()

    return variant || null
  }

  /**
   * Gets all variants for a game item.
   */
  async getVariantsByGameItem(gameItemId: string): Promise<ItemVariant[]> {
    const db = getKnex()
    return db<ItemVariant>("item_variants")
      .where({ game_item_id: gameItemId })
      .orderBy("created_at", "desc")
  }

  /**
   * Finds variant by game item and exact attributes.
   */
  async findVariantByAttributes(
    gameItemId: string,
    attributes: VariantAttributes,
  ): Promise<ItemVariant | null> {
    const db = getKnex()
    const hash = generateAttributesHash(attributes)

    const variant = await db<ItemVariant>("item_variants")
      .where({
        game_item_id: gameItemId,
        attributes_hash: hash,
      })
      .first()

    return variant || null
  }
}

export const variantService = new VariantService()
