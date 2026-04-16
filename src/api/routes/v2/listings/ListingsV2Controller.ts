/**
 * Listings V2 Controller
 *
 * TSOA controller for listing creation, search, and management in the V2 market system.
 *
 * Requirements: 10.1, 13.1, 13.2, 13.3, 13.4, 26.1, 26.2, 28.1, 28.4, 28.5, 28.6
 */

import { Controller, Post, Route, Tags, Body, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { CreateListingRequest, Listing } from "../types/market-v2-types.js"
import { ListingService } from "../../../../services/market-v2/listing.service.js"
import logger from "../../../../logger/logger.js"

@Route("listings")
@Tags("Listings V2")
export class ListingsV2Controller extends BaseController {
  private listingService: ListingService

  constructor(@Request() request: ExpressRequest) {
    super(request)
    this.listingService = new ListingService()
  }

  /**
   * Create a new listing with variants
   *
   * Creates a listing with stock lots and variant pricing in a single atomic transaction.
   * Supports both unified pricing (one price for all variants) and per-variant pricing.
   *
   * @summary Create listing
   * @param request Listing creation request with title, description, game item, pricing mode, and lots
   * @returns Created listing object
   */
  @Post()
  public async createListing(
    @Body() request: CreateListingRequest,
  ): Promise<Listing> {
    // Require authentication
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Creating listing", {
      userId,
      title: request.title,
      gameItemId: request.game_item_id,
      pricingMode: request.pricing_mode,
      lotCount: request.lots.length,
    })

    try {
      // Create listing using service
      const listing = await this.listingService.createListing(userId, request)

      logger.info("Listing created successfully", {
        listingId: listing.listing_id,
        userId,
      })

      return listing
    } catch (error) {
      logger.error("Failed to create listing", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
  }
}
