/**
 * BuyOrdersV2Controller Tests
 *
 * Tests for direct purchase (buy now) functionality with variant-specific items.
 * Validates variant availability, pricing, stock allocation, and transaction atomicity.
 *
 * Task: 4.7 Implement BuyOrdersV2Controller
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { BuyOrdersV2Controller } from "./BuyOrdersV2Controller.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { v4 as uuidv4 } from "uuid"
import type { Knex } from "knex"

describe("BuyOrdersV2Controller", () => {
  let knex: Knex
  let controller: BuyOrdersV2Controller
  let testBuyerId: string
  let testSellerId: string
  let testListingId: string
  let testItemId: string
  let testVariantId: string
  let testGameItemId: string

  beforeEach(async () => {
    knex = getKnex()
    controller = new BuyOrdersV2Controller()

    // Create test buyer
    testBuyerId = uuidv4()
    await knex("accounts").insert({
      user_id: testBuyerId,
      username: `test_buyer_${testBuyerId.substring(0, 8)}`,
      email: `buyer_${testBuyerId}@example.com`,
      password_hash: "test_hash",
      created_at: new Date(),
    })

    // Create test seller
    testSellerId = uuidv4()
    await knex("accounts").insert({
      user_id: testSellerId,
      username: `test_seller_${testSellerId.substring(0, 8)}`,
      email: `seller_${testSellerId}@example.com`,
      password_hash: "test_hash",
      created_at: new Date(),
    })

    // Create test game item
    testGameItemId = uuidv4()
    await knex("game_items").insert({
      id: testGameItemId,
      name: "Test Component",
      type: "component",
      created_at: new Date(),
    })

    // Create test listing
    testListingId = uuidv4()
    await knex("listings").insert({
      listing_id: testListingId,
      seller_id: testSellerId,
      seller_type: "user",
      title: "Test Listing for Buy Now",
      description: "Test Description",
      status: "active",
      visibility: "public",
      sale_type: "fixed",
      listing_type: "single",
      created_at: new Date(),
      updated_at: new Date(),
    })

    // Create test listing item
    testItemId = uuidv4()
    await knex("listing_items").insert({
      item_id: testItemId,
      listing_id: testListingId,
      game_item_id: testGameItemId,
      pricing_mode: "unified",
      base_price: 5000,
      display_order: 0,
      quantity_available: 0,
      variant_count: 0,
    })

    // Create test variant
    testVariantId = uuidv4()
    await knex("item_variants").insert({
      variant_id: testVariantId,
      game_item_id: testGameItemId,
      attributes: { quality_tier: 4, quality_value: 85.0, crafted_source: "crafted" },
      display_name: "Tier 4 (85.0%) - Crafted",
      short_name: "T4 Crafted",
      created_at: new Date(),
    })

    // Create test stock lot
    await knex("listing_item_lots").insert({
      item_id: testItemId,
      variant_id: testVariantId,
      quantity_total: 15,
      listed: true,
      owner_id: testSellerId,
      created_at: new Date(),
      updated_at: new Date(),
    })
  })

  afterEach(async () => {
    // Clean up test data
    await knex("listing_item_lots").where({ item_id: testItemId }).delete()
    await knex("item_variants").where({ variant_id: testVariantId }).delete()
    await knex("listing_items").where({ item_id: testItemId }).delete()
    await knex("listings").where({ listing_id: testListingId }).delete()
    await knex("game_items").where({ id: testGameItemId }).delete()
    await knex("accounts").where({ user_id: testBuyerId }).delete()
    await knex("accounts").where({ user_id: testSellerId }).delete()
  })

  describe("createBuyOrder", () => {
    it("should create direct purchase order with variant-specific item", async () => {
      // Mock request with authentication
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 3,
      }

      const result = await controller.createBuyOrder(buyOrderRequest, mockRequest)

      expect(result).toBeDefined()
      expect(result.order_id).toBeDefined()
      expect(result.buyer_id).toBe(testBuyerId)
      expect(result.seller_id).toBe(testSellerId)
      expect(result.total_price).toBe(15000) // 3 * 5000
      expect(result.status).toBe("pending")
      expect(result.item).toBeDefined()
      expect(result.item.variant.variant_id).toBe(testVariantId)
      expect(result.item.quantity).toBe(3)
      expect(result.item.price_per_unit).toBe(5000)
      expect(result.item.subtotal).toBe(15000)

      // Verify order was created
      const order = await knex("orders")
        .where({ order_id: result.order_id })
        .first()

      expect(order).toBeDefined()
      expect(order.customer_id).toBe(testBuyerId)
      expect(order.status).toBe("pending")

      // Verify market_orders entry was created
      const marketOrder = await knex("market_orders")
        .where({ order_id: result.order_id })
        .first()

      expect(marketOrder).toBeDefined()
      expect(marketOrder.listing_id).toBe(testListingId)
      expect(marketOrder.quantity).toBe(3)

      // Verify order_market_items_v2 was created
      const orderItems = await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .select("*")

      expect(orderItems).toHaveLength(1)
      expect(orderItems[0].variant_id).toBe(testVariantId)
      expect(orderItems[0].price_per_unit).toBe("5000")
      expect(orderItems[0].quantity).toBe(3)

      // Clean up
      await knex("stock_allocations")
        .where({ order_id: result.order_id })
        .delete()
      await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .delete()
      await knex("market_orders")
        .where({ order_id: result.order_id })
        .delete()
      await knex("orders")
        .where({ order_id: result.order_id })
        .delete()
    })

    it("should reject buy order with insufficient stock", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 20, // More than available (15)
      }

      await expect(
        controller.createBuyOrder(buyOrderRequest, mockRequest),
      ).rejects.toThrow(/Insufficient stock/)
    })

    it("should reject buy order with invalid listing", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: uuidv4(), // Non-existent listing
        variant_id: testVariantId,
        quantity: 1,
      }

      await expect(
        controller.createBuyOrder(buyOrderRequest, mockRequest),
      ).rejects.toThrow(/not found/)
    })

    it("should reject buy order with invalid variant", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: uuidv4(), // Non-existent variant
        quantity: 1,
      }

      await expect(
        controller.createBuyOrder(buyOrderRequest, mockRequest),
      ).rejects.toThrow(/not found/)
    })

    it("should reject buy order with inactive listing", async () => {
      // Update listing to inactive
      await knex("listings")
        .where({ listing_id: testListingId })
        .update({ status: "sold" })

      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 1,
      }

      await expect(
        controller.createBuyOrder(buyOrderRequest, mockRequest),
      ).rejects.toThrow(/not active/)

      // Restore listing status
      await knex("listings")
        .where({ listing_id: testListingId })
        .update({ status: "active" })
    })

    it("should reject buy order with variant from different game item", async () => {
      // Create another game item
      const otherGameItemId = uuidv4()
      await knex("game_items").insert({
        id: otherGameItemId,
        name: "Other Item",
        type: "component",
        created_at: new Date(),
      })

      // Create variant for different game item
      const otherVariantId = uuidv4()
      await knex("item_variants").insert({
        variant_id: otherVariantId,
        game_item_id: otherGameItemId,
        attributes: { quality_tier: 3 },
        display_name: "Tier 3",
        short_name: "T3",
        created_at: new Date(),
      })

      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: otherVariantId, // Variant from different game item
        quantity: 1,
      }

      await expect(
        controller.createBuyOrder(buyOrderRequest, mockRequest),
      ).rejects.toThrow(/does not belong/)

      // Clean up
      await knex("item_variants").where({ variant_id: otherVariantId }).delete()
      await knex("game_items").where({ id: otherGameItemId }).delete()
    })

    it("should reject buy order with zero quantity", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 0,
      }

      await expect(
        controller.createBuyOrder(buyOrderRequest, mockRequest),
      ).rejects.toThrow(/greater than 0/)
    })

    it("should reject buy order with negative quantity", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: -5,
      }

      await expect(
        controller.createBuyOrder(buyOrderRequest, mockRequest),
      ).rejects.toThrow(/greater than 0/)
    })

    it("should handle per-variant pricing correctly", async () => {
      // Update listing to use per-variant pricing
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ pricing_mode: "per_variant", base_price: null })

      // Create variant pricing
      await knex("variant_pricing").insert({
        item_id: testItemId,
        variant_id: testVariantId,
        price: 7500,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 2,
      }

      const result = await controller.createBuyOrder(buyOrderRequest, mockRequest)

      expect(result.total_price).toBe(15000) // 2 * 7500
      expect(result.item.price_per_unit).toBe(7500)
      expect(result.item.subtotal).toBe(15000)

      // Clean up
      await knex("stock_allocations")
        .where({ order_id: result.order_id })
        .delete()
      await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .delete()
      await knex("market_orders")
        .where({ order_id: result.order_id })
        .delete()
      await knex("orders")
        .where({ order_id: result.order_id })
        .delete()
      await knex("variant_pricing")
        .where({ item_id: testItemId })
        .delete()

      // Restore listing pricing mode
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ pricing_mode: "unified", base_price: 5000 })
    })

    it("should snapshot price at time of purchase", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const buyOrderRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 1,
      }

      const result = await controller.createBuyOrder(buyOrderRequest, mockRequest)

      // Verify price was snapshotted
      const orderItem = await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .first()

      expect(orderItem.price_per_unit).toBe("5000")

      // Change listing price
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ base_price: 10000 })

      // Verify order still has original price
      const unchangedOrderItem = await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .first()

      expect(unchangedOrderItem.price_per_unit).toBe("5000")

      // Clean up
      await knex("stock_allocations")
        .where({ order_id: result.order_id })
        .delete()
      await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .delete()
      await knex("market_orders")
        .where({ order_id: result.order_id })
        .delete()
      await knex("orders")
        .where({ order_id: result.order_id })
        .delete()

      // Restore listing price
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ base_price: 5000 })
    })
  })
})
