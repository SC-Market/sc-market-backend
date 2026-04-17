/**
 * Stock Lots V2 Controller Tests
 *
 * Unit tests for the StockLotsV2Controller.
 * Tests stock lot retrieval, updates, and bulk operations.
 *
 * Requirements: 20.1-20.12, 22.1-22.10
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { StockLotsV2Controller } from "./StockLotsV2Controller.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { Knex } from "knex"

describe("StockLotsV2Controller", () => {
  let controller: StockLotsV2Controller
  let knex: Knex
  let testUserId: string
  let testListingId: string
  let testItemId: string
  let testVariantId: string
  let testLotId: string
  let testGameItemId: string

  beforeEach(async () => {
    knex = getKnex()
    controller = new StockLotsV2Controller()

    // Generate test IDs
    testUserId = "00000000-0000-0000-0000-000000000001"
    testListingId = "00000000-0000-0000-0000-000000000002"
    testItemId = "00000000-0000-0000-0000-000000000003"
    testVariantId = "00000000-0000-0000-0000-000000000004"
    testLotId = "00000000-0000-0000-0000-000000000005"
    testGameItemId = "00000000-0000-0000-0000-000000000006"

    // Create test data
    await knex("listings").insert({
      listing_id: testListingId,
      seller_id: testUserId,
      seller_type: "user",
      title: "Test Listing",
      description: "Test Description",
      status: "active",
    })

    await knex("listing_items").insert({
      item_id: testItemId,
      listing_id: testListingId,
      game_item_id: testGameItemId,
      pricing_mode: "unified",
      base_price: 1000,
    })

    await knex("item_variants").insert({
      variant_id: testVariantId,
      game_item_id: testGameItemId,
      attributes: JSON.stringify({ quality_tier: 5 }),
      display_name: "Tier 5",
      short_name: "T5",
    })

    await knex("listing_item_lots").insert({
      lot_id: testLotId,
      item_id: testItemId,
      variant_id: testVariantId,
      quantity_total: 100,
      listed: true,
    })
  })

  afterEach(async () => {
    // Clean up test data in reverse order of dependencies
    await knex("listing_item_lots").where({ lot_id: testLotId }).del()
    await knex("item_variants").where({ variant_id: testVariantId }).del()
    await knex("listing_items").where({ item_id: testItemId }).del()
    await knex("listings").where({ listing_id: testListingId }).del()
  })

  describe("getStockLots", () => {
    it("should fetch stock lots with filters", async () => {
      // Requirement 20.1: GET /api/v2/stock-lots endpoint
      const response = await controller.getStockLots(
        testListingId, // listing_id
        undefined, // game_item_id
        undefined, // location_id
        true, // listed
        undefined, // variant_id
        undefined, // quality_tier_min
        undefined, // quality_tier_max
        1, // page
        20, // page_size
      )

      expect(response.lots).toBeDefined()
      expect(response.lots.length).toBeGreaterThan(0)
      expect(response.total).toBeGreaterThan(0)
      expect(response.page).toBe(1)
      expect(response.page_size).toBe(20)

      // Requirement 20.8: Return array of stock lots with variant information
      const lot = response.lots[0]
      expect(lot.lot_id).toBe(testLotId)
      expect(lot.variant).toBeDefined()
      expect(lot.variant.variant_id).toBe(testVariantId)
      expect(lot.variant.attributes).toBeDefined()
      expect(lot.quantity_total).toBe(100)
      expect(lot.listed).toBe(true)
    })

    it("should filter by quality tier range", async () => {
      // Requirement 20.7: Accept quality_tier_min and quality_tier_max filter parameters
      const response = await controller.getStockLots(
        undefined, // listing_id
        undefined, // game_item_id
        undefined, // location_id
        undefined, // listed
        undefined, // variant_id
        5, // quality_tier_min
        5, // quality_tier_max
        1, // page
        20, // page_size
      )

      expect(response.lots).toBeDefined()
      expect(response.lots.length).toBeGreaterThan(0)

      // All lots should have quality_tier = 5
      for (const lot of response.lots) {
        expect(lot.variant.attributes.quality_tier).toBe(5)
      }
    })

    it("should validate quality tier range", async () => {
      // Requirement 20.7: Validate quality tier range
      await expect(
        controller.getStockLots(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          6, // Invalid: > 5
          5,
          1,
          20,
        ),
      ).rejects.toThrow()
    })

    it("should support pagination", async () => {
      // Requirement 20.10: Support pagination with page and page_size parameters
      const response = await controller.getStockLots(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1, // page
        10, // page_size
      )

      expect(response.page).toBe(1)
      expect(response.page_size).toBe(10)
      expect(response.lots.length).toBeLessThanOrEqual(10)
    })
  })

  describe("updateStockLot", () => {
    it("should update stock lot quantity", async () => {
      // Requirement 20.2: Accept quantity_total update
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      const response = await controller.updateStockLot(
        testLotId,
        { quantity_total: 50 },
        mockRequest,
      )

      expect(response.lot).toBeDefined()
      expect(response.lot.lot_id).toBe(testLotId)
      expect(response.lot.quantity_total).toBe(50)
    })

    it("should update stock lot listed status", async () => {
      // Requirement 20.3: Accept listed status update
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      const response = await controller.updateStockLot(
        testLotId,
        { listed: false },
        mockRequest,
      )

      expect(response.lot).toBeDefined()
      expect(response.lot.listed).toBe(false)
    })

    it("should prevent negative quantities", async () => {
      // Requirement 20.8: Prevent negative quantities
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      await expect(
        controller.updateStockLot(testLotId, { quantity_total: -10 }, mockRequest),
      ).rejects.toThrow()
    })

    it("should validate notes length", async () => {
      // Requirement 20.11: Validate notes length (max 1000 characters)
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      const longNotes = "a".repeat(1001)

      await expect(
        controller.updateStockLot(testLotId, { notes: longNotes }, mockRequest),
      ).rejects.toThrow()
    })

    it("should verify ownership before updates", async () => {
      // Requirement 20.6: Verify ownership before updates
      const differentUserId = "00000000-0000-0000-0000-000000000099"
      const mockRequest = {
        user: { userId: differentUserId },
      } as any

      await expect(
        controller.updateStockLot(testLotId, { quantity_total: 50 }, mockRequest),
      ).rejects.toThrow()
    })
  })

  describe("bulkUpdateStockLots", () => {
    it("should perform bulk updates", async () => {
      // Requirement 22.1: POST /api/v2/stock-lots/bulk-update endpoint
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      const response = await controller.bulkUpdateStockLots(
        {
          updates: [
            {
              lot_id: testLotId,
              quantity_total: 75,
              listed: true,
            },
          ],
        },
        mockRequest,
      )

      expect(response.results).toBeDefined()
      expect(response.results.length).toBe(1)
      expect(response.success_count).toBe(1)
      expect(response.failure_count).toBe(0)

      // Verify the update was applied
      const lot = await knex("listing_item_lots")
        .where({ lot_id: testLotId })
        .first()
      expect(lot.quantity_total).toBe(75)
    })

    it("should validate ownership for all lots in batch", async () => {
      // Requirement 22.8: Validate ownership for all stock lots in batch
      const differentUserId = "00000000-0000-0000-0000-000000000099"
      const mockRequest = {
        user: { userId: differentUserId },
      } as any

      const response = await controller.bulkUpdateStockLots(
        {
          updates: [
            {
              lot_id: testLotId,
              quantity_total: 75,
            },
          ],
        },
        mockRequest,
      )

      expect(response.results).toBeDefined()
      expect(response.results.length).toBe(1)
      expect(response.results[0].success).toBe(false)
      expect(response.failure_count).toBe(1)
    })

    it("should return summary of successful and failed operations", async () => {
      // Requirement 22.7: Return summary of successful and failed operations
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      const nonExistentLotId = "00000000-0000-0000-0000-000000000999"

      const response = await controller.bulkUpdateStockLots(
        {
          updates: [
            {
              lot_id: testLotId,
              quantity_total: 75,
            },
            {
              lot_id: nonExistentLotId,
              quantity_total: 50,
            },
          ],
        },
        mockRequest,
      )

      expect(response.results.length).toBe(2)
      expect(response.success_count).toBe(1)
      expect(response.failure_count).toBe(1)

      // First update should succeed
      expect(response.results[0].success).toBe(true)

      // Second update should fail
      expect(response.results[1].success).toBe(false)
      expect(response.results[1].error).toBeDefined()
    })

    it("should support bulk quantity updates", async () => {
      // Requirement 22.3: Support bulk quantity updates
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      const response = await controller.bulkUpdateStockLots(
        {
          updates: [
            {
              lot_id: testLotId,
              quantity_total: 200,
            },
          ],
        },
        mockRequest,
      )

      expect(response.success_count).toBe(1)

      // Verify the update
      const lot = await knex("listing_item_lots")
        .where({ lot_id: testLotId })
        .first()
      expect(lot.quantity_total).toBe(200)
    })

    it("should support bulk listing/unlisting operations", async () => {
      // Requirement 22.4: Support bulk listing/unlisting operations
      const mockRequest = {
        user: { userId: testUserId },
      } as any

      const response = await controller.bulkUpdateStockLots(
        {
          updates: [
            {
              lot_id: testLotId,
              listed: false,
            },
          ],
        },
        mockRequest,
      )

      expect(response.success_count).toBe(1)

      // Verify the update
      const lot = await knex("listing_item_lots")
        .where({ lot_id: testLotId })
        .first()
      expect(lot.listed).toBe(false)
    })
  })
})
