/**
 * Market Listings Controller
 *
 * TSOA controller for market listing endpoints.
 * This controller handles creating, reading, updating market listings.
 *
 * Migration Status: Phase 1 - Core endpoints
 * - GET /api/v1/market/listings (search)
 * - GET /api/v1/market/listings/:listing_id (get details)
 * - POST /api/v1/market/listings (create)
 * - PUT /api/v1/market/listing/:listing_id (update)
 * - POST /api/v1/market/listings/stats (get stats)
 * - POST /api/v1/market/listing/:listing_id/update_quantity (update quantity)
 * - POST /api/v1/market/listing/:listing_id/refresh (refresh expiration)
 * - POST /api/v1/market/listings/:listing_id/views (track view)
 *
 * @tags Market Listings
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Path,
  Body,
  Route,
  Response,
  Tags,
  Request,
  Middlewares,
  Security,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import {
  BaseController,
  NotFoundError,
  ValidationErrorClass,
  ForbiddenError,
} from "./base.controller.js"
import {
  MarketListingsResponse,
  MarketListingResponse,
  CreateMarketListingPayload,
  UpdateMarketListingPayload,
  ListingStatsResponse,
  UpdateQuantityPayload,
  UpdateQuantityResponse,
  RefreshListingResponse,
  TrackViewResponse,
} from "../models/market-listings.models.js"
import {
  ErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
} from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as marketDb from "../routes/v1/market/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import { is_member } from "../routes/v1/util/permissions.js"
import { serializeListingStats } from "../routes/v1/util/formatting.js"

/**
 * Controller for managing market listings
 */
@Route("api/v1/market")
@Tags("Market Listings")
export class MarketListingsController extends BaseController {
  /**
   * Search market listings
   *
   * Search and filter market listings with pagination.
   * Supports filtering by item type, status, price range, and more.
   *
   * @summary Search market listings
   * @param item_type Filter by item type (e.g., "ship", "vehicle")
   * @param status Filter by status (default: "active")
   * @param min_price Minimum price filter
   * @param max_price Maximum price filter
   * @param page Page number (default: 1)
   * @param limit Results per page (default: 20, max: 100)
   * @returns Paginated list of market listings
   *
   * @example item_type "ship"
   * @example status "active"
   * @example min_price "10"
   * @example max_price "100"
   * @example page "1"
   * @example limit "20"
   */
  @Get("listings")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchListings(
    @Request() request: ExpressRequest,
    @Query() item_type?: string,
    @Query() status?: string,
    @Query() min_price?: string,
    @Query() max_price?: string,
    @Query() page?: string,
    @Query() limit?: string,
  ): Promise<MarketListingsResponse> {
    try {
      const pagination = this.parsePagination(request)
      const statusFilter = status || "active"
      const minPrice = min_price ? parseFloat(min_price) : undefined
      const maxPrice = max_price ? parseFloat(max_price) : undefined

      this.logInfo("searchListings", "Searching market listings", {
        item_type,
        status: statusFilter,
        minPrice,
        maxPrice,
        page: pagination.page,
        limit: pagination.limit,
      })

      // TODO: Implement actual search logic using marketDb
      // For now, return empty results
      const listings: any[] = []
      const total = 0

      return this.success({
        listings,
        total,
        page: pagination.page,
        limit: pagination.limit,
      })
    } catch (error) {
      this.logError("searchListings", error)
      this.handleError(error, "searchListings")
    }
  }

