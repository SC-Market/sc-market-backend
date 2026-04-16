/**
 * Stock Allocation Service Unit Tests
 *
 * Tests for stock allocation, rollback, and availability checking.
 * These are unit tests with mocked database interactions.
 * Full integration tests with real database transactions should be in separate integration test files.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { StockAllocationService } from "./stock-allocation.service.js"
import { InsufficientStockError } from "./errors.js"
import type { Knex } from "knex"
import type { DBListingItemLot } from "./types.js"

// Mock the database client
vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(() => ({} as any)),
}))

describe("StockAllocationService", () => {
  let service: StockAllocationService
  let mockKnex: any

  beforeEach(() => {
    // Create mock knex instance
    mockKnex = {
      fn: {
        now: vi.fn(() => new Date()),
      },
    }
    service = new StockAllocationService(mockKnex as any)
  })

  describe("allocateStock", () => {
    it("should allocate stock from a single lot", async () => {
      const variantId = "variant-1"
      const mockLots: DBListingItemLot[] = [
        {
          lot_id: "lot-1",
          item_id: "item-1",
          variant_id: variantId,
          quantity_total: 100,
          location_id: null,
          owner_id: null,
          listed: true,
          notes: null,
          crafted_by: null,
          crafted_at: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
      ]

      // Mock the query chain for SELECT
      const mockForUpdate = vi.fn().mockResolvedValue(mockLots)
      const mockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 })
      
      // Mock the query chain for UPDATE
      const mockUpdate = vi.fn().mockResolvedValue(1)
      const mockUpdateWhere = vi.fn().mockReturnValue({ update: mockUpdate })

      let callCount = 0
      mockKnex = vi.fn((table: string) => {
        if (table === "listing_item_lots") {
          callCount++
          // First call is SELECT, subsequent calls are UPDATE
          if (callCount === 1) {
            return { where: mockWhere1 }
          } else {
            return { where: mockUpdateWhere }
          }
        }
        return {}
      })
      mockKnex.fn = { now: vi.fn(() => new Date()) }

      service = new StockAllocationService(mockKnex as any)

      const result = await service.allocateStock(variantId, 50)

      expect(result.total_allocated).toBe(50)
      expect(result.allocations).toHaveLength(1)
      expect(result.allocations[0].quantity_allocated).toBe(50)
      expect(result.allocations[0].lot_id).toBe("lot-1")
    })

    it("should allocate stock across multiple lots in FIFO order", async () => {
      const variantId = "variant-1"
      const mockLots: DBListingItemLot[] = [
        {
          lot_id: "lot-1",
          item_id: "item-1",
          variant_id: variantId,
          quantity_total: 30,
          location_id: null,
          owner_id: null,
          listed: true,
          notes: null,
          crafted_by: null,
          crafted_at: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
        {
          lot_id: "lot-2",
          item_id: "item-1",
          variant_id: variantId,
          quantity_total: 50,
          location_id: null,
          owner_id: null,
          listed: true,
          notes: null,
          crafted_by: null,
          crafted_at: null,
          created_at: new Date("2024-01-02"),
          updated_at: new Date("2024-01-02"),
        },
      ]

      // Mock the query chain for SELECT
      const mockForUpdate = vi.fn().mockResolvedValue(mockLots)
      const mockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 })
      
      // Mock the query chain for UPDATE
      const mockUpdate = vi.fn().mockResolvedValue(1)
      const mockUpdateWhere = vi.fn().mockReturnValue({ update: mockUpdate })

      let callCount = 0
      mockKnex = vi.fn((table: string) => {
        if (table === "listing_item_lots") {
          callCount++
          // First call is SELECT, subsequent calls are UPDATE
          if (callCount === 1) {
            return { where: mockWhere1 }
          } else {
            return { where: mockUpdateWhere }
          }
        }
        return {}
      })
      mockKnex.fn = { now: vi.fn(() => new Date()) }

      service = new StockAllocationService(mockKnex as any)

      const result = await service.allocateStock(variantId, 80)

      expect(result.total_allocated).toBe(80)
      expect(result.allocations).toHaveLength(2)
      
      // Verify FIFO order: oldest lot first
      expect(result.allocations[0].lot_id).toBe("lot-1")
      expect(result.allocations[0].quantity_allocated).toBe(30)
      
      expect(result.allocations[1].lot_id).toBe("lot-2")
      expect(result.allocations[1].quantity_allocated).toBe(50)
    })

    it("should throw InsufficientStockError when not enough stock available", async () => {
      const variantId = "variant-1"
      const mockLots: DBListingItemLot[] = [
        {
          lot_id: "lot-1",
          item_id: "item-1",
          variant_id: variantId,
          quantity_total: 30,
          location_id: null,
          owner_id: null,
          listed: true,
          notes: null,
          crafted_by: null,
          crafted_at: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
      ]

      // Mock the query chain
      const mockForUpdate = vi.fn().mockResolvedValue(mockLots)
      const mockOrderBy = vi.fn().mockReturnValue({ forUpdate: mockForUpdate })
      const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 })

      mockKnex = vi.fn(() => ({ where: mockWhere1 }))
      service = new StockAllocationService(mockKnex as any)

      await expect(service.allocateStock(variantId, 50)).rejects.toThrow(
        InsufficientStockError
      )
    })

    it("should throw error for negative quantity", async () => {
      await expect(service.allocateStock("variant-1", -10)).rejects.toThrow(
        "Quantity must be positive"
      )
    })

    it("should throw error for zero quantity", async () => {
      await expect(service.allocateStock("variant-1", 0)).rejects.toThrow(
        "Quantity must be positive"
      )
    })
  })

  describe("rollbackAllocation", () => {
    it("should restore quantities to stock lots in reverse order", async () => {
      const allocations = [
        {
          lot_id: "lot-1",
          variant_id: "variant-1",
          quantity_allocated: 30,
          allocated_at: new Date(),
        },
        {
          lot_id: "lot-2",
          variant_id: "variant-1",
          quantity_allocated: 50,
          allocated_at: new Date(),
        },
      ]

      const mockUpdate = vi.fn().mockResolvedValue(1)
      const mockIncrement = vi.fn().mockReturnValue({ update: mockUpdate })
      const mockWhere = vi.fn().mockReturnValue({ increment: mockIncrement })

      mockKnex = vi.fn(() => ({ where: mockWhere }))
      mockKnex.fn = { now: vi.fn(() => new Date()) }
      
      service = new StockAllocationService(mockKnex as any)

      await service.rollbackAllocation(allocations)

      // Verify increment was called twice (once per allocation)
      expect(mockIncrement).toHaveBeenCalledTimes(2)
      
      // Verify reverse order: lot-2 first, then lot-1
      expect(mockWhere.mock.calls[0][0]).toEqual({ lot_id: "lot-2" })
      expect(mockWhere.mock.calls[1][0]).toEqual({ lot_id: "lot-1" })
    })

    it("should handle empty allocations array", async () => {
      await expect(service.rollbackAllocation([])).resolves.not.toThrow()
    })
  })

  describe("checkAvailability", () => {
    it("should return available quantity for variant", async () => {
      const variantId = "variant-1"
      const mockResult = { total: "80" }

      const mockFirst = vi.fn().mockResolvedValue(mockResult)
      const mockSum = vi.fn().mockReturnValue({ first: mockFirst })
      const mockWhere = vi.fn().mockReturnValue({ sum: mockSum })

      mockKnex = vi.fn(() => ({ where: mockWhere }))
      service = new StockAllocationService(mockKnex as any)

      const result = await service.checkAvailability(variantId)

      expect(result.available).toBe(true)
      expect(result.available_quantity).toBe(80)
      expect(result.variant_id).toBe(variantId)
    })

    it("should return zero for variant with no stock", async () => {
      const variantId = "variant-1"
      const mockResult = { total: null }

      const mockFirst = vi.fn().mockResolvedValue(mockResult)
      const mockSum = vi.fn().mockReturnValue({ first: mockFirst })
      const mockWhere = vi.fn().mockReturnValue({ sum: mockSum })

      mockKnex = vi.fn(() => ({ where: mockWhere }))
      service = new StockAllocationService(mockKnex as any)

      const result = await service.checkAvailability(variantId)

      expect(result.available).toBe(false)
      expect(result.available_quantity).toBe(0)
      expect(result.variant_id).toBe(variantId)
    })
  })
})
