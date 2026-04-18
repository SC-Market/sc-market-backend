/**
 * Stock Lots V2 Controller
 *
 * TSOA controller for stock lot management in the V2 market system.
 * Handles stock lot retrieval, updates, and bulk operations with variant support.
 *
 * Requirements: 20.1-20.12, 22.1-22.10
 */

import { Controller, Get, Put, Post, Route, Tags, Body, Request, Query, Path } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  CreateStockLotRequest,
  GetStockLotsRequest,
  GetStockLotsResponse,
  UpdateStockLotRequest,
  UpdateStockLotResponse,
  BulkUpdateStockLotsRequest,
  BulkUpdateStockLotsResponse,
  StockLotDetail,
  BulkUpdateResult,
} from "../types/stock-lots.types.js"
import logger from "../../../../logger/logger.js"

@Route("stock-lots")
@Tags("Stock Lots V2")
export class StockLotsV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Create a stock lot
   *
   * @summary Create stock lot
   * @param requestBody Create request with item_id, quantity, variant_attributes
   * @param request Express request for authentication
   * @returns Created stock lot
   */
  @Post()
  public async createStockLot(
    @Body() requestBody: CreateStockLotRequest,
    @Request() request: ExpressRequest,
  ): Promise<UpdateStockLotResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    const db = getKnex()

    // Verify the listing item exists and user owns the listing
    const item = await db('listing_items as li')
      .join('listings as l', 'li.listing_id', 'l.listing_id')
      .where('li.item_id', requestBody.item_id)
      .andWhere('l.seller_id', userId)
      .first('li.item_id', 'l.listing_id', 'li.game_item_id')

    if (!item) {
      this.throwNotFound('Listing item not found or not owned by user')
    }

    // Get or create variant
    const { getOrCreateVariant } = await import('../../../../services/market-v2/variant.service.js')
    const variantId = await getOrCreateVariant(item.game_item_id, requestBody.variant_attributes)

    // Create the lot
    const [lot] = await db('listing_item_lots').insert({
      item_id: requestBody.item_id,
      variant_id: variantId,
      quantity_total: requestBody.quantity,
      location_id: requestBody.location_id || null,
      listed: requestBody.listed ?? true,
      notes: requestBody.notes || null,
      owner_id: userId,
    }).returning('*')

    // Fetch full lot detail for response
    const lotDetail = await this.fetchLotDetail(db, lot.lot_id)
    return { lot: lotDetail }
  }

  /**
   * Get stock lots with filters
   *
   * Retrieves stock lots with optional filtering by listing, game item, location, variant,
   * and quality tier. Supports pagination and returns enriched lot information including
   * variant attributes, location details, and owner information.
   *
   * Requirements:
   * - 20.1: GET /api/v2/stock-lots endpoint
   * - 20.2: Accept listing_id filter parameter
   * - 20.3: Accept game_item_id filter parameter
   * - 20.4: Accept location_id filter parameter
   * - 20.5: Accept listed filter parameter
   * - 20.6: Accept variant_id filter parameter
   * - 20.7: Accept quality_tier_min and quality_tier_max filter parameters
   * - 20.8: Return array of stock lots with variant information
   * - 20.9: Include location and owner details in response
   * - 20.10: Support pagination with page and page_size parameters
   * - 20.11: Return total count for pagination
   * - 20.12: Include crafted_by information if applicable
   *
   * @summary Get stock lots
   * @param listing_id Filter by listing UUID
   * @param game_item_id Filter by game item UUID
   * @param location_id Filter by location UUID
   * @param listed Filter by listed status
   * @param variant_id Filter by variant UUID
   * @param quality_tier_min Minimum quality tier (1-5)
   * @param quality_tier_max Maximum quality tier (1-5)
   * @param page Page number for pagination (default: 1)
   * @param page_size Number of results per page (default: 20, max: 100)
   * @returns Stock lots with pagination metadata
   */
  @Get()
  public async getStockLots(
    @Query() listing_id?: string,
    @Query() game_item_id?: string,
    @Query() location_id?: string,
    @Query() listed?: boolean,
    @Query() variant_id?: string,
    @Query() quality_tier_min?: number,
    @Query() quality_tier_max?: number,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<GetStockLotsResponse> {
    const knex = getKnex()

    // Validate and set defaults (Requirement 20.10)
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    // Validate quality tier range (Requirement 20.7)
    if (quality_tier_min !== undefined && (quality_tier_min < 1 || quality_tier_min > 5)) {
      this.throwValidationError("Invalid quality_tier_min", [
        { field: "quality_tier_min", message: "Quality tier must be between 1 and 5" },
      ])
    }

    if (quality_tier_max !== undefined && (quality_tier_max < 1 || quality_tier_max > 5)) {
      this.throwValidationError("Invalid quality_tier_max", [
        { field: "quality_tier_max", message: "Quality tier must be between 1 and 5" },
      ])
    }

    if (
      quality_tier_min !== undefined &&
      quality_tier_max !== undefined &&
      quality_tier_min > quality_tier_max
    ) {
      this.throwValidationError("Invalid quality tier range", [
        {
          field: "quality_tier_min",
          message: "quality_tier_min must be less than or equal to quality_tier_max",
        },
      ])
    }

    logger.info("Fetching stock lots", {
      listing_id,
      game_item_id,
      location_id,
      listed,
      variant_id,
      quality_tier_min,
      quality_tier_max,
      page: validatedPage,
      page_size: validatedPageSize,
    })

    try {
      // Build query with joins for enriched data (Requirements 20.8, 20.9, 20.12)
      let query = knex("listing_item_lots as sl")
        .join("item_variants as iv", "sl.variant_id", "iv.variant_id")
        .join("listing_items as li", "sl.item_id", "li.item_id")
        .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
        .leftJoin("accounts as owner", "sl.owner_id", "owner.user_id")
        .leftJoin("accounts as crafter", "sl.crafted_by", "crafter.user_id")
        .select(
          "sl.lot_id",
          "sl.item_id",
          "sl.variant_id",
          "sl.quantity_total",
          "sl.listed",
          "sl.notes",
          "sl.created_at",
          "sl.updated_at",
          "sl.crafted_at",
          // Variant information
          "iv.attributes as variant_attributes",
          "iv.display_name as variant_display_name",
          "iv.short_name as variant_short_name",
          // Location information
          "loc.location_id",
          "loc.name as location_name",
          "loc.is_preset as location_is_preset",
          // Owner information
          "owner.user_id as owner_user_id",
          "owner.username as owner_username",
          "owner.display_name as owner_display_name",
          "owner.avatar_url as owner_avatar_url",
          // Crafter information
          "crafter.username as crafted_by_username",
        )

      // Apply filters (Requirements 20.2-20.7)
      if (listing_id) {
        query = query.where("li.listing_id", listing_id)
      }

      if (game_item_id) {
        query = query.where("li.game_item_id", game_item_id)
      }

      if (location_id) {
        query = query.where("sl.location_id", location_id)
      }

      if (listed !== undefined) {
        query = query.where("sl.listed", listed)
      }

      if (variant_id) {
        query = query.where("sl.variant_id", variant_id)
      }

      // Apply quality tier filters (Requirement 20.7)
      if (quality_tier_min !== undefined) {
        query = query.whereRaw(
          "(iv.attributes->>'quality_tier')::integer >= ?",
          [quality_tier_min]
        )
      }

      if (quality_tier_max !== undefined) {
        query = query.whereRaw(
          "(iv.attributes->>'quality_tier')::integer <= ?",
          [quality_tier_max]
        )
      }

      // Get total count for pagination (Requirement 20.11)
      const countQuery = query.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply pagination (Requirement 20.10)
      const offset = (validatedPage - 1) * validatedPageSize
      query = query.limit(validatedPageSize).offset(offset)

      // Order by created_at descending (newest first)
      query = query.orderBy("sl.created_at", "desc")

      // Execute query
      const results = await query

      // Transform results to match response type (Requirements 20.8, 20.9, 20.12)
      const lots: StockLotDetail[] = results.map((row: any) => ({
        lot_id: row.lot_id,
        item_id: row.item_id,
        variant: {
          variant_id: row.variant_id,
          attributes: row.variant_attributes,
          display_name: row.variant_display_name || "Standard",
          short_name: row.variant_short_name || "STD",
        },
        quantity_total: row.quantity_total,
        location: row.location_id
          ? {
              location_id: row.location_id,
              name: row.location_name,
              is_preset: row.location_is_preset,
            }
          : null,
        owner: row.owner_user_id
          ? {
              user_id: row.owner_user_id,
              username: row.owner_username,
              display_name: row.owner_display_name,
              avatar_url: row.owner_avatar_url,
            }
          : null,
        listed: row.listed,
        notes: row.notes,
        crafted_by: row.crafted_by_username,
        crafted_at: row.crafted_at?.toISOString(),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      }))

      logger.info("Stock lots fetched successfully", {
        total,
        returned: lots.length,
        page: validatedPage,
        page_size: validatedPageSize,
      })

      return {
        lots,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch stock lots", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Update a stock lot
   *
   * Updates a stock lot's quantity, listed status, location, or notes. Verifies ownership
   * before allowing updates and prevents negative quantities. Triggers automatic recalculation
   * of quantity_available in the parent listing_items record.
   *
   * Requirements:
   * - 20.1: PUT /api/v2/stock-lots/:id endpoint
   * - 20.2: Accept quantity_total update
   * - 20.3: Accept listed status update
   * - 20.4: Accept location_id update
   * - 20.5: Accept notes update
   * - 20.6: Verify ownership before updates
   * - 20.7: Trigger quantity_available recalculation
   * - 20.8: Prevent negative quantities
   * - 20.9: Log modifications to audit trail
   * - 20.10: Return updated stock lot with variant information
   * - 20.11: Validate notes length (max 1000 characters)
   * - 20.12: Use database transaction for atomicity
   *
   * @summary Update stock lot
   * @param id Stock lot UUID
   * @param requestBody Update request with optional fields
   * @param request Express request for authentication
   * @returns Updated stock lot
   */
  @Put("{id}")
  public async updateStockLot(
    @Path() id: string,
    @Body() requestBody: UpdateStockLotRequest,
    @Request() request: ExpressRequest,
  ): Promise<UpdateStockLotResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Updating stock lot", {
      lotId: id,
      userId,
      updates: {
        hasQuantity: requestBody.quantity_total !== undefined,
        hasListed: requestBody.listed !== undefined,
        hasLocation: requestBody.location_id !== undefined,
        hasNotes: requestBody.notes !== undefined,
      },
    })

    const db = getKnex()

    try {
      // Use database transaction for atomicity (Requirement 20.12)
      await withTransaction(async (trx) => {
        // 1. Fetch stock lot and verify ownership (Requirement 20.6)
        const lot = await trx("listing_item_lots as sl")
          .join("listing_items as li", "sl.item_id", "li.item_id")
          .join("listings as l", "li.listing_id", "l.listing_id")
          .where("sl.lot_id", id)
          .select("sl.*", "l.seller_id", "l.seller_type")
          .first()

        if (!lot) {
          this.throwNotFound("Stock lot", id)
        }

        // Verify ownership
        if (lot.seller_id !== userId) {
          this.throwForbidden("You do not have permission to update this stock lot")
        }

        // 2. Validate updates
        const updates: any = {
          updated_at: new Date(),
        }

        // Validate and set quantity_total (Requirements 20.2, 20.8)
        if (requestBody.quantity_total !== undefined) {
          if (requestBody.quantity_total < 0) {
            this.throwValidationError("Invalid quantity", [
              {
                field: "quantity_total",
                message: "Quantity cannot be negative",
              },
            ])
          }
          updates.quantity_total = requestBody.quantity_total
        }

        // Validate and set listed status (Requirement 20.3)
        if (requestBody.listed !== undefined) {
          updates.listed = requestBody.listed
        }

        // Validate and set location_id (Requirement 20.4)
        if (requestBody.location_id !== undefined) {
          updates.location_id = requestBody.location_id
        }

        // Validate and set notes (Requirements 20.5, 20.11)
        if (requestBody.notes !== undefined) {
          if (requestBody.notes && requestBody.notes.length > 1000) {
            this.throwValidationError("Notes too long", [
              {
                field: "notes",
                message: "Notes must be 1000 characters or less",
              },
            ])
          }
          updates.notes = requestBody.notes
        }

        // 3. Apply updates
        if (Object.keys(updates).length > 1) {
          // More than just updated_at
          await trx("listing_item_lots")
            .where({ lot_id: id })
            .update(updates)

          logger.info("Stock lot updated", {
            lotId: id,
            updates: Object.keys(updates),
          })

          // Note: The database trigger will automatically update quantity_available
          // and variant_count in listing_items table (Requirement 20.7)
        }

        // TODO: Log modifications to audit trail (Requirement 20.9)
      })

      logger.info("Stock lot updated successfully", {
        lotId: id,
        userId,
      })

      // 4. Fetch and return updated stock lot (Requirement 20.10)
      const knex2 = getKnex()
      const lotResult = await knex2("listing_item_lots as sl")
        .join("item_variants as iv", "sl.variant_id", "iv.variant_id")
        .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
        .leftJoin("accounts as owner", "sl.owner_id", "owner.user_id")
        .leftJoin("accounts as crafter", "sl.crafted_by", "crafter.user_id")
        .where("sl.lot_id", id)
        .select(
          "sl.lot_id",
          "sl.item_id",
          "sl.variant_id",
          "sl.quantity_total",
          "sl.listed",
          "sl.notes",
          "sl.created_at",
          "sl.updated_at",
          "sl.crafted_at",
          "iv.attributes as variant_attributes",
          "iv.display_name as variant_display_name",
          "iv.short_name as variant_short_name",
          "loc.location_id",
          "loc.name as location_name",
          "loc.is_preset as location_is_preset",
          "owner.user_id as owner_user_id",
          "owner.username as owner_username",
          "owner.display_name as owner_display_name",
          "owner.avatar_url as owner_avatar_url",
          "crafter.username as crafted_by_username",
        )
        .first()

      if (!lotResult) {
        this.throwNotFound("Stock lot", id)
      }

      const lot: StockLotDetail = {
        lot_id: lotResult.lot_id,
        item_id: lotResult.item_id,
        variant: {
          variant_id: lotResult.variant_id,
          attributes: lotResult.variant_attributes,
          display_name: lotResult.variant_display_name || "Standard",
          short_name: lotResult.variant_short_name || "STD",
        },
        quantity_total: lotResult.quantity_total,
        location: lotResult.location_id
          ? {
              location_id: lotResult.location_id,
              name: lotResult.location_name,
              is_preset: lotResult.location_is_preset,
            }
          : null,
        owner: lotResult.owner_user_id
          ? {
              user_id: lotResult.owner_user_id,
              username: lotResult.owner_username,
              display_name: lotResult.owner_display_name,
              avatar_url: lotResult.owner_avatar_url,
            }
          : null,
        listed: lotResult.listed,
        notes: lotResult.notes,
        crafted_by: lotResult.crafted_by_username,
        crafted_at: lotResult.crafted_at?.toISOString(),
        created_at: lotResult.created_at.toISOString(),
        updated_at: lotResult.updated_at.toISOString(),
      }

      return { lot }
    } catch (error) {
      logger.error("Failed to update stock lot", {
        lotId: id,
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Bulk update stock lots
   *
   * Performs bulk operations on multiple stock lots in a single transaction. Validates
   * ownership for all lots before applying any updates. Returns summary of successful
   * and failed operations.
   *
   * Requirements:
   * - 22.1: POST /api/v2/stock-lots/bulk-update endpoint
   * - 22.2: Accept array of stock_lot_id values with updates
   * - 22.3: Support bulk quantity updates
   * - 22.4: Support bulk listing/unlisting operations
   * - 22.5: Support bulk location transfers
   * - 22.6: Use database transaction for atomicity
   * - 22.7: Return summary of successful and failed operations
   * - 22.8: Validate ownership for all stock lots in batch
   * - 22.9: Log all bulk operations to audit trail
   * - 22.10: Trigger quantity_available recalculation for affected listings
   *
   * @summary Bulk update stock lots
   * @param requestBody Bulk update request with array of lot updates
   * @param request Express request for authentication
   * @returns Bulk update results with success/failure counts
   */
  @Post("bulk-update")
  public async bulkUpdateStockLots(
    @Body() requestBody: BulkUpdateStockLotsRequest,
    @Request() request: ExpressRequest,
  ): Promise<BulkUpdateStockLotsResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Bulk updating stock lots", {
      userId,
      updateCount: requestBody.updates.length,
    })

    // Validate request
    if (!requestBody.updates || requestBody.updates.length === 0) {
      this.throwValidationError("No updates provided", [
        {
          field: "updates",
          message: "At least one update is required",
        },
      ])
    }

    const db = getKnex()
    const results: BulkUpdateResult[] = []
    let successCount = 0
    let failureCount = 0

    try {
      // Use database transaction for atomicity (Requirement 22.6)
      await withTransaction(async (trx) => {
        // 1. Fetch all lots and verify ownership (Requirement 22.8)
        const lotIds = requestBody.updates.map((u) => u.lot_id)
        const lots = await trx("listing_item_lots as sl")
          .join("listing_items as li", "sl.item_id", "li.item_id")
          .join("listings as l", "li.listing_id", "l.listing_id")
          .whereIn("sl.lot_id", lotIds)
          .select("sl.lot_id", "l.seller_id", "l.seller_type")

        // Create a map for quick lookup
        const lotMap = new Map(lots.map((lot) => [lot.lot_id, lot]))

        // 2. Process each update (Requirements 22.3, 22.4, 22.5)
        for (const update of requestBody.updates) {
          try {
            // Verify lot exists
            const lot = lotMap.get(update.lot_id)
            if (!lot) {
              results.push({
                lot_id: update.lot_id,
                success: false,
                error: "Stock lot not found",
              })
              failureCount++
              continue
            }

            // Verify ownership
            if (lot.seller_id !== userId) {
              results.push({
                lot_id: update.lot_id,
                success: false,
                error: "You do not have permission to update this stock lot",
              })
              failureCount++
              continue
            }

            // Build update object
            const updates: any = {
              updated_at: new Date(),
            }

            // Validate and set quantity_total (Requirement 22.3)
            if (update.quantity_total !== undefined) {
              if (update.quantity_total < 0) {
                results.push({
                  lot_id: update.lot_id,
                  success: false,
                  error: "Quantity cannot be negative",
                })
                failureCount++
                continue
              }
              updates.quantity_total = update.quantity_total
            }

            // Set listed status (Requirement 22.4)
            if (update.listed !== undefined) {
              updates.listed = update.listed
            }

            // Set location_id (Requirement 22.5)
            if (update.location_id !== undefined) {
              updates.location_id = update.location_id
            }

            // Apply updates
            if (Object.keys(updates).length > 1) {
              // More than just updated_at
              await trx("listing_item_lots")
                .where({ lot_id: update.lot_id })
                .update(updates)

              results.push({
                lot_id: update.lot_id,
                success: true,
              })
              successCount++

              logger.info("Bulk update: stock lot updated", {
                lotId: update.lot_id,
                updates: Object.keys(updates),
              })
            } else {
              results.push({
                lot_id: update.lot_id,
                success: true,
              })
              successCount++
            }
          } catch (error) {
            results.push({
              lot_id: update.lot_id,
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            })
            failureCount++

            logger.error("Bulk update: failed to update stock lot", {
              lotId: update.lot_id,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        // Note: The database trigger will automatically update quantity_available
        // and variant_count in listing_items table (Requirement 22.10)

        // TODO: Log bulk operations to audit trail (Requirement 22.9)
      })

      logger.info("Bulk update completed", {
        userId,
        successCount,
        failureCount,
        totalCount: requestBody.updates.length,
      })

      // Return summary (Requirement 22.7)
      return {
        results,
        success_count: successCount,
        failure_count: failureCount,
      }
    } catch (error) {
      logger.error("Failed to bulk update stock lots", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Fetch full lot detail by lot_id
   */
  private async fetchLotDetail(db: ReturnType<typeof getKnex>, lotId: string): Promise<StockLotDetail> {
    const row = await db("listing_item_lots as sl")
      .join("item_variants as iv", "sl.variant_id", "iv.variant_id")
      .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
      .leftJoin("accounts as owner", "sl.owner_id", "owner.user_id")
      .leftJoin("accounts as crafter", "sl.crafted_by", "crafter.user_id")
      .where("sl.lot_id", lotId)
      .select(
        "sl.lot_id",
        "sl.item_id",
        "sl.variant_id",
        "sl.quantity_total",
        "sl.listed",
        "sl.notes",
        "sl.created_at",
        "sl.updated_at",
        "sl.crafted_at",
        "iv.attributes as variant_attributes",
        "iv.display_name as variant_display_name",
        "iv.short_name as variant_short_name",
        "loc.location_id",
        "loc.name as location_name",
        "loc.is_preset as location_is_preset",
        "owner.user_id as owner_user_id",
        "owner.username as owner_username",
        "owner.display_name as owner_display_name",
        "owner.avatar_url as owner_avatar_url",
        "crafter.username as crafted_by_username",
      )
      .first()

    if (!row) {
      this.throwNotFound("Stock lot", lotId)
    }

    return {
      lot_id: row.lot_id,
      item_id: row.item_id,
      variant: {
        variant_id: row.variant_id,
        attributes: row.variant_attributes,
        display_name: row.variant_display_name || "Standard",
        short_name: row.variant_short_name || "STD",
      },
      quantity_total: row.quantity_total,
      location: row.location_id
        ? { location_id: row.location_id, name: row.location_name, is_preset: row.location_is_preset }
        : null,
      owner: row.owner_user_id
        ? { user_id: row.owner_user_id, username: row.owner_username, display_name: row.owner_display_name, avatar_url: row.owner_avatar_url }
        : null,
      listed: row.listed,
      notes: row.notes,
      crafted_by: row.crafted_by_username,
      crafted_at: row.crafted_at?.toISOString(),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    }
  }
}