  /**
   * Get market listing details
   *
   * Retrieves detailed information about a specific market listing.
   *
   * @summary Get listing details
   * @param listing_id ID of the listing
   * @returns Market listing details
   */
  @Get("listings/{listing_id}")
  @Middlewares(tsoaReadRateLimit)
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getListingDetails(
    @Request() request: ExpressRequest,
    @Path() listing_id: string,
  ): Promise<MarketListingResponse> {
    try {
      this.logInfo("getListingDetails", "Fetching listing details", {
        listing_id,
      })

      const listing = await marketDb.getMarketListing({ listing_id })

      if (!listing) {
        throw new NotFoundError(`Listing ${listing_id} not found`)
      }

      // Transform Date objects to ISO strings
      const transformedListing = {
        ...listing,
        timestamp: listing.timestamp.toISOString(),
        expiration: listing.expiration.toISOString(),
      }

      return this.success({ listing: transformedListing as any })
    } catch (error) {
      this.logError("getListingDetails", error, { listing_id })
      this.handleError(error, "getListingDetails")
    }
  }

  /**
   * Create a new market listing
   *
   * Creates a new market listing. Requires authentication.
   *
   * @summary Create market listing
   * @param payload Listing data
   * @returns Created market listing
   *
   * @example payload {
   *   "listing_type": "unique",
   *   "sale_type": "sale",
   *   "title": "Aegis Avenger Titan",
   *   "description": "Great starter ship",
   *   "item_type": "ship",
   *   "item_name": "Aegis Avenger Titan",
   *   "price": 50.00,
   *   "quantity_available": 1,
   *   "photos": [],
   *   "internal": false
   * }
   */
  @Post("listings")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(201, "Created")
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createListing(
    @Request() request: ExpressRequest,
    @Body() payload: CreateMarketListingPayload,
  ): Promise<MarketListingResponse> {
    try {
      const userId = this.getUserId(request)

      // Validate required fields
      if (
        !payload.listing_type ||
        !payload.sale_type ||
        !payload.title ||
        !payload.item_type ||
        !payload.item_name ||
        payload.price === undefined ||
        payload.quantity_available === undefined
      ) {
        throw new ValidationErrorClass("Missing required fields")
      }

      this.logInfo("createListing", "Creating market listing", {
        user: userId,
        listing_type: payload.listing_type,
        sale_type: payload.sale_type,
      })

      // TODO: Implement actual creation logic using marketDb
      // For now, return a placeholder
      throw new Error("Not implemented yet")
    } catch (error) {
      this.logError("createListing", error, { payload })
      this.handleError(error, "createListing")
    }
  }

  /**
   * Update a market listing
   *
   * Updates an existing market listing. Only the owner can update.
   *
   * @summary Update market listing
   * @param listing_id ID of the listing to update
   * @param payload Updated listing data
   * @returns Updated market listing
   *
   * @example payload {
   *   "title": "Updated Title",
   *   "price": 55.00
   * }
   */
  @Put("listing/{listing_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateListing(
    @Request() request: ExpressRequest,
    @Path() listing_id: string,
    @Body() payload: UpdateMarketListingPayload,
  ): Promise<MarketListingResponse> {
    try {
      const userId = this.getUserId(request)

      this.logInfo("updateListing", "Updating market listing", {
        listing_id,
        user: userId,
      })

      // Get the listing
      const listing = await marketDb.getMarketListing({ listing_id })

      if (!listing) {
        throw new NotFoundError(`Listing ${listing_id} not found`)
      }

      // Check if listing is archived
      if (listing.status === "archived") {
        throw new ValidationErrorClass("Cannot update archived listing")
      }

      // Check permissions
      let hasPermission = false

      if (listing.user_seller_id && listing.user_seller_id === userId) {
        hasPermission = true
      }

      if (listing.contractor_seller_id) {
        const contractor = await contractorDb.getContractor({
          contractor_id: listing.contractor_seller_id,
        })

        if (contractor && (await is_member(contractor.contractor_id, userId))) {
          hasPermission = true
        }
      }

      if (!hasPermission) {
        throw new ForbiddenError(
          "You don't have permission to update this listing",
        )
      }

      // TODO: Implement actual update logic using marketDb
      // For now, return a placeholder
      throw new Error("Not implemented yet")
    } catch (error) {
      this.logError("updateListing", error, { listing_id, payload })
      this.handleError(error, "updateListing")
    }
  }

