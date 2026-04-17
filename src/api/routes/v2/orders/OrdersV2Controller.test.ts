/**
 * OrdersV2Controller Tests
 *
 * Tests for order creation with variant-specific items.
 * Validates variant availability, pricing, stock allocation, and transaction atomicity.
 *
 * Requirements: 25.1-25.12
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { OrdersV2Controller } from "./OrdersV2Controller.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { v4 as uuidv4 } from "uuid"
import type { Knex } from "knex"

describe("OrdersV2Controller", () => {
  let knex: Knex
  let controller: OrdersV2Controller
  let testUserId: string
  let testListingId: string
  let testItemId: string
  let testVariantId: string
  let testGameItemId: string

  beforeEach(async () => {
    knex = getKnex()
    controller = new OrdersV2Controller()

    // Create test user
    testUserId = uuidv4()
    await knex("accounts").insert({
      user_id: testUserId,
      username: `test_user_${testUserId.substring(0, 8)}`,
      email: `test_${testUserId}@example.com`,
      password_hash: "test_hash",
      created_at: new Date(),
    })

    // Create test game item
    testGameItemId = uuidv4()
    await knex("game_items").insert({
      id: testGameItemId,
      name: "Test Item",
      type: "component",
      created_at: new Date(),
    })

    // Create test listing
    testListingId = uuidv4()
    await knex("listings").insert({
      listing_id: testListingId,
      seller_id: testUserId,
      seller_type: "user",
      title: "Test Listing",
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
      base_price: 1000,
      display_order: 0,
      quantity_available: 0,
      variant_count: 0,
    })

    // Create test variant
    testVariantId = uuidv4()
    await knex("item_variants").insert({
      variant_id: testVariantId,
      game_item_id: testGameItemId,
      attributes: { quality_tier: 5, quality_value: 95.5, crafted_source: "crafted" },
      display_name: "Tier 5 (95.5%) - Crafted",
      short_name: "T5 Crafted",
      created_at: new Date(),
    })

    // Create test stock lot
    await knex("listing_item_lots").insert({
      item_id: testItemId,
      variant_id: testVariantId,
      quantity_total: 10,
      listed: true,
      owner_id: testUserId,
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
    await knex("accounts").where({ user_id: testUserId }).delete()
  })

  describe("createOrder", () => {
    it("should create order with variant-specific items", async () => {
      // Mock request with authentication
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const orderRequest = {
        items: [
          {
            listing_id: testListingId,
            variant_id: testVariantId,
            quantity: 2,
          },
        ],
      }

      const result = await controller.createOrder(orderRequest, mockRequest)

      expect(result).toBeDefined()
      expect(result.order_id).toBeDefined()
      expect(result.buyer_id).toBe(testUserId)
      expect(result.seller_id).toBe(testUserId)
      expect(result.total_price).toBe(2000) // 2 * 1000
      expect(result.items).toHaveLength(1)
      expect(result.items[0].variant.variant_id).toBe(testVariantId)
      expect(result.items[0].quantity).toBe(2)
      expect(result.items[0].price_per_unit).toBe(1000)
      expect(result.items[0].subtotal).toBe(2000)

      // Verify order_market_items_v2 was created
      const orderItems = await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .select("*")

      expect(orderItems).toHaveLength(1)
      expect(orderItems[0].variant_id).toBe(testVariantId)
      expect(orderItems[0].price_per_unit).toBe("1000")

      // Clean up
      await knex("order_market_items_v2").where({ order_id: result.order_id }).delete()
      await knex("market_orders").where({ order_id: result.order_id }).delete()
      await knex("orders").where({ order_id: result.order_id }).delete()
    })

    it("should reject order with insufficient stock", async () => {
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const orderRequest = {
        items: [
          {
            listing_id: testListingId,
            variant_id: testVariantId,
            quantity: 20, // More than available (10)
          },
        ],
      }

      await expect(
        controller.createOrder(orderRequest, mockRequest),
      ).rejects.toThrow()
    })

    it("should reject order with invalid variant", async () => {
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const orderRequest = {
        items: [
          {
            listing_id: testListingId,
            variant_id: uuidv4(), // Non-existent variant
            quantity: 1,
          },
        ],
      }

      await expect(
        controller.createOrder(orderRequest, mockRequest),
      ).rejects.toThrow()
    })

    it("should reject order with inactive listing", async () => {
      // Update listing to inactive
      await knex("listings")
        .where({ listing_id: testListingId })
        .update({ status: "sold" })

      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const orderRequest = {
        items: [
          {
            listing_id: testListingId,
            variant_id: testVariantId,
            quantity: 1,
          },
        ],
      }

      await expect(
        controller.createOrder(orderRequest, mockRequest),
      ).rejects.toThrow()

      // Restore listing status
      await knex("listings")
        .where({ listing_id: testListingId })
        .update({ status: "active" })
    })

    it("should snapshot variant price at purchase time", async () => {
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const orderRequest = {
        items: [
          {
            listing_id: testListingId,
            variant_id: testVariantId,
            quantity: 1,
          },
        ],
      }

      const result = await controller.createOrder(orderRequest, mockRequest)

      // Change the listing price
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ base_price: 2000 })

      // Verify order still has original price
      const orderItem = await knex("order_market_items_v2")
        .where({ order_id: result.order_id })
        .first()

      expect(orderItem.price_per_unit).toBe("1000") // Original price, not 2000

      // Clean up
      await knex("order_market_items_v2").where({ order_id: result.order_id }).delete()
      await knex("market_orders").where({ order_id: result.order_id }).delete()
      await knex("orders").where({ order_id: result.order_id }).delete()
    })
  })

  describe("getOrderDetail", () => {
    let testOrderId: string
    let testBuyerId: string
    let testSellerId: string

    beforeEach(async () => {
      // Create buyer and seller accounts
      testBuyerId = uuidv4()
      testSellerId = uuidv4()

      await knex("accounts").insert([
        {
          user_id: testBuyerId,
          username: `buyer_${testBuyerId.substring(0, 8)}`,
          display_name: "Test Buyer",
          email: `buyer_${testBuyerId}@example.com`,
          password_hash: "test_hash",
          created_at: new Date(),
        },
        {
          user_id: testSellerId,
          username: `seller_${testSellerId.substring(0, 8)}`,
          display_name: "Test Seller",
          email: `seller_${testSellerId}@example.com`,
          password_hash: "test_hash",
          created_at: new Date(),
        },
      ])

      // Update listing to be owned by seller
      await knex("listings")
        .where({ listing_id: testListingId })
        .update({ seller_id: testSellerId })

      // Create test order
      testOrderId = uuidv4()
      await knex("orders").insert({
        order_id: testOrderId,
        customer_id: testBuyerId,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      })

      // Create market_orders entry
      await knex("market_orders").insert({
        order_id: testOrderId,
        listing_id: testListingId,
        quantity: 2,
      })

      // Create order_market_items_v2 entry
      await knex("order_market_items_v2").insert({
        order_id: testOrderId,
        listing_id: testListingId,
        item_id: testItemId,
        variant_id: testVariantId,
        quantity: 2,
        price_per_unit: 1000,
        created_at: new Date(),
      })
    })

    afterEach(async () => {
      // Clean up order data
      await knex("order_market_items_v2").where({ order_id: testOrderId }).delete()
      await knex("market_orders").where({ order_id: testOrderId }).delete()
      await knex("orders").where({ order_id: testOrderId }).delete()
      await knex("accounts").where({ user_id: testBuyerId }).delete()
      await knex("accounts").where({ user_id: testSellerId }).delete()
    })

    it("should return order detail with variant information for buyer", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const result = await controller.getOrderDetail(testOrderId, mockRequest)

      expect(result).toBeDefined()
      expect(result.order_id).toBe(testOrderId)
      expect(result.buyer.user_id).toBe(testBuyerId)
      expect(result.buyer.username).toContain("buyer_")
      expect(result.buyer.display_name).toBe("Test Buyer")
      expect(result.seller.user_id).toBe(testSellerId)
      expect(result.seller.username).toContain("seller_")
      expect(result.seller.display_name).toBe("Test Seller")
      expect(result.total_price).toBe(2000) // 2 * 1000
      expect(result.status).toBe("pending")
      expect(result.items).toHaveLength(1)
      expect(result.items[0].variant.variant_id).toBe(testVariantId)
      expect(result.items[0].variant.display_name).toBe("Tier 5 (95.5%) - Crafted")
      expect(result.items[0].quantity).toBe(2)
      expect(result.items[0].price_per_unit).toBe(1000)
      expect(result.items[0].subtotal).toBe(2000)
    })

    it("should return order detail with variant information for seller", async () => {
      const mockRequest = {
        user: { user_id: testSellerId },
      } as any

      const result = await controller.getOrderDetail(testOrderId, mockRequest)

      expect(result).toBeDefined()
      expect(result.order_id).toBe(testOrderId)
      expect(result.buyer.user_id).toBe(testBuyerId)
      expect(result.seller.user_id).toBe(testSellerId)
    })

    it("should return 404 for non-existent order", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const nonExistentOrderId = uuidv4()

      await expect(
        controller.getOrderDetail(nonExistentOrderId, mockRequest),
      ).rejects.toThrow()
    })

    it("should reject unauthorized user from viewing order", async () => {
      const unauthorizedUserId = uuidv4()
      await knex("accounts").insert({
        user_id: unauthorizedUserId,
        username: `unauthorized_${unauthorizedUserId.substring(0, 8)}`,
        email: `unauthorized_${unauthorizedUserId}@example.com`,
        password_hash: "test_hash",
        created_at: new Date(),
      })

      const mockRequest = {
        user: { user_id: unauthorizedUserId },
      } as any

      await expect(
        controller.getOrderDetail(testOrderId, mockRequest),
      ).rejects.toThrow()

      // Clean up
      await knex("accounts").where({ user_id: unauthorizedUserId }).delete()
    })

    it("should include quality tier attributes in variant details", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      const result = await controller.getOrderDetail(testOrderId, mockRequest)

      expect(result.items[0].variant.attributes).toBeDefined()
      expect(result.items[0].variant.attributes.quality_tier).toBe(5)
      expect(result.items[0].variant.attributes.quality_value).toBe(95.5)
      expect(result.items[0].variant.attributes.crafted_source).toBe("crafted")
    })

    it("should preserve price snapshot from purchase time", async () => {
      const mockRequest = {
        user: { user_id: testBuyerId },
      } as any

      // Change the listing price after order creation
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ base_price: 5000 })

      const result = await controller.getOrderDetail(testOrderId, mockRequest)

      // Verify order still shows original price
      expect(result.items[0].price_per_unit).toBe(1000) // Original price, not 5000
      expect(result.total_price).toBe(2000) // 2 * 1000
    })
  })
})
