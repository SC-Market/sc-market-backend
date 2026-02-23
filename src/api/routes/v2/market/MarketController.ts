/**
 * Market Controller for v2 API
 *
 * Handles market listing operations using TSOA decorators.
 * Reuses existing database functions and business logic from v1.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Body,
  Path,
  Query,
  Security,
  Request,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as marketDb from "../../v1/market/database.js"
import * as contractorDb from "../../v1/contractors/database.js"
import { formatListing } from "../../v1/util/formatting.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import {
  CreateListingRequest,
  UpdateListingRequest,
  ListingFilters,
  ListingResponse,
  PaginatedListingsResponse,
} from "./types.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { DEFAULT_PLACEHOLDER_PHOTO_URL } from "../../v1/market/constants.js"
import { has_permission } from "../../v1/util/permissions.js"
import { StockLotService } from "../../../../services/stock-lot/stock-lot.service.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { DBMarketListing } from "../../../../clients/database/db-models.js"
import moment from "moment"

/**
 * Controller for market listing operations
 */
@Route("v2/market/listings")
@Tags("Market")
export class MarketController extends BaseController {
  constructor() {
    // TSOA will inject the request via setStatus/getHeaders methods
    super({} as ExpressRequest)
  }

  // Override to get the actual request from TSOA context
  private getRequest(): ExpressRequest {
    return this.request
  }

  /**
   * Get all market listings with optional filters
   * @summary Get market listings
   * @param search Search query string
   * @param game_item_id Filter by game item ID
   * @param item_type Filter by item type
   * @param sale_type Filter by sale type
   * @param status Filter by status
   * @param min_price Minimum price filter
   * @param max_price Maximum price filter
   * @param user_seller_id Filter by user seller
   * @param contractor_seller_id Filter by contractor seller
   * @param limit Results limit (default: 50, max: 100)
   * @param offset Results offset for pagination (default: 0)
   * @param sort Sort field
   * @param reverse_sort Reverse sort order
   */
  @Get()
  @SuccessResponse("200", "Successfully retrieved listings")
  public async getListings(
    @Query() search?: string,
    @Query() game_item_id?: string,
    @Query() item_type?: string,
    @Query() sale_type?: string,
    @Query() status?: string,
    @Query() min_price?: number,
    @Query() max_price?: number,
    @Query() user_seller_id?: string,
    @Query() contractor_seller_id?: string,
    @Query() limit: number = 50,
    @Query() offset: number = 0,
    @Query() sort?: string,
    @Query() reverse_sort?: boolean,
  ): Promise<PaginatedListingsResponse> {
    // Validate and cap limit
    const safeLimit = Math.min(Math.max(1, limit), 100)
    const safeOffset = Math.max(0, offset)

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status
    } else {
      where.status = "active" // Default to active listings
    }

    if (sale_type) {
      where.sale_type = sale_type
    }

    if (user_seller_id) {
      where.user_seller_id = user_seller_id
    }

    if (contractor_seller_id) {
      where.contractor_seller_id = contractor_seller_id
    }

    // Get listings from database
    const knex = getKnex()
    let query = knex("market_listings").where(where)

    // Apply price filters
    if (min_price !== undefined) {
      query = query.where("price", ">=", min_price)
    }
    if (max_price !== undefined) {
      query = query.where("price", "<=", max_price)
    }

    // Apply game item filter if provided
    if (game_item_id) {
      query = query
        .join(
          "market_unique_listings",
          "market_unique_listings.listing_id",
          "=",
          "market_listings.listing_id",
        )
        .join(
          "market_listing_details",
          "market_unique_listings.details_id",
          "=",
          "market_listing_details.details_id",
        )
        .where("market_listing_details.game_item_id", "=", game_item_id)
    }

    // Apply item type filter if provided
    if (item_type) {
      if (!game_item_id) {
        // Only join if not already joined
        query = query
          .join(
            "market_unique_listings",
            "market_unique_listings.listing_id",
            "=",
            "market_listings.listing_id",
          )
          .join(
            "market_listing_details",
            "market_unique_listings.details_id",
            "=",
            "market_listing_details.details_id",
          )
      }
      query = query.where("market_listing_details.item_type", "=", item_type)
    }

