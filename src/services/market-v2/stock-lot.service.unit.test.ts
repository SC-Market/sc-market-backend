/**
 * Stock Lot Service - Unit Tests
 *
 * Unit tests for stock lot management service.
 * Tests individual methods with mocked dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { StockLotService } from "./stock-lot.service.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { v4 as uuidv4 } from "uuid"

describe("StockLotService - Unit Tests", () => {
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

  describe("getStockLots", () => {
    it("should return empty array when user has no stock lots", async () => {
      const userId = uuidv4()
      testUserIds.push(userId)

      const result = await service.getStockLots(userId, {
        page: 1,
        page_size: 20,
      })

      expect(result.stock_lots).toEqual([])
      expect(result.total).toBe(0)
    })
  })
})

    it("should return stock lots with variant details", async () => {
      // Setup test data
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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

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

      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3, quality_value: 75 },
        attributes_hash: "hash123",
        display_name: "Tier 3 (75%)",
        short_name: "T3",
      })

      await knex("stock_lots").insert({
        lot_id: lotId,
        item_id: itemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
        notes: "Test notes",
      })

      const result = await service.getStockLots(userId, {
        page: 1,
        page_size: 20,
      })

      expect(result.stock_lots).toHaveLength(1)
      expect(result.stock_lots[0].lot_id).toBe(lotId)
      expect(result.stock_lots[0].quantity_total).toBe(10)
      expect(result.stock_lots[0].variant.quality_tier).toBe(3)
      expect(result.stock_lots[0].game_item.name).toBe("Test Weapon")
    })

    it("should filter by quality tier range", async () => {
      // Setup test data with multiple quality tiers
      const userId = uuidv4()
      const gameItemId = uuidv4()
      const listingId = uuidv4()
      const itemId = uuidv4()

      testUserIds.push(userId)
      testListingIds.push(listingId)
      testItemIds.push(itemId)

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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      await knex("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        display_order: 1,
        quantity_available: 30,
        variant_count: 3,
      })

      // Create 3 variants with different quality tiers
      for (let tier = 1; tier <= 3; tier++) {
        const variantId = uuidv4()
        const lotId = uuidv4()

        testVariantIds.push(variantId)
        testLotIds.push(lotId)

        await knex("item_variants").insert({
          variant_id: variantId,
          game_item_id: gameItemId,
          attributes: { quality_tier: tier },
          attributes_hash: `hash${tier}`,
          display_name: `Tier ${tier}`,
          short_name: `T${tier}`,
        })

        await knex("stock_lots").insert({
          lot_id: lotId,
          item_id: itemId,
          variant_id: variantId,
          quantity_total: 10,
          listed: true,
        })
      }

      // Filter for quality tier 2-3
      const result = await service.getStockLots(userId, {
        quality_tier_min: 2,
        quality_tier_max: 3,
        page: 1,
        page_size: 20,
      })

      expect(result.stock_lots).toHaveLength(2)
      expect(result.stock_lots.every((lot) => lot.variant.quality_tier >= 2)).toBe(true)
      expect(result.stock_lots.every((lot) => lot.variant.quality_tier <= 3)).toBe(true)
    })
  })

  describe("updateStockLot", () => {
    it("should update quantity successfully", async () => {
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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

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

      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        attributes_hash: "hash123",
        display_name: "Tier 3",
        short_name: "T3",
      })

      await knex("stock_lots").insert({
        lot_id: lotId,
        item_id: itemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      const result = await service.updateStockLot(userId, lotId, {
        quantity_total: 20,
      })

      expect(result.quantity_total).toBe(20)
    })

    it("should reject negative quantities", async () => {
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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

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

      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        attributes_hash: "hash123",
        display_name: "Tier 3",
        short_name: "T3",
      })

      await knex("stock_lots").insert({
        lot_id: lotId,
        item_id: itemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      await expect(
        service.updateStockLot(userId, lotId, {
          quantity_total: -5,
        }),
      ).rejects.toThrow("negative")
    })

    it("should update listed status", async () => {
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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

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

      await knex("item_variants").insert({
        variant_id: variantId,
        game_item_id: gameItemId,
        attributes: { quality_tier: 3 },
        attributes_hash: "hash123",
        display_name: "Tier 3",
        short_name: "T3",
      })

      await knex("stock_lots").insert({
        lot_id: lotId,
        item_id: itemId,
        variant_id: variantId,
        quantity_total: 10,
        listed: true,
      })

      const result = await service.updateStockLot(userId, lotId, {
        listed: false,
      })

      expect(result.listed).toBe(false)
    })
  })

  describe("bulkUpdateStockLots", () => {
    it("should perform bulk quantity updates", async () => {
      const userId = uuidv4()
      const gameItemId = uuidv4()
      const listingId = uuidv4()
      const itemId = uuidv4()
      const lotIds: string[] = []

      testUserIds.push(userId)
      testListingIds.push(listingId)
      testItemIds.push(itemId)

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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      await knex("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        display_order: 1,
        quantity_available: 20,
        variant_count: 2,
      })

      // Create 2 stock lots
      for (let i = 0; i < 2; i++) {
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
          quantity_total: 10,
          listed: true,
        })
      }

      const result = await service.bulkUpdateStockLots(userId, {
        stock_lot_ids: lotIds,
        operation: "update_quantity",
        quantity_delta: 5,
      })

      expect(result.successful).toBe(2)
      expect(result.failed).toBe(0)

      // Verify quantities updated
      const lots = await knex("stock_lots").whereIn("lot_id", lotIds)
      expect(lots.every((lot) => lot.quantity_total === 15)).toBe(true)
    })

    it("should perform bulk list/unlist operations", async () => {
      const userId = uuidv4()
      const gameItemId = uuidv4()
      const listingId = uuidv4()
      const itemId = uuidv4()
      const lotIds: string[] = []

      testUserIds.push(userId)
      testListingIds.push(listingId)
      testItemIds.push(itemId)

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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      await knex("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        display_order: 1,
        quantity_available: 20,
        variant_count: 2,
      })

      // Create 2 stock lots
      for (let i = 0; i < 2; i++) {
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
          quantity_total: 10,
          listed: true,
        })
      }

      const result = await service.bulkUpdateStockLots(userId, {
        stock_lot_ids: lotIds,
        operation: "unlist",
        listed: false,
      })

      expect(result.successful).toBe(2)
      expect(result.failed).toBe(0)

      // Verify listed status updated
      const lots = await knex("stock_lots").whereIn("lot_id", lotIds)
      expect(lots.every((lot) => lot.listed === false)).toBe(true)
    })

    it("should handle partial failures gracefully", async () => {
      const userId = uuidv4()
      const gameItemId = uuidv4()
      const listingId = uuidv4()
      const itemId = uuidv4()
      const lotIds: string[] = []

      testUserIds.push(userId)
      testListingIds.push(listingId)
      testItemIds.push(itemId)

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

      await knex("game_items").insert({
        game_item_id: gameItemId,
        name: "Test Weapon",
        type: "weapon",
      })

      await knex("listing_items").insert({
        item_id: itemId,
        listing_id: listingId,
        game_item_id: gameItemId,
        pricing_mode: "unified",
        base_price: 1000,
        display_order: 1,
        quantity_available: 20,
        variant_count: 2,
      })

      // Create 2 stock lots with different quantities
      for (let i = 0; i < 2; i++) {
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
          quantity_total: i === 0 ? 5 : 20, // First lot has only 5
          listed: true,
        })
      }

      // Try to decrease by 10 - first lot will fail (would go negative)
      const result = await service.bulkUpdateStockLots(userId, {
        stock_lot_ids: lotIds,
        operation: "update_quantity",
        quantity_delta: -10,
      })

      expect(result.successful).toBe(1) // Only second lot succeeds
      expect(result.failed).toBe(1) // First lot fails
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain("negative")
    })
  })
})
