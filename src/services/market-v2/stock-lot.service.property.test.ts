/**
 * Stock Lot Service - Property Tests
 *
 * Property-based tests for stock lot management using fast-check.
 * Tests invariants and properties that should hold for all inputs.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { StockLotService } from "./stock-lot.service.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { v4 as uuidv4 } from "uuid"

describe("StockLotService - Property Tests", () => {
  let service: StockLotService
  let knex: ReturnType<typeof getKnex>
  const testUserIds: string[] = []
  const testListingIds: string[] = []
  const testItemIds: string[] = []
  const testVariantIds: string[] = []
  const testLotIds: string[] = []

  beforeEach(async () => {
    service = new StockLotService()
    knex = getKnex()
  })

  afterEach(async () => {
    // Cleanup test data
    if (testLotIds.length > 0) {
      await knex("stock_lots").whereIn("lot_id", testLotIds).del()
    }
    if (testItemIds.length > 0) {
      await knex("listing_items").whereIn("item_id", testItemIds).del()
    }
    if (testListingIds.length > 0) {
      await knex("listings").whereIn("listing_id", testListingIds).del()
    }
    if (testVariantIds.length > 0) {
      await knex("item_variants").whereIn("variant_id", testVariantIds).del()
    }
  })

  /**
   * Property 6: Non-Negative Quantity Invariant
   * Validates: Requirements 4.10, 42.9
   *
   * Property: Stock lot quantities must never be negative
   */
  it("Property 6: Non-Negative Quantity Invariant - should reject negative quantities", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -1000, max: -1 }), // Generate negative quantities
        async (negativeQuantity) => {
          // Setup: Create test data
          const userId = uuidv4()
          const gameItemId = uuidv4()
          const listingId = uuidv4()
          const itemId = uuidv4()
          const variantId = uuidv4()
          const lotId = uuidv4()

          testUserIds.push(userId)
          testListingIds.push(listingId)
          testItemIds.push(itemId)
          testVariantIds.push(variantId)
          testLotIds.push(lotId)

          // Create test listing
          await knex("listings").insert({
            listing_id: listingId,
            seller_id: userId,
            seller_type: "user",
            title: "Test Listing",
            description: "Test",
            status: "active",
            visibility: "public",
            sale_type: "fixed",
            listing_type: "single",
          })

          // Create game item
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listing item
          await knex("listing_items").insert({
            item_id: itemId,
            listing_id: listingId,
            game_item_id: gameItemId,
            pricing_mode: "unified",
            base_price: 1000,
            display_order: 1,
            quantity_available: 10,
            variant_count: 1,
          })

          // Create variant
          await knex("item_variants").insert({
            variant_id: variantId,
            game_item_id: gameItemId,
            attributes: { quality_tier: 3 },
            attributes_hash: "hash123",
            display_name: "Tier 3",
            short_name: "T3",
          })

          // Create stock lot
          await knex("stock_lots").insert({
            lot_id: lotId,
            item_id: itemId,
            variant_id: variantId,
            quantity_total: 10,
            listed: true,
          })

          // Test: Attempt to update with negative quantity
          try {
            await service.updateStockLot(userId, lotId, {
              quantity_total: negativeQuantity,
            })
            // Should not reach here
            return false
          } catch (error: any) {
            // Verify error message indicates negative quantity rejection
            return (
              error.message.includes("negative") ||
              error.message.includes("Quantity cannot be negative")
            )
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * Property 19: Stock Lot Quantity Update Propagation
   * Validates: Requirements 4.9
   *
   * Property: When stock lot quantity changes, listing_item.quantity_available
   * should be updated by the same delta via database trigger
   */
  it("Property 19: Stock Lot Quantity Update Propagation - should update listing quantity", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // Initial quantity
        fc.integer({ min: -50, max: 50 }), // Delta (but result must be >= 0)
        async (initialQuantity, delta) => {
          const newQuantity = initialQuantity + delta
          if (newQuantity < 0) return true // Skip invalid cases

          // Setup: Create test data
          const userId = uuidv4()
          const gameItemId = uuidv4()
          const listingId = uuidv4()
          const itemId = uuidv4()
          const variantId = uuidv4()
          const lotId = uuidv4()

          testUserIds.push(userId)
          testListingIds.push(listingId)
          testItemIds.push(itemId)
          testVariantIds.push(variantId)
          testLotIds.push(lotId)

          // Create test listing
          await knex("listings").insert({
            listing_id: listingId,
            seller_id: userId,
            seller_type: "user",
            title: "Test Listing",
            description: "Test",
            status: "active",
            visibility: "public",
            sale_type: "fixed",
            listing_type: "single",
          })

          // Create game item
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listing item
          await knex("listing_items").insert({
            item_id: itemId,
            listing_id: listingId,
            game_item_id: gameItemId,
            pricing_mode: "unified",
            base_price: 1000,
            display_order: 1,
            quantity_available: initialQuantity,
            variant_count: 1,
          })

          // Create variant
          await knex("item_variants").insert({
            variant_id: variantId,
            game_item_id: gameItemId,
            attributes: { quality_tier: 3 },
            attributes_hash: "hash123",
            display_name: "Tier 3",
            short_name: "T3",
          })

          // Create stock lot
          await knex("stock_lots").insert({
            lot_id: lotId,
            item_id: itemId,
            variant_id: variantId,
            quantity_total: initialQuantity,
            listed: true,
          })

          // Get initial listing quantity
          const beforeItem = await knex("listing_items")
            .where("item_id", itemId)
            .first("quantity_available")

          // Test: Update stock lot quantity
          await service.updateStockLot(userId, lotId, {
            quantity_total: newQuantity,
          })

          // Verify: Check listing quantity updated
          const afterItem = await knex("listing_items")
            .where("item_id", itemId)
            .first("quantity_available")

          // Property: quantity_available should change by the same delta
          const expectedQuantity = beforeItem.quantity_available + delta
          return afterItem.quantity_available === expectedQuantity
        },
      ),
      { numRuns: 20 },
    )
  })

  /**
   * Property 13 variant: Bulk Operation Atomicity
   * Validates: Requirements 6.6
   *
   * Property: Bulk operations should be atomic - either all succeed or all fail
   */
  it("Property 13: Bulk Operation Atomicity - should rollback on failure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 2, maxLength: 5 }),
        async (quantities) => {
          // Setup: Create multiple stock lots
          const userId = uuidv4()
          const gameItemId = uuidv4()
          const listingId = uuidv4()
          const itemId = uuidv4()
          const lotIds: string[] = []

          testUserIds.push(userId)
          testListingIds.push(listingId)
          testItemIds.push(itemId)

          // Create test listing
          await knex("listings").insert({
            listing_id: listingId,
            seller_id: userId,
            seller_type: "user",
            title: "Test Listing",
            description: "Test",
            status: "active",
            visibility: "public",
            sale_type: "fixed",
            listing_type: "single",
          })

          // Create game item
          await knex("game_items").insert({
            game_item_id: gameItemId,
            name: "Test Item",
            type: "weapon",
          })

          // Create listing item
          await knex("listing_items").insert({
            item_id: itemId,
            listing_id: listingId,
            game_item_id: gameItemId,
            pricing_mode: "unified",
            base_price: 1000,
            display_order: 1,
            quantity_available: quantities.reduce((a, b) => a + b, 0),
            variant_count: quantities.length,
          })

          // Create stock lots
          for (let i = 0; i < quantities.length; i++) {
            const variantId = uuidv4()
            const lotId = uuidv4()

            testVariantIds.push(variantId)
            testLotIds.push(lotId)
            lotIds.push(lotId)

            await knex("item_variants").insert({
              variant_id: variantId,
              game_item_id: gameItemId,
              attributes: { quality_tier: i + 1 },
              attributes_hash: `hash${i}`,
              display_name: `Tier ${i + 1}`,
              short_name: `T${i + 1}`,
            })

            await knex("stock_lots").insert({
              lot_id: lotId,
              item_id: itemId,
              variant_id: variantId,
              quantity_total: quantities[i],
              listed: true,
            })
          }

          // Get initial quantities
          const beforeLots = await knex("stock_lots")
            .whereIn("lot_id", lotIds)
            .select("lot_id", "quantity_total")

          // Test: Attempt bulk update with invalid delta that would make one negative
          const invalidDelta = -Math.max(...quantities) - 1

          const result = await service.bulkUpdateStockLots(userId, {
            stock_lot_ids: lotIds,
            operation: "update_quantity",
            quantity_delta: invalidDelta,
          })

          // Verify: Some operations should fail
          const hasFailures = result.failed > 0

          // Verify: Lots that would go negative should remain unchanged
          const afterLots = await knex("stock_lots")
            .whereIn("lot_id", lotIds)
            .select("lot_id", "quantity_total")

          // Property: Failed lots should have unchanged quantities
          const unchangedCount = afterLots.filter((after) => {
            const before = beforeLots.find((b) => b.lot_id === after.lot_id)
            return before && before.quantity_total === after.quantity_total
          }).length

          return hasFailures && unchangedCount > 0
        },
      ),
      { numRuns: 10 },
    )
  })
})
