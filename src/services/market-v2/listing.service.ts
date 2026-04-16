/**
 * Listing Service
 *
 * Business logic for creating and managing listings with variant support.
 * Handles atomic transactions for listing creation with stock lots and pricing.
 * Implements search with full-text search, quality filters, and price filters.
 *
 * Requirements: 9.1, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 22.1, 22.2, 22.3, 22.4, 22.5, 26.1, 26.2, 26.3, 26.4, 26.5, 28.1, 28.4, 28.5, 28.6
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { VariantService } from "./variant.service.js"
import { MarketV2Repository } from "./repository.js"
import {
  CreateListingRequest,
  Listing,
  SearchListingsRequest,
  SearchListingsResponse,
} from "../../api/routes/v2/types/market-v2-types.js"
import {
  BusinessLogicError,
  ValidationError,
} from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import logger from "../../logger/logger.js"

export class ListingService {
  private knex: Knex
  private variantService: VariantService
  private repository: MarketV2Repository

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
    this.variantService = new VariantService(this.knex)
    this.repository = new MarketV2Repository(this.knex)
  }

  /**
   * Search listings with filters
   *
   * Queries the listing_search view with full-text search, quality tier filters,
   * price filters, and game item filters. Results are paginated.
   *
   * Requirements: 9.1, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 22.1, 22.2, 22.3, 22.4, 22.5
   */
  async searchListings(
    request: SearchListingsRequest,
  ): Promise<SearchListingsResponse> {
    // Validate pagination parameters
    const page = Math.max(1, request.page || 1)
    const page_size = Math.min(100, Math.max(1, request.page_size || 20))

    try {
      // Build query on listing_search view
      let query = this.knex("listing_search")

      // Apply full-text search filter (Requirement 22.5)
      if (request.text && request.text.trim().length > 0) {
        const searchQuery = request.text
          .trim()
          .split(/\s+/)
          .map((term) => `${term}:*`)
          .join(" & ")

        query = query.whereRaw(
          "search_vector @@ to_tsquery('english', ?)",
          [searchQuery],
        )
      }

      // Apply game item filter (Requirement 22.5)
      if (request.game_item_id) {
        query = query.where("game_item_id", this.knex.raw("?::uuid", [request.game_item_id]))
      }

      // Apply quality tier min filter (Requirement 22.1)
      // Filter: quality_tier_max >= quality_tier_min
      if (request.quality_tier_min !== undefined) {
        query = query.where("quality_tier_max", ">=", request.quality_tier_min)
      }

      // Apply quality tier max filter (Requirement 22.2)
      // Filter: quality_tier_min <= quality_tier_max
      if (request.quality_tier_max !== undefined) {
        query = query.where("quality_tier_min", "<=", request.quality_tier_max)
      }

      // Apply price min filter (Requirement 22.3)
      // Filter: price_max >= price_min
      if (request.price_min !== undefined) {
        query = query.where("price_max", ">=", request.price_min)
      }

      // Apply price max filter (Requirement 22.4)
      // Filter: price_min <= price_max
      if (request.price_max !== undefined) {
        query = query.where("price_min", "<=", request.price_max)
      }

      // Get total count for pagination
      const countQuery = query.clone().count("* as count")
      const [{ count }] = await countQuery
      const total = parseInt(count as string, 10)

      // Apply pagination (Requirement 14.6)
      const offset = (page - 1) * page_size
      query = query
        .select(
          "listing_id",
          "title",
          "seller_name",
          "seller_rating",
          "price_min",
          "price_max",
          "quantity_available",
          "quality_tier_min",
          "quality_tier_max",
          "variant_count",
          "created_at",
        )
        .orderBy("created_at", "desc")
        .limit(page_size)
        .offset(offset)

      // Execute query
      const listings = await query

      logger.debug("Search query executed", {
        total,
        returned: listings.length,
        page,
        page_size,
      })

      return {
        listings: listings.map((row) => ({
          listing_id: row.listing_id,
          title: row.title,
          seller_name: row.seller_name,
          seller_rating: parseFloat(row.seller_rating) || 0,
          price_min: parseInt(row.price_min, 10),
          price_max: parseInt(row.price_max, 10),
          quantity_available: row.quantity_available,
          quality_tier_min: row.quality_tier_min || 1,
          quality_tier_max: row.quality_tier_max || 1,
          variant_count: row.variant_count,
          created_at: row.created_at,
        })),
        total,
        page,
        page_size,
      }
    } catch (error) {
      logger.error("Search query failed", {
        error: error instanceof Error ? error.message : String(error),
        request,
      })

      throw new BusinessLogicError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to search listings",
      )
    }
  }

  /**
   * Create a new listing with variants in an atomic transaction
   *
   * Transaction flow:
   * 1. BEGIN TRANSACTION
   * 2. INSERT INTO listings
   * 3. INSERT INTO listing_items
   * 4. For each lot:
   *    - Get or create variant
   *    - INSERT INTO stock_lots
   *    - INSERT INTO variant_pricing (if per_variant mode)
   * 5. COMMIT TRANSACTION (or ROLLBACK on error)
   *
   * Requirements: 13.5, 13.6, 26.2, 26.3, 26.4, 26.5
   */
  async createListing(
    userId: string,
    request: CreateListingRequest,
  ): Promise<Listing> {
    // Validate request
    this.validateCreateListingRequest(request)

    try {
      // Execute in transaction for atomicity
      const listing = await this.knex.transaction(async (trx) => {
        // Step 1: Insert into listings table
        const [listingRow] = await trx("listings")
          .insert({
            seller_id: trx.raw("?::uuid", [userId]),
            seller_type: "user",
            title: request.title,
            description: request.description,
            status: "active",
            visibility: "public",
            sale_type: "fixed",
            listing_type: "single",
          })
          .returning("*")

        logger.debug("Listing created", {
          listingId: listingRow.listing_id,
        })

        // Step 2: Insert into listing_items table
        const [listingItemRow] = await trx("listing_items")
          .insert({
            listing_id: listingRow.listing_id,
            game_item_id: trx.raw("?::uuid", [request.game_item_id]),
            pricing_mode: request.pricing_mode,
            base_price: request.base_price,
            display_order: 0,
          })
          .returning("*")

        logger.debug("Listing item created", {
          itemId: listingItemRow.item_id,
        })

        // Step 3: Process each lot
        for (const lot of request.lots) {
          // Get or create variant
          const variant = await this.variantService.getOrCreateVariant({
            game_item_id: request.game_item_id,
            attributes: lot.variant_attributes,
          })

          logger.debug("Variant resolved", {
            variantId: variant.variant_id,
            attributes: lot.variant_attributes,
          })

          // Insert stock lot
          await trx("stock_lots").insert({
            item_id: listingItemRow.item_id,
            variant_id: variant.variant_id,
            quantity_total: lot.quantity,
            location_id: lot.location_id
              ? trx.raw("?::uuid", [lot.location_id])
              : null,
            listed: true,
          })

          logger.debug("Stock lot created", {
            variantId: variant.variant_id,
            quantity: lot.quantity,
          })

          // Insert variant pricing if per_variant mode
          if (request.pricing_mode === "per_variant") {
            if (!lot.price) {
              throw new ValidationError(
                "Price is required for each lot when pricing_mode is per_variant",
                [
                  {
                    field: "lots[].price",
                    message: "Price is required for per_variant pricing mode",
                  },
                ],
              )
            }

            await trx("variant_pricing").insert({
              item_id: listingItemRow.item_id,
              variant_id: variant.variant_id,
              price: lot.price,
            })

            logger.debug("Variant pricing created", {
              variantId: variant.variant_id,
              price: lot.price,
            })
          }
        }

        // Return the created listing
        return listingRow as Listing
      })

      logger.info("Listing creation transaction completed", {
        listingId: listing.listing_id,
      })

      return listing
    } catch (error) {
      // Handle database errors with descriptive messages
      const dbError = this.handleDatabaseError(error)
      logger.error("Listing creation failed", {
        userId,
        error: dbError.message,
        originalError: error instanceof Error ? error.message : String(error),
      })
      throw dbError
    }
  }

  /**
   * Validate create listing request
   *
   * Requirements: 28.1
   */
  private validateCreateListingRequest(request: CreateListingRequest): void {
    const errors: Array<{ field: string; message: string }> = []

    // Validate title
    if (!request.title || request.title.trim().length === 0) {
      errors.push({
        field: "title",
        message: "Title is required",
      })
    } else if (request.title.length > 500) {
      errors.push({
        field: "title",
        message: "Title must be 500 characters or less",
      })
    }

    // Validate description
    if (!request.description || request.description.trim().length === 0) {
      errors.push({
        field: "description",
        message: "Description is required",
      })
    }

    // Validate game_item_id
    if (!request.game_item_id) {
      errors.push({
        field: "game_item_id",
        message: "Game item ID is required",
      })
    }

    // Validate pricing_mode
    if (!["unified", "per_variant"].includes(request.pricing_mode)) {
      errors.push({
        field: "pricing_mode",
        message: "Pricing mode must be 'unified' or 'per_variant'",
      })
    }

    // Validate base_price for unified mode
    if (request.pricing_mode === "unified" && !request.base_price) {
      errors.push({
        field: "base_price",
        message: "Base price is required for unified pricing mode",
      })
    }

    // Validate lots
    if (!request.lots || request.lots.length === 0) {
      errors.push({
        field: "lots",
        message: "At least one lot is required",
      })
    } else {
      request.lots.forEach((lot, index) => {
        if (!lot.quantity || lot.quantity <= 0) {
          errors.push({
            field: `lots[${index}].quantity`,
            message: "Quantity must be greater than 0",
          })
        }

        if (!lot.variant_attributes) {
          errors.push({
            field: `lots[${index}].variant_attributes`,
            message: "Variant attributes are required",
          })
        }

        if (request.pricing_mode === "per_variant" && !lot.price) {
          errors.push({
            field: `lots[${index}].price`,
            message: "Price is required for per_variant pricing mode",
          })
        }
      })
    }

    if (errors.length > 0) {
      throw new ValidationError("Listing validation failed", errors)
    }
  }

  /**
   * Handle database errors with descriptive messages
   *
   * Requirements: 28.1, 28.4, 28.5, 28.6
   */
  private handleDatabaseError(error: any): Error {
    // If already a known error type, return as-is
    if (
      error instanceof ValidationError ||
      error instanceof BusinessLogicError
    ) {
      return error
    }

    // Handle PostgreSQL errors
    if (error.code) {
      switch (error.code) {
        case "23505": // Unique constraint violation
          return new BusinessLogicError(
            ErrorCode.CONFLICT,
            "A listing with these attributes already exists",
            {
              constraint: error.constraint,
              detail: error.detail,
            },
          )

        case "23503": // Foreign key violation
          return new ValidationError(
            this.getForeignKeyErrorMessage(error),
            [
              {
                field: "reference",
                message: this.getForeignKeyErrorMessage(error),
              },
            ],
          )

        case "23502": // Not null violation
          return new ValidationError(`Required field is missing: ${error.column}`, [
            {
              field: error.column,
              message: "This field is required",
            },
          ])

        case "23514": // Check constraint violation
          return new ValidationError("Invalid value provided", [
            {
              field: error.constraint || "unknown",
              message: error.detail || "Value does not meet constraints",
            },
          ])

        default:
          logger.error("Unhandled database error", {
            code: error.code,
            message: error.message,
            detail: error.detail,
          })
          return new BusinessLogicError(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "An error occurred while creating the listing",
          )
      }
    }

    // Generic error
    return new BusinessLogicError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      "An unexpected error occurred",
    )
  }

  /**
   * Get descriptive error message for foreign key violations
   */
  private getForeignKeyErrorMessage(error: any): string {
    const constraint = error.constraint || ""

    if (constraint.includes("game_item")) {
      return "Invalid game item ID"
    }

    if (constraint.includes("location")) {
      return "Invalid location ID"
    }

    if (constraint.includes("seller")) {
      return "Invalid seller ID"
    }

    return "Invalid reference to related data"
  }
}
