/**
 * Stock Allocation Service
 *
 * Manages stock allocation for V2 market orders with FIFO allocation logic.
 * Handles locking, allocation, rollback, and availability checking.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { InsufficientStockError } from "./errors.js"
import {
  DBListingItemLot,
  StockAllocation,
  StockAllocationResult,
  AvailabilityCheckResult,
} from "./types.js"

export class StockAllocationService {
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
  }

  /**
   * Allocate stock for a variant using FIFO allocation logic.
   * Uses SELECT FOR UPDATE to lock stock lots and prevent race conditions.
   * Allocates from oldest stock lots first (ORDER BY created_at ASC).
   * Handles partial allocation across multiple stock lots.
   *
   * @param variantId - The variant to allocate stock for
   * @param quantity - The quantity to allocate
   * @param trx - Optional transaction (if not provided, creates a new one)
   * @returns Stock allocation result with allocated lots
   * @throws InsufficientStockError when not enough stock available
   */
  async allocateStock(
    variantId: string,
    quantity: number,
    trx?: Knex.Transaction
  ): Promise<StockAllocationResult> {
    const useTransaction = trx || this.knex

    // Validate input
    if (quantity <= 0) {
      throw new Error("Quantity must be positive")
    }

    // Lock and fetch available stock lots in FIFO order (oldest first)
    const availableLots = await useTransaction<DBListingItemLot>("listing_item_lots")
      .where({
        variant_id: variantId,
        listed: true,
      })
      .where("quantity_total", ">", 0)
      .orderBy("created_at", "asc")
      .forUpdate() // Lock rows to prevent race conditions

    // Check if sufficient stock is available
    const totalAvailable = availableLots.reduce((sum, lot) => sum + lot.quantity_total, 0)
    if (totalAvailable < quantity) {
      throw new InsufficientStockError(variantId, quantity, totalAvailable)
    }

    // Allocate stock from lots using FIFO
    const allocations: StockAllocation[] = []
    let remainingToAllocate = quantity

    for (const lot of availableLots) {
      if (remainingToAllocate <= 0) {
        break
      }

      const allocateFromThisLot = Math.min(lot.quantity_total, remainingToAllocate)

      // Update the lot quantity
      await useTransaction("listing_item_lots")
        .where({ lot_id: lot.lot_id })
        .update({
          quantity_total: lot.quantity_total - allocateFromThisLot,
          updated_at: useTransaction.fn.now(),
        })

      // Record the allocation
      allocations.push({
        lot_id: lot.lot_id,
        variant_id: variantId,
        quantity_allocated: allocateFromThisLot,
        allocated_at: new Date(),
      })

      remainingToAllocate -= allocateFromThisLot
    }

    return {
      allocations,
      total_allocated: quantity,
    }
  }

  /**
   * Rollback stock allocation (for order cancellation).
   * Restores quantities to stock lots in reverse allocation order.
   * Uses database transaction for atomicity.
   *
   * @param allocations - The allocations to rollback
   * @param trx - Optional transaction (if not provided, creates a new one)
   */
  async rollbackAllocation(
    allocations: StockAllocation[],
    trx?: Knex.Transaction
  ): Promise<void> {
    const useTransaction = trx || this.knex

    // Restore quantities in reverse order
    const reversedAllocations = [...allocations].reverse()

    for (const allocation of reversedAllocations) {
      await useTransaction("listing_item_lots")
        .where({ lot_id: allocation.lot_id })
        .increment("quantity_total", allocation.quantity_allocated)
        .update({
          updated_at: useTransaction.fn.now(),
        })
    }
  }

  /**
   * Check availability for a variant (non-locking for UI).
   * Sums stock lot quantities for variant without locking.
   *
   * @param variantId - The variant to check availability for
   * @returns Availability check result with available quantity
   */
  async checkAvailability(variantId: string): Promise<AvailabilityCheckResult> {
    const result = await this.knex<DBListingItemLot>("listing_item_lots")
      .where({
        variant_id: variantId,
        listed: true,
      })
      .sum("quantity_total as total")
      .first()

    const availableQuantity = Number(result?.total || 0)

    return {
      available: availableQuantity > 0,
      available_quantity: availableQuantity,
      variant_id: variantId,
    }
  }
}
