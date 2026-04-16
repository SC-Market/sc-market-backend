/**
 * Property tests for StockAllocationService
 *
 * These tests validate FIFO allocation order, allocation correctness, and
 * concurrent purchase prevention using property-based testing with fast-check.
 *
 * NOTE: These tests require a real database connection and are skipped in the
 * default test suite. To run these tests, set up a test database and remove
 * the .skip modifier.
 *
 * Requirements: 42.1, 42.2, 42.4, 40.3
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { StockAllocationService } from "./stock-allocation.service.js"
import { InsufficientStockError } from "./errors.js"
import { getKnex } from "../../clients/database/knex-db.js"
import type { Knex } from "knex"

describe.skip("StockAllocationService - Property Tests (Integration)", () => {
  let knex: Knex
  let service: StockAllocationService
  let testGameItemId: string
  let testVariantId: string
  let testItemId: string
  let testListingId: string

  beforeEach(async () => {
    knex = getKnex()
    service = new StockAllocationService(knex)

    // Create test data
    testGameItemId = "11111111-1111-1111-1111-111111111111"

    // Create a test listing
    const [listing] = await knex("listings")
      .insert({
        seller_id: "22222222-2222-2222-2222-222222222222",
        seller_type: "user",
        title: "Test Listing",
        status: "active",
      })
      .returning("*")
    testListingId = listing.listing_id

    // Create a test variant
    const [variant] = await knex("item_variants")
      .insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({ quality_tier: 3 }),
        display_name: "Tier 3",
        short_name: "T3",
      })
      .returning("*")
    testVariantId = variant.variant_id

    // Create a test listing item
    const [item] = await knex("listing_items")
      .insert({
        listing_id: testListingId,
        game_item_id: testGameItemId,
        pricing_mode: "unified",
        base_price: 1000,
      })
      .returning("*")
    testItemId = item.item_id
  })

  afterEach(async () => {
    // Clean up test data
    await knex("listing_item_lots").where({ variant_id: testVariantId }).del()
    await knex("listing_items").where({ item_id: testItemId }).del()
    await knex("item_variants").where({ variant_id: testVariantId }).del()
    await knex("listings").where({ listing_id: testListingId }).del()
  })

  /**
   * Property 7: FIFO Stock Allocation Order
   * Validates: Requirements 42.2
   *
   * FOR ALL stock lots with different created_at timestamps,
   * WHEN allocating stock,
   * THEN oldest lots SHALL be allocated first (FIFO order)
   */
  describe("Property 7: FIFO Stock Allocation Order", () => {
    it("should allocate from oldest lots first regardless of quantity", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 2-5 stock lots with different quantities and timestamps
          fc
            .array(
              fc.record({
                quantity: fc.integer({ min: 10, max: 100 }),
                daysAgo: fc.integer({ min: 1, max: 30 }),
              }),
              { minLength: 2, maxLength: 5 }
            )
            .map((lots) => {
              // Sort by daysAgo to ensure unique timestamps
              return lots.sort((a, b) => b.daysAgo - a.daysAgo)
            }),
          async (lotConfigs) => {
            // Create stock lots with different timestamps
            const createdLots = []
            for (const config of lotConfigs) {
              const createdAt = new Date()
              createdAt.setDate(createdAt.getDate() - config.daysAgo)

              const [lot] = await knex("listing_item_lots")
                .insert({
                  item_id: testItemId,
                  variant_id: testVariantId,
                  quantity_total: config.quantity,
                  listed: true,
                  created_at: createdAt,
                })
                .returning("*")

              createdLots.push({ ...lot, expectedOrder: config.daysAgo })
            }

            // Sort by created_at to get expected FIFO order
            const expectedOrder = createdLots
              .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
              .map((lot) => lot.lot_id)

            // Calculate total available
            const totalAvailable = lotConfigs.reduce((sum, lot) => sum + lot.quantity, 0)

            // Allocate a quantity that requires multiple lots
            const quantityToAllocate = Math.min(
              Math.floor(totalAvailable * 0.8),
              totalAvailable - 1
            )

            const result = await service.allocateStock(testVariantId, quantityToAllocate)

            // Verify allocations follow FIFO order
            const actualOrder = result.allocations.map((alloc) => alloc.lot_id)

            // The actual order should be a prefix of the expected order
            // (we may not use all lots if we don't need them)
            for (let i = 0; i < actualOrder.length; i++) {
              expect(actualOrder[i]).toBe(expectedOrder[i])
            }

            // Clean up
            await knex("listing_item_lots").where({ variant_id: testVariantId }).del()
          }
        ),
        { numRuns: 10 } // Run 10 random test cases
      )
    })
  })

  /**
   * Property 4: Stock Allocation Correctness
   * Validates: Requirements 42.1, 42.4
   *
   * FOR ALL orders with quantity Q for variant V,
   * WHEN stock is allocated,
   * THEN sum of allocated stock lots SHALL equal Q
   * AND all stock lots SHALL have variant_id = V
   */
  describe("Property 4: Stock Allocation Correctness", () => {
    it("should allocate exact quantity from correct variant", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random stock lots
          fc.array(
            fc.record({
              quantity: fc.integer({ min: 10, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          // Generate random quantity to allocate
          fc.integer({ min: 1, max: 200 }),
          async (lotConfigs, requestedQuantity) => {
            // Create stock lots
            for (const config of lotConfigs) {
              await knex("listing_item_lots").insert({
                item_id: testItemId,
                variant_id: testVariantId,
                quantity_total: config.quantity,
                listed: true,
              })
            }

            const totalAvailable = lotConfigs.reduce((sum, lot) => sum + lot.quantity, 0)

            try {
              const result = await service.allocateStock(testVariantId, requestedQuantity)

              // Verify total allocated equals requested
              expect(result.total_allocated).toBe(requestedQuantity)

              // Verify sum of allocations equals requested
              const sumAllocated = result.allocations.reduce(
                (sum, alloc) => sum + alloc.quantity_allocated,
                0
              )
              expect(sumAllocated).toBe(requestedQuantity)

              // Verify all allocations are for the correct variant
              result.allocations.forEach((alloc) => {
                expect(alloc.variant_id).toBe(testVariantId)
              })
            } catch (error) {
              // If allocation fails, it should be because of insufficient stock
              if (error instanceof InsufficientStockError) {
                expect(requestedQuantity).toBeGreaterThan(totalAvailable)
              } else {
                throw error
              }
            }

            // Clean up
            await knex("listing_item_lots").where({ variant_id: testVariantId }).del()
          }
        ),
        { numRuns: 20 } // Run 20 random test cases
      )
    })
  })

  /**
   * Property 13: Concurrent Purchase Prevention
   * Validates: Requirements 40.3
   *
   * FOR ALL concurrent order attempts exceeding availability,
   * WHEN multiple orders try to allocate the same stock,
   * THEN at least one order SHALL fail with InsufficientStockError
   */
  describe("Property 13: Concurrent Purchase Prevention", () => {
    it("should prevent overselling with concurrent allocations", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate stock quantity
          fc.integer({ min: 50, max: 100 }),
          // Generate number of concurrent orders
          fc.integer({ min: 2, max: 5 }),
          async (stockQuantity, numOrders) => {
            // Create a single stock lot
            await knex("listing_item_lots").insert({
              item_id: testItemId,
              variant_id: testVariantId,
              quantity_total: stockQuantity,
              listed: true,
            })

            // Each order tries to allocate more than half the stock
            // This ensures total demand exceeds supply
            const quantityPerOrder = Math.ceil(stockQuantity * 0.6)

            // Attempt concurrent allocations
            const allocationPromises = Array(numOrders)
              .fill(null)
              .map(() =>
                knex.transaction(async (trx) => {
                  return service.allocateStock(testVariantId, quantityPerOrder, trx)
                })
              )

            const results = await Promise.allSettled(allocationPromises)

            // Count successes and failures
            const successes = results.filter((r) => r.status === "fulfilled")
            const failures = results.filter(
              (r) =>
                r.status === "rejected" &&
                r.reason instanceof InsufficientStockError
            )

            // At least one should fail (since total demand > supply)
            expect(failures.length).toBeGreaterThan(0)

            // Total allocated should not exceed available stock
            const totalAllocated = successes.reduce((sum, result) => {
              if (result.status === "fulfilled") {
                return sum + result.value.total_allocated
              }
              return sum
            }, 0)

            expect(totalAllocated).toBeLessThanOrEqual(stockQuantity)

            // Clean up
            await knex("listing_item_lots").where({ variant_id: testVariantId }).del()
          }
        ),
        { numRuns: 10 } // Run 10 random test cases
      )
    })
  })
})
