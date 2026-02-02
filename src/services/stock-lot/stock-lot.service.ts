/**
 * Stock Lot Service
 * 
 * Business logic for managing stock lots, including CRUD operations,
 * aggregation, and stock transfers.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { StockLotRepository } from "./repository.js"
import {
  DBStockLot,
  CreateLotInput,
  UpdateLotInput,
  LotFilters,
  StockAggregation,
  TransferLotInput,
  TransferLotResult,
} from "./types.js"
import {
  InsufficientStockError,
  InvalidQuantityError,
  CharacterLimitError,
} from "./errors.js"
import logger from "../../logger/logger.js"

export class StockLotService {
  private repository: StockLotRepository
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
    this.repository = new StockLotRepository(this.knex)
  }

  /**
   * Update stock using the simple interface (single number)
   * Creates or updates an Unspecified location lot with listed=true
   * 
   * Requirements: 1.1, 1.4, 4.5
   */
  async updateSimpleStock(listingId: string, quantity: number): Promise<void> {
    if (quantity < 0) {
      throw new InvalidQuantityError(quantity, "Quantity must be non-negative")
    }

    // Find or create Unspecified location lot
    const existingLot = await this.repository.getUnspecifiedLot(listingId)

    if (existingLot) {
      // Update existing Unspecified lot
      await this.repository.update(existingLot.lot_id, { quantity })
    } else {
      // Create new Unspecified lot
      await this.repository.create({
        listing_id: listingId,
        quantity,
        location_id: null,
        listed: true,
      })
    }

    logger.info("Simple stock updated", { listingId, quantity })
  }

  /**
   * Get total stock for a listing (simple interface)
   * 
   * Requirements: 1.2
   */
  async getSimpleStock(listingId: string): Promise<number> {
    const total = await this.getTotalStock(listingId)
    return total
  }

  /**
   * Create a new stock lot with validation
   * 
   * Requirements: 2.1, 2.2, 2.4, 3.1, 4.1, 8.1, 8.2
   */
  async createLot(input: CreateLotInput): Promise<DBStockLot> {
    // Validate quantity
    if (input.quantity < 0) {
      throw new InvalidQuantityError(input.quantity, "Quantity must be non-negative")
    }

    // Validate notes length
    if (input.notes && input.notes.length > 1000) {
      throw new CharacterLimitError("notes", input.notes.length, 1000)
    }

    const lot = await this.repository.create(input)

    logger.info("Stock lot created", {
      lotId: lot.lot_id,
      listingId: lot.listing_id,
      quantity: lot.quantity_total,
    })

    return lot
  }

  /**
   * Update an existing stock lot
   * 
   * Requirements: 2.4, 4.1, 8.5
   */
  async updateLot(
    lotId: string,
    updates: UpdateLotInput,
  ): Promise<DBStockLot> {
    // Validate quantity if provided
    if (updates.quantity !== undefined && updates.quantity < 0) {
      throw new InvalidQuantityError(updates.quantity, "Quantity must be non-negative")
    }

    // Validate notes length if provided
    if (updates.notes && updates.notes.length > 1000) {
      throw new CharacterLimitError("notes", updates.notes.length, 1000)
    }

    const lot = await this.repository.update(lotId, updates)

    logger.info("Stock lot updated", {
      lotId,
      updates,
    })

    return lot
  }

  /**
   * Delete a stock lot
   * Verifies no active allocations exist before deletion
   * 
   * Requirements: 2.4
   */
  async deleteLot(lotId: string): Promise<void> {
    // Check for active allocations
    const hasAllocations = await this.repository.hasActiveAllocations(lotId)

    if (hasAllocations) {
      throw new Error(
        "Cannot delete lot with active allocations. Release allocations first.",
      )
    }

    await this.repository.delete(lotId)

    logger.info("Stock lot deleted", { lotId })
  }

  /**
   * Get lots for a listing with optional filters
   * 
   * Requirements: 2.1, 3.3, 3.4, 4.4
   */
  async getLots(filters: LotFilters): Promise<DBStockLot[]> {
    const lots = await this.repository.getLots(filters)
    return lots
  }

  /**
   * Get a single lot by ID
   */
  async getLotById(lotId: string): Promise<DBStockLot | null> {
    return await this.repository.getById(lotId)
  }

  /**
   * Get available stock for a listing (not allocated)
   * Calls database function for accurate calculation
   * 
   * Requirements: 1.2, 4.2, 4.3, 5.2
   */
  async getAvailableStock(listingId: string): Promise<number> {
    const result = await this.knex.raw<{ rows: Array<{ get_available_stock: number }> }>(
      "SELECT get_available_stock(?::uuid) as get_available_stock",
      [listingId],
    )

    return result.rows[0]?.get_available_stock ?? 0
  }

  /**
   * Get reserved stock for a listing (allocated to orders)
   * Calls database function for accurate calculation
   * 
   * Requirements: 1.2, 4.2, 4.3, 5.2
   */
  async getReservedStock(listingId: string): Promise<number> {
    const result = await this.knex.raw<{ rows: Array<{ get_reserved_stock: number }> }>(
      "SELECT get_reserved_stock(?::uuid) as get_reserved_stock",
      [listingId],
    )

    return result.rows[0]?.get_reserved_stock ?? 0
  }

  /**
   * Get total stock for a listing (all lots)
   * Calls database function for accurate calculation
   * 
   * Requirements: 1.2, 4.2, 4.3, 5.2
   */
  async getTotalStock(listingId: string): Promise<number> {
    const result = await this.knex.raw<{ rows: Array<{ get_total_stock: number }> }>(
      "SELECT get_total_stock(?::uuid) as get_total_stock",
      [listingId],
    )

    return result.rows[0]?.get_total_stock ?? 0
  }

  /**
   * Get stock aggregation (total, available, reserved)
   * 
   * Requirements: 1.2, 4.2, 4.3, 5.2
   */
  async getStockAggregation(listingId: string): Promise<StockAggregation> {
    const [total, available, reserved] = await Promise.all([
      this.getTotalStock(listingId),
      this.getAvailableStock(listingId),
      this.getReservedStock(listingId),
    ])

    return {
      total,
      available,
      reserved,
    }
  }

  /**
   * Transfer stock from one lot to another location
   * Handles both partial and full transfers
   * 
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
   */
  async transferLot(input: TransferLotInput): Promise<TransferLotResult> {
    return await this.knex.transaction(async (trx) => {
      const repository = new StockLotRepository(trx)

      // Get source lot
      const sourceLot = await repository.getById(input.source_lot_id)
      if (!sourceLot) {
        throw new Error("Source lot not found")
      }

      // Validate transfer quantity
      if (input.quantity <= 0) {
        throw new InvalidQuantityError(input.quantity, "Transfer quantity must be positive")
      }

      if (input.quantity > sourceLot.quantity_total) {
        throw new InsufficientStockError(
          input.quantity,
          sourceLot.quantity_total,
          sourceLot.listing_id,
        )
      }

      let destinationLot: DBStockLot

      if (input.quantity === sourceLot.quantity_total) {
        // Full transfer: update source lot's location
        destinationLot = await repository.update(input.source_lot_id, {
          location_id: input.destination_location_id,
        })

        logger.info("Full stock transfer completed", {
          sourceLotId: input.source_lot_id,
          destinationLocationId: input.destination_location_id,
          quantity: input.quantity,
        })

        return {
          source_lot: destinationLot, // Same lot, new location
          destination_lot: destinationLot,
        }
      } else {
        // Partial transfer: reduce source, create/update destination
        const newSourceQuantity = sourceLot.quantity_total - input.quantity

        // Update source lot
        const updatedSourceLot = await repository.update(input.source_lot_id, {
          quantity: newSourceQuantity,
        })

        // Find existing lot at destination with same properties
        const existingDestLots = await repository.getLots({
          listing_id: sourceLot.listing_id,
          location_id: input.destination_location_id,
          owner_id: sourceLot.owner_id,
          listed: sourceLot.listed,
        })

        if (existingDestLots.length > 0) {
          // Update existing destination lot
          const existingDestLot = existingDestLots[0]
          destinationLot = await repository.update(existingDestLot.lot_id, {
            quantity: existingDestLot.quantity_total + input.quantity,
          })
        } else {
          // Create new destination lot
          destinationLot = await repository.create({
            listing_id: sourceLot.listing_id,
            quantity: input.quantity,
            location_id: input.destination_location_id,
            owner_id: sourceLot.owner_id,
            listed: sourceLot.listed,
            notes: sourceLot.notes,
          })
        }

        logger.info("Partial stock transfer completed", {
          sourceLotId: input.source_lot_id,
          destinationLotId: destinationLot.lot_id,
          quantity: input.quantity,
        })

        return {
          source_lot: updatedSourceLot,
          destination_lot: destinationLot,
        }
      }
    })
  }
}

// Export singleton instance
export const stockLotService = new StockLotService()
