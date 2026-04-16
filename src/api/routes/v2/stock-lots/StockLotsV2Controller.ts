/**
 * Stock Lots V2 Controller
 *
 * TSOA controller for stock lot management in the V2 market system.
 * Provides endpoints for viewing, updating, and bulk managing stock lots.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { Controller, Get, Put, Post, Route, Tags, Body, Query, Path, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import {
  StockLotsResponse,
  StockLotDetail,
  UpdateStockLotRequest,
  BulkStockUpdateRequest,
  BulkStockUpdateResponse,
} from "../types/market-v2-types.js"
import { StockLotService } from "../../../../services/market-v2/stock-lot.service.js"
import logger from "../../../../logger/logger.js"

@Route("stock-lots")
@Tags("Stock Lots V2")
export class StockLotsV2Controller extends BaseController {
  private stockLotService: StockLotService

  constructor(@Request() request?: ExpressRequest) {
    super(request as ExpressRequest)
    this.stockLotService = new StockLotService()
  }

  /**
   * Get stock lots with filters
   *
   * Retrieves stock lots with optional filters for listing, game item, location,
   * and quality tier range. Includes variant attributes and listing information.
   * Results are paginated.
   *
   * @summary Get stock lots
   * @param listing_id Optional listing ID filter
   * @param game_item_id Optional game item ID filter
   * @param location_id Optional location ID filter
   * @param quality_tier_min Optional minimum quality tier (1-5)
   * @param quality_tier_max Optional maximum quality tier (1-5)
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Stock lots with pagination metadata
   */
  @Get()
  public async getStockLots(
    @Request() expressRequest: ExpressRequest,
    @Query() listing_id?: string,
    @Query() game_item_id?: string,
    @Query() location_id?: string,
    @Query() quality_tier_min?: number,
    @Query() quality_tier_max?: number,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<StockLotsResponse> {
    this.request = expressRequest
    // Require authentication
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Fetching stock lots", {
      userId,
      listing_id,
      game_item_id,
      location_id,
      quality_tier_min,
      quality_tier_max,
      page,
      page_size,
    })

    try {
      // Get stock lots using service
      const results = await this.stockLotService.getStockLots(userId, {
        listing_id,
        game_item_id,
        location_id,
        quality_tier_min,
        quality_tier_max,
        page,
        page_size,
      })

      logger.info("Stock lots retrieved successfully", {
        userId,
        total: results.total,
        returned: results.stock_lots.length,
      })

      return results
    } catch (error) {
      logger.error("Failed to fetch stock lots", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
  }

  /**
   * Update stock lot
   *
   * Updates stock lot quantity, listed status, location, or notes.
   * Validates ownership before allowing updates. Prevents negative quantities.
   * Triggers quantity_available recalculation via database trigger.
   *
   * @summary Update stock lot
   * @param lot_id Stock lot ID to update
   * @param request Update request with fields to modify
   * @returns Updated stock lot detail
   */
  @Put("{lot_id}")
  public async updateStockLot(
    @Path() lot_id: string,
    @Body() request: UpdateStockLotRequest,
    @Request() expressRequest: ExpressRequest,
  ): Promise<StockLotDetail> {
    this.request = expressRequest
    // Require authentication
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Updating stock lot", {
      userId,
      lot_id,
      updates: request,
    })

    try {
      // Update stock lot using service
      const detail = await this.stockLotService.updateStockLot(
        userId,
        lot_id,
        request,
      )

      logger.info("Stock lot updated successfully", {
        lot_id,
        userId,
      })

      return detail
    } catch (error) {
      logger.error("Failed to update stock lot", {
        userId,
        lot_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
  }

  /**
   * Bulk update stock lots
   *
   * Performs bulk operations on multiple stock lots in a single transaction.
   * Supports update_quantity, list/unlist, and transfer_location operations.
   * Validates ownership for all lots before proceeding.
   *
   * @summary Bulk update stock lots
   * @param request Bulk update request with lot IDs and operation
   * @returns Summary with successful/failed counts and errors
   */
  @Post("bulk-update")
  public async bulkUpdateStockLots(
    @Body() request: BulkStockUpdateRequest,
    @Request() expressRequest: ExpressRequest,
  ): Promise<BulkStockUpdateResponse> {
    this.request = expressRequest
    // Require authentication
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Bulk updating stock lots", {
      userId,
      operation: request.operation,
      lotCount: request.stock_lot_ids.length,
    })

    try {
      // Bulk update stock lots using service
      const result = await this.stockLotService.bulkUpdateStockLots(
        userId,
        request,
      )

      logger.info("Bulk update completed", {
        userId,
        successful: result.successful,
        failed: result.failed,
      })

      return result
    } catch (error) {
      logger.error("Failed to bulk update stock lots", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
  }
}
