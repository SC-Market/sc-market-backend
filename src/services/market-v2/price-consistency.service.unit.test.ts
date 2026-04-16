/**
 * Unit Tests for Price Consistency Service
 *
 * Tests with mocked database interactions for price snapshotting,
 * staleness detection, and price updates.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { PriceConsistencyService } from "./price-consistency.service.js"

// Mock the database client
vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(() => ({} as any)),
}))

describe("PriceConsistencyService", () => {
  let service: PriceConsistencyService
  let mockKnex: any

  beforeEach(() => {
    // Create mock knex instance
    mockKnex = {
      fn: {
        now: vi.fn(() => new Date()),
      },
    }
    service = new PriceConsistencyService(mockKnex as any)
  })

  describe("getCurrentPrice", () => {
    it("should return base_price for unified pricing mode", async () => {
      const itemId = "item-1"
      const variantId = "variant-1"
      const basePrice = 5000

      // Mock listing_items query
      mockKnex.where = vi.fn().mockReturnThis()
      mockKnex.select = vi.fn().mockReturnThis()
      mockKnex.first = vi.fn().mockResolvedValue({
        pricing_mode: "unified",
        base_price: basePrice,
      })

      const mockListingItems = vi.fn(() => mockKnex)
      Object.assign(mockListingItems, { fn: mockKnex.fn })
      mockKnex = Object.assign(mockListingItems, mockKnex)
      service = new PriceConsistencyService(mockKnex as any)

      const price = await service.getCurrentPrice(itemId, variantId)

      expect(price).toBe(basePrice)
      expect(mockListingItems).toHaveBeenCalledWith("listing_items")
    })

    it("should return variant price for per_variant pricing mode", async () => {
      const itemId = "item-1"
      const variantId = "variant-1"
      const basePrice = 5000
      const variantPrice = 7500

      let callCount = 0
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            // First call: listing_items
            return Promise.resolve({
              pricing_mode: "per_variant",
              base_price: basePrice,
            })
          } else {
            // Second call: variant_pricing
            return Promise.resolve({
              price: variantPrice,
            })
          }
        }),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      const price = await service.getCurrentPrice(itemId, variantId)

      expect(price).toBe(variantPrice)
    })

    it("should fall back to base_price when variant pricing not found", async () => {
      const itemId = "item-1"
      const variantId = "variant-1"
      const basePrice = 5000

      let callCount = 0
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            // First call: listing_items
            return Promise.resolve({
              pricing_mode: "per_variant",
              base_price: basePrice,
            })
          } else {
            // Second call: variant_pricing (not found)
            return Promise.resolve(null)
          }
        }),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      const price = await service.getCurrentPrice(itemId, variantId)

      expect(price).toBe(basePrice)
    })

    it("should throw error when item not found", async () => {
      const itemId = "item-1"
      const variantId = "variant-1"

      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      await expect(service.getCurrentPrice(itemId, variantId)).rejects.toThrow(
        "Listing item not found"
      )
    })

    it("should throw error when no price available", async () => {
      const itemId = "item-1"
      const variantId = "variant-1"

      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          pricing_mode: "unified",
          base_price: null,
        }),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      await expect(service.getCurrentPrice(itemId, variantId)).rejects.toThrow(
        "No price found for item"
      )
    })
  })

  describe("snapshotPriceForCart", () => {
    it("should return current price for cart snapshot", async () => {
      const itemId = "item-1"
      const variantId = "variant-1"
      const price = 6000

      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          pricing_mode: "unified",
          base_price: price,
        }),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      const snapshotPrice = await service.snapshotPriceForCart(itemId, variantId)

      expect(snapshotPrice).toBe(price)
    })
  })

  describe("checkCartPriceStaleness", () => {
    it("should detect no stale prices when prices unchanged", async () => {
      const userId = "user-1"
      const price = 5000

      const cartItems = [
        {
          cart_item_id: "cart-1",
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          price_per_unit: price,
          price_updated_at: new Date(),
        },
      ]

      let callCount = 0
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            // First call: cart_items_v2
            return Promise.resolve(cartItems)
          } else {
            // Second call: listing_items
            return mockQueryBuilder
          }
        }),
        first: vi.fn().mockResolvedValue({
          pricing_mode: "unified",
          base_price: price,
        }),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      const staleItems = await service.checkCartPriceStaleness(userId)

      expect(staleItems).toHaveLength(1)
      expect(staleItems[0].is_stale).toBe(false)
      expect(staleItems[0].price_per_unit).toBe(price)
      expect(staleItems[0].current_price).toBe(price)
      expect(staleItems[0].percentage_change).toBe(0)
    })

    it("should detect stale prices when listing price changes", async () => {
      const userId = "user-1"
      const oldPrice = 5000
      const newPrice = 7500

      const cartItems = [
        {
          cart_item_id: "cart-1",
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          price_per_unit: oldPrice,
          price_updated_at: new Date(),
        },
      ]

      let callCount = 0
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            // First call: cart_items_v2
            return Promise.resolve(cartItems)
          } else {
            // Second call: listing_items
            return mockQueryBuilder
          }
        }),
        first: vi.fn().mockResolvedValue({
          pricing_mode: "unified",
          base_price: newPrice,
        }),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      const staleItems = await service.checkCartPriceStaleness(userId)

      expect(staleItems).toHaveLength(1)
      expect(staleItems[0].is_stale).toBe(true)
      expect(staleItems[0].price_per_unit).toBe(oldPrice)
      expect(staleItems[0].current_price).toBe(newPrice)
      expect(staleItems[0].percentage_change).toBeCloseTo(50, 2)
    })

    it("should mark item as stale when price lookup fails", async () => {
      const userId = "user-1"
      const oldPrice = 5000

      const cartItems = [
        {
          cart_item_id: "cart-1",
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          price_per_unit: oldPrice,
          price_updated_at: new Date(),
        },
      ]

      let callCount = 0
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            // First call: cart_items_v2
            return Promise.resolve(cartItems)
          } else {
            // Second call: listing_items (not found)
            return mockQueryBuilder
          }
        }),
        first: vi.fn().mockResolvedValue(null),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      const staleItems = await service.checkCartPriceStaleness(userId)

      expect(staleItems).toHaveLength(1)
      expect(staleItems[0].is_stale).toBe(true)
      expect(staleItems[0].current_price).toBe(0)
      expect(staleItems[0].percentage_change).toBe(-100)
    })
  })

  describe("snapshotPricesForOrder", () => {
    it("should snapshot current prices for order items", async () => {
      const items = [
        {
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          quantity: 1,
        },
        {
          item_id: "item-2",
          variant_id: "variant-2",
          listing_id: "listing-1",
          quantity: 2,
        },
      ]

      let callCount = 0
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          callCount++
          return Promise.resolve({
            pricing_mode: "unified",
            base_price: callCount === 1 ? 5000 : 7500,
          })
        }),
      }

      const mockKnexFn: any = vi.fn(() => mockQueryBuilder)
      mockKnexFn.fn = { now: vi.fn(() => new Date()) }
      service = new PriceConsistencyService(mockKnexFn)

      const orderPrices = await service.snapshotPricesForOrder(items)

      expect(orderPrices).toHaveLength(2)
      expect(orderPrices[0].price_per_unit).toBe(5000)
      expect(orderPrices[1].price_per_unit).toBe(7500)
    })
  })
})
