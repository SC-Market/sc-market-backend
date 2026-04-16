/**
 * Stock Lot Service
 *
 * Business logic for stock lot management in the V2 market system.
 * Handles retrieval, updates, and bulk operations on stock lots.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  StockLotsResponse,
  StockLotDetail,
  GetStockLotsRequest,
  UpdateStockLotRequest,
  BulkStockUpdateRequest,
  BulkStockUpdateResponse,
} from "../../api/routes/v2/types/market-v2-types.js"
import {
  NotFoundError,
  ValidationError,
  BusinessLogicError,
} from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"

export class StockLotService {
  private db: Knex

  constructor() {
    this.db = getKnex()
  }
  /**
   * Get stock lots with filters
   *
   * Retrieves stock lots owned by the user with optional filters.
   * Includes variant attributes and listing information for each lot.
   *
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  async getStockLots(
    userId: string,
    request: Partial<GetStockLotsRequest>,
  ): Promise<StockLotsResponse> {
    const {
      listing_id,
      game_item_id,
      location_id,
      quality_tier_min,
      quality_tier_max,
      page = 1,
      page_size = 20,
    } = request

    // Validate pagination
    if (page < 1) {
      throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "Page must be >= 1")
    }
    if (page_size < 1 || page_size > 100) {
      throw new BusinessLogicError(
        ErrorCode.VALIDATION_ERROR,
        "Page size must be between 1 and 100",
      )
    }

    // Validate quality tier range
    if (quality_tier_min !== undefined && (quality_tier_min < 1 || quality_tier_min > 5)) {
      throw new BusinessLogicError(
        ErrorCode.VALIDATION_ERROR,
        "Quality tier min must be between 1 and 5",
      )
    }
    if (quality_tier_max !== undefined && (quality_tier_max < 1 || quality_tier_max > 5)) {
      throw new BusinessLogicError(
        ErrorCode.VALIDATION_ERROR,
        "Quality tier max must be between 1 and 5",
      )
    }
    if (
      quality_tier_min !== undefined &&
      quality_tier_max !== undefined &&
      quality_tier_min > quality_tier_max
    ) {
      throw new BusinessLogicError(
        ErrorCode.VALIDATION_ERROR,
        "Quality tier min must be <= quality tier max",
      )
    }

    try {
      // Build query
      const query = this.db("stock_lots as sl")
        .join("listing_items as li", "sl.item_id", "li.item_id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .join("item_variants as iv", "sl.variant_id", "iv.variant_id")
        .join("game_items as gi", "li.game_item_id", "gi.game_item_id")
        .where("l.seller_id", userId)
        .select(
          "sl.lot_id",
          "sl.item_id",
          "sl.variant_id",
          "sl.quantity_total",
          "sl.location_id",
          "sl.listed",
          "sl.notes",
          "sl.created_at",
          "sl.updated_at",
          "l.listing_id",
          "l.title as listing_title",
          "gi.game_item_id",
          "gi.name as game_item_name",
          "gi.type as game_item_type",
          "iv.display_name as variant_display_name",
          "iv.short_name as variant_short_name",
          "iv.attributes as variant_attributes",
        )

      // Apply filters
      if (listing_id) {
        query.where("l.listing_id", listing_id)
      }
      if (game_item_id) {
        query.where("gi.game_item_id", game_item_id)
      }
      if (location_id) {
        query.where("sl.location_id", location_id)
      }
      if (quality_tier_min !== undefined) {
        query.whereRaw("(iv.attributes->>'quality_tier')::integer >= ?", [quality_tier_min])
      }
      if (quality_tier_max !== undefined) {
        query.whereRaw("(iv.attributes->>'quality_tier')::integer <= ?", [quality_tier_max])
      }

      // Get total count
      const countQuery = query.clone().clearSelect().clearOrder().count("* as count")
      const [{ count }] = await countQuery
      const total = parseInt(count as string, 10)

      // Apply pagination
      const offset = (page - 1) * page_size
      query.limit(page_size).offset(offset)

      // Order by created_at DESC
      query.orderBy("sl.created_at", "desc")

      // Execute query
      const rows = await query

      // Transform to response format
      const stock_lots: StockLotDetail[] = rows.map((row: any) => ({
        lot_id: row.lot_id,
        item_id: row.item_id,
        listing: {
          listing_id: row.listing_id,
          title: row.listing_title,
        },
        game_item: {
          game_item_id: row.game_item_id,
          name: row.game_item_name,
          type: row.game_item_type,
        },
        variant: {
          variant_id: row.variant_id,
          display_name: row.variant_display_name,
          short_name: row.variant_short_name,
          attributes: row.variant_attributes,
          quality_tier: row.variant_attributes.quality_tier || 0,
        },
        quantity_total: row.quantity_total,
        location_id: row.location_id,
        listed: row.listed,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }))

      return {
        stock_lots,
        total,
        page,
        page_size,
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Update stock lot
   *
   * Updates stock lot fields with ownership validation.
   * Prevents negative quantities and triggers recalculation.
   *
   * Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
   */
  async updateStockLot(
    userId: string,
    lot_id: string,
    request: UpdateStockLotRequest,
  ): Promise<StockLotDetail> {
    const { quantity_total, listed, location_id, notes } = request

    // Validate quantity
    if (quantity_total !== undefined && quantity_total < 0) {
      throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "Quantity cannot be negative")
    }

    try {
      // Verify ownership
      const ownershipCheck = await this.db("stock_lots as sl")
        .join("listing_items as li", "sl.item_id", "li.item_id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .where("sl.lot_id", lot_id)
        .where("l.seller_id", userId)
        .first("sl.lot_id")

      if (!ownershipCheck) {
        throw new BusinessLogicError(
          ErrorCode.FORBIDDEN,
          "You do not have permission to update this stock lot",
        )
      }

      // Build update object
      const updates: Record<string, any> = {
        updated_at: this.db.fn.now(),
      }

      if (quantity_total !== undefined) {
        updates.quantity_total = quantity_total
      }
      if (listed !== undefined) {
        updates.listed = listed
      }
      if (location_id !== undefined) {
        updates.location_id = location_id
      }
      if (notes !== undefined) {
        updates.notes = notes
      }

      // Update stock lot
      await this.db("stock_lots").where("lot_id", lot_id).update(updates)

      // Fetch updated stock lot detail
      const detail = await this.getStockLotDetail(lot_id)

      return detail
    } catch (error) {
      throw error
    }
  }

  /**
   * Bulk update stock lots
   *
   * Performs bulk operations on multiple stock lots in a transaction.
   * Validates ownership for all lots before proceeding.
   *
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
   */
  async bulkUpdateStockLots(
    userId: string,
    request: BulkStockUpdateRequest,
  ): Promise<BulkStockUpdateResponse> {
    const { stock_lot_ids, operation, quantity_delta, listed, location_id } = request

    // Validate request
    if (!stock_lot_ids || stock_lot_ids.length === 0) {
      throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "Stock lot IDs are required")
    }

    if (operation === "update_quantity" && quantity_delta === undefined) {
      throw new BusinessLogicError(
        ErrorCode.VALIDATION_ERROR,
        "Quantity delta is required for update_quantity operation",
      )
    }

    if ((operation === "list" || operation === "unlist") && listed === undefined) {
      throw new BusinessLogicError(
        ErrorCode.VALIDATION_ERROR,
        "Listed status is required for list/unlist operation",
      )
    }

    if (operation === "transfer_location" && !location_id) {
      throw new BusinessLogicError(
        ErrorCode.VALIDATION_ERROR,
        "Location ID is required for transfer_location operation",
      )
    }

    const errors: Array<{ lot_id: string; error: string }> = []
    let successful = 0

    try {
      // Use transaction for atomicity
      await this.db.transaction(async (trx: Knex.Transaction) => {
        // Verify ownership for all lots
        const ownedLots = await trx("stock_lots as sl")
          .join("listing_items as li", "sl.item_id", "li.item_id")
          .join("listings as l", "li.listing_id", "l.listing_id")
          .whereIn("sl.lot_id", stock_lot_ids)
          .where("l.seller_id", userId)
          .select("sl.lot_id")

        const ownedLotIds = new Set(ownedLots.map((row: any) => row.lot_id))

        // Check for unauthorized lots
        for (const lot_id of stock_lot_ids) {
          if (!ownedLotIds.has(lot_id)) {
            errors.push({
              lot_id,
              error: "You do not have permission to update this stock lot",
            })
          }
        }

        // Only proceed with owned lots
        const lotsToUpdate = stock_lot_ids.filter((id) => ownedLotIds.has(id))

        if (lotsToUpdate.length === 0) {
          throw new BusinessLogicError(
            ErrorCode.FORBIDDEN,
            "No stock lots found that you have permission to update",
          )
        }

        // Perform operation based on type
        switch (operation) {
          case "update_quantity": {
            // Fetch current quantities
            const lots = await trx("stock_lots")
              .whereIn("lot_id", lotsToUpdate)
              .select("lot_id", "quantity_total")

            for (const lot of lots) {
              const newQuantity = lot.quantity_total + (quantity_delta || 0)

              if (newQuantity < 0) {
                errors.push({
                  lot_id: lot.lot_id,
                  error: "Quantity cannot be negative",
                })
              } else {
                await trx("stock_lots")
                  .where("lot_id", lot.lot_id)
                  .update({
                    quantity_total: newQuantity,
                    updated_at: trx.fn.now(),
                  })
                successful++
              }
            }
            break
          }

          case "list":
          case "unlist": {
            await trx("stock_lots")
              .whereIn("lot_id", lotsToUpdate)
              .update({
                listed: listed,
                updated_at: trx.fn.now(),
              })
            successful = lotsToUpdate.length
            break
          }

          case "transfer_location": {
            await trx("stock_lots")
              .whereIn("lot_id", lotsToUpdate)
              .update({
                location_id: location_id,
                updated_at: trx.fn.now(),
              })
            successful = lotsToUpdate.length
            break
          }

          default:
            throw new BusinessLogicError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown operation: ${operation}`,
            )
        }
      })

      return {
        successful,
        failed: errors.length,
        errors,
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Get stock lot detail by ID
   *
   * Helper method to fetch complete stock lot information.
   */
  private async getStockLotDetail(lot_id: string): Promise<StockLotDetail> {
    const row = await this.db("stock_lots as sl")
      .join("listing_items as li", "sl.item_id", "li.item_id")
      .join("listings as l", "li.listing_id", "l.listing_id")
      .join("item_variants as iv", "sl.variant_id", "iv.variant_id")
      .join("game_items as gi", "li.game_item_id", "gi.game_item_id")
      .where("sl.lot_id", lot_id)
      .first(
        "sl.lot_id",
        "sl.item_id",
        "sl.variant_id",
        "sl.quantity_total",
        "sl.location_id",
        "sl.listed",
        "sl.notes",
        "sl.created_at",
        "sl.updated_at",
        "l.listing_id",
        "l.title as listing_title",
        "gi.game_item_id",
        "gi.name as game_item_name",
        "gi.type as game_item_type",
        "iv.display_name as variant_display_name",
        "iv.short_name as variant_short_name",
        "iv.attributes as variant_attributes",
      )

    if (!row) {
      throw new NotFoundError("Stock lot not found")
    }

    return {
      lot_id: row.lot_id,
      item_id: row.item_id,
      listing: {
        listing_id: row.listing_id,
        title: row.listing_title,
      },
      game_item: {
        game_item_id: row.game_item_id,
        name: row.game_item_name,
        type: row.game_item_type,
      },
      variant: {
        variant_id: row.variant_id,
        display_name: row.variant_display_name,
        short_name: row.variant_short_name,
        attributes: row.variant_attributes,
        quality_tier: row.variant_attributes.quality_tier || 0,
      },
      quantity_total: row.quantity_total,
      location_id: row.location_id,
      listed: row.listed,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}