    // Apply search if provided
    if (search) {
      if (!game_item_id && !item_type) {
        query = query
          .join(
            "market_unique_listings",
            "market_unique_listings.listing_id",
            "=",
            "market_listings.listing_id",
          )
          .join(
            "market_listing_details",
            "market_unique_listings.details_id",
            "=",
            "market_listing_details.details_id",
          )
      }
      query = query.where((builder: any) => {
        builder
          .where("market_listing_details.title", "ilike", `%${search}%`)
          .orWhere("market_listing_details.description", "ilike", `%${search}%`)
      })
    }

    // Get total count
    const countQuery = query.clone()
    const [{ count }] = await countQuery.count(
      "market_listings.listing_id as count",
    )
    const total = parseInt(count as string)

    // Apply sorting
    const sortField = sort || "timestamp"
    const sortOrder = reverse_sort ? "asc" : "desc"
    query = query.orderBy(`market_listings.${sortField}`, sortOrder)

    // Apply pagination
    query = query.limit(safeLimit).offset(safeOffset)

    // Select only market_listings columns to avoid duplicates
    const listings = await query.select("market_listings.*")

    // Format listings
    const formattedListings = await Promise.all(
      listings.map(async (listing: DBMarketListing) => {
        const formatted = await formatListing(listing, false)
        return this.convertToListingResponse(formatted)
      }),
    )

