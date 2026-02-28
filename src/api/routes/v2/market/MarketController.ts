/**
 * Market Controller for v2 API
 *
 * Implements Option A: Separate endpoints for search vs details
 * - GET /v2/market/listings → Search results (flat format)
 * - GET /v2/market/listings/:id/details → Full details (nested format)
 * - POST /v2/market/listings → Create listing
 * - PUT /v2/market/listings/:id → Update listing
 * - DELETE /v2/market/listings/:id → Delete listing
 *
 * Maintains v1 business logic and response formats for compatibility.
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
  SuccessResponse,
} from "tsoa"
import { BaseController } from "../base/BaseController.js"
import * as marketDb from "../../v1/market/database.js"
import * as contractorDb from "../../v1/contractors/database.js"
import { formatListing } from "../../v1/util/formatting.js"
import { convertQuery } from "../../v1/market/helpers.js"
import { is_member } from "../../v1/util/permissions.js"
import {
  CreateListingRequest,
  UpdateListingRequest,
  ListingSearchResponse,
  ListingSearchResult,
  ListingDetailResponse,
} from "./types.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { DEFAULT_PLACEHOLDER_PHOTO_URL } from "../../v1/market/constants.js"
import { has_permission } from "../../v1/util/permissions.js"
import type { MarketSearchQueryArguments } from "../../v1/market/types.js"

/**
 * Controller for market listing operations
 */
@Route("market/listings")
@Tags("Market")
export class MarketController extends BaseController {
  constructor() {
    // TSOA will inject the request via setStatus/getHeaders methods
    super({} as any)
  }

  /**
   * Search market listings
   * Returns flat search results optimized for list views
   * @summary Search market listings
   */
  @Get()
  @SuccessResponse("200", "Successfully retrieved listings")
  public async searchListings(
    @Query() query?: string,
    @Query() item_type?: string,
    @Query() sale_type?: string,
    @Query() min_price?: number,
    @Query() max_price?: number,
    @Query() quantity_available?: number,
    @Query() user_seller_id?: string,
    @Query() contractor_seller_id?: string,
    @Query() statuses?: string,
    @Query() listing_type?: string,
    @Query() sort: string = "timestamp",
    @Query() page: number = 0,
    @Query() pageSize: number = 20,
  ): Promise<ListingSearchResponse> {
    // Convert query parameters to v1 format
    const queryArgs: Partial<MarketSearchQueryArguments> = {
      query: query || "",
      item_type: item_type || null,
      sale_type: sale_type || null,
      minCost: min_price?.toString() || "0",
      maxCost: max_price?.toString() || null,
      quantityAvailable: quantity_available?.toString() || "0",
      user_seller: user_seller_id || "",
      contractor_seller: contractor_seller_id || "",
      statuses: statuses || null,
      listing_type: listing_type || null,
      sort,
      index: page.toString(),
      page_size: pageSize.toString(),
      rating: null,
      seller_rating: "0",
      language_codes: null,
      attributes: null,
    }

    const searchQuery = await convertQuery(queryArgs)

    // Check if user can see internal listings
    let includeInternal = false
    const user = this.request.user
    if (user && searchQuery.contractor_seller_id) {
      if (await is_member(searchQuery.contractor_seller_id, user.user_id)) {
        includeInternal = true
      }
    }

    // Use v1 search function
    const searchResults = await marketDb.searchMarket(searchQuery, {
      ...(includeInternal ? {} : { internal: "false" }),
    })

    // Format results to match v1 response
    const listings: ListingSearchResult[] = searchResults.map((r) => ({
      listing_id: r.listing_id,
      listing_type: r.listing_type,
      item_type: r.item_type,
      item_name: r.item_name,
      game_item_id: r.game_item_id,
      sale_type: r.sale_type === "sale" ? r.listing_type : r.sale_type,
      price: Number(r.price),
      expiration: r.expiration?.toISOString() || null,
      minimum_price: Number(r.minimum_price),
      maximum_price: Number(r.maximum_price),
      quantity_available: Number(r.quantity_available),
      timestamp: r.timestamp.toISOString(),
      total_rating: r.total_rating,
      avg_rating: r.avg_rating,
      details_id: r.details_id,
      status: r.status,
      user_seller: r.user_seller,
      contractor_seller: r.contractor_seller,
      auction_end_time: r.auction_end_time?.toISOString() || null,
      rating_count: r.rating_count,
      rating_streak: r.rating_streak,
      total_orders: r.total_orders,
      total_assignments: r.total_assignments,
      response_rate: r.response_rate,
      title: r.title,
      photo: r.photo,
      internal: r.internal,
      badges: r.badges || null,
    }))

    return {
      total:
        searchResults.length > 0 && searchResults[0].full_count != null
          ? Number(searchResults[0].full_count)
          : 0,
      listings,
    }
  }

