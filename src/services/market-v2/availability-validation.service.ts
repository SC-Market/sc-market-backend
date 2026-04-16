/**
 * Availability Validation Service
 *
 * Validates variant availability for cart operations and order creation.
 * Provides alternative variant suggestions when requested variants are unavailable.
 * Handles cart checkout validation with price change detection.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { InsufficientStockError } from "./errors.js"
import { CartItemPrice } from "./types.js"
import { PriceConsistencyService } from "./price-consistency.service.js"

/**
 * Validation result for cart add operation
 */
export interface CartAddValidationResult {
  valid: boolean
  error_message?: string
  alternative_variants?: AlternativeVariant[]
}

/**
 * Alternative variant suggestion
 */
export interface AlternativeVariant {
  variant_id: string
  display_name: string
  quality_tier: number
  available_quantity: number
  price: number
}

/**
 * Validation result for order creation
 */
export interface OrderCreationValidationResult {
  valid: boolean
  item_errors: ItemValidationError[]
}

/**
 * Per-item validation error
 */
export interface ItemValidationError {
  item_id: string
  variant_id: string
  error_message: string
  requested_quantity: number
  available_quantity: number
}

/**
 * Cart checkout validation result
 */
export interface CartCheckoutValidationResult {
  valid_items: ValidCartItem[]
  removed_items: RemovedCartItem[]
  price_changes: CartItemPrice[]
}

/**
 * Valid cart item for checkout
 */
export interface ValidCartItem {
  cart_item_id: string
  item_id: string
  variant_id: string
  listing_id: string
  quantity: number
  price_per_unit: number
}

/**
 * Removed cart item (unavailable)
 */
export interface RemovedCartItem {
  cart_item_id: string
  item_id: string
  variant_id: string
  reason: string
}

export class AvailabilityValidationService {
  private knex: Knex
  private priceConsistencyService: PriceConsistencyService

  constructor(knex?: Knex, priceConsistencyService?: PriceConsistencyService) {
    this.knex = knex || getKnex()
    this.priceConsistencyService = priceConsistencyService || new PriceConsistencyService(this.knex)
  }

  /**
   * Validate variant availability for cart add (non-locking check).
   * Returns validation result with error message and alternative suggestions.
   *
   * Requirements: 40.1, 40.5, 40.6, 48.1
   *
   * @param variantId - The variant to validate
   * @param quantity - The quantity to add
   * @param itemId - The listing item ID
   * @returns Validation result with alternatives if unavailable
   */
  async validateForCartAdd(
    variantId: string,
    quantity: number,
    itemId: string
  ): Promise<CartAddValidationResult> {
    // Check available quantity (non-locking)
    const result = await this.knex("listing_item_lots")
      .where({
        variant_id: variantId,
        listed: true,
      })
      .sum("quantity_total as total")
      .first()

    const availableQuantity = Number(result?.total || 0)

    if (availableQuantity >= quantity) {
      return { valid: true }
    }

    // Get alternative variants
    const alternatives = await this.getAlternativeVariants(variantId, quantity, itemId)

    return {
      valid: false,
      error_message: `Insufficient stock for this variant. Requested ${quantity}, available ${availableQuantity}.`,
      alternative_variants: alternatives,
    }
  }

  /**
   * Validate variant availability for order creation (with row locks).
   * Uses SELECT FOR UPDATE to prevent race conditions.
   * Returns validation result with per-item errors.
   *
   * Requirements: 40.2, 40.3, 40.4, 40.7, 40.8, 40.9
   *
   * @param items - Array of items to validate
   * @param trx - Transaction (required for locking)
   * @returns Validation result with per-item errors
   */
  async validateForOrderCreation(
    items: Array<{ item_id: string; variant_id: string; quantity: number }>,
    trx: Knex.Transaction
  ): Promise<OrderCreationValidationResult> {
    const itemErrors: ItemValidationError[] = []

    for (const item of items) {
      // Lock and check availability
      const availableLots = await trx("listing_item_lots")
        .where({
          variant_id: item.variant_id,
          listed: true,
        })
        .where("quantity_total", ">", 0)
        .forUpdate() // Lock rows to prevent race conditions

      const availableQuantity = availableLots.reduce((sum, lot) => sum + lot.quantity_total, 0)

      if (availableQuantity < item.quantity) {
        itemErrors.push({
          item_id: item.item_id,
          variant_id: item.variant_id,
          error_message: `Insufficient stock: requested ${item.quantity}, available ${availableQuantity}`,
          requested_quantity: item.quantity,
          available_quantity: availableQuantity,
        })
      }
    }

    return {
      valid: itemErrors.length === 0,
      item_errors: itemErrors,
    }
  }

