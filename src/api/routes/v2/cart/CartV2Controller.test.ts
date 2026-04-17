/**
 * Cart V2 Controller Tests
 *
 * Unit tests for CartV2Controller endpoints.
 * Tests cart operations with variant-specific items and stock validation.
 *
 * Requirements: 29.1-29.12, 30.1-30.12, 31.1-31.12, 32.1-32.12, 33.1-33.7
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { CartV2Controller } from "./CartV2Controller.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { v4 as uuidv4 } from "uuid"
import type { Knex } from "knex"

describe("CartV2Controller", () => {
  let knex: Knex
  let controller: CartV2Controller
  let testUserId: string
  let testSellerId: string
  let testListingId: string
  let testItemId: string
  let testVariantId: string
  let testGameItemId: string

  beforeEach(async () => {
    knex = getKnex()
    controller = new CartV2Controller()

    // Create test user (buyer)
    testUserId = uuidv4()
    await knex("accounts").insert({
      user_id: testUserId,
      username: `test_buyer_${testUserId.substring(0, 8)}`,
      email: `buyer_${testUserId}@example.com`,
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
      title: "Test Listing for Cart",
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
      quantity_total: 20,
      listed: true,
      owner_id: testSellerId,
      created_at: new Date(),
      updated_at: new Date(),
    })
  })

  afterEach(async () => {
    // Clean up test data
    await knex("cart_items_v2").where({ user_id: testUserId }).delete()
    await knex("listing_item_lots").where({ item_id: testItemId }).delete()
    await knex("item_variants").where({ variant_id: testVariantId }).delete()
    await knex("listing_items").where({ item_id: testItemId }).delete()
    await knex("listings").where({ listing_id: testListingId }).delete()
    await knex("game_items").where({ id: testGameItemId }).delete()
    await knex("accounts").where({ user_id: testUserId }).delete()
    await knex("accounts").where({ user_id: testSellerId }).delete()
  })

  describe("GET /api/v2/cart - getCart", () => {
    it("should return empty cart for user with no items", async () => {
      // Requirement 29.1: GET /api/v2/cart endpoint
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const result = await controller.getCart(mockRequest)

      expect(result).toBeDefined()
      expect(result.items).toEqual([])
      expect(result.total_price).toBe(0)
      expect(result.item_count).toBe(0)
    })

    it("should return cart with variant details", async () => {
      // Add item to cart
      await knex("cart_items_v2").insert({
        user_id: testUserId,
        listing_id: testListingId,
        item_id: testItemId,
        variant_id: testVariantId,
        quantity: 2,
        price_per_unit: 1000,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const result = await controller.getCart(mockRequest)

      // Requirement 29.2: Return array of cart items with variant details
      expect(result.items).toHaveLength(1)
      expect(result.items[0].variant.variant_id).toBe(testVariantId)
      expect(result.items[0].variant.display_name).toBe("Tier 5 (95.5%) - Crafted")
      expect(result.items[0].quantity).toBe(2)
      expect(result.items[0].price_per_unit).toBe(1000)
      
      // Requirement 29.6: Calculate subtotal for each item
      expect(result.items[0].subtotal).toBe(2000)
      
      // Requirement 29.7: Calculate total_price for entire cart
      expect(result.total_price).toBe(2000)
      
      // Requirement 29.11: Return item_count
      expect(result.item_count).toBe(2)
    })

    it("should include availability indicator", async () => {
      // Add item to cart
      await knex("cart_items_v2").insert({
        user_id: testUserId,
        listing_id: testListingId,
        item_id: testItemId,
        variant_id: testVariantId,
        quantity: 2,
        price_per_unit: 1000,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const result = await controller.getCart(mockRequest)

      // Requirement 29.8: Include availability indicator
      expect(result.items[0].available).toBe(true)
    })

    it("should detect price changes", async () => {
      // Add item to cart with old price
      await knex("cart_items_v2").insert({
        user_id: testUserId,
        listing_id: testListingId,
        item_id: testItemId,
        variant_id: testVariantId,
        quantity: 2,
        price_per_unit: 800, // Old price
        created_at: new Date(),
        updated_at: new Date(),
      })

      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const result = await controller.getCart(mockRequest)

      // Requirement 29.9: Include price_changed indicator
      expect(result.items[0].price_changed).toBe(true)
      
      // Requirement 29.10: Return current_price if price has changed
      expect(result.items[0].current_price).toBe(1000)
    })
  })

  describe("POST /api/v2/cart/add - addToCart", () => {
    it("should add item to cart", async () => {
      // Requirement 30.1: POST /api/v2/cart/add endpoint
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const addRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 3,
      }

      const result = await controller.addToCart(addRequest, mockRequest)

      // Requirement 30.10: Return cart_item_id on success
      expect(result.cart_item_id).toBeDefined()
      expect(result.message).toBe("Item added to cart successfully")

      // Verify cart item was created
      const cartItem = await knex("cart_items_v2")
        .where({ cart_item_id: result.cart_item_id })
        .first()

      expect(cartItem).toBeDefined()
      expect(cartItem.user_id).toBe(testUserId)
      expect(cartItem.listing_id).toBe(testListingId)
      expect(cartItem.variant_id).toBe(testVariantId)
      expect(cartItem.quantity).toBe(3)
      
      // Requirement 30.6: Snapshot variant price at add-to-cart time
      expect(cartItem.price_per_unit).toBe(1000)
    })

    it("should validate required fields", async () => {
      // Requirement 30.2: Accept listing_id, variant_id, and quantity
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const invalidRequest = {
        listing_id: testListingId,
        // Missing variant_id and quantity
      } as any

      await expect(
        controller.addToCart(invalidRequest, mockRequest),
      ).rejects.toThrow()
    })

    it("should reject invalid listing", async () => {
      // Requirement 30.3: Validate listing exists and is active
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const addRequest = {
        listing_id: uuidv4(), // Non-existent listing
        variant_id: testVariantId,
        quantity: 1,
      }

      await expect(
        controller.addToCart(addRequest, mockRequest),
      ).rejects.toThrow()
    })

    it("should reject inactive listing", async () => {
      // Update listing to inactive
      await knex("listings")
        .where({ listing_id: testListingId })
        .update({ status: "sold" })

      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const addRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 1,
      }

      await expect(
        controller.addToCart(addRequest, mockRequest),
      ).rejects.toThrow(/not active/)

      // Restore listing status
      await knex("listings")
        .where({ listing_id: testListingId })
        .update({ status: "active" })
    })

    it("should reject invalid variant", async () => {
      // Requirement 30.4: Validate variant exists and belongs to listing
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const addRequest = {
        listing_id: testListingId,
        variant_id: uuidv4(), // Non-existent variant
        quantity: 1,
      }

      await expect(
        controller.addToCart(addRequest, mockRequest),
      ).rejects.toThrow()
    })

    it("should check variant availability", async () => {
      // Requirement 30.5: Check variant availability before adding
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const addRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 30, // More than available (20)
      }

      // Requirement 30.11: Prevent adding unavailable variants with descriptive error
      await expect(
        controller.addToCart(addRequest, mockRequest),
      ).rejects.toThrow(/Insufficient stock/)
    })

    it("should upsert existing cart item", async () => {
      // Requirement 30.8: Support upsert (update if already in cart)
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      // Add item first time
      const addRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 2,
      }

      const result1 = await controller.addToCart(addRequest, mockRequest)

      // Add same item again
      const result2 = await controller.addToCart(addRequest, mockRequest)

      // Should return same cart_item_id
      expect(result2.cart_item_id).toBe(result1.cart_item_id)

      // Verify quantity was added
      const cartItem = await knex("cart_items_v2")
        .where({ cart_item_id: result1.cart_item_id })
        .first()

      expect(cartItem.quantity).toBe(4) // 2 + 2
    })

    it("should validate positive quantity", async () => {
      // Requirement 30.9: Validate quantity is positive integer
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const addRequest = {
        listing_id: testListingId,
        variant_id: testVariantId,
        quantity: 0,
      }

      await expect(
        controller.addToCart(addRequest, mockRequest),
      ).rejects.toThrow()
    })
  })

  describe("PUT /api/v2/cart/:id - updateCartItem", () => {
    let testCartItemId: string

    beforeEach(async () => {
      // Create cart item for update tests
      const [cartItem] = await knex("cart_items_v2")
        .insert({
          user_id: testUserId,
          listing_id: testListingId,
          item_id: testItemId,
          variant_id: testVariantId,
          quantity: 5,
          price_per_unit: 1000,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("cart_item_id")

      testCartItemId = cartItem.cart_item_id
    })

    it("should update cart item quantity", async () => {
      // Requirement 31.2: Accept quantity updates
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const updateRequest = {
        quantity: 3,
      }

      const result = await controller.updateCartItem(
        testCartItemId,
        updateRequest,
        mockRequest,
      )

      expect(result.message).toBe("Cart item updated successfully")

      // Verify update
      const cartItem = await knex("cart_items_v2")
        .where({ cart_item_id: testCartItemId })
        .first()

      expect(cartItem.quantity).toBe(3)
    })

    it("should validate cart item exists", async () => {
      // Requirement 31.9: Return 404 if cart item not found
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const nonExistentId = uuidv4()

      await expect(
        controller.updateCartItem(nonExistentId, { quantity: 2 }, mockRequest),
      ).rejects.toThrow()
    })

    it("should validate ownership", async () => {
      // Requirement 31.10: Return 403 if cart item belongs to different user
      const differentUserId = uuidv4()
      const mockRequest = {
        user: { user_id: differentUserId },
      } as any

      await expect(
        controller.updateCartItem(testCartItemId, { quantity: 2 }, mockRequest),
      ).rejects.toThrow(/permission/)
    })

    it("should validate new quantity against availability", async () => {
      // Requirement 31.4: Validate new quantity against variant availability
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const updateRequest = {
        quantity: 30, // More than available (20)
      }

      await expect(
        controller.updateCartItem(testCartItemId, updateRequest, mockRequest),
      ).rejects.toThrow(/Insufficient stock/)
    })

    it("should prevent quantity from being set to 0", async () => {
      // Requirement 31.7: Prevent quantity from being set to 0 (use DELETE instead)
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const updateRequest = {
        quantity: 0,
      }

      await expect(
        controller.updateCartItem(testCartItemId, updateRequest, mockRequest),
      ).rejects.toThrow()
    })

    it("should update price to current price", async () => {
      // Requirement 31.6: Update price_per_unit to current price
      // Change listing price
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ base_price: 1500 })

      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      await controller.updateCartItem(
        testCartItemId,
        { quantity: 5 },
        mockRequest,
      )

      // Verify price was updated
      const cartItem = await knex("cart_items_v2")
        .where({ cart_item_id: testCartItemId })
        .first()

      expect(cartItem.price_per_unit).toBe(1500)

      // Restore listing price
      await knex("listing_items")
        .where({ item_id: testItemId })
        .update({ base_price: 1000 })
    })
  })

  describe("DELETE /api/v2/cart/:id - removeCartItem", () => {
    let testCartItemId: string

    beforeEach(async () => {
      // Create cart item for delete tests
      const [cartItem] = await knex("cart_items_v2")
        .insert({
          user_id: testUserId,
          listing_id: testListingId,
          item_id: testItemId,
          variant_id: testVariantId,
          quantity: 5,
          price_per_unit: 1000,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("cart_item_id")

      testCartItemId = cartItem.cart_item_id
    })

    it("should remove cart item", async () => {
      // Requirement 33.1: DELETE /api/v2/cart/:id endpoint
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const result = await controller.removeCartItem(testCartItemId, mockRequest)

      expect(result.message).toBe("Cart item removed successfully")

      // Verify deletion
      const cartItem = await knex("cart_items_v2")
        .where({ cart_item_id: testCartItemId })
        .first()

      expect(cartItem).toBeUndefined()
    })

    it("should return 404 for non-existent cart item", async () => {
      // Requirement 33.4: Return 404 if cart item not found
      const mockRequest = {
        user: { user_id: testUserId },
      } as any

      const nonExistentId = uuidv4()

      await expect(
        controller.removeCartItem(nonExistentId, mockRequest),
      ).rejects.toThrow()
    })

    it("should validate ownership before deletion", async () => {
      // Requirement 33.5: Return 403 if cart item belongs to different user
      const differentUserId = uuidv4()
      const mockRequest = {
        user: { user_id: differentUserId },
      } as any

      await expect(
        controller.removeCartItem(testCartItemId, mockRequest),
      ).rejects.toThrow(/permission/)
    })
  })
})

