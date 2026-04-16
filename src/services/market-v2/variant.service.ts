/**
 * Variant Service
 *
 * Business logic for managing item variants, including creation, deduplication,
 * validation, and display name generation.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.6, 16.6, 21.4, 21.5, 21.6, 24.1, 24.2, 24.3, 24.4, 28.1
 */

import { Knex } from "knex"
import crypto from "crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import { MarketV2Repository } from "./repository.js"
import {
  DBItemVariant,
  DBVariantType,
  VariantAttributes,
  GetOrCreateVariantInput,
  ValidationResult,
  ValidationError,
} from "./types.js"
import {
  VariantValidationError,
  VariantTypeNotFoundError,
  AttributeNormalizationError,
} from "./errors.js"
import logger from "../../logger/logger.js"

export class VariantService {
  private repository: MarketV2Repository
  private knex: Knex
  private variantTypesCache: Map<string, DBVariantType> | null = null

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
    this.repository = new MarketV2Repository(this.knex)
  }

  /**
   * Get or create a variant with deduplication logic
   *
   * This method implements the core variant deduplication algorithm:
   * 1. Normalize attribute order (alphabetically by key)
   * 2. Compute canonical JSON representation
   * 3. Compute SHA256 hash of canonical JSON
   * 4. Check if variant with same hash exists
   * 5. If exists, return existing variant
   * 6. If not, validate attributes and create new variant
   *
   * Requirements: 5.1, 5.2, 5.3, 5.6, 24.1, 24.2, 24.3, 24.4
   */
  async getOrCreateVariant(
    input: GetOrCreateVariantInput,
  ): Promise<DBItemVariant> {
    // Step 1: Normalize attributes (order-independent)
    const normalizedAttributes = this.normalizeAttributes(input.attributes)

    // Step 2: Compute canonical JSON representation
    const canonicalJson = this.getCanonicalJson(normalizedAttributes)

    // Step 3: Compute attributes hash
    const attributesHash = this.computeAttributesHash(canonicalJson)

    // Step 4: Check if variant already exists
    const existingVariant = await this.repository.findVariantByHash(
      input.game_item_id,
      attributesHash,
    )

    if (existingVariant) {
      logger.debug("Variant already exists, returning existing", {
        variantId: existingVariant.variant_id,
        gameItemId: input.game_item_id,
        attributesHash,
      })
      return existingVariant
    }

    // Step 5: Validate attributes before creating new variant
    const validationResult = await this.validateAttributes(normalizedAttributes)

    if (!validationResult.valid) {
      throw new VariantValidationError(validationResult.errors)
    }

    // Step 6: Generate display names
    const displayName = this.generateDisplayName(normalizedAttributes)
    const shortName = this.generateShortName(normalizedAttributes)

    // Step 7: Create new variant
    const newVariant = await this.repository.createVariant(
      input.game_item_id,
      normalizedAttributes,
      displayName,
      shortName,
    )

    logger.info("New variant created", {
      variantId: newVariant.variant_id,
      gameItemId: input.game_item_id,
      attributes: normalizedAttributes,
      displayName,
    })

    return newVariant
  }

  /**
   * Normalize attributes by sorting keys alphabetically
   *
   * This ensures that {"quality_tier": 3, "quality_value": 75} and
   * {"quality_value": 75, "quality_tier": 3} are treated as identical.
   *
   * Requirements: 24.4, 24.5
   */
  private normalizeAttributes(
    attributes: VariantAttributes,
  ): VariantAttributes {
    // Sort keys alphabetically
    const sortedKeys = Object.keys(attributes).sort()

    // Build normalized object with sorted keys
    const normalized: VariantAttributes = {}
    for (const key of sortedKeys) {
      normalized[key] = attributes[key]
    }

    return normalized
  }

  /**
   * Get canonical JSON representation of attributes
   *
   * Uses JSON.stringify with sorted keys to ensure consistent representation.
   *
   * Requirements: 24.3
   */
  private getCanonicalJson(attributes: VariantAttributes): string {
    // JSON.stringify with sorted keys (already sorted by normalizeAttributes)
    return JSON.stringify(attributes)
  }

  /**
   * Compute SHA256 hash of canonical JSON
   *
   * Requirements: 24.2
   */
  private computeAttributesHash(canonicalJson: string): string {
    return crypto.createHash("sha256").update(canonicalJson).digest("hex")
  }

  /**
   * Validate variant attributes against variant_types table
   *
   * Checks:
   * - Attribute exists in variant_types
   * - Value matches expected value_type
   * - Value is within min_value/max_value range (if applicable)
   * - Value is in allowed_values list (if applicable)
   *
   * Requirements: 16.6, 21.4, 21.5, 21.6, 28.1
   */
  async validateAttributes(
    attributes: VariantAttributes,
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = []

    // Load variant types (with caching)
    const variantTypes = await this.getVariantTypes()

    // Validate each attribute
    for (const [attributeName, attributeValue] of Object.entries(attributes)) {
      const variantType = variantTypes.get(attributeName)

      // Check if attribute type exists
      if (!variantType) {
        errors.push({
          attribute: attributeName,
          value: attributeValue,
          message: `Unknown attribute type: ${attributeName}`,
        })
        continue
      }

      // Validate value type
      const typeError = this.validateValueType(
        attributeName,
        attributeValue,
        variantType,
      )
      if (typeError) {
        errors.push(typeError)
        continue
      }

      // Validate range (for integer and decimal types)
      if (
        variantType.value_type === "integer" ||
        variantType.value_type === "decimal"
      ) {
        const rangeError = this.validateRange(
          attributeName,
          attributeValue,
          variantType,
        )
        if (rangeError) {
          errors.push(rangeError)
        }
      }

      // Validate allowed values (for enum types)
      if (variantType.value_type === "enum") {
        const enumError = this.validateEnum(
          attributeName,
          attributeValue,
          variantType,
        )
        if (enumError) {
          errors.push(enumError)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Validate that value matches expected type
   */
  private validateValueType(
    attributeName: string,
    value: any,
    variantType: DBVariantType,
  ): ValidationError | null {
    switch (variantType.value_type) {
      case "integer":
        if (!Number.isInteger(value)) {
          return {
            attribute: attributeName,
            value,
            message: `Expected integer, got ${typeof value}`,
            expected: { type: "integer" },
          }
        }
        break

      case "decimal":
        if (typeof value !== "number" || isNaN(value)) {
          return {
            attribute: attributeName,
            value,
            message: `Expected number, got ${typeof value}`,
            expected: { type: "decimal" },
          }
        }
        break

      case "string":
        if (typeof value !== "string") {
          return {
            attribute: attributeName,
            value,
            message: `Expected string, got ${typeof value}`,
            expected: { type: "string" },
          }
        }
        break

      case "enum":
        if (typeof value !== "string") {
          return {
            attribute: attributeName,
            value,
            message: `Expected string (enum value), got ${typeof value}`,
            expected: { type: "enum" },
          }
        }
        break
    }

    return null
  }

  /**
   * Validate that numeric value is within min/max range
   */
  private validateRange(
    attributeName: string,
    value: number,
    variantType: DBVariantType,
  ): ValidationError | null {
    if (variantType.min_value !== null && value < variantType.min_value) {
      return {
        attribute: attributeName,
        value,
        message: `Value ${value} is below minimum ${variantType.min_value}`,
        expected: {
          min: variantType.min_value,
          max: variantType.max_value ?? undefined,
        },
      }
    }

    if (variantType.max_value !== null && value > variantType.max_value) {
      return {
        attribute: attributeName,
        value,
        message: `Value ${value} is above maximum ${variantType.max_value}`,
        expected: {
          min: variantType.min_value ?? undefined,
          max: variantType.max_value,
        },
      }
    }

    return null
  }

  /**
   * Validate that enum value is in allowed_values list
   */
  private validateEnum(
    attributeName: string,
    value: string,
    variantType: DBVariantType,
  ): ValidationError | null {
    if (!variantType.allowed_values) {
      return null // No restriction
    }

    if (!variantType.allowed_values.includes(value)) {
      return {
        attribute: attributeName,
        value,
        message: `Value "${value}" is not in allowed values: ${variantType.allowed_values.join(", ")}`,
        expected: {
          allowed_values: variantType.allowed_values,
        },
      }
    }

    return null
  }

  /**
   * Get variant types with caching
   */
  private async getVariantTypes(): Promise<Map<string, DBVariantType>> {
    if (this.variantTypesCache) {
      return this.variantTypesCache
    }

    const types = await this.repository.getAllVariantTypes()
    this.variantTypesCache = new Map(types.map((t) => [t.name, t]))

    return this.variantTypesCache
  }

  /**
   * Clear variant types cache (useful for testing)
   */
  clearCache(): void {
    this.variantTypesCache = null
  }

  /**
   * Generate display name from attributes
   *
   * Examples:
   * - {quality_tier: 3, quality_value: 75} -> "Tier 3 (75%)"
   * - {quality_tier: 5, crafted_source: "crafted"} -> "Tier 5 (Crafted)"
   *
   * Requirements: 5.6
   */
  private generateDisplayName(attributes: VariantAttributes): string {
    const parts: string[] = []

    // Quality tier
    if (attributes.quality_tier !== undefined) {
      parts.push(`Tier ${attributes.quality_tier}`)
    }

    // Quality value
    if (attributes.quality_value !== undefined) {
      parts.push(`(${attributes.quality_value}%)`)
    }

    // Crafted source
    if (attributes.crafted_source !== undefined) {
      const sourceLabel = this.formatCraftedSource(attributes.crafted_source)
      parts.push(`(${sourceLabel})`)
    }

    // Blueprint tier
    if (attributes.blueprint_tier !== undefined) {
      parts.push(`Blueprint T${attributes.blueprint_tier}`)
    }

    // If no recognized attributes, return generic name
    if (parts.length === 0) {
      return "Standard"
    }

    return parts.join(" ")
  }

  /**
   * Generate short name from attributes
   *
   * Examples:
   * - {quality_tier: 3} -> "T3"
   * - {quality_tier: 5, crafted_source: "crafted"} -> "T5-C"
   *
   * Requirements: 5.6
   */
  private generateShortName(attributes: VariantAttributes): string {
    const parts: string[] = []

    // Quality tier
    if (attributes.quality_tier !== undefined) {
      parts.push(`T${attributes.quality_tier}`)
    }

    // Crafted source (first letter)
    if (attributes.crafted_source !== undefined) {
      const sourceCode = attributes.crafted_source.charAt(0).toUpperCase()
      parts.push(sourceCode)
    }

    // Blueprint tier
    if (attributes.blueprint_tier !== undefined) {
      parts.push(`BP${attributes.blueprint_tier}`)
    }

    // If no recognized attributes, return generic name
    if (parts.length === 0) {
      return "STD"
    }

    return parts.join("-")
  }

  /**
   * Format crafted source for display
   */
  private formatCraftedSource(source: string): string {
    switch (source) {
      case "crafted":
        return "Crafted"
      case "store":
        return "Store"
      case "looted":
        return "Looted"
      case "unknown":
        return "Unknown"
      default:
        return source.charAt(0).toUpperCase() + source.slice(1)
    }
  }
}

// Export singleton instance
export const variantService = new VariantService()
