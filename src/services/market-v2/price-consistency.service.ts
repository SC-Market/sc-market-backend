/**
 * Price Consistency Service
 *
 * Manages price consistency across cart, orders, and history for V2 market.
 * Handles price snapshotting, staleness detection, and price updates.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { CartItemPrice } from "./types.js"

/**
 * Price information for a variant
 */
export interface VariantPrice {
  item_id: string
  variant_id: string
  price: number
  pricing_mode: "unified" | "per_variant"
}

/**
 * Order item with price snapshot
 */
export interface OrderItemPrice {
  item_id: string
  variant_id: string
  listing_id: string
  price_per_unit: number
}

/**
 * Price change details
 */
export interface PriceChange {
  cart_item_id: string
  old_price: number
  new_price: number
  percentage_change: number
}

export class PriceConsistencyService {
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
  }

  /**
   * Get current price for a variant.
   * Checks variant_pricing table first, falls back to base_price.
   *
   * @param itemId - The listing item ID
   * @param variantId - The variant ID
   * @returns Current price for the variant
   */
  async getCurrentPrice(itemId: string, variantId: string): Promise<number> {
    // Get listing item to check pricing mode
    const listingItem = await this.knex("listing_items")
      .where({ item_id: itemId })
      .select("pricing_mode", "base_price")
      .first()

    if (!listingItem) {
      throw new Error(`Listing item not found: ${itemId}`)
    }

    // If per-variant pricing, check variant_pricing table
    if (listingItem.pricing_mode === "per_variant") {
      const variantPricing = await this.knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variantId })
        .select("price")
        .first()

      if (variantPricing) {
        return Number(variantPricing.price)
      }
    }

    // Fall back to base_price
    if (listingItem.base_price === null) {
      throw new Error(`No price found for item ${itemId}, variant ${variantId}`)
    }

    return Number(listingItem.base_price)
  }

  /**
   * Snapshot price for cart item.
   * Fetches current price and returns it for storage.
   *
   * @param itemId - The listing item ID
   * @param variantId - The variant ID
   * @returns Price to snapshot in cart
   */
  async snapshotPriceForCart(itemId: string, variantId: string): Promise<number> {
    return this.getCurrentPrice(itemId, variantId)
  }

  /**
   * Check cart items for price staleness.
   * Returns items with price changes including old/new prices and percentage change.
   *
   * @param userId - The user ID
   * @returns Array of cart items with price change information
   */
  async checkCartPriceStaleness(userId: string): Promise<CartItemPrice[]> {
    // Get all cart items for user
    const cartItems = await this.knex("cart_items_v2")
      .where({ user_id: userId })
      .select(
        "cart_item_id",
        "item_id",
        "variant_id",
        "listing_id",
        "price_per_unit",
        "price_updated_at"
      )

    const results: CartItemPrice[] = []

    for (const item of cartItems) {
      try {
        const currentPrice = await this.getCurrentPrice(item.item_id, item.variant_id)
        const oldPrice = Number(item.price_per_unit)
        const isStale = currentPrice !== oldPrice
        const percentageChange = oldPrice > 0 ? ((currentPrice - oldPrice) / oldPrice) * 100 : 0

        results.push({
          cart_item_id: item.cart_item_id,
          item_id: item.item_id,
          variant_id: item.variant_id,
          listing_id: item.listing_id,
          price_per_unit: oldPrice,
          price_updated_at: item.price_updated_at,
          current_price: currentPrice,
          is_stale: isStale,
          percentage_change: percentageChange,
        })
      } catch (error) {
        // If price lookup fails (e.g., listing deleted), mark as stale
        results.push({
          cart_item_id: item.cart_item_id,
          item_id: item.item_id,
          variant_id: item.variant_id,
          listing_id: item.listing_id,
          price_per_unit: Number(item.price_per_unit),
          price_updated_at: item.price_updated_at,
          current_price: 0,
          is_stale: true,
          percentage_change: -100,
        })
      }
    }

    return results
  }

  /**
   * Update cart prices to current values.
   * Updates price_per_unit and price_updated_at in transaction.
   *
   * @param userId - The user ID
   * @param trx - Optional transaction
   * @returns Array of price changes that were applied
   */
  async updateCartPrices(userId: string, trx?: Knex.Transaction): Promise<PriceChange[]> {
    const useTransaction = trx || this.knex

    // Get stale items
    const staleItems = await this.checkCartPriceStaleness(userId)
    const itemsToUpdate = staleItems.filter((item) => item.is_stale)

    const priceChanges: PriceChange[] = []

    for (const item of itemsToUpdate) {
      // Update cart item with new price
      await useTransaction("cart_items_v2")
        .where({ cart_item_id: item.cart_item_id })
        .update({
          price_per_unit: item.current_price,
          price_updated_at: useTransaction.fn.now(),
          updated_at: useTransaction.fn.now(),
        })

      priceChanges.push({
        cart_item_id: item.cart_item_id,
        old_price: item.price_per_unit,
        new_price: item.current_price,
        percentage_change: item.percentage_change,
      })
    }

    return priceChanges
  }

  /**
   * Snapshot prices for order creation.
   * Fetches current prices for all items before order creation.
   * Returns items with immutable price_per_unit snapshots.
   *
   * @param items - Array of items with item_id and variant_id
   * @returns Array of items with current price snapshots
   */
  async snapshotPricesForOrder(
    items: Array<{ item_id: string; variant_id: string; listing_id: string; quantity: number }>
  ): Promise<OrderItemPrice[]> {
    const results: OrderItemPrice[] = []

    for (const item of items) {
      const currentPrice = await this.getCurrentPrice(item.item_id, item.variant_id)

      results.push({
        item_id: item.item_id,
        variant_id: item.variant_id,
        listing_id: item.listing_id,
        price_per_unit: currentPrice,
      })
    }

    return results
  }
}