  /**
   * Get stats for multiple market listings
   *
   * Retrieves statistics (views, orders, revenue) for multiple listings.
   * Only accessible by listing owners.
   *
   * @summary Get listing stats
   * @param listing_ids Array of listing IDs (max 96)
   * @returns Statistics for each listing
   *
   * @example listing_ids ["550e8400-e29b-41d4-a716-446655440000"]
   */
  @Post("listings/stats")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getListingStats(
    @Request() request: ExpressRequest,
    @Body() body: { listing_ids: string[] },
  ): Promise<ListingStatsResponse> {
    try {
      const userId = this.getUserId(request)
      const { listing_ids } = body

      if (
        !listing_ids ||
        !Array.isArray(listing_ids) ||
        listing_ids.length === 0
      ) {
        throw new ValidationErrorClass(
          "listing_ids array is required and must not be empty",
        )
      }

      if (listing_ids.length > 96) {
        throw new ValidationErrorClass("Maximum 96 listing IDs allowed per request")
      }

      this.logInfo("getListingStats", "Fetching listing stats", {
        user: userId,
        count: listing_ids.length,
      })

      const stats = []

      for (const listing_id of listing_ids) {
        const listing = await marketDb.getMarketListing({ listing_id })

        if (!listing) {
          throw new ValidationErrorClass(`Listing ${listing_id} not found`)
        }

        // Check permissions
        let hasPermission = false

        if (listing.user_seller_id && listing.user_seller_id === userId) {
          hasPermission = true
        }

        if (listing.contractor_seller_id) {
          const contractor = await contractorDb.getContractor({
            contractor_id: listing.contractor_seller_id,
          })

          if (
            contractor &&
            (await is_member(contractor.contractor_id, userId))
          ) {
            hasPermission = true
          }
        }

        if (!hasPermission) {
          throw new ForbiddenError(
            `You don't have permission to view stats for listing ${listing_id}`,
          )
        }

        const listingStats = await serializeListingStats(listing)
        stats.push({
          listing_id,
          views: listingStats.view_count,
          orders: listingStats.order_count,
          revenue: 0, // TODO: Calculate revenue
        })
      }

      return this.success({ stats })
    } catch (error) {
      this.logError("getListingStats", error)
      this.handleError(error, "getListingStats")
    }
  }

  /**
   * Update listing quantity
   *
   * Updates the available quantity for a listing.
   * Only accessible by listing owners.
   *
   * @summary Update listing quantity
   * @param listing_id ID of the listing
   * @param payload New quantity
   * @returns Updated quantity
   *
   * @example payload { "quantity_available": 5 }
   */
  @Post("listing/{listing_id}/update_quantity")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateQuantity(
    @Request() request: ExpressRequest,
    @Path() listing_id: string,
    @Body() payload: UpdateQuantityPayload,
  ): Promise<UpdateQuantityResponse> {
    try {
      const userId = this.getUserId(request)

      if (payload.quantity_available === undefined) {
        throw new ValidationErrorClass("quantity_available is required")
      }

      this.logInfo("updateQuantity", "Updating listing quantity", {
        listing_id,
        user: userId,
        quantity: payload.quantity_available,
      })

      // Get the listing
      const listing = await marketDb.getMarketListing({ listing_id })

      if (!listing) {
        throw new NotFoundError(`Listing ${listing_id} not found`)
      }

      // Check permissions (same as updateListing)
      let hasPermission = false

      if (listing.user_seller_id && listing.user_seller_id === userId) {
        hasPermission = true
      }

      if (listing.contractor_seller_id) {
        const contractor = await contractorDb.getContractor({
          contractor_id: listing.contractor_seller_id,
        })

        if (contractor && (await is_member(contractor.contractor_id, userId))) {
          hasPermission = true
        }
      }

      if (!hasPermission) {
        throw new ForbiddenError(
          "You don't have permission to update this listing",
        )
      }

      // TODO: Implement actual update logic
      // For now, return placeholder
      return this.success({
        listing_id,
        quantity_available: payload.quantity_available,
      })
    } catch (error) {
      this.logError("updateQuantity", error, { listing_id, payload })
      this.handleError(error, "updateQuantity")
    }
  }