  /**
   * Get detailed listing information
   * Returns nested format with full details, photos, and stats
   * @summary Get listing details
   */
  @Get("{listing_id}/details")
  @SuccessResponse("200", "Successfully retrieved listing details")
  public async getListingDetails(
    @Path() listing_id: string,
  ): Promise<ListingDetailResponse> {
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

    // Use v1 formatListing function to get the nested format
    const formatted = await formatListing(listing, isPrivate)
    return formatted as ListingDetailResponse
  }

  /**
   * Create a new market listing
   * @summary Create listing
   */
  @Post()
  @Security("jwt")
  @SuccessResponse("201", "Successfully created listing")
  public async createListing(
    @Body() body: CreateListingRequest,
  ): Promise<ListingDetailResponse> {
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

    if (internal && !contractor) {
      this.throwValidationError(
        "Internal listings can only be created for contractor listings",
        [{ field: "internal", message: "User listings cannot be internal" }],
      )
    }

    const photosToProcess =
      photos && photos.length > 0 ? photos : [DEFAULT_PLACEHOLDER_PHOTO_URL]

    if (photosToProcess.find((p: string) => !cdn.verifyExternalResource(p))) {
      this.throwValidationError("Invalid photo URL", [
        { field: "photos", message: "One or more photo URLs are invalid" },
      ])
    }

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

    const details = (
      await marketDb.createListingDetails({
        title,
        description,
        item_type,
        game_item_id: validatedGameItemId,
      })
    )[0]

    const [listing] = await marketDb.createMarketListing({
      price,
      sale_type,
      quantity_available,
      user_seller_id: contractor ? null : user.user_id,
      contractor_seller_id: contractor ? contractor.contractor_id : null,
      status: "active",
      internal,
    })

    await marketDb.createUniqueListing({
      accept_offers: false,
      details_id: details.details_id,
      listing_id: listing.listing_id,
    })

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
    return formatted as ListingDetailResponse
  }

  /**
   * Update an existing listing
   * @summary Update listing
   */
  @Put("{listing_id}")
  @Security("jwt")
  @SuccessResponse("200", "Successfully updated listing")
  public async updateListing(
    @Path() listing_id: string,
    @Body() body: UpdateListingRequest,
  ): Promise<ListingDetailResponse> {
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

    if (internal && !listing.contractor_seller_id) {
      this.throwValidationError(
        "Internal listings can only be created for contractor listings",
        [{ field: "internal", message: "User listings cannot be internal" }],
      )
    }

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

    if (title || description || item_type || item_name !== undefined) {
      const unique = await marketDb.getMarketUniqueListing({ listing_id })
      await marketDb.updateListingDetails(
        { details_id: unique.details_id },
        { title, description, item_type, game_item_id },
      )
    }

    if (photos !== undefined) {
      const old_photos =
        await marketDb.getMarketListingImagesByListingID(listing)

      for (const p of old_photos) {
        await marketDb.deleteMarketListingImages(p)
        try {
          await cdn.removeResource(p.resource_id)
        } catch (error) {
          // Continue even if removal fails
        }
      }

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

    const updatedListing = await marketDb.getMarketListing({ listing_id })
    const formatted = await formatListing(updatedListing, true)
    return formatted as ListingDetailResponse
  }

  /**
   * Delete a listing (archives it)
   * @summary Delete listing
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
}
