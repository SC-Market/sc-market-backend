/**
 * Unit Tests for Price Consistency Service
 *
 * Tests specific scenarios for price snapshotting, staleness detection,
 * and price updates.
 *
 * NOTE: These tests require a real database connection and are skipped in the
 * default test suite. To run these tests, set up a test database and remove
 * the .skip modifier.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { PriceConsistencyService } from "./price-consistency.service.js"

describe.skip("PriceConsistencyService - Unit Tests (Integration)", () => {
  let knex: Knex
  let service: PriceConsistencyService

  // Test data IDs
  const testUserId = "00000000-0000-0000-0000-000000000001"
  const testSellerId = "00000000-0000-0000-0000-000000000002"
  const testGameItemId = "00000000-0000-0000-0000-000000000003"

  beforeAll(() => {
    knex = getKnex()
    service = new PriceConsistencyService(knex)
  })

  afterAll(async () => {
    await knex.destroy()
  })

  // Helper functions
  async function createTestListing(
    pricingMode: "unified" | "per_variant",
    basePrice?: number
  ): Promise<{ listingId: string; itemId: string }> {
    const [listing] = await knex("listings")
      .insert({
        seller_type: "user",
        seller_id: testSellerId,
        title: "Test Listing",
        status: "active",
      })
      .returning("listing_id")

    const [item] = await knex("listing_items")
      .insert({
        listing_id: listing.listing_id,
        game_item_id: testGameItemId,
        pricing_mode: pricingMode,
        base_price: basePrice,
      })
      .returning("item_id")

    return { listingId: listing.listing_id, itemId: item.item_id }
  }

  async function createTestVariant(qualityTier: number): Promise<string> {
    const [variant] = await knex("item_variants")
      .insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({ quality_tier: qualityTier }),
        display_name: `Tier ${qualityTier}`,
        short_name: `T${qualityTier}`,
      })
      .returning("variant_id")

    return variant.variant_id
  }

  async function setVariantPrice(
    itemId: string,
    variantId: string,
    price: number
  ): Promise<void> {
    await knex("variant_pricing").insert({
      item_id: itemId,
      variant_id: variantId,
      price,
    })
  }

  async function addToCart(
    itemId: string,
    variantId: string,
    listingId: string,
    quantity: number,
    pricePerUnit: number
  ): Promise<string> {
    const [cartItem] = await knex("cart_items_v2")
      .insert({
        user_id: testUserId,
        listing_id: listingId,
        item_id: itemId,
        variant_id: variantId,
        quantity,
        price_per_unit: pricePerUnit,
      })
      .returning("cart_item_id")

    return cartItem.cart_item_id
  }

  async function cleanupTestData(): Promise<void> {
    await knex("cart_items_v2").del()
    await knex("variant_pricing").del()
    await knex("listing_item_lots").del()
    await knex("listing_items").del()
    await knex("listings").del()
    await knex("item_variants").del()
  }

  beforeEach(async () => {
    await cleanupTestData()
  })

  afterEach(async () => {
    await cleanupTestData()
  })

  describe("getCurrentPrice", () => {
    it("should return base_price for unified pricing mode", async () => {
      const basePrice = 5000
      const { itemId } = await createTestListing("unified", basePrice)
      const variantId = await createTestVariant(3)

      const price = await service.getCurrentPrice(itemId, variantId)

      expect(price).toBe(basePrice)
    })

    it("should return variant price for per_variant pricing mode", async () => {
      const basePrice = 5000
      const variantPrice = 7500
      const { itemId } = await createTestListing("per_variant", basePrice)
      const variantId = await createTestVariant(4)

      await setVariantPrice(itemId, variantId, variantPrice)

      const price = await service.getCurrentPrice(itemId, variantId)

      expect(price).toBe(variantPrice)
    })

    it("should fall back to base_price when variant pricing not found", async () => {
      const basePrice = 5000
      const { itemId } = await createTestListing("per_variant", basePrice)
      const variantId = await createTestVariant(2)

      // No variant pricing set, should fall back to base_price
      const price = await service.getCurrentPrice(itemId, variantId)

      expect(price).toBe(basePrice)
    })

    it("should throw error when item not found", async () => {
      const fakeItemId = "00000000-0000-0000-0000-000000000099"
      const variantId = await createTestVariant(3)

      await expect(service.getCurrentPrice(fakeItemId, variantId)).rejects.toThrow(
        "Listing item not found"
      )
    })

    it("should throw error when no price available", async () => {
      const { itemId } = await createTestListing("unified", null)
      const variantId = await createTestVariant(3)

      await expect(service.getCurrentPrice(itemId, variantId)).rejects.toThrow(
        "No price found for item"
      )
    })
  })

  describe("snapshotPriceForCart", () => {
    it("should return current price for cart snapshot", async () => {
      const variantPrice = 6000
      const { itemId } = await createTestListing("per_variant")
      const variantId = await createTestVariant(3)

      await setVariantPrice(itemId, variantId, variantPrice)

      const snapshotPrice = await service.snapshotPriceForCart(itemId, variantId)

      expect(snapshotPrice).toBe(variantPrice)
    })
  })

  describe("checkCartPriceStaleness", () => {
    it("should detect no stale prices when prices unchanged", async () => {
      const price = 5000
      const { listingId, itemId } = await createTestListing("unified", price)
      const variantId = await createTestVariant(3)

      await addToCart(itemId, variantId, listingId, 1, price)

      const staleItems = await service.checkCartPriceStaleness(testUserId)

      expect(staleItems).toHaveLength(1)
      expect(staleItems[0].is_stale).toBe(false)
      expect(staleItems[0].price_per_unit).toBe(price)
      expect(staleItems[0].current_price).toBe(price)
      expect(staleItems[0].percentage_change).toBe(0)
    })

    it("should detect stale prices when listing price increases", async () => {
      const oldPrice = 5000
      const newPrice = 7500
      const { listingId, itemId } = await createTestListing("per_variant")
      const variantId = await createTestVariant(3)

      await setVariantPrice(itemId, variantId, oldPrice)
      await addToCart(itemId, variantId, listingId, 1, oldPrice)

      // Update price
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variantId })
        .update({ price: newPrice })

      const staleItems = await service.checkCartPriceStaleness(testUserId)

      expect(staleItems).toHaveLength(1)
      expect(staleItems[0].is_stale).toBe(true)
      expect(staleItems[0].price_per_unit).toBe(oldPrice)
      expect(staleItems[0].current_price).toBe(newPrice)
      expect(staleItems[0].percentage_change).toBeCloseTo(50, 2) // 50% increase
    })

    it("should detect stale prices when listing price decreases", async () => {
      const oldPrice = 10000
      const newPrice = 7500
      const { listingId, itemId } = await createTestListing("per_variant")
      const variantId = await createTestVariant(4)

      await setVariantPrice(itemId, variantId, oldPrice)
      await addToCart(itemId, variantId, listingId, 1, oldPrice)

      // Update price
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variantId })
        .update({ price: newPrice })

      const staleItems = await service.checkCartPriceStaleness(testUserId)

      expect(staleItems).toHaveLength(1)
      expect(staleItems[0].is_stale).toBe(true)
      expect(staleItems[0].price_per_unit).toBe(oldPrice)
      expect(staleItems[0].current_price).toBe(newPrice)
      expect(staleItems[0].percentage_change).toBeCloseTo(-25, 2) // 25% decrease
    })

    it("should handle multiple cart items with mixed staleness", async () => {
      const { listingId, itemId } = await createTestListing("per_variant")

      // Item 1: Price unchanged
      const variant1 = await createTestVariant(2)
      await setVariantPrice(itemId, variant1, 3000)
      await addToCart(itemId, variant1, listingId, 1, 3000)

      // Item 2: Price increased
      const variant2 = await createTestVariant(4)
      await setVariantPrice(itemId, variant2, 5000)
      await addToCart(itemId, variant2, listingId, 1, 5000)
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variant2 })
        .update({ price: 6000 })

      // Item 3: Price decreased
      const variant3 = await createTestVariant(5)
      await setVariantPrice(itemId, variant3, 10000)
      await addToCart(itemId, variant3, listingId, 1, 10000)
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variant3 })
        .update({ price: 8000 })

      const staleItems = await service.checkCartPriceStaleness(testUserId)

      expect(staleItems).toHaveLength(3)

      // Item 1: Not stale
      expect(staleItems[0].is_stale).toBe(false)

      // Item 2: Stale (increased)
      expect(staleItems[1].is_stale).toBe(true)
      expect(staleItems[1].current_price).toBe(6000)

      // Item 3: Stale (decreased)
      expect(staleItems[2].is_stale).toBe(true)
      expect(staleItems[2].current_price).toBe(8000)
    })

    it("should mark item as stale when listing is deleted", async () => {
      const price = 5000
      const { listingId, itemId } = await createTestListing("unified", price)
      const variantId = await createTestVariant(3)

      await addToCart(itemId, variantId, listingId, 1, price)

      // Delete listing (cascades to listing_items)
      await knex("listings").where({ listing_id: listingId }).del()

      const staleItems = await service.checkCartPriceStaleness(testUserId)

      expect(staleItems).toHaveLength(0) // Cart item deleted due to cascade
    })
  })

  describe("updateCartPrices", () => {
    it("should update stale prices to current values", async () => {
      const oldPrice = 5000
      const newPrice = 7500
      const { listingId, itemId } = await createTestListing("per_variant")
      const variantId = await createTestVariant(3)

      await setVariantPrice(itemId, variantId, oldPrice)
      const cartItemId = await addToCart(itemId, variantId, listingId, 1, oldPrice)

      // Update price
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variantId })
        .update({ price: newPrice })

      const priceChanges = await service.updateCartPrices(testUserId)

      expect(priceChanges).toHaveLength(1)
      expect(priceChanges[0].cart_item_id).toBe(cartItemId)
      expect(priceChanges[0].old_price).toBe(oldPrice)
      expect(priceChanges[0].new_price).toBe(newPrice)
      expect(priceChanges[0].percentage_change).toBeCloseTo(50, 2)

      // Verify cart item updated
      const cartItem = await knex("cart_items_v2")
        .where({ cart_item_id: cartItemId })
        .first()

      expect(Number(cartItem.price_per_unit)).toBe(newPrice)
    })

    it("should not update prices when no stale items", async () => {
      const price = 5000
      const { listingId, itemId } = await createTestListing("unified", price)
      const variantId = await createTestVariant(3)

      await addToCart(itemId, variantId, listingId, 1, price)

      const priceChanges = await service.updateCartPrices(testUserId)

      expect(priceChanges).toHaveLength(0)
    })

    it("should update multiple stale items", async () => {
      const { listingId, itemId } = await createTestListing("per_variant")

      // Item 1: Price increased
      const variant1 = await createTestVariant(3)
      await setVariantPrice(itemId, variant1, 5000)
      await addToCart(itemId, variant1, listingId, 1, 5000)
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variant1 })
        .update({ price: 6000 })

      // Item 2: Price decreased
      const variant2 = await createTestVariant(4)
      await setVariantPrice(itemId, variant2, 10000)
      await addToCart(itemId, variant2, listingId, 1, 10000)
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variant2 })
        .update({ price: 8000 })

      const priceChanges = await service.updateCartPrices(testUserId)

      expect(priceChanges).toHaveLength(2)

      // Verify both items updated
      const cartItems = await knex("cart_items_v2")
        .where({ user_id: testUserId })
        .orderBy("created_at", "asc")

      expect(Number(cartItems[0].price_per_unit)).toBe(6000)
      expect(Number(cartItems[1].price_per_unit)).toBe(8000)
    })

    it("should update price_updated_at timestamp", async () => {
      const oldPrice = 5000
      const newPrice = 7500
      const { listingId, itemId } = await createTestListing("per_variant")
      const variantId = await createTestVariant(3)

      await setVariantPrice(itemId, variantId, oldPrice)
      const cartItemId = await addToCart(itemId, variantId, listingId, 1, oldPrice)

      // Get original timestamp
      const originalItem = await knex("cart_items_v2")
        .where({ cart_item_id: cartItemId })
        .first()

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Update price
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variantId })
        .update({ price: newPrice })

      await service.updateCartPrices(testUserId)

      // Verify timestamp updated
      const updatedItem = await knex("cart_items_v2")
        .where({ cart_item_id: cartItemId })
        .first()

      expect(updatedItem.price_updated_at.getTime()).toBeGreaterThan(
        originalItem.price_updated_at.getTime()
      )
    })
  })

  describe("snapshotPricesForOrder", () => {
    it("should snapshot current prices for order items", async () => {
      const { listingId, itemId } = await createTestListing("per_variant")

      const variant1 = await createTestVariant(3)
      await setVariantPrice(itemId, variant1, 5000)

      const variant2 = await createTestVariant(4)
      await setVariantPrice(itemId, variant2, 7500)

      const orderPrices = await service.snapshotPricesForOrder([
        { item_id: itemId, variant_id: variant1, listing_id: listingId, quantity: 1 },
        { item_id: itemId, variant_id: variant2, listing_id: listingId, quantity: 2 },
      ])

      expect(orderPrices).toHaveLength(2)
      expect(orderPrices[0].price_per_unit).toBe(5000)
      expect(orderPrices[1].price_per_unit).toBe(7500)
    })

    it("should use current prices even if cart has stale prices", async () => {
      const oldPrice = 5000
      const newPrice = 7500
      const { listingId, itemId } = await createTestListing("per_variant")
      const variantId = await createTestVariant(3)

      await setVariantPrice(itemId, variantId, oldPrice)
      await addToCart(itemId, variantId, listingId, 1, oldPrice)

      // Update price
      await knex("variant_pricing")
        .where({ item_id: itemId, variant_id: variantId })
        .update({ price: newPrice })

      // Snapshot for order should use new price
      const orderPrices = await service.snapshotPricesForOrder([
        { item_id: itemId, variant_id: variantId, listing_id: listingId, quantity: 1 },
      ])

      expect(orderPrices[0].price_per_unit).toBe(newPrice)
    })

    it("should handle unified pricing mode", async () => {
      const basePrice = 5000
      const { listingId, itemId } = await createTestListing("unified", basePrice)
      const variantId = await createTestVariant(3)

      const orderPrices = await service.snapshotPricesForOrder([
        { item_id: itemId, variant_id: variantId, listing_id: listingId, quantity: 1 },
      ])

      expect(orderPrices[0].price_per_unit).toBe(basePrice)
    })
  })
})