  /**
   * Refresh listing expiration
   *
   * Extends the expiration date of a listing.
   * Only accessible by listing owners.
   *
   * @summary Refresh listing
   * @param listing_id ID of the listing
   * @returns New expiration date
   */
  @Post("listing/{listing_id}/refresh")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async refreshListing(
    @Request() request: ExpressRequest,
    @Path() listing_id: string,
  ): Promise<RefreshListingResponse> {
    try {
      const userId = this.getUserId(request)

      this.logInfo("refreshListing", "Refreshing listing", {
        listing_id,
        user: userId,
      })

      // Get the listing
      const listing = await marketDb.getMarketListing({ listing_id })

      if (!listing) {
        throw new NotFoundError(`Listing ${listing_id} not found`)
      }

      // Check permissions
      let hasPermission = false

      if (listing.user_seller_id && listing.user_seller_id === userId) {
        hasPermission = true
      }

      if (listing.contractor_seller_id) {
        const contractor = await contractorDb.getContractor({
          contractor_id: listing.contractor_seller_id,
        })

        if (contractor && (await is_member(contractor.contractor_id, userId))) {
          hasPermission = true
        }
      }

      if (!hasPermission) {
        throw new ForbiddenError(
          "You don't have permission to refresh this listing",
        )
      }

      // TODO: Implement actual refresh logic
      // For now, return placeholder
      const newExpiresAt = new Date()
      newExpiresAt.setDate(newExpiresAt.getDate() + 30)

      return this.success({
        listing_id,
        expires_at: newExpiresAt.toISOString(),
      })
    } catch (error) {
      this.logError("refreshListing", error, { listing_id })
      this.handleError(error, "refreshListing")
    }
  }

  /**
   * Track a view on a market listing
   *
   * Records a view on a listing for analytics purposes.
   * Public endpoint, no authentication required.
   *
   * @summary Track listing view
   * @param listing_id ID of the listing
   * @returns Success confirmation
   */
  @Post("listings/{listing_id}/views")
  @Middlewares(tsoaReadRateLimit)
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async trackView(
    @Request() request: ExpressRequest,
    @Path() listing_id: string,
  ): Promise<TrackViewResponse> {
    try {
      this.logInfo("trackView", "Tracking listing view", {
        listing_id,
        ip: this.getClientIp(request),
      })

      // Verify listing exists
      const listing = await marketDb.getMarketListing({ listing_id })

      if (!listing) {
        throw new NotFoundError(`Listing ${listing_id} not found`)
      }

      // TODO: Implement actual view tracking logic
      // For now, return success
      return this.success({ success: true })
    } catch (error) {
      this.logError("trackView", error, { listing_id })
      this.handleError(error, "trackView")
    }
  }

  /**
   * Search game items by name
   *
   * Search for game items using PostgreSQL full-text search.
   * Returns matching items with their name, type, and ID.
   *
   * @summary Search game items
   * @param query Search query string
   * @returns List of matching game items
   *
   * @example query "Aegis"
   */
  @Get("items/search")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchGameItems(
    @Query() query: string,
  ): Promise<{ data: Array<{ name: string; type: string; id: string }> }> {
    try {
      if (!query || query.length < 1) {
        return this.success([])
      }

      const limit = query.length < 3 ? 10 : 50
      const items = await marketDb.searchGameItems(query, limit)

      this.logInfo("searchGameItems", "Searching game items", {
        query,
        limit,
        resultsCount: items.length,
      })

      return this.success(items)
    } catch (error) {
      this.logError("searchGameItems", error, { query })
      this.handleError(error, "searchGameItems")
    }
  }
}