    return {
      listings: formattedListings,
      total,
      limit: safeLimit,
      offset: safeOffset,
    }
  }

  /**
   * Get a specific listing by ID
   * @summary Get listing details
   * @param listing_id The listing ID
   */
  @Get("{listing_id}")
  @SuccessResponse("200", "Successfully retrieved listing")
  public async getListing(
    @Path() listing_id: string,
  ): Promise<ListingResponse> {
    const listing = await marketDb.getMarketListing({ listing_id })

    if (!listing) {
      this.throwNotFound("Listing", listing_id)
    }

    // Check if user has private access
    const user = this.request.user
    let isPrivate = false

    if (user) {
      if (listing.contractor_seller_id) {
        const contractors = await contractorDb.getUserContractors({
          user_id: user.user_id,
        })
        if (
          contractors.find(
            (c) => c.contractor_id === listing.contractor_seller_id,
          ) ||
          listing.user_seller_id === user.user_id ||
          user.role === "admin"
        ) {
          isPrivate = true
        }
      } else if (listing.user_seller_id === user.user_id) {
        isPrivate = true
      }
    }

    const formatted = await formatListing(listing, isPrivate)
    return this.convertToListingResponse(formatted)
  }

  /**
   * Create a new market listing
   * @summary Create listing
   * @param body Listing creation data
   */
  @Post()
  @Security("jwt")
  @SuccessResponse("201", "Successfully created listing")
  public async createListing(
    @Body() body: CreateListingRequest,
  ): Promise<ListingResponse> {
    const user = this.getUser()

    // Require verified account
    if (!user.rsi_confirmed) {
      this.throwForbidden("Account must be verified to create listings")
    }

    const {
      price,
      title,
      description,
      sale_type = "sale",
      item_type,
      quantity: quantity_available,
      game_item_id,
      photos,
      spectrum_id,
      internal = false,
    } = body

    let contractor
    if (spectrum_id) {
      // Validate contractor exists and user has permissions
      contractor = await contractorDb.getContractor({ spectrum_id })
      if (!contractor) {
        this.throwValidationError("Invalid contractor", [
          { field: "spectrum_id", message: "Contractor not found" },
        ])
      }
      if (contractor.archived) {
        this.throwConflict("Archived contractors cannot create listings")
      }

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        this.throwForbidden(
          "You are not authorized to create listings on behalf of this contractor",
        )
      }
    }

    // Only allow internal=true for contractor listings
    if (internal && !contractor) {
      this.throwValidationError(
        "Internal listings can only be created for contractor listings",
        [{ field: "internal", message: "User listings cannot be internal" }],
      )
    }

    // Handle empty photos by using default placeholder
    const photosToProcess =
      photos && photos.length > 0 ? photos : [DEFAULT_PLACEHOLDER_PHOTO_URL]

    // Validate URLs are valid
    if (photosToProcess.find((p: string) => !cdn.verifyExternalResource(p))) {
      this.throwValidationError("Invalid photo URL", [
        { field: "photos", message: "One or more photo URLs are invalid" },
      ])
    }

    // Validate game item if provided
    let validatedGameItemId: string | null = null
    if (game_item_id) {
      const item = await marketDb.getGameItem({ id: game_item_id })
      if (!item) {
        this.throwValidationError("Invalid game item", [
          { field: "game_item_id", message: "Game item not found" },
        ])
      }
      validatedGameItemId = item.id
    }

    // Create listing details
    const details = (
      await marketDb.createListingDetails({
        title,
        description,
        item_type,
        game_item_id: validatedGameItemId,
      })
    )[0]

    // Create listing
    const [listing] = await marketDb.createMarketListing({
      price,
      sale_type,
      quantity_available,
      user_seller_id: contractor ? null : user.user_id,
      contractor_seller_id: contractor ? contractor.contractor_id : null,
      status: "active",
      internal,
    })

    // Create unique listing
    await marketDb.createUniqueListing({
      accept_offers: false,
      details_id: details.details_id,
      listing_id: listing.listing_id,
    })

    // Upload photos
    const resources = await Promise.all(
      photosToProcess
        .filter((p: string) => p)
        .map(
          async (p: string, i: number) =>
            await cdn.createExternalResource(
              p,
              listing.listing_id + `_photo_${i}`,
            ),
        ),
    )

    await marketDb.insertMarketListingPhoto(
      listing,
      resources.map((r) => ({ resource_id: r.resource_id })),
    )

    this.setStatus(201)
    const formatted = await formatListing(listing, true)
    return this.convertToListingResponse(formatted)
  }

  /**
   * Update an existing listing
   * @summary Update listing
   * @param listing_id The listing ID
   * @param body Listing update data
   */
  @Put("{listing_id}")
  @Security("jwt")
  @SuccessResponse("200", "Successfully updated listing")
  public async updateListing(
    @Path() listing_id: string,
    @Body() body: UpdateListingRequest,
  ): Promise<ListingResponse> {
    const user = this.getUser()
    const listing = await marketDb.getMarketListing({ listing_id })

    if (!listing) {
      this.throwNotFound("Listing", listing_id)
    }

    // Check permissions
    let hasPermission = false
    if (listing.user_seller_id && listing.user_seller_id === user.user_id) {
      hasPermission = true
    }
    if (listing.contractor_seller_id) {
      const contractor = await contractorDb.getContractor({
        contractor_id: listing.contractor_seller_id,
      })
      if (
        contractor &&
        (await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        hasPermission = true
      }
    }
    if (user.role === "admin") {
      hasPermission = true
    }

    if (!hasPermission) {
      this.throwForbidden("You do not have permission to update this listing")
    }

    if (listing.status === "archived") {
      this.throwConflict("Cannot update archived listing")
    }

    const {
      status,
      title,
      description,
      item_type,
      item_name,
      price,
      quantity_available,
      photos,
      internal,
    } = body

    // Validate constraints
    if (
      (title || description || item_type) &&
      listing.sale_type === "aggregate"
    ) {
      this.throwValidationError("Cannot update details for aggregate listing", [
        {
          field: "title",
          message: "Aggregate listings cannot have custom details",
        },
      ])
    }

    // Only allow internal=true for contractor listings
    if (internal && !listing.contractor_seller_id) {
      this.throwValidationError(
        "Internal listings can only be created for contractor listings",
        [{ field: "internal", message: "User listings cannot be internal" }],
      )
    }

    // Handle game item name to ID conversion
    let game_item_id: string | null | undefined = undefined
    if (item_name !== undefined) {
      if (item_name === null) {
        game_item_id = null
      } else {
        const item = await marketDb.getGameItem({ name: item_name })
        if (!item) {
          this.throwValidationError("Invalid item name", [
            { field: "item_name", message: "Game item not found" },
          ])
        }
        game_item_id = item.id
      }
    }

    // Update listing fields
    if (
      status ||
      price !== undefined ||
      quantity_available !== undefined ||
      internal !== undefined
    ) {
      await marketDb.updateMarketListing(listing_id, {
        status,
        price,
        quantity_available,
        internal,
      })
    }

    // Update listing details
    if (title || description || item_type || item_name !== undefined) {
      const unique = await marketDb.getMarketUniqueListing({ listing_id })
      await marketDb.updateListingDetails(
        { details_id: unique.details_id },
        { title, description, item_type, game_item_id },
      )
    }

    // Handle photo updates
    if (photos !== undefined) {
      const old_photos =
        await marketDb.getMarketListingImagesByListingID(listing)

      // Remove old photos
      for (const p of old_photos) {
        await marketDb.deleteMarketListingImages(p)
        try {
          await cdn.removeResource(p.resource_id)
        } catch (error) {
          // Continue even if removal fails
        }
      }

      // Add new photos
      const resources = await Promise.all(
        photos
          .filter((p: string) => p)
          .map(
            async (p: string, i: number) =>
              await cdn.createExternalResource(
                p,
                listing.listing_id + `_photo_${i}`,
              ),
          ),
      )

      await marketDb.insertMarketListingPhoto(
        listing,
        resources.map((r) => ({ resource_id: r.resource_id })),
      )
    }

    // Fetch updated listing
    const updatedListing = await marketDb.getMarketListing({ listing_id })
    const formatted = await formatListing(updatedListing, true)
    return this.convertToListingResponse(formatted)
  }

  /**
   * Delete a listing
   * @summary Delete listing
   * @param listing_id The listing ID
   */
  @Delete("{listing_id}")
  @Security("jwt")
  @SuccessResponse("204", "Successfully deleted listing")
  public async deleteListing(@Path() listing_id: string): Promise<void> {
    const user = this.getUser()
    const listing = await marketDb.getMarketListing({ listing_id })

    if (!listing) {
      this.throwNotFound("Listing", listing_id)
    }

    // Check permissions
    let hasPermission = false
    if (listing.user_seller_id && listing.user_seller_id === user.user_id) {
      hasPermission = true
    }
    if (listing.contractor_seller_id) {
      const contractor = await contractorDb.getContractor({
        contractor_id: listing.contractor_seller_id,
      })
      if (
        contractor &&
        (await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        hasPermission = true
      }
    }
    if (user.role === "admin") {
      hasPermission = true
    }

    if (!hasPermission) {
      this.throwForbidden("You do not have permission to delete this listing")
    }

    // Archive the listing instead of deleting
    await marketDb.updateMarketListing(listing_id, { status: "archived" })

    this.setStatus(204)
  }

  /**
   * Helper method to convert v1 formatted listing to v2 response format
   */
  private convertToListingResponse(formatted: any): ListingResponse {
    return {
      listing_id: formatted.listing.listing_id,
      title: formatted.details.title,
      description: formatted.details.description,
      price: formatted.listing.price,
      quantity_available: formatted.listing.quantity_available,
      status: formatted.listing.status,
      sale_type: formatted.listing.sale_type,
      item_type: formatted.details.item_type,
      game_item_id: formatted.details.game_item_id,
      user_seller: formatted.listing.user_seller || null,
      contractor_seller: formatted.listing.contractor_seller || null,
      timestamp: formatted.listing.timestamp,
      expiration: formatted.listing.expiration,
      photos: formatted.photos || [],
      internal: formatted.listing.internal || false,
    }
  }
}
