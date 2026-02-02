/**
 * Allocation Service
 * 
 * Manages stock allocation for orders, including automatic FIFO allocation,
 * manual allocation, release, and consumption.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { AllocationRepository } from "./repository.js"
import { StockLotRepository } from "../stock-lot/repository.js"
import {
  DBAllocation,
  ManualAllocationInput,
  AllocationResult,
  AllocationStrategyType,
  AllocationStrategyInput,
  DBAllocationStrategy,
} from "./types.js"
import { DBStockLot } from "../stock-lot/types.js"

/**
 * Error thrown when insufficient stock is available for allocation
 */
export class InsufficientStockError extends Error {
  constructor(
    public requested: number,
    public available: number,
    public listingId: string
  ) {
    super(`Insufficient stock: requested ${requested}, available ${available}`)
    this.name = 'InsufficientStockError'
  }
}

/**
 * Error thrown when allocation validation fails
 */
export class AllocationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AllocationValidationError'
  }
}

export class AllocationService {
  private allocationRepo: AllocationRepository
  private stockLotRepo: StockLotRepository
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
    this.allocationRepo = new AllocationRepository(this.knex)
    this.stockLotRepo = new StockLotRepository(this.knex)
  }

  /**
   * Automatically allocate stock to an order using FIFO strategy
   * 
   * Requirements: 6.1, 6.2, 6.3
   * 
   * @param orderId - The order to allocate stock for
   * @param listingId - The listing to allocate stock from
   * @param quantity - The quantity to allocate
   * @returns Allocation result with created allocations
   */
  async autoAllocate(
    orderId: string,
    listingId: string,
    quantity: number
  ): Promise<AllocationResult> {
    return await this.knex.transaction(async (trx) => {
      const allocationRepo = new AllocationRepository(trx)
      const stockLotRepo = new StockLotRepository(trx)

      // Get all listed lots for the listing, ordered by created_at (FIFO)
      const lots = await stockLotRepo.getLots({
        listing_id: listingId,
        listed: true,
      })

      // Lock the lots for update to prevent concurrent allocation issues
      await trx('stock_lots')
        .whereIn('lot_id', lots.map(l => l.lot_id))
        .forUpdate()

      // Calculate available quantity for each lot
      const lotsWithAvailable = await Promise.all(
        lots.map(async (lot) => {
          const allocated = await allocationRepo.getAllocatedQuantity(lot.lot_id)
          const available = lot.quantity_total - allocated
          return { lot, available }
        })
      )

      // Filter to only lots with available stock
      const availableLots = lotsWithAvailable.filter(l => l.available > 0)

      // Calculate total available stock
      const totalAvailable = availableLots.reduce((sum, l) => sum + l.available, 0)

      // Check if we have enough stock
      if (totalAvailable === 0) {
        throw new InsufficientStockError(quantity, 0, listingId)
      }

      // Allocate from lots in FIFO order
      const allocations: DBAllocation[] = []
      let remainingQuantity = quantity

      for (const { lot, available } of availableLots) {
        if (remainingQuantity <= 0) break

        const allocateQuantity = Math.min(remainingQuantity, available)

        const allocation = await allocationRepo.create({
          lot_id: lot.lot_id,
          order_id: orderId,
          quantity: allocateQuantity,
          status: 'active',
        })

        allocations.push(allocation)
        remainingQuantity -= allocateQuantity
      }

      const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0)
      const isPartial = totalAllocated < quantity

      return {
        allocations,
        total_allocated: totalAllocated,
        is_partial: isPartial,
      }
    })
  }

  /**
   * Manually allocate specific lots to an order
   * 
   * Requirements: 7.1, 7.2, 7.3, 7.4
   * 
   * @param orderId - The order to allocate stock for
   * @param allocations - Array of lot selections with quantities
   * @returns Allocation result with created allocations
   */
  async manualAllocate(
    orderId: string,
    allocations: ManualAllocationInput[]
  ): Promise<AllocationResult> {
    return await this.knex.transaction(async (trx) => {
      const allocationRepo = new AllocationRepository(trx)
      const stockLotRepo = new StockLotRepository(trx)

      // Validate all lots exist and have sufficient available quantity
      const lotIds = allocations.map(a => a.lot_id)
      const lots = await Promise.all(
        lotIds.map(id => stockLotRepo.getById(id))
      )

      // Lock the lots for update
      await trx('stock_lots')
        .whereIn('lot_id', lotIds)
        .forUpdate()

      // Validate each allocation
      for (let i = 0; i < allocations.length; i++) {
        const input = allocations[i]
        const lot = lots[i]

        if (!lot) {
          throw new AllocationValidationError(`Lot ${input.lot_id} not found`)
        }

        const allocated = await allocationRepo.getAllocatedQuantity(lot.lot_id)
        const available = lot.quantity_total - allocated

        if (input.quantity > available) {
          throw new AllocationValidationError(
            `Cannot allocate ${input.quantity} from lot ${lot.lot_id}. Only ${available} available.`
          )
        }

        if (input.quantity <= 0) {
          throw new AllocationValidationError(
            `Allocation quantity must be positive. Got ${input.quantity} for lot ${lot.lot_id}`
          )
        }
      }

      // Create all allocations
      const createdAllocations = await allocationRepo.createMany(
        allocations.map(a => ({
          lot_id: a.lot_id,
          order_id: orderId,
          quantity: a.quantity,
          status: 'active',
        }))
      )

      const totalAllocated = createdAllocations.reduce((sum, a) => sum + a.quantity, 0)

      return {
        allocations: createdAllocations,
        total_allocated: totalAllocated,
        is_partial: false, // Manual allocation is always complete or fails
      }
    })
  }

  /**
   * Release all allocations for an order (e.g., when order is cancelled)
   * 
   * Requirements: 6.4, 7.5
   * 
   * @param orderId - The order to release allocations for
   */
  async releaseAllocations(orderId: string): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const allocationRepo = new AllocationRepository(trx)

      // Update all active allocations to released status
      await allocationRepo.updateStatusByOrderId(orderId, 'released')
    })
  }

  /**
   * Consume allocations for an order (e.g., when order is fulfilled)
   * 
   * Requirements: 6.5, 10.5
   * 
   * @param orderId - The order to consume allocations for
   */
  async consumeAllocations(orderId: string): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const allocationRepo = new AllocationRepository(trx)
      const stockLotRepo = new StockLotRepository(trx)

      // Get all active allocations for the order
      const allocations = await allocationRepo.getActiveByOrderId(orderId)

      // Lock the lots for update
      const lotIds = [...new Set(allocations.map(a => a.lot_id))]
      await trx('stock_lots')
        .whereIn('lot_id', lotIds)
        .forUpdate()

      // Reduce lot quantities
      for (const allocation of allocations) {
        const lot = await stockLotRepo.getById(allocation.lot_id)
        if (!lot) {
          throw new Error(`Lot ${allocation.lot_id} not found`)
        }

        const newQuantity = lot.quantity_total - allocation.quantity
        if (newQuantity < 0) {
          throw new Error(
            `Cannot consume ${allocation.quantity} from lot ${lot.lot_id}. Only ${lot.quantity_total} available.`
          )
        }

        await stockLotRepo.update(lot.lot_id, {
          quantity: newQuantity,
        })
      }

      // Update allocation status to fulfilled
      await allocationRepo.updateStatusByOrderId(orderId, 'fulfilled')
    })
  }

  /**
   * Get all allocations for an order
   * 
   * @param orderId - The order to get allocations for
   * @returns Array of allocations
   */
  async getAllocations(orderId: string): Promise<DBAllocation[]> {
    return this.allocationRepo.getByOrderId(orderId)
  }

  /**
   * Get the total allocated quantity for a lot
   * 
   * @param lotId - The lot to get allocated quantity for
   * @returns Total allocated quantity
   */
  async getAllocatedQuantity(lotId: string): Promise<number> {
    return this.allocationRepo.getAllocatedQuantity(lotId)
  }

  /**
   * Get allocation strategy for a contractor
   * 
   * Requirements: 12.1, 12.2, 12.4, 12.5
   * 
   * @param contractorId - The contractor to get strategy for
   * @returns Allocation strategy or null if not set (defaults to FIFO)
   */
  async getAllocationStrategy(contractorId: string): Promise<DBAllocationStrategy | null> {
    return this.allocationRepo.getStrategy(contractorId)
  }

  /**
   * Set allocation strategy for a contractor
   * 
   * Requirements: 12.1, 12.2, 12.4, 12.5
   * 
   * @param input - Strategy configuration
   * @returns Created or updated strategy
   */
  async setAllocationStrategy(input: AllocationStrategyInput): Promise<DBAllocationStrategy> {
    return this.allocationRepo.upsertStrategy(input)
  }

  /**
   * Allocate stock using the configured strategy for a contractor
   * 
   * Requirements: 12.1, 12.2, 12.4, 12.5
   * 
   * @param orderId - The order to allocate stock for
   * @param listingId - The listing to allocate stock from
   * @param quantity - The quantity to allocate
   * @param contractorId - The contractor ID to get strategy for
   * @returns Allocation result
   */
  async allocateWithStrategy(
    orderId: string,
    listingId: string,
    quantity: number,
    contractorId: string
  ): Promise<AllocationResult> {
    const strategy = await this.getAllocationStrategy(contractorId)
    const strategyType = strategy?.strategy_type ?? 'fifo'

    if (strategyType === 'fifo') {
      return this.autoAllocate(orderId, listingId, quantity)
    } else if (strategyType === 'location_priority') {
      return this.allocateWithLocationPriority(
        orderId,
        listingId,
        quantity,
        strategy!.location_priority_order ?? []
      )
    }

    // Default to FIFO
    return this.autoAllocate(orderId, listingId, quantity)
  }

  /**
   * Allocate stock using location priority strategy
   * 
   * Requirements: 12.2, 12.3
   * 
   * @param orderId - The order to allocate stock for
   * @param listingId - The listing to allocate stock from
   * @param quantity - The quantity to allocate
   * @param locationPriority - Array of location IDs in priority order
   * @returns Allocation result
   */
  private async allocateWithLocationPriority(
    orderId: string,
    listingId: string,
    quantity: number,
    locationPriority: string[]
  ): Promise<AllocationResult> {
    return await this.knex.transaction(async (trx) => {
      const allocationRepo = new AllocationRepository(trx)
      const stockLotRepo = new StockLotRepository(trx)

      // Get all listed lots for the listing
      const allLots = await stockLotRepo.getLots({
        listing_id: listingId,
        listed: true,
      })

      // Lock the lots for update
      await trx('stock_lots')
        .whereIn('lot_id', allLots.map(l => l.lot_id))
        .forUpdate()

      // Calculate available quantity for each lot
      const lotsWithAvailable = await Promise.all(
        allLots.map(async (lot) => {
          const allocated = await allocationRepo.getAllocatedQuantity(lot.lot_id)
          const available = lot.quantity_total - allocated
          return { lot, available }
        })
      )

      // Filter to only lots with available stock
      const availableLots = lotsWithAvailable.filter(l => l.available > 0)

      // Sort lots by location priority, then by created_at (FIFO within same priority)
      const sortedLots = availableLots.sort((a, b) => {
        const aPriority = a.lot.location_id
          ? locationPriority.indexOf(a.lot.location_id)
          : -1
        const bPriority = b.lot.location_id
          ? locationPriority.indexOf(b.lot.location_id)
          : -1

        // If both have priority, sort by priority
        if (aPriority !== -1 && bPriority !== -1) {
          if (aPriority !== bPriority) {
            return aPriority - bPriority
          }
        }

        // If only one has priority, prioritize it
        if (aPriority !== -1 && bPriority === -1) return -1
        if (aPriority === -1 && bPriority !== -1) return 1

        // Otherwise, sort by created_at (FIFO)
        return a.lot.created_at.getTime() - b.lot.created_at.getTime()
      })

      // Calculate total available stock
      const totalAvailable = sortedLots.reduce((sum, l) => sum + l.available, 0)

      // Check if we have enough stock
      if (totalAvailable === 0) {
        throw new InsufficientStockError(quantity, 0, listingId)
      }

      // Allocate from lots in priority order
      const allocations: DBAllocation[] = []
      let remainingQuantity = quantity

      for (const { lot, available } of sortedLots) {
        if (remainingQuantity <= 0) break

        const allocateQuantity = Math.min(remainingQuantity, available)

        const allocation = await allocationRepo.create({
          lot_id: lot.lot_id,
          order_id: orderId,
          quantity: allocateQuantity,
          status: 'active',
        })

        allocations.push(allocation)
        remainingQuantity -= allocateQuantity
      }

      const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0)
      const isPartial = totalAllocated < quantity

      return {
        allocations,
        total_allocated: totalAllocated,
        is_partial: isPartial,
      }
    })
  }
}
