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
        listing_id: this.knex.raw("?::uuid", [input.listing_id]),
        quantity_total: input.quantity,
        location_id: input.location_id ? this.knex.raw("?::uuid", [input.location_id]) : null,
        owner_id: input.owner_id ? this.knex.raw("?::uuid", [input.owner_id]) : null,
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

    if (lot) return lot

    // Check V2 listing_item_lots
    const v2Lot = await this.knex("listing_item_lots as lil")
      .join("listing_items as li", "lil.item_id", "li.item_id")
      .where("lil.lot_id", lotId)
      .select(
        "lil.lot_id",
        "li.listing_id",
        "lil.location_id",
        "lil.owner_id",
        "lil.quantity_total",
        "lil.listed",
        "lil.created_at",
        "lil.updated_at",
      )
      .first()

    return (v2Lot as DBStockLot) || null
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

    // If no V1 stock_lots found and filtering by listing_id, check V2 listing_item_lots
    if (lots.length === 0 && filters.listing_id) {
      const v2Lots = await this.knex("listing_item_lots as lil")
        .join("listing_items as li", "lil.item_id", "li.item_id")
        .where("li.listing_id", filters.listing_id)
        .modify((qb) => {
          if (filters.listed !== undefined) qb.where("lil.listed", filters.listed)
          if (filters.location_id !== undefined) qb.where("lil.location_id", filters.location_id)
          if (filters.owner_id !== undefined) qb.where("lil.owner_id", filters.owner_id)
        })
        .select(
          "lil.lot_id",
          this.knex.raw("? as listing_id", [filters.listing_id]),
          "lil.location_id",
          "lil.owner_id",
          "lil.quantity_total",
          "lil.listed",
          "lil.created_at",
          "lil.updated_at",
        )
        .orderBy("lil.created_at", "asc")

      return v2Lots as DBStockLot[]
    }

    return lots
  }

  /**
   * Update a stock lot
   */
  async update(lotId: string, updates: UpdateLotInput): Promise<DBStockLot> {
    const updateData: Partial<DBStockLot> = {
      updated_at: new Date(),
    }

    if (updates.listing_id !== undefined) {
      updateData.listing_id = updates.listing_id
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

    if (lot) return lot

    // Try V2 listing_item_lots
    const v2UpdateData: Record<string, unknown> = { updated_at: new Date() }
    if (updates.quantity !== undefined) v2UpdateData.quantity_total = updates.quantity
    if (updates.location_id !== undefined) v2UpdateData.location_id = updates.location_id
    if (updates.owner_id !== undefined) v2UpdateData.owner_id = updates.owner_id
    if (updates.listed !== undefined) v2UpdateData.listed = updates.listed

    await this.knex("listing_item_lots")
      .where({ lot_id: lotId })
      .update(v2UpdateData)

    const updated = await this.getById(lotId)
    if (!updated) throw new Error(`Lot ${lotId} not found in stock_lots or listing_item_lots`)
    return updated
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
