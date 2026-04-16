/**
 * Listings V2 Controller
 *
 * TSOA controller for listing creation, search, and management in the V2 market system.
 *
 * Requirements: 9.1, 10.1, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 26.1, 26.2, 28.1, 28.4, 28.5, 28.6
 */

import { Controller, Get, Post, Route, Tags, Body, Query, Path, Request, Put } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { 
  CreateListingRequest, 
  Listing, 
  SearchListingsResponse, 
  ListingDetailResponse,
  MyListingsResponse,
  UpdateListingRequest,
} from "../types/market-v2-types.js"
import { ListingService } from "../../../../services/market-v2/listing.service.js"
import logger from "../../../../logger/logger.js"

@Route("listings")
@Tags("Listings V2")
export class ListingsV2Controller extends BaseController {
  private listingService: ListingService

  constructor(@Request() request?: ExpressRequest) {
    super(request as ExpressRequest)
    this.listingService = new ListingService()
  }

  /**
   * Search listings with filters
   *
   * Searches active listings using full-text search, quality tier filters, price filters,
   * and game item filters. Results are paginated and include price/quality ranges.
   *
   * @summary Search market listings
   * @param text Optional full-text search query
   * @param game_item_id Optional game item ID filter
   * @param quality_tier_min Optional minimum quality tier (1-5)
   * @param quality_tier_max Optional maximum quality tier (1-5)
   * @param price_min Optional minimum price filter
   * @param price_max Optional maximum price filter
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Search results with pagination metadata
   */
  @Get("search")
  public async searchListings(
    @Query() text?: string,
    @Query() game_item_id?: string,
    @Query() quality_tier_min?: number,
    @Query() quality_tier_max?: number,
    @Query() price_min?: number,
    @Query() price_max?: number,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<SearchListingsResponse> {
    logger.info("Searching listings", {
      text,
      game_item_id,
      quality_tier_min,
      quality_tier_max,
      price_min,
      price_max,
      page,
      page_size,
    })

    try {
      // Search listings using service
      const results = await this.listingService.searchListings({
        text,
        game_item_id,
        quality_tier_min,
        quality_tier_max,
        price_min,
        price_max,
        page,
        page_size,
      })

      logger.info("Search completed", {
        total: results.total,
        returned: results.listings.length,
        page: results.page,
      })

      return results
    } catch (error) {
      logger.error("Failed to search listings", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
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
    @Request() expressRequest: ExpressRequest,
  ): Promise<Listing> {
    this.request = expressRequest
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

  /**
   * Get listing detail with variant breakdown
   *
   * Returns comprehensive listing information including seller details, game item info,
   * and a breakdown of all variants with their attributes, quantities, and prices.
   *
   * @summary Get listing details
   * @param listing_id Listing ID to retrieve
   * @returns Listing detail with variant breakdown
   */
  @Get("{listing_id}")
  public async getListingDetail(
    @Path() listing_id: string,
  ): Promise<ListingDetailResponse> {
    logger.info("Fetching listing detail", { listing_id })

    try {
      // Get listing detail using service
      const detail = await this.listingService.getListingDetail(listing_id)

      logger.info("Listing detail retrieved successfully", {
        listingId: listing_id,
        itemCount: detail.items.length,
      })

      return detail
    } catch (error) {
      logger.error("Failed to fetch listing detail", {
        listing_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
  }

  /**
   * Get current user's listings with variant breakdown
   *
   * Returns listings owned by the authenticated user with aggregated variant information
   * including variant count, total quantity, price range, and quality tier range.
   * Supports filtering by status and pagination with sorting.
   *
   * @summary Get my listings
   * @param status Optional status filter (active, sold, expired, cancelled)
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @param sort_by Sort field (default: created_at)
   * @param sort_order Sort order (default: desc)
   * @returns My listings with pagination metadata
   */
  @Get("mine")
  public async getMyListings(
    @Request() expressRequest: ExpressRequest,
    @Query() status?: "active" | "sold" | "expired" | "cancelled",
    @Query() page: number = 1,
    @Query() page_size: number = 20,
    @Query() sort_by?: "created_at" | "updated_at" | "price" | "quantity",
    @Query() sort_order?: "asc" | "desc",
  ): Promise<MyListingsResponse> {
    this.request = expressRequest
    // Require authentication
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Fetching my listings", {
      userId,
      status,
      page,
      page_size,
      sort_by,
      sort_order,
    })

    try {
      // Get my listings using service
      const results = await this.listingService.getMyListings(userId, {
        status,
        page,
        page_size,
        sort_by,
        sort_order,
      })

      logger.info("My listings retrieved successfully", {
        userId,
        total: results.total,
        returned: results.listings.length,
      })

      return results
    } catch (error) {
      logger.error("Failed to fetch my listings", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
  }

  /**
   * Update listing
   *
   * Updates listing title, description, base_price, or per-variant prices.
   * Validates ownership and prevents editing sold or cancelled listings.
   * All modifications are logged to the audit trail.
   *
   * @summary Update listing
   * @param listing_id Listing ID to update
   * @param request Update request with fields to modify
   * @returns Updated listing detail with variant breakdown
   */
  @Put("{listing_id}")
  public async updateListing(
    @Path() listing_id: string,
    @Body() request: UpdateListingRequest,
    @Request() expressRequest: ExpressRequest,
  ): Promise<ListingDetailResponse> {
    this.request = expressRequest
    // Require authentication
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Updating listing", {
      userId,
      listingId: listing_id,
      updates: request,
    })

    try {
      // Update listing using service
      const detail = await this.listingService.updateListing(
        userId,
        listing_id,
        request,
      )

      logger.info("Listing updated successfully", {
        listingId: listing_id,
        userId,
      })

      return detail
    } catch (error) {
      logger.error("Failed to update listing", {
        userId,
        listingId: listing_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Re-throw to be handled by error middleware
      throw error
    }
  }
}
