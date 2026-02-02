/**
 * Stock Lot Repository
 *
 * Provides database access methods for stock lots.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  DBStockLot,
  CreateLotInput,
  UpdateLotInput,
  LotFilters,
} from "./types.js"

export class StockLotRepository {
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
  }

  /**
   * Create a new stock lot
   */
  async create(input: CreateLotInput): Promise<DBStockLot> {
    const [lot] = await this.knex<DBStockLot>("stock_lots")
      .insert({
        listing_id: input.listing_id,
        quantity_total: input.quantity,
        location_id: input.location_id ?? null,
        owner_id: input.owner_id ?? null,
        listed: input.listed ?? true,
        notes: input.notes ?? null,
      })
      .returning("*")

    return lot
  }

  /**
   * Get a stock lot by ID
   */
  async getById(lotId: string): Promise<DBStockLot | null> {
    const lot = await this.knex<DBStockLot>("stock_lots")
      .where({ lot_id: lotId })
      .first()

    return lot || null
  }

  /**
   * Get all lots for a listing with optional filters
   */
  async getLots(filters: LotFilters): Promise<DBStockLot[]> {
    let query = this.knex<DBStockLot>("stock_lots")

    if (filters.listing_id) {
      query = query.where({ listing_id: filters.listing_id })
    }

    if (filters.location_id !== undefined) {
      query = query.where({ location_id: filters.location_id })
    }

    if (filters.owner_id !== undefined) {
      query = query.where({ owner_id: filters.owner_id })
    }

    if (filters.listed !== undefined) {
      query = query.where({ listed: filters.listed })
    }

    const lots = await query.orderBy("created_at", "asc")

    return lots
  }

  /**
   * Update a stock lot
   */
  async update(lotId: string, updates: UpdateLotInput): Promise<DBStockLot> {
    const updateData: Partial<DBStockLot> = {
      updated_at: new Date(),
    }

    if (updates.quantity !== undefined) {
      updateData.quantity_total = updates.quantity
    }

    if (updates.location_id !== undefined) {
      updateData.location_id = updates.location_id
    }

    if (updates.owner_id !== undefined) {
      updateData.owner_id = updates.owner_id
    }

    if (updates.listed !== undefined) {
      updateData.listed = updates.listed
    }

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes
    }

    const [lot] = await this.knex<DBStockLot>("stock_lots")
      .where({ lot_id: lotId })
      .update(updateData)
      .returning("*")

    return lot
  }

  /**
   * Delete a stock lot
   */
  async delete(lotId: string): Promise<void> {
    await this.knex<DBStockLot>("stock_lots").where({ lot_id: lotId }).delete()
  }

  /**
   * Get the Unspecified location lot for a listing (if it exists)
   */
  async getUnspecifiedLot(listingId: string): Promise<DBStockLot | null> {
    const lot = await this.knex<DBStockLot>("stock_lots")
      .where({
        listing_id: listingId,
        location_id: null,
        listed: true,
      })
      .first()

    return lot || null
  }

  /**
   * Check if a lot has active allocations
   */
  async hasActiveAllocations(lotId: string): Promise<boolean> {
    const allocation = await this.knex("stock_allocations")
      .where({
        lot_id: lotId,
        status: "active",
      })
      .first()

    return !!allocation
  }
}
