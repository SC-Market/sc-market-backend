/**
 * Unit Tests for Availability Validation Service
 *
 * Tests validation logic with mocked database interactions.
 * Integration tests with real database transactions should be in separate files.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { AvailabilityValidationService } from "./availability-validation.service.js"
import { PriceConsistencyService } from "./price-consistency.service.js"
import type { Knex } from "knex"

// Mock the database client
vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(() => ({} as any)),
}))

describe("AvailabilityValidationService - Unit Tests", () => {
  let service: AvailabilityValidationService
  let mockKnex: any
  let mockPriceService: any

  beforeEach(() => {
    // Create mock knex instance
    mockKnex = {
      fn: {
        now: vi.fn(() => new Date()),
      },
    }

    // Create mock price service
    mockPriceService = {
      getCurrentPrice: vi.fn(),
      checkCartPriceStaleness: vi.fn(),
    }

    service = new AvailabilityValidationService(mockKnex as any, mockPriceService)
  })

  describe("validateForCartAdd", () => {
    it("should validate successfully when stock is available", async () => {
      const variantId = "variant-1"
      const itemId = "item-1"
      const quantity = 5

      // Mock stock availability query
      const mockFirst = vi.fn().mockResolvedValue({ total: 10 })
      const mockSum = vi.fn().mockReturnValue({ first: mockFirst })
      const mockWhere = vi.fn().mockReturnValue({ sum: mockSum })
      mockKnex = vi.fn(() => ({ where: mockWhere }))

      service = new AvailabilityValidationService(mockKnex as any, mockPriceService)

      const result = await service.validateForCartAdd(variantId, quantity, itemId)

      expect(result.valid).toBe(true)
      expect(result.error_message).toBeUndefined()
      expect(result.alternative_variants).toBeUndefined()
    })

    it("should fail validation when stock is insufficient", async () => {
      const variantId = "variant-1"
      const itemId = "item-1"
      const quantity = 10

      // Mock insufficient stock
      const mockFirst = vi.fn().mockResolvedValue({ total: 3 })
      const mockSum = vi.fn().mockReturnValue({ first: mockFirst })
      const mockWhere = vi.fn().mockReturnValue({ sum: mockSum })

      // Mock alternative variants query (empty)
      const mockLimit = vi.fn().mockResolvedValue([])
      const mockOrderByRaw = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockSelect = vi.fn().mockReturnValue({ orderByRaw: mockOrderByRaw })
      const mockHavingRaw = vi.fn().mockReturnValue({ select: mockSelect })
      const mockGroupBy = vi.fn().mockReturnValue({ havingRaw: mockHavingRaw })
      const mockWhereRaw = vi.fn().mockReturnValue({ groupBy: mockGroupBy })
      const mockWhere3 = vi.fn().mockReturnValue({ whereRaw: mockWhereRaw })
      const mockWhere2 = vi.fn().mockReturnValue({ where: mockWhere3 })
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 })
      const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere1 })
      const mockJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin })

      // Mock variant query
      const mockVariantFirst = vi.fn().mockResolvedValue({
        attributes: { quality_tier: 3 },
        game_item_id: "game-1",
      })
      const mockVariantSelect = vi.fn().mockReturnValue({ first: mockVariantFirst })
      const mockVariantWhere = vi.fn().mockReturnValue({ select: mockVariantSelect })

      // Mock listing item query
      const mockItemFirst = vi.fn().mockResolvedValue({
        pricing_mode: "unified",
        base_price: 1000,
        listing_id: "listing-1",
      })
      const mockItemSelect = vi.fn().mockReturnValue({ first: mockItemFirst })
      const mockItemWhere = vi.fn().mockReturnValue({ select: mockItemSelect })

      let callCount = 0
      mockKnex = vi.fn((table: string) => {
        callCount++
        if (callCount === 1) {
          // First call: stock availability check
          return { where: mockWhere }
        } else if (callCount === 2) {
          // Second call: get original variant
          return { where: mockVariantWhere }
        } else if (callCount === 3) {
          // Third call: get listing item
          return { where: mockItemWhere }
        } else {
          // Fourth call: find alternatives
          return { join: mockJoin }
        }
      })
      mockKnex.raw = vi.fn()

      service = new AvailabilityValidationService(mockKnex as any, mockPriceService)

      const result = await service.validateForCartAdd(variantId, quantity, itemId)

      expect(result.valid).toBe(false)
      expect(result.error_message).toContain("Insufficient stock")
      expect(result.error_message).toContain("Requested 10, available 3")
    })

    it("should provide alternative variant suggestions when available", async () => {
      const variantId = "variant-1"
      const itemId = "item-1"
      const quantity = 10

      // Mock insufficient stock
      const mockFirst = vi.fn().mockResolvedValue({ total: 3 })
      const mockSum = vi.fn().mockReturnValue({ first: mockFirst })
      const mockWhere = vi.fn().mockReturnValue({ sum: mockSum })

      // Mock alternative variants
      const alternatives = [
        {
          variant_id: "variant-2",
          display_name: "Tier 2",
          attributes: { quality_tier: 2 },
          available_quantity: 15,
          price: 900,
        },
        {
          variant_id: "variant-4",
          display_name: "Tier 4",
          attributes: { quality_tier: 4 },
          available_quantity: 12,
          price: 1100,
        },
      ]

      const mockLimit = vi.fn().mockResolvedValue(alternatives)
      const mockOrderByRaw = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockSelect = vi.fn().mockReturnValue({ orderByRaw: mockOrderByRaw })
      const mockHavingRaw = vi.fn().mockReturnValue({ select: mockSelect })
      const mockGroupBy = vi.fn().mockReturnValue({ havingRaw: mockHavingRaw })
      const mockWhereRaw = vi.fn().mockReturnValue({ groupBy: mockGroupBy })
      const mockWhere3 = vi.fn().mockReturnValue({ whereRaw: mockWhereRaw })
      const mockWhere2 = vi.fn().mockReturnValue({ where: mockWhere3 })
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 })
      const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere1 })
      const mockJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin })

      // Mock variant query
      const mockVariantFirst = vi.fn().mockResolvedValue({
        attributes: { quality_tier: 3 },
        game_item_id: "game-1",
      })
      const mockVariantSelect = vi.fn().mockReturnValue({ first: mockVariantFirst })
      const mockVariantWhere = vi.fn().mockReturnValue({ select: mockVariantSelect })

      // Mock listing item query
      const mockItemFirst = vi.fn().mockResolvedValue({
        pricing_mode: "unified",
        base_price: 1000,
        listing_id: "listing-1",
      })
      const mockItemSelect = vi.fn().mockReturnValue({ first: mockItemFirst })
      const mockItemWhere = vi.fn().mockReturnValue({ select: mockItemSelect })

      let callCount = 0
      mockKnex = vi.fn((table: string) => {
        callCount++
        if (callCount === 1) {
          return { where: mockWhere }
        } else if (callCount === 2) {
          return { where: mockVariantWhere }
        } else if (callCount === 3) {
          return { where: mockItemWhere }
        } else {
          return { join: mockJoin }
        }
      })
      mockKnex.raw = vi.fn()

      service = new AvailabilityValidationService(mockKnex as any, mockPriceService)

      const result = await service.validateForCartAdd(variantId, quantity, itemId)

      expect(result.valid).toBe(false)
      expect(result.alternative_variants).toBeDefined()
      expect(result.alternative_variants!.length).toBe(2)
      expect(result.alternative_variants![0].quality_tier).toBe(2)
      expect(result.alternative_variants![1].quality_tier).toBe(4)
    })
  })

  describe("validateForOrderCreation", () => {
    it("should validate successfully when all items have sufficient stock", async () => {
      const items = [
        { item_id: "item-1", variant_id: "variant-1", quantity: 5 },
        { item_id: "item-2", variant_id: "variant-2", quantity: 3 },
      ]

      // Mock stock lots with sufficient quantity
      const mockForUpdate = vi.fn()
        .mockResolvedValueOnce([
          { lot_id: "lot-1", quantity_total: 10 },
          { lot_id: "lot-2", quantity_total: 5 },
        ])
        .mockResolvedValueOnce([{ lot_id: "lot-3", quantity_total: 10 }])

      const mockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 })

      const mockTrx = vi.fn(() => ({ where: mockWhere1 }))

      const result = await service.validateForOrderCreation(items, mockTrx as any)

      expect(result.valid).toBe(true)
      expect(result.item_errors).toHaveLength(0)
    })

    it("should fail validation with per-item errors when stock insufficient", async () => {
      const items = [
        { item_id: "item-1", variant_id: "variant-1", quantity: 10 },
        { item_id: "item-2", variant_id: "variant-2", quantity: 3 },
      ]

      // Mock stock lots - first item has insufficient stock
      const mockForUpdate = vi.fn()
        .mockResolvedValueOnce([{ lot_id: "lot-1", quantity_total: 5 }])
        .mockResolvedValueOnce([{ lot_id: "lot-2", quantity_total: 10 }])

      const mockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 })

      const mockTrx = vi.fn(() => ({ where: mockWhere1 }))

      const result = await service.validateForOrderCreation(items, mockTrx as any)

      expect(result.valid).toBe(false)
      expect(result.item_errors).toHaveLength(1)
      expect(result.item_errors[0].variant_id).toBe("variant-1")
      expect(result.item_errors[0].requested_quantity).toBe(10)
      expect(result.item_errors[0].available_quantity).toBe(5)
      expect(result.item_errors[0].error_message).toContain("Insufficient stock")
    })
  })

  describe("validateCartForCheckout", () => {
    it("should return valid items when all items have sufficient stock", async () => {
      const userId = "user-1"

      // Mock cart items
      const cartItems = [
        {
          cart_item_id: "cart-1",
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          quantity: 3,
          price_per_unit: 1000,
        },
      ]

      const mockCartSelect = vi.fn().mockResolvedValue(cartItems)
      const mockCartWhere = vi.fn().mockReturnValue({ select: mockCartSelect })

      // Mock stock lots with sufficient quantity
      const mockForUpdate = vi.fn().mockResolvedValue([
        { lot_id: "lot-1", quantity_total: 10 },
      ])
      const mockStockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockStockWhere2 = vi.fn().mockReturnValue({ orderBy: mockStockOrderBy })
      const mockStockWhere1 = vi.fn().mockReturnValue({ where: mockStockWhere2 })

      let callCount = 0
      const mockTrx = vi.fn((table: string) => {
        callCount++
        if (callCount === 1) {
          // First call: get cart items
          return { where: mockCartWhere }
        } else {
          // Subsequent calls: check stock
          return { where: mockStockWhere1 }
        }
      })

      // Mock price service
      mockPriceService.checkCartPriceStaleness.mockResolvedValue([])

      const result = await service.validateCartForCheckout(userId, mockTrx as any)

      expect(result.valid_items).toHaveLength(1)
      expect(result.valid_items[0].cart_item_id).toBe("cart-1")
      expect(result.removed_items).toHaveLength(0)
      expect(result.price_changes).toHaveLength(0)
    })

    it("should remove unavailable items from cart", async () => {
      const userId = "user-1"

      // Mock cart items
      const cartItems = [
        {
          cart_item_id: "cart-1",
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          quantity: 10,
          price_per_unit: 1000,
        },
      ]

      const mockCartSelect = vi.fn().mockResolvedValue(cartItems)
      const mockCartWhere = vi.fn().mockReturnValue({ select: mockCartSelect })

      // Mock insufficient stock
      const mockForUpdate = vi.fn().mockResolvedValue([
        { lot_id: "lot-1", quantity_total: 3 },
      ])
      const mockStockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockStockWhere2 = vi.fn().mockReturnValue({ orderBy: mockStockOrderBy })
      const mockStockWhere1 = vi.fn().mockReturnValue({ where: mockStockWhere2 })

      // Mock delete
      const mockDelete = vi.fn().mockResolvedValue(1)
      const mockDeleteWhere = vi.fn().mockReturnValue({ delete: mockDelete })

      let callCount = 0
      const mockTrx = vi.fn((table: string) => {
        callCount++
        if (callCount === 1) {
          // First call: get cart items
          return { where: mockCartWhere }
        } else if (callCount === 2) {
          // Second call: check stock
          return { where: mockStockWhere1 }
        } else {
          // Third call: delete cart item
          return { where: mockDeleteWhere }
        }
      })

      // Mock price service
      mockPriceService.checkCartPriceStaleness.mockResolvedValue([])

      const result = await service.validateCartForCheckout(userId, mockTrx as any)

      expect(result.valid_items).toHaveLength(0)
      expect(result.removed_items).toHaveLength(1)
      expect(result.removed_items[0].cart_item_id).toBe("cart-1")
      expect(result.removed_items[0].reason).toContain("Insufficient stock")
    })

    it("should detect price changes on valid items", async () => {
      const userId = "user-1"

      // Mock cart items
      const cartItems = [
        {
          cart_item_id: "cart-1",
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          quantity: 3,
          price_per_unit: 1000,
        },
      ]

      const mockCartSelect = vi.fn().mockResolvedValue(cartItems)
      const mockCartWhere = vi.fn().mockReturnValue({ select: mockCartSelect })

      // Mock stock lots
      const mockForUpdate = vi.fn().mockResolvedValue([
        { lot_id: "lot-1", quantity_total: 10 },
      ])
      const mockStockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockStockWhere2 = vi.fn().mockReturnValue({ orderBy: mockStockOrderBy })
      const mockStockWhere1 = vi.fn().mockReturnValue({ where: mockStockWhere2 })

      let callCount = 0
      const mockTrx = vi.fn((table: string) => {
        callCount++
        if (callCount === 1) {
          return { where: mockCartWhere }
        } else {
          return { where: mockStockWhere1 }
        }
      })

      // Mock price changes
      mockPriceService.checkCartPriceStaleness.mockResolvedValue([
        {
          cart_item_id: "cart-1",
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          price_per_unit: 1000,
          price_updated_at: new Date(),
          current_price: 1500,
          is_stale: true,
          percentage_change: 50,
        },
      ])

      const result = await service.validateCartForCheckout(userId, mockTrx as any)

      expect(result.valid_items).toHaveLength(1)
      expect(result.price_changes).toHaveLength(1)
      expect(result.price_changes[0].is_stale).toBe(true)
      expect(result.price_changes[0].current_price).toBe(1500)
    })
  })
})
