/**
 * Order Lifecycle Service Tests
 *
 * Tests for order lifecycle integration with stock allocation
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 13.4
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { OrderLifecycleService } from "./order-lifecycle.service.js"
import { AllocationService } from "./allocation.service.js"
import { StockLotService } from "../stock-lot/stock-lot.service.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { Knex } from "knex"
import { v4 as uuidv4 } from "uuid"

describe("OrderLifecycleService Integration Tests", () => {
  let service: OrderLifecycleService
  let allocationService: AllocationService
  let stockLotService: StockLotService
  let knex: Knex

  // Test data IDs
  let testListingId: string
  let testOrderId: string
  let testUserId: string
  let testContractorId: string
  let unspecifiedLocationId: string

  beforeEach(async () => {
    knex = getKnex()
    service = new OrderLifecycleService(knex)
    allocationService = new AllocationService(knex)
    stockLotService = new StockLotService(knex)

    // Generate test IDs
    testListingId = uuidv4()
    testOrderId = uuidv4()
    testUserId = uuidv4()
    testContractorId = uuidv4()

    // Get Unspecified location ID
    const unspecifiedLocation = await knex("locations")
      .where({ name: "Unspecified" })
      .first()
    unspecifiedLocationId = unspecifiedLocation?.location_id

    // Create test user (minimal required fields)
    await knex("accounts").insert({
      user_id: testUserId,
      username: `test_user_${Date.now()}`,
      spectrum_id: `TEST${Date.now()}`,
    })

    // Create test contractor
    await knex("contractors").insert({
      contractor_id: testContractorId,
      spectrum_id: `TEST_CONTRACTOR_${Date.now()}`,
      name: "Test Contractor",
    })

    // Create test listing
    await knex("market_listings").insert({
      listing_id: testListingId,
      user_seller_id: testUserId,
      sale_type: "sale",
      price: 100,
      quantity_available: 0, // Will be managed by lots
      status: "active",
      title: "Test Listing",
      description: "Test Description",
      timestamp: new Date(),
    })

    // Create test order
    await knex("orders").insert({
      order_id: testOrderId,
      customer_id: testUserId,
      contractor_id: testContractorId,
      kind: "Delivery",
      cost: 100,
      title: "Test Order",
      description: "Test Order Description",
      status: "pending",
      payment_type: "one-time",
      timestamp: new Date(),
    })
  })

  afterEach(async () => {
    // Clean up test data in reverse order of dependencies
    await knex("stock_allocations").where({ order_id: testOrderId }).del()
    await knex("stock_lots").where({ listing_id: testListingId }).del()
    await knex("orders").where({ order_id: testOrderId }).del()
    await knex("market_listings").where({ listing_id: testListingId }).del()
    await knex("contractors").where({ contractor_id: testContractorId }).del()
    await knex("accounts").where({ user_id: testUserId }).del()
  })

  describe("Order Creation with Automatic Allocation", () => {
    it("should allocate stock when order is created with sufficient stock", async () => {
      // Requirement 6.1, 6.2, 6.3

      // Create stock lot with sufficient quantity
      await stockLotService.createLot({
        listing_id: testListingId,
        quantity: 100,
        location_id: unspecifiedLocationId,
        listed: true,
      })

      // Allocate stock for order
      const result = await service.allocateStockForOrder(
        testOrderId,
        [{ listing_id: testListingId, quantity: 50 }],
        testContractorId,
      )

      // Verify allocation result
      expect(result.total_requested).toBe(50)
      expect(result.total_allocated).toBe(50)
      expect(result.has_partial_allocations).toBe(false)
      expect(result.allocations).toHaveLength(1)
      expect(result.allocations[0].listing_id).toBe(testListingId)
      expect(result.allocations[0].quantity_allocated).toBe(50)

      // Verify allocations were created in database
      const allocations = await allocationService.getAllocations(testOrderId)
      expect(allocations).toHaveLength(1)
      expect(allocations[0].quantity).toBe(50)
      expect(allocations[0].status).toBe("active")
    })

    it("should handle partial allocation when insufficient stock", async () => {
      // Requirement 6.3

      // Create stock lot with insufficient quantity
      await stockLotService.createLot({
        listing_id: testListingId,
        quantity: 30,
        location_id: unspecifiedLocationId,
        listed: true,
      })

      // Allocate stock for order (requesting more than available)
      const result = await service.allocateStockForOrder(
        testOrderId,
        [{ listing_id: testListingId, quantity: 50 }],
        testContractorId,
      )

      // Verify partial allocation
      expect(result.total_requested).toBe(50)
      expect(result.total_allocated).toBe(30)
      expect(result.has_partial_allocations).toBe(true)
      expect(result.allocations[0].is_partial).toBe(true)
    })

    it("should allocate from multiple lots using FIFO", async () => {
      // Requirement 6.2

      // Create multiple lots at different times
      const lot1 = await stockLotService.createLot({
        listing_id: testListingId,
        quantity: 20,
        location_id: unspecifiedLocationId,
        listed: true,
      })

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))

      const lot2 = await stockLotService.createLot({
        listing_id: testListingId,
        quantity: 30,
        location_id: unspecifiedLocationId,
        listed: true,
      })

      // Allocate stock for order
      const result = await service.allocateStockForOrder(
        testOrderId,
        [{ listing_id: testListingId, quantity: 40 }],
        testContractorId,
      )

      // Verify allocation used FIFO (oldest lot first)
      expect(result.total_allocated).toBe(40)

      const allocations = await allocationService.getAllocations(testOrderId)
      expect(allocations).toHaveLength(2)

      // First allocation should be from lot1 (20 units)
      const alloc1 = allocations.find((a) => a.lot_id === lot1.lot_id)
      expect(alloc1?.quantity).toBe(20)

      // Second allocation should be from lot2 (20 units)
      const alloc2 = allocations.find((a) => a.lot_id === lot2.lot_id)
      expect(alloc2?.quantity).toBe(20)
    })
  })

  describe("Order Cancellation Releases Allocations", () => {
    it("should release allocations when order is cancelled", async () => {
      // Requirement 6.4

      // Create stock and allocate
      await stockLotService.createLot({
        listing_id: testListingId,
        quantity: 100,
        location_id: unspecifiedLocationId,
        listed: true,
      })

      await service.allocateStockForOrder(
        testOrderId,
        [{ listing_id: testListingId, quantity: 50 }],
        testContractorId,
      )

      // Verify allocation exists
      let allocations = await allocationService.getAllocations(testOrderId)
      expect(allocations).toHaveLength(1)
      expect(allocations[0].status).toBe("active")

      // Release allocations
      await service.releaseAllocationsForOrder(testOrderId)

      // Verify allocations are released
      allocations = await allocationService.getAllocations(testOrderId)
      expect(allocations).toHaveLength(1)
      expect(allocations[0].status).toBe("released")

      // Verify stock is available again
      const availableStock = await knex.raw(
        "SELECT get_available_stock(?::uuid) as available",
        [testListingId],
      )
      expect(availableStock.rows[0].available).toBe(100)
    })
  })

  describe("Order Fulfillment Consumes Allocations", () => {
    it("should consume allocations when order is fulfilled", async () => {
      // Requirement 6.5, 10.5

      // Create stock and allocate
      const lot = await stockLotService.createLot({
        listing_id: testListingId,
        quantity: 100,
        location_id: unspecifiedLocationId,
        listed: true,
      })

      await service.allocateStockForOrder(
        testOrderId,
        [{ listing_id: testListingId, quantity: 50 }],
        testContractorId,
      )

      // Consume allocations
      await service.consumeAllocationsForOrder(testOrderId)

      // Verify allocations are fulfilled
      const allocations = await allocationService.getAllocations(testOrderId)
      expect(allocations).toHaveLength(1)
      expect(allocations[0].status).toBe("fulfilled")

      // Verify lot quantity was reduced
      const updatedLot = await stockLotService.getLotById(lot.lot_id)
      expect(updatedLot?.quantity_total).toBe(50)
    })
  })

  describe("Concurrent Order Creation", () => {
    it("should handle concurrent allocation attempts safely", async () => {
      // Requirement 13.4

      // Create stock lot
      await stockLotService.createLot({
        listing_id: testListingId,
        quantity: 100,
        location_id: unspecifiedLocationId,
        listed: true,
      })

      // Create second order for concurrent test
      const testOrderId2 = uuidv4()
      await knex("orders").insert({
        order_id: testOrderId2,
        customer_id: testUserId,
        contractor_id: testContractorId,
        kind: "Delivery",
        cost: 100,
        title: "Test Order 2",
        description: "Test Order Description 2",
        status: "pending",
        payment_type: "one-time",
        timestamp: new Date(),
      })

      try {
        // Attempt concurrent allocations
        const [result1, result2] = await Promise.all([
          service.allocateStockForOrder(
            testOrderId,
            [{ listing_id: testListingId, quantity: 60 }],
            testContractorId,
          ),
          service.allocateStockForOrder(
            testOrderId2,
            [{ listing_id: testListingId, quantity: 60 }],
            testContractorId,
          ),
        ])

        // Verify total allocated doesn't exceed available
        const totalAllocated = result1.total_allocated + result2.total_allocated
        expect(totalAllocated).toBeLessThanOrEqual(100)

        // At least one should be partial
        expect(
          result1.has_partial_allocations || result2.has_partial_allocations,
        ).toBe(true)
      } finally {
        // Clean up second order
        await knex("stock_allocations").where({ order_id: testOrderId2 }).del()
        await knex("orders").where({ order_id: testOrderId2 }).del()
      }
    })
  })
})
