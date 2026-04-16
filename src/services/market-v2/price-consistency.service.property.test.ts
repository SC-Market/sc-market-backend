/**
 * Property-Based Tests for Price Consistency Service
 *
 * Tests correctness properties for price snapshotting, staleness detection,
 * and price consistency across cart and orders.
 *
 * NOTE: These tests require a real database connection and are skipped in the
 * default test suite. To run these tests, set up a test database and remove
 * the .skip modifier.
 *
 * Requirements: 41.1, 41.3, 41.4, 41.7, 41.8
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { PriceConsistencyService } from "./price-consistency.service.js"

describe.skip("PriceConsistencyService - Property Tests (Integration)", () => {
  let knex: Knex
  let service: PriceConsistencyService

  beforeAll(() => {
    knex = getKnex()
    service = new PriceConsistencyService(knex)
  })

  afterAll(async () => {
    await knex.destroy()
  })

  // Helper to create test data
  async function createTestListing(
    sellerId: string,
    gameItemId: string,
    pricingMode: "unified" | "per_variant",
    basePrice?: number
  ): Promise<{ listingId: string; itemId: string }> {
    const [listing] = await knex("listings")
      .insert({
        seller_type: "user",
        seller_id: sellerId,
        title: "Test Listing",
        status: "active",
      })
      .returning("listing_id")

    const [item] = await knex("listing_items")
      .insert({
        listing_id: listing.listing_id,
        game_item_id: gameItemId,
        pricing_mode: pricingMode,
        base_price: basePrice,
      })
      .returning("item_id")

    return { listingId: listing.listing_id, itemId: item.item_id }
  }

  async function createTestVariant(
    gameItemId: string,
    qualityTier: number
  ): Promise<string> {
    const [variant] = await knex("item_variants")
      .insert({
        game_item_id: gameItemId,
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
    userId: string,
    listingId: string,
    itemId: string,
    variantId: string,
    quantity: number,
    pricePerUnit: number
  ): Promise<string> {
    const [cartItem] = await knex("cart_items_v2")
      .insert({
        user_id: userId,
        listing_id: listingId,
        item_id: itemId,
        variant_id: variantId,
        quantity,
        price_per_unit: pricePerUnit,
      })
      .returning("cart_item_id")

    return cartItem.cart_item_id
  }

  // Clean up test data
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

  /**
   * Property 5: Price Snapshot Immutability
   *
   * Validates: Requirements 41.1, 41.3
   *
   * FOR ALL cart items with price P1, WHEN listing price changes to P2,
   * THEN cart item SHALL still show P1, AND order creation SHALL use current price P2
   */
  it("Property 5: Price snapshot immutability - cart preserves old price, order uses current", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.uuid(), // sellerId
        fc.uuid(), // gameItemId
        fc.integer({ min: 1, max: 5 }), // qualityTier
        fc.integer({ min: 100, max: 10000 }), // initialPrice
        fc.integer({ min: 100, max: 10000 }), // updatedPrice
        async (userId, sellerId, gameItemId, qualityTier, initialPrice, updatedPrice) => {
          // Skip if prices are the same
          fc.pre(initialPrice !== updatedPrice)

          // Create listing with per-variant pricing
          const { listingId, itemId } = await createTestListing(
            sellerId,
            gameItemId,
            "per_variant"
          )

          // Create variant
          const variantId = await createTestVariant(gameItemId, qualityTier)

          // Set initial price
          await setVariantPrice(itemId, variantId, initialPrice)

          // Add to cart at initial price
          const cartItemId = await addToCart(
            userId,
            listingId,
            itemId,
            variantId,
            1,
            initialPrice
          )

          // Update listing price
          await knex("variant_pricing")
            .where({ item_id: itemId, variant_id: variantId })
            .update({ price: updatedPrice })

          // Verify cart item still shows old price
          const cartItem = await knex("cart_items_v2")
            .where({ cart_item_id: cartItemId })
            .first()

          expect(Number(cartItem.price_per_unit)).toBe(initialPrice)

          // Verify order creation would use current price
          const orderPrices = await service.snapshotPricesForOrder([
            { item_id: itemId, variant_id: variantId, listing_id: listingId, quantity: 1 },
          ])

          expect(orderPrices[0].price_per_unit).toBe(updatedPrice)

          // Clean up
          await cleanupTestData()
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Property 8: Price Change Detection in Cart
   *
   * Validates: Requirements 41.4, 41.8
   *
   * FOR ALL cart items, WHEN listing prices change,
   * THEN cart SHALL mark items with stale prices correctly
   */
  it("Property 8: Price change detection - cart marks stale prices correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.uuid(), // sellerId
        fc.uuid(), // gameItemId
        fc.array(
          fc.record({
            qualityTier: fc.integer({ min: 1, max: 5 }),
            initialPrice: fc.integer({ min: 100, max: 10000 }),
            updatedPrice: fc.integer({ min: 100, max: 10000 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (userId, sellerId, gameItemId, items) => {
          // Create listing with per-variant pricing
          const { listingId, itemId } = await createTestListing(
            sellerId,
            gameItemId,
            "per_variant"
          )

          // Create variants and add to cart
          for (const item of items) {
            const variantId = await createTestVariant(gameItemId, item.qualityTier)

            // Set initial price
            await setVariantPrice(itemId, variantId, item.initialPrice)

            // Add to cart
            await addToCart(userId, listingId, itemId, variantId, 1, item.initialPrice)

            // Update price if different
            if (item.initialPrice !== item.updatedPrice) {
              await knex("variant_pricing")
                .where({ item_id: itemId, variant_id: variantId })
                .update({ price: item.updatedPrice })
            }
          }

          // Check for stale prices
          const staleItems = await service.checkCartPriceStaleness(userId)

          // Verify staleness detection
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const staleItem = staleItems[i]

            const expectedStale = item.initialPrice !== item.updatedPrice
            expect(staleItem.is_stale).toBe(expectedStale)

            if (expectedStale) {
              expect(staleItem.price_per_unit).toBe(item.initialPrice)
              expect(staleItem.current_price).toBe(item.updatedPrice)

              // Verify percentage change calculation
              const expectedPercentage =
                ((item.updatedPrice - item.initialPrice) / item.initialPrice) * 100
              expect(staleItem.percentage_change).toBeCloseTo(expectedPercentage, 2)
            }
          }

          // Clean up
          await cleanupTestData()
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Property: Price Update Atomicity
   *
   * Validates: Requirements 41.7
   *
   * FOR ALL cart price updates, WHEN updateCartPrices is called,
   * THEN all stale prices SHALL be updated atomically
   */
  it("Property: Price update atomicity - all stale prices updated together", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.uuid(), // sellerId
        fc.uuid(), // gameItemId
        fc.array(
          fc.record({
            qualityTier: fc.integer({ min: 1, max: 5 }),
            initialPrice: fc.integer({ min: 100, max: 10000 }),
            updatedPrice: fc.integer({ min: 100, max: 10000 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (userId, sellerId, gameItemId, items) => {
          // Ensure at least one price change
          fc.pre(items.some((item) => item.initialPrice !== item.updatedPrice))

          // Create listing with per-variant pricing
          const { listingId, itemId } = await createTestListing(
            sellerId,
            gameItemId,
            "per_variant"
          )

          // Create variants and add to cart
          const cartItemIds: string[] = []
          for (const item of items) {
            const variantId = await createTestVariant(gameItemId, item.qualityTier)

            // Set initial price
            await setVariantPrice(itemId, variantId, item.initialPrice)

            // Add to cart
            const cartItemId = await addToCart(
              userId,
              listingId,
              itemId,
              variantId,
              1,
              item.initialPrice
            )
            cartItemIds.push(cartItemId)

            // Update price
            await knex("variant_pricing")
              .where({ item_id: itemId, variant_id: variantId })
              .update({ price: item.updatedPrice })
          }

          // Update cart prices
          const priceChanges = await service.updateCartPrices(userId)

          // Verify all stale items were updated
          const expectedChanges = items.filter(
            (item) => item.initialPrice !== item.updatedPrice
          ).length
          expect(priceChanges.length).toBe(expectedChanges)

          // Verify all cart items now have current prices
          const updatedCartItems = await knex("cart_items_v2")
            .where({ user_id: userId })
            .select("cart_item_id", "price_per_unit")

          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const cartItem = updatedCartItems.find((ci) => ci.cart_item_id === cartItemIds[i])

            expect(Number(cartItem?.price_per_unit)).toBe(item.updatedPrice)
          }

          // Clean up
          await cleanupTestData()
        }
      ),
      { numRuns: 15 }
    )
  })

  /**
   * Property: Unified Pricing Fallback
   *
   * Validates: Requirements 41.1
   *
   * FOR ALL items with unified pricing mode,
   * THEN getCurrentPrice SHALL return base_price
   */
  it("Property: Unified pricing fallback - returns base_price when no variant pricing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // sellerId
        fc.uuid(), // gameItemId
        fc.integer({ min: 1, max: 5 }), // qualityTier
        fc.integer({ min: 100, max: 10000 }), // basePrice
        async (sellerId, gameItemId, qualityTier, basePrice) => {
          // Create listing with unified pricing
          const { itemId } = await createTestListing(sellerId, gameItemId, "unified", basePrice)

          // Create variant
          const variantId = await createTestVariant(gameItemId, qualityTier)

          // Get current price (should return base_price)
          const currentPrice = await service.getCurrentPrice(itemId, variantId)

          expect(currentPrice).toBe(basePrice)

          // Clean up
          await cleanupTestData()
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Property: Per-Variant Pricing Priority
   *
   * Validates: Requirements 41.1
   *
   * FOR ALL items with per_variant pricing mode,
   * WHEN variant_pricing exists, THEN getCurrentPrice SHALL return variant price
   */
  it("Property: Per-variant pricing priority - returns variant price over base price", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // sellerId
        fc.uuid(), // gameItemId
        fc.integer({ min: 1, max: 5 }), // qualityTier
        fc.integer({ min: 100, max: 10000 }), // basePrice
        fc.integer({ min: 100, max: 10000 }), // variantPrice
        async (sellerId, gameItemId, qualityTier, basePrice, variantPrice) => {
          // Skip if prices are the same
          fc.pre(basePrice !== variantPrice)

          // Create listing with per-variant pricing
          const { itemId } = await createTestListing(
            sellerId,
            gameItemId,
            "per_variant",
            basePrice
          )

          // Create variant
          const variantId = await createTestVariant(gameItemId, qualityTier)

          // Set variant price
          await setVariantPrice(itemId, variantId, variantPrice)

          // Get current price (should return variant price, not base price)
          const currentPrice = await service.getCurrentPrice(itemId, variantId)

          expect(currentPrice).toBe(variantPrice)
          expect(currentPrice).not.toBe(basePrice)

          // Clean up
          await cleanupTestData()
        }
      ),
      { numRuns: 20 }
    )
  })
})
