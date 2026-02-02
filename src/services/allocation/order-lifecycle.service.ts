/**
 * Order Lifecycle Integration Service
 *
 * Integrates stock allocation with the order lifecycle:
 * - Auto-allocates stock when orders are created
 * - Releases allocations when orders are cancelled
 * - Consumes allocations when orders are fulfilled
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.5
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  AllocationService,
  InsufficientStockError,
} from "./allocation.service.js"
import logger from "../../logger/logger.js"

export interface OrderMarketListing {
  listing_id: string
  quantity: number
}

export interface AllocationSummary {
  listing_id: string
  quantity_requested: number
  quantity_allocated: number
  is_partial: boolean
}

export interface OrderAllocationResult {
  order_id: string
  allocations: AllocationSummary[]
  has_partial_allocations: boolean
  total_requested: number
  total_allocated: number
}

export class OrderLifecycleService {
  private allocationService: AllocationService
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
    this.allocationService = new AllocationService(this.knex)
  }

  /**
   * Allocate stock for an order when it's created
   *
   * Requirements: 6.1, 6.2, 6.3
   *
   * @param orderId - The order ID
   * @param marketListings - Array of listings with quantities
   * @param contractorId - Optional contractor ID for strategy-based allocation
   * @returns Allocation result summary
   */
  async allocateStockForOrder(
    orderId: string,
    marketListings: OrderMarketListing[],
    contractorId?: string | null,
  ): Promise<OrderAllocationResult> {
    const allocations: AllocationSummary[] = []
    let hasPartialAllocations = false
    let totalRequested = 0
    let totalAllocated = 0

    for (const { listing_id, quantity } of marketListings) {
      totalRequested += quantity

      try {
        // Use strategy-based allocation if contractor is specified
        const result = contractorId
          ? await this.allocationService.allocateWithStrategy(
              orderId,
              listing_id,
              quantity,
              contractorId,
            )
          : await this.allocationService.autoAllocate(
              orderId,
              listing_id,
              quantity,
            )

        allocations.push({
          listing_id,
          quantity_requested: quantity,
          quantity_allocated: result.total_allocated,
          is_partial: result.is_partial,
        })

        totalAllocated += result.total_allocated

        if (result.is_partial) {
          hasPartialAllocations = true
          logger.warn("Partial allocation for order", {
            order_id: orderId,
            listing_id,
            requested: quantity,
            allocated: result.total_allocated,
          })
        }
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          // Handle insufficient stock gracefully
          allocations.push({
            listing_id,
            quantity_requested: quantity,
            quantity_allocated: 0,
            is_partial: true,
          })
          hasPartialAllocations = true

          logger.warn("Insufficient stock for order allocation", {
            order_id: orderId,
            listing_id,
            requested: quantity,
            available: error.available,
          })
        } else {
          // Re-throw unexpected errors
          throw error
        }
      }
    }

    logger.info("Stock allocated for order", {
      order_id: orderId,
      total_requested: totalRequested,
      total_allocated: totalAllocated,
      has_partial: hasPartialAllocations,
    })

    return {
      order_id: orderId,
      allocations,
      has_partial_allocations: hasPartialAllocations,
      total_requested: totalRequested,
      total_allocated: totalAllocated,
    }
  }

  /**
   * Release allocations when an order is cancelled
   *
   * Requirements: 6.4
   *
   * @param orderId - The order ID
   */
  async releaseAllocationsForOrder(orderId: string): Promise<void> {
    try {
      await this.allocationService.releaseAllocations(orderId)

      logger.info("Allocations released for cancelled order", {
        order_id: orderId,
      })
    } catch (error) {
      logger.error("Failed to release allocations for order", {
        order_id: orderId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Consume allocations when an order is fulfilled
   *
   * Requirements: 6.5, 10.5
   *
   * @param orderId - The order ID
   */
  async consumeAllocationsForOrder(orderId: string): Promise<void> {
    try {
      await this.allocationService.consumeAllocations(orderId)

      logger.info("Allocations consumed for fulfilled order", {
        order_id: orderId,
      })
    } catch (error) {
      logger.error("Failed to consume allocations for order", {
        order_id: orderId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get allocation summary for an order
   *
   * @param orderId - The order ID
   * @returns Array of allocations with lot details
   */
  async getAllocationSummary(orderId: string) {
    const allocations = await this.allocationService.getAllocations(orderId)

    // Group by listing_id
    const byListing = new Map<string, typeof allocations>()

    for (const allocation of allocations) {
      // Get the lot to find the listing_id
      const lot = await this.knex("stock_lots")
        .where("lot_id", allocation.lot_id)
        .first()

      if (lot) {
        const existing = byListing.get(lot.listing_id) || []
        byListing.set(lot.listing_id, [...existing, allocation])
      }
    }

    return Array.from(byListing.entries()).map(([listing_id, allocs]) => ({
      listing_id,
      allocations: allocs,
      total_quantity: allocs.reduce((sum, a) => sum + a.quantity, 0),
      status: allocs[0]?.status || "unknown",
    }))
  }
}