  /**
   * Get alternative variant suggestions.
   * Finds variants with similar quality tiers (±1) and sufficient quantity.
   * Returns up to 3 suggestions with display names.
   *
   * Requirements: 40.6, 48.1, 48.7
   *
   * @param variantId - The unavailable variant
   * @param quantity - The desired quantity
   * @param itemId - The listing item ID
   * @returns Array of alternative variant suggestions (max 3)
   */
  private async getAlternativeVariants(
    variantId: string,
    quantity: number,
    itemId: string
  ): Promise<AlternativeVariant[]> {
    // Get the original variant's quality tier
    const originalVariant = await this.knex("item_variants")
      .where({ variant_id: variantId })
      .select("attributes", "game_item_id")
      .first()

    if (!originalVariant) {
      return []
    }

    const originalQualityTier = originalVariant.attributes?.quality_tier as number | undefined
    if (!originalQualityTier) {
      return []
    }

    // Find variants with similar quality tiers (±1)
    const minQualityTier = Math.max(1, originalQualityTier - 1)
    const maxQualityTier = Math.min(5, originalQualityTier + 1)

    // Get listing item to determine pricing mode
    const listingItem = await this.knex("listing_items")
      .where({ item_id: itemId })
      .select("pricing_mode", "base_price", "listing_id")
      .first()

    if (!listingItem) {
      return []
    }

    // Find alternative variants with sufficient stock
    const alternatives = await this.knex("item_variants as iv")
      .join("listing_item_lots as lil", "iv.variant_id", "lil.variant_id")
      .leftJoin("variant_pricing as vp", function (this: any) {
        this.on("vp.variant_id", "=", "iv.variant_id").andOn(
          "vp.item_id",
          "=",
          this.client.raw("?", [itemId])
        )
      })
      .where("iv.game_item_id", originalVariant.game_item_id)
      .where("iv.variant_id", "!=", variantId)
      .where("lil.listed", true)
      .where("lil.item_id", itemId)
      .whereRaw("(iv.attributes->>'quality_tier')::integer BETWEEN ? AND ?", [
        minQualityTier,
        maxQualityTier,
      ])
      .groupBy("iv.variant_id", "iv.display_name", "iv.attributes", "vp.price")
      .havingRaw("SUM(lil.quantity_total) >= ?", [quantity])
      .select(
        "iv.variant_id",
        "iv.display_name",
        "iv.attributes",
        this.knex.raw("SUM(lil.quantity_total) as available_quantity"),
        this.knex.raw("COALESCE(vp.price, ?) as price", [listingItem.base_price])
      )
      .orderByRaw("ABS((iv.attributes->>'quality_tier')::integer - ?) ASC", [originalQualityTier])
      .limit(3)

    return alternatives.map((alt) => ({
      variant_id: alt.variant_id,
      display_name: alt.display_name || `Tier ${alt.attributes.quality_tier}`,
      quality_tier: alt.attributes.quality_tier,
      available_quantity: Number(alt.available_quantity),
      price: Number(alt.price),
    }))
  }

  /**
   * Validate cart for checkout.
   * Checks availability for all cart items with locks.
   * Removes unavailable items, detects price changes.
   * Returns valid items, removed items, and price changes.
   *
   * Requirements: 16.2, 16.3, 16.8, 41.4, 41.5
   *
   * @param userId - The user ID
   * @param trx - Transaction (required for locking)
   * @returns Cart checkout validation result
   */
  async validateCartForCheckout(
    userId: string,
    trx: Knex.Transaction
  ): Promise<CartCheckoutValidationResult> {
    // Get all cart items for user
    const cartItems = await trx("cart_items_v2")
      .where({ user_id: userId })
      .select("cart_item_id", "item_id", "variant_id", "listing_id", "quantity", "price_per_unit")

    const validItems: ValidCartItem[] = []
    const removedItems: RemovedCartItem[] = []

    // Check availability for each item with locks
    for (const item of cartItems) {
      const availableLots = await trx("listing_item_lots")
        .where({
          variant_id: item.variant_id,
          item_id: item.item_id,
          listed: true,
        })
        .where("quantity_total", ">", 0)
        .forUpdate() // Lock rows

      const availableQuantity = availableLots.reduce((sum, lot) => sum + lot.quantity_total, 0)

      if (availableQuantity < item.quantity) {
        // Remove unavailable item
        await trx("cart_items_v2").where({ cart_item_id: item.cart_item_id }).delete()

        removedItems.push({
          cart_item_id: item.cart_item_id,
          item_id: item.item_id,
          variant_id: item.variant_id,
          reason: `Insufficient stock: requested ${item.quantity}, available ${availableQuantity}`,
        })
      } else {
        validItems.push({
          cart_item_id: item.cart_item_id,
          item_id: item.item_id,
          variant_id: item.variant_id,
          listing_id: item.listing_id,
          quantity: item.quantity,
          price_per_unit: Number(item.price_per_unit),
        })
      }
    }

    // Check for price changes on valid items
    const priceChanges = await this.priceConsistencyService.checkCartPriceStaleness(userId)
    const staleItems = priceChanges.filter((item) => item.is_stale)

    return {
      valid_items: validItems,
      removed_items: removedItems,
      price_changes: staleItems,
    }
  }
}
