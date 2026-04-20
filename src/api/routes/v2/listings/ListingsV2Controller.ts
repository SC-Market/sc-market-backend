/**
 * Listings V2 Controller
 *
 * TSOA controller for listing management in the V2 market system.
 * Handles listing creation, search, detail retrieval, updates, and seller dashboard.
 *
 * Requirements: 14.1-14.12, 15.1-15.12, 16.1-16.12, 17.1-17.12, 18.1-18.12
 */

import { Controller, Delete, Post, Get, Put, Route, Tags, Body, Request, Query, Path, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { getOrCreateVariant } from "../../../../services/market-v2/variant.service.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import {
  CreateListingRequest,
  SearchListingsRequest,
  SearchListingsResponse,
  ListingSearchResult,
  UpdateListingRequest,
  GetListingDetailResponse,
  GetMyListingsResponse,
} from "../types/listings.types.js"
import logger from "../../../../logger/logger.js"

/**
 * Response for creating a listing
 */
export interface CreateListingResponse {
  listing_id: string
  seller_id: string
  seller_type: "user" | "contractor"
  title: string
  description: string
  status: "active" | "sold" | "expired" | "cancelled"
  created_at: string
  updated_at: string
}

@Route("listings")
@Tags("Listings V2")
export class ListingsV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Create a new listing with variants
   *
   * Creates a listing with stock lots that have variant attributes (quality tier, crafted source, etc).
   * Uses database transaction for atomicity. Supports unified pricing (one price for all variants)
   * or per-variant pricing (different prices per quality tier).
   *
   * The variant deduplication logic ensures that variants with identical attributes are reused
   * across listings, preventing duplicate variant records.
   *
   * Requirements:
   * - 14.1: POST /api/v2/listings endpoint
   * - 14.2: Accept title, description, game_item_id
   * - 14.3: Accept pricing_mode and base_price
   * - 14.4: Accept array of lots with variant_attributes
   * - 14.5: Create or reuse variants based on variant_attributes
   * - 14.6: Create stock_lots for each lot
   * - 14.7: Use database transaction for atomicity
   * - 14.8: Validate all inputs before creating listing
   * - 14.9: Return created listing with listing_id
   * - 14.11: Validate seller ownership before creation
   *
   * @summary Create listing
   * @param requestBody Listing creation request with title, description, pricing, and lots
   * @param request Express request for authentication
   * @returns Created listing with listing_id
   */
  @Post()
  public async createListing(
    @Body() requestBody: CreateListingRequest,
    @Request() request: ExpressRequest,
  ): Promise<CreateListingResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Creating listing", {
      userId,
      title: requestBody.title,
      gameItemId: requestBody.game_item_id,
      pricingMode: requestBody.pricing_mode,
      lotCount: requestBody.lots.length,
    })

    // Validate request (Requirement 14.8)
    this.validateCreateListingRequest(requestBody)

    try {
      // Use database transaction for atomicity (Requirement 14.7)
      const result = await withTransaction(async (trx) => {
        // 1. Create listing record
        const [listing] = await trx("listings")
          .insert({
            seller_id: userId,
            seller_type: "user",
            title: requestBody.title,
            description: requestBody.description,
            status: "active",
            visibility: "public",
            sale_type: "fixed",
            listing_type: "single",
            pickup_method: requestBody.pickup_method || null,
            quantity_unit: requestBody.quantity_unit || "unit",
            min_order_quantity: requestBody.min_order_quantity ?? null,
            max_order_quantity: requestBody.max_order_quantity ?? null,
            min_order_value: requestBody.min_order_value ?? null,
            max_order_value: requestBody.max_order_value ?? null,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("*")

        logger.info("Created listing record", {
          listingId: listing.listing_id,
          userId,
        })

        // 2. Create listing_items record
        const [listingItem] = await trx("listing_items")
          .insert({
            listing_id: listing.listing_id,
            game_item_id: requestBody.game_item_id,
            pricing_mode: requestBody.pricing_mode,
            base_price: requestBody.base_price || null,
            bulk_discount_tiers: requestBody.bulk_discount_tiers?.length
              ? JSON.stringify(requestBody.bulk_discount_tiers)
              : null,
            display_order: 0,
            quantity_available: 0, // Will be updated by trigger
            variant_count: 0, // Will be updated by trigger
          })
          .returning("*")

        logger.info("Created listing_items record", {
          itemId: listingItem.item_id,
          listingId: listing.listing_id,
        })

        // 3. Process each lot: get or create variants, create stock lots, create pricing
        for (const lot of requestBody.lots) {
          // Get or create variant using deduplication logic (Requirement 14.5)
          const variantId = await getOrCreateVariant(
            requestBody.game_item_id,
            lot.variant_attributes,
          )

          logger.info("Got or created variant", {
            variantId,
            attributes: lot.variant_attributes,
          })

          // Create listing_item_lots record (Requirement 14.6)
          await trx("listing_item_lots").insert({
            item_id: listingItem.item_id,
            variant_id: variantId,
            quantity_total: lot.quantity,
            location_id: lot.location_id || null,
            owner_id: userId,
            listed: true,
            created_at: new Date(),
            updated_at: new Date(),
          })

          logger.info("Created listing_item_lots record", {
            itemId: listingItem.item_id,
            variantId,
            quantity: lot.quantity,
          })

          // Create variant_pricing record if per_variant mode
          if (requestBody.pricing_mode === "per_variant") {
            if (!lot.price) {
              throw this.throwValidationError(
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
              item_id: listingItem.item_id,
              variant_id: variantId,
              price: lot.price,
              created_at: new Date(),
              updated_at: new Date(),
            })

            logger.info("Created variant_pricing record", {
              itemId: listingItem.item_id,
              variantId,
              price: lot.price,
            })
          }
        }

        // Link photos if provided
        if (requestBody.photo_resource_ids && requestBody.photo_resource_ids.length > 0) {
          const photoRows = requestBody.photo_resource_ids.map((resource_id, index) => ({
            listing_id: listing.listing_id,
            resource_id,
            display_order: index,
          }));
          await trx('listing_photos_v2').insert(photoRows);
        }

        // Return listing data (Requirement 14.9)
        return {
          listing_id: listing.listing_id,
          seller_id: listing.seller_id,
          seller_type: listing.seller_type,
          title: listing.title,
          description: listing.description,
          status: listing.status,
          created_at: listing.created_at.toISOString(),
          updated_at: listing.updated_at.toISOString(),
        }
      })

      logger.info("Listing created successfully", {
        listingId: result.listing_id,
        userId,
      })

      // TODO: Log listing creation to audit trail (Requirement 14.12)

      return result
    } catch (error) {
      logger.error("Failed to create listing", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Validates the create listing request
   * Requirement 14.8: Validate all inputs before creating listing
   */
  private validateCreateListingRequest(request: CreateListingRequest): void {
    const errors: Array<{ field: string; message: string }> = []

    // Validate title
    if (!request.title || request.title.trim().length === 0) {
      errors.push({ field: "title", message: "Title is required" })
    } else if (request.title.length > 500) {
      errors.push({
        field: "title",
        message: "Title must be 500 characters or less",
      })
    }

    // Validate description
    if (!request.description || request.description.trim().length === 0) {
      errors.push({ field: "description", message: "Description is required" })
    }

    // Validate game_item_id
    if (!request.game_item_id) {
      errors.push({ field: "game_item_id", message: "Game item ID is required" })
    }

    // Validate pricing_mode
    if (!request.pricing_mode) {
      errors.push({ field: "pricing_mode", message: "Pricing mode is required" })
    } else if (
      request.pricing_mode !== "unified" &&
      request.pricing_mode !== "per_variant"
    ) {
      errors.push({
        field: "pricing_mode",
        message: "Pricing mode must be 'unified' or 'per_variant'",
      })
    }

    // Validate base_price for unified pricing
    if (request.pricing_mode === "unified") {
      if (request.base_price === undefined || request.base_price === null) {
        errors.push({
          field: "base_price",
          message: "Base price is required when pricing_mode is 'unified'",
        })
      } else if (request.base_price <= 0) {
        errors.push({
          field: "base_price",
          message: "Base price must be greater than 0",
        })
      }
    }

    // Validate lots
    if (!request.lots || request.lots.length === 0) {
      errors.push({
        field: "lots",
        message: "At least one lot is required",
      })
    } else {
      request.lots.forEach((lot, index) => {
        // Validate quantity
        if (!lot.quantity || lot.quantity <= 0) {
          errors.push({
            field: `lots[${index}].quantity`,
            message: "Quantity must be greater than 0",
          })
        }

        // Validate variant_attributes
        if (!lot.variant_attributes) {
          errors.push({
            field: `lots[${index}].variant_attributes`,
            message: "Variant attributes are required",
          })
        } else {
          // Validate quality_tier if present
          if (lot.variant_attributes.quality_tier !== undefined) {
            if (
              lot.variant_attributes.quality_tier < 1 ||
              lot.variant_attributes.quality_tier > 5
            ) {
              errors.push({
                field: `lots[${index}].variant_attributes.quality_tier`,
                message: "Quality tier must be between 1 and 5",
              })
            }
          }

          // Validate quality_value if present
          if (lot.variant_attributes.quality_value !== undefined) {
            if (
              lot.variant_attributes.quality_value < 0 ||
              lot.variant_attributes.quality_value > 1000
            ) {
              errors.push({
                field: `lots[${index}].variant_attributes.quality_value`,
                message: "Quality value must be between 0 and 1000",
              })
            }
          }

          // Validate crafted_source if present
          if (lot.variant_attributes.crafted_source !== undefined) {
            const validSources = ["crafted", "store", "looted", "unknown"]
            if (!validSources.includes(lot.variant_attributes.crafted_source)) {
              errors.push({
                field: `lots[${index}].variant_attributes.crafted_source`,
                message: `Crafted source must be one of: ${validSources.join(", ")}`,
              })
            }
          }

          // Validate blueprint_tier if present
          if (lot.variant_attributes.blueprint_tier !== undefined) {
            if (
              lot.variant_attributes.blueprint_tier < 1 ||
              lot.variant_attributes.blueprint_tier > 5
            ) {
              errors.push({
                field: `lots[${index}].variant_attributes.blueprint_tier`,
                message: "Blueprint tier must be between 1 and 5",
              })
            }
          }
        }

        // Validate price for per_variant pricing
        if (request.pricing_mode === "per_variant") {
          if (lot.price === undefined || lot.price === null) {
            errors.push({
              field: `lots[${index}].price`,
              message: "Price is required for each lot when pricing_mode is 'per_variant'",
            })
          } else if (lot.price <= 0) {
            errors.push({
              field: `lots[${index}].price`,
              message: "Price must be greater than 0",
            })
          }
        }
      })
    }

    if (errors.length > 0) {
      this.throwValidationError("Validation failed", errors)
    }
  }

  /**
   * Search listings with filters
   *
   * Searches active listings using full-text search, quality tier filters, price filters,
   * and game item filters. Uses the listing_search view for optimized query performance.
   *
   * Requirements:
   * - 15.1: GET /api/v2/listings/search endpoint
   * - 15.2: Accept text query parameter for full-text search
   * - 15.3: Accept game_item_id parameter for item filtering
   * - 15.4: Accept quality_tier_min and quality_tier_max parameters
   * - 15.5: Accept price_min and price_max parameters
   * - 15.6: Accept page and page_size parameters for pagination
   * - 15.7: Return listings with price_min, price_max, quality_tier_min, quality_tier_max
   * - 15.8: Return total count for pagination
   * - 15.9: Support sorting by created_at, price, quality, seller_rating
   * - 15.10: Include seller information in results
   * - 15.11: Include variant_count in results
   * - 15.12: Execute queries within 50ms performance target
   *
   * @summary Search listings
   * @param text Full-text search query
   * @param game_item_id Filter by specific game item UUID
   * @param quality_tier_min Minimum quality tier (1-5)
   * @param quality_tier_max Maximum quality tier (1-5)
   * @param price_min Minimum price filter
   * @param price_max Maximum price filter
   * @param page Page number for pagination (default: 1)
   * @param page_size Number of results per page (default: 20, max: 100)
   * @param sort_by Sort field (default: created_at)
   * @param sort_order Sort order (default: desc)
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
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() item_type?: string,
    @Query() quantity_min?: number,
    @Query() status?: 'active' | 'sold' | 'expired' | 'cancelled',
    @Query() sort_by?: "created_at" | "updated_at" | "price" | "quality" | "seller_rating" | "quantity",
    @Query() sort_order?: "asc" | "desc",
    @Query() language_codes?: string,
    @Query() listing_type?: 'single' | 'bundle' | 'bulk',
    @Query() seller_id?: string,
    @Query() contractor_id?: string,
  ): Promise<SearchListingsResponse> {
    const db = getKnex()

    // Validate and set defaults
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))
    const validatedSortBy = sort_by || "created_at"
    const validatedSortOrder = sort_order || "desc"

    // Validate quality tier range
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

    // Validate price range
    if (price_min !== undefined && price_min < 0) {
      this.throwValidationError("Invalid price_min", [
        { field: "price_min", message: "Price must be non-negative" },
      ])
    }

    if (price_max !== undefined && price_max < 0) {
      this.throwValidationError("Invalid price_max", [
        { field: "price_max", message: "Price must be non-negative" },
      ])
    }

    if (
      price_min !== undefined &&
      price_max !== undefined &&
      price_min > price_max
    ) {
      this.throwValidationError("Invalid price range", [
        {
          field: "price_min",
          message: "price_min must be less than or equal to price_max",
        },
      ])
    }

    logger.info("Searching listings", {
      text,
      game_item_id,
      quality_tier_min,
      quality_tier_max,
      price_min,
      price_max,
      page: validatedPage,
      page_size: validatedPageSize,
      sort_by: validatedSortBy,
      sort_order: validatedSortOrder,
    })

    try {
      // Build query using listing_search view
      let query = db("listing_search as ls")
        .leftJoin("accounts as u", function () {
          this.on("ls.seller_id", "=", "u.user_id").andOn(
            db.raw("ls.seller_type = 'user'"),
          )
        })
        .leftJoin("contractors as c", function () {
          this.on("ls.seller_id", "=", "c.contractor_id").andOn(
            db.raw("ls.seller_type = 'contractor'"),
          )
        })
        .select(
          "ls.listing_id",
          "ls.title",
          "ls.created_at",
          "ls.quantity_available",
          "ls.variant_count",
          "ls.price_min",
          "ls.price_max",
          "ls.quality_tier_min",
          "ls.quality_tier_max",
          db.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN u.username
              WHEN ls.seller_type = 'contractor' THEN c.name
            END AS seller_name
          `),
          db.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN COALESCE(public.get_average_rating_float(ls.seller_id, NULL), 0)
              WHEN ls.seller_type = 'contractor' THEN COALESCE(public.get_average_rating_float(NULL, ls.seller_id), 0)
            END AS seller_rating
          `),
          "ls.seller_type",
          db.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN u.username
              WHEN ls.seller_type = 'contractor' THEN c.spectrum_id
            END AS seller_slug
          `),
          db.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN COALESCE(u.supported_languages, ARRAY['en'])
              WHEN ls.seller_type = 'contractor' THEN COALESCE(c.supported_languages, ARRAY['en'])
            END AS seller_languages
          `),
          "ls.updated_at",
          "ls.game_item_name",
          "ls.game_item_type",
          db.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN COALESCE(public.get_rating_count(ls.seller_id, NULL), 0)
              WHEN ls.seller_type = 'contractor' THEN COALESCE(public.get_rating_count(NULL, ls.seller_id), 0)
            END AS seller_rating_count
          `),
          "ls.photo",
          "ls.pickup_method",
          "ls.quantity_unit",
        )

      // Apply full-text search filter (Requirement 15.2)
      if (text && text.trim().length > 0) {
        query = query.whereRaw(
          "ls.search_vector @@ plainto_tsquery('english', ?)",
          [text.trim()],
        )
      }

      // Apply game item filter (Requirement 15.3)
      if (game_item_id) {
        query = query.where("ls.game_item_id", game_item_id)
      }

      // Apply quality tier filters (Requirement 15.4)
      if (quality_tier_min !== undefined) {
        query = query.where(function () {
          this.whereNull("ls.quality_tier_max").orWhere(
            "ls.quality_tier_max",
            ">=",
            quality_tier_min,
          )
        })
      }

      if (quality_tier_max !== undefined) {
        query = query.where(function () {
          this.whereNull("ls.quality_tier_min").orWhere(
            "ls.quality_tier_min",
            "<=",
            quality_tier_max,
          )
        })
      }

      // Apply price filters (Requirement 15.5)
      if (price_min !== undefined) {
        query = query.where(function () {
          this.whereNull("ls.price_max").orWhere("ls.price_max", ">=", price_min)
        })
      }

      if (price_max !== undefined) {
        query = query.where(function () {
          this.whereNull("ls.price_min").orWhere("ls.price_min", "<=", price_max)
        })
      }

      // Filter by status (default: active)
      const statusFilter = status || 'active';
      query = query.where('ls.status', statusFilter);

      // Filter by item type
      if (item_type) {
        query = query.where('ls.game_item_type', item_type);
      }

      // Filter by minimum quantity
      if (quantity_min !== undefined && quantity_min > 0) {
        query = query.where('ls.quantity_available', '>=', quantity_min);
      }

      // Filter by language codes (seller supports ANY of the requested languages)
      if (language_codes) {
        const langs = language_codes.split(',').map(l => l.trim()).filter(Boolean);
        if (langs.length > 0) {
          query = query.where(function() {
            this.whereRaw(
              `COALESCE(u.supported_languages, ARRAY['en']) && ARRAY[${langs.map(() => '?').join(',')}]::text[]`,
              langs
            ).orWhereRaw(
              `COALESCE(c.supported_languages, ARRAY['en']) && ARRAY[${langs.map(() => '?').join(',')}]::text[]`,
              langs
            );
          });
        }
      }

      // Filter by listing type
      if (listing_type) {
        query = query.where('ls.listing_type', listing_type);
      }

      // Filter by seller (user or contractor)
      if (seller_id) {
        query = query.where('ls.seller_id', seller_id).where('ls.seller_type', 'user');
      }
      if (contractor_id) {
        query = query.where('ls.seller_id', contractor_id).where('ls.seller_type', 'contractor');
      }

      // Get total count for pagination (Requirement 15.8)
      const countQuery = query.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply sorting (Requirement 15.9)
      switch (validatedSortBy) {
        case "price":
          query = query.orderBy("ls.price_min", validatedSortOrder)
          break
        case "quality":
          query = query.orderBy("ls.quality_tier_max", validatedSortOrder)
          break
        case "seller_rating":
          query = query.orderByRaw(
            `CASE 
              WHEN ls.seller_type = 'user' THEN COALESCE(u.rating, 0)
              WHEN ls.seller_type = 'contractor' THEN COALESCE(c.rating, 0)
            END ${validatedSortOrder}`,
          )
          break
        case "updated_at":
          query = query.orderBy("ls.updated_at", validatedSortOrder)
          break
        case "quantity":
          query = query.orderBy("ls.quantity_available", validatedSortOrder)
          break
        case "created_at":
        default:
          query = query.orderBy("ls.created_at", validatedSortOrder)
          break
      }

      // Apply pagination (Requirement 15.6)
      const offset = (validatedPage - 1) * validatedPageSize
      query = query.limit(validatedPageSize).offset(offset)

      // Execute query
      const results = await query

      // Transform results to match response type (Requirements 15.7, 15.10, 15.11)
      const listings: ListingSearchResult[] = results.map((row: any) => ({
        listing_id: row.listing_id,
        title: row.title,
        seller_name: row.seller_name || "Unknown",
        seller_rating: parseFloat(row.seller_rating) || 0,
        price_min: parseInt(row.price_min, 10) || 0,
        price_max: parseInt(row.price_max, 10) || 0,
        quantity_available: row.quantity_available || 0,
        quality_tier_min: row.quality_tier_min || undefined,
        quality_tier_max: row.quality_tier_max || undefined,
        variant_count: row.variant_count || 0,
        seller_type: row.seller_type,
        seller_slug: row.seller_slug || "",
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at?.toISOString() || row.created_at.toISOString(),
        game_item_name: row.game_item_name || '',
        game_item_type: row.game_item_type || '',
        seller_rating_count: parseInt(row.seller_rating_count, 10) || 0,
        seller_languages: row.seller_languages || ['en'],
        photo: row.photo || undefined,
        pickup_method: row.pickup_method || null,
        quantity_unit: row.quantity_unit || "unit",
      }))

      logger.info("Search completed", {
        total,
        returned: listings.length,
        page: validatedPage,
        page_size: validatedPageSize,
      })

      return {
        listings,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to search listings", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Update an existing listing
   *
   * Updates listing metadata (title, description), pricing (base_price or per-variant prices),
   * and stock lot details (quantities, listed status, locations). Validates ownership before
   * allowing updates and prevents editing sold or cancelled listings.
   *
   * Requirements:
   * - 17.1: PUT /api/v2/listings/:id endpoint
   * - 17.2: Allow updating title and description
   * - 17.3: Allow updating base_price for unified pricing mode
   * - 17.4: Allow updating per-variant prices for per_variant pricing mode
   * - 17.5: Allow updating stock lot quantities
   * - 17.6: Allow updating stock lot listed status
   * - 17.7: Prevent editing sold or cancelled listings
   * - 17.8: Validate ownership before allowing updates
   * - 17.9: Return updated listing with variant breakdown
   * - 17.10: Log all modifications to Audit_Trail
   * - 17.11: Use database transaction for atomicity
   * - 17.12: Invalidate cache after updates
   *
   * @summary Update listing
   * @param id Listing UUID
   * @param requestBody Update request with optional fields
   * @param request Express request for authentication
   * @returns Updated listing with variant breakdown
   */
  /**
   * Get my listings with variant information
   *
   * Retrieves all listings owned by the authenticated user with variant breakdown,
   * quantity information, and price ranges. Supports filtering by status, pagination,
   * and sorting. Uses the listing_search view for optimized query performance.
   *
   * Requirements:
   * - 18.1: GET /api/v2/listings/mine endpoint
   * - 18.2: Return listings owned by current user
   * - 18.3: Include variant breakdown for each listing
   * - 18.4: Include quantity_available per variant
   * - 18.5: Support filtering by status (active, sold, expired, cancelled)
   * - 18.6: Support pagination with page and page_size parameters
   * - 18.7: Support sorting by created_at, updated_at, price, quantity
   * - 18.8: Include total count for pagination UI
   * - 18.9: Include price range (min to max) for each listing
   * - 18.10: Include quality tier range for each listing
   * - 18.11: Include variant count for each listing
   * - 18.12: Execute queries within 50ms performance target
   *
   * @summary Get my listings
   * @param status Filter by listing status
   * @param page Page number for pagination (default: 1)
   * @param page_size Number of results per page (default: 20, max: 100)
   * @param sort_by Sort field (default: created_at)
   * @param sort_order Sort order (default: desc)
   * @param request Express request for authentication
   * @returns User's listings with pagination metadata
   */
  @Get("mine")
  public async getMyListings(
    @Query() status?: "active" | "sold" | "expired" | "cancelled",
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() sort_by?: "created_at" | "updated_at" | "price" | "quantity",
    @Query() sort_order?: "asc" | "desc",
    @Request() request?: ExpressRequest,
  ): Promise<GetMyListingsResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    const db = getKnex()

    // Validate and set defaults (Requirement 18.6)
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))
    const validatedSortBy = sort_by || "created_at"
    const validatedSortOrder = sort_order || "desc"

    // Validate status if provided (Requirement 18.5)
    if (status && !["active", "sold", "expired", "cancelled"].includes(status)) {
      this.throwValidationError("Invalid status", [
        {
          field: "status",
          message: "Status must be one of: active, sold, expired, cancelled",
        },
      ])
    }

    logger.info("Fetching my listings", {
      userId,
      status,
      page: validatedPage,
      page_size: validatedPageSize,
      sort_by: validatedSortBy,
      sort_order: validatedSortOrder,
    })

    try {
      // Build query using listing_search view for performance (Requirement 18.12)
      let query = db("listing_search as ls")
        .select(
          "ls.listing_id",
          "ls.title",
          "ls.status",
          "ls.created_at",
          "ls.updated_at",
          "ls.quantity_available",
          "ls.variant_count",
          "ls.price_min",
          "ls.price_max",
          "ls.quality_tier_min",
          "ls.quality_tier_max",
        )
        .where("ls.seller_id", userId) // Filter by current user (Requirement 18.2)

      // Apply status filter if provided (Requirement 18.5)
      if (status) {
        query = query.where("ls.status", status)
      }

      // Get total count for pagination (Requirement 18.8)
      const countQuery = query.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply sorting (Requirement 18.7)
      switch (validatedSortBy) {
        case "price":
          query = query.orderBy("ls.price_min", validatedSortOrder)
          break
        case "quantity":
          query = query.orderBy("ls.quantity_available", validatedSortOrder)
          break
        case "updated_at":
          query = query.orderBy("ls.updated_at", validatedSortOrder)
          break
        case "created_at":
        default:
          query = query.orderBy("ls.created_at", validatedSortOrder)
          break
      }

      // Apply pagination (Requirement 18.6)
      const offset = (validatedPage - 1) * validatedPageSize
      query = query.limit(validatedPageSize).offset(offset)

      // Execute query
      const results = await query

      // Transform results to match response type (Requirements 18.3, 18.4, 18.9, 18.10, 18.11)
      const listings = results.map((row: any) => ({
        listing_id: row.listing_id,
        title: row.title,
        status: row.status,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        variant_count: row.variant_count || 0,
        quantity_available: row.quantity_available || 0,
        price_min: parseInt(row.price_min, 10) || 0,
        price_max: parseInt(row.price_max, 10) || 0,
        quality_tier_min: row.quality_tier_min || undefined,
        quality_tier_max: row.quality_tier_max || undefined,
      }))

      logger.info("My listings fetched successfully", {
        userId,
        total,
        returned: listings.length,
        page: validatedPage,
        page_size: validatedPageSize,
      })

      return {
        listings,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch my listings", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get listing detail with variant breakdown
   *
   * Retrieves complete listing information including seller details, game item information,
   * and variant breakdown with quantities, prices, and locations. Returns 404 if listing
   * not found.
   *
   * Requirements:
   * - 16.1: GET /api/v2/listings/:id endpoint
   * - 16.2: Return listing metadata with seller information
   * - 16.3: Return array of items with game_item details
   * - 16.4: Return array of variants for each item with attributes
   * - 16.5: Return quantity and price for each variant
   * - 16.6: Return display_name for each variant
   * - 16.7: Include location information for stock lots
   * - 16.8: Include crafted_by information if applicable
   * - 16.9: Return 404 if listing not found
   * - 16.10: Include view count and timestamps
   * - 16.11: Include seller rating and status
   * - 16.12: Support image gallery with multiple photos
   *
   * @summary Get listing detail
   * @param id Listing UUID
   * @returns Complete listing detail with variant breakdown
   */
  @Get("{id}")
  public async getListingDetail(
    id: string,
  ): Promise<GetListingDetailResponse> {
    const db = getKnex()

    logger.info("Fetching listing detail", { listingId: id })

    try {
      // Query listing with seller information (Requirements 16.2, 16.11)
      const listing = await db("listings as l")
        .leftJoin("accounts as u", function () {
          this.on("l.seller_id", "=", "u.user_id").andOn(
            db.raw("l.seller_type = 'user'"),
          )
        })
        .leftJoin("contractors as c", function () {
          this.on("l.seller_id", "=", "c.contractor_id").andOn(
            db.raw("l.seller_type = 'contractor'"),
          )
        })
        .select(
          "l.listing_id",
          "l.seller_id",
          "l.seller_type",
          "l.title",
          "l.description",
          "l.status",
          "l.visibility",
          "l.sale_type",
          "l.listing_type",
          "l.pickup_method",
          "l.quantity_unit",
          "l.min_order_quantity",
          "l.max_order_quantity",
          "l.min_order_value",
          "l.max_order_value",
          "l.created_at",
          "l.updated_at",
          "l.expires_at",
          db.raw(`
            CASE 
              WHEN l.seller_type = 'user' THEN u.username
              WHEN l.seller_type = 'contractor' THEN c.name
            END AS seller_name
          `),
          db.raw(`
            CASE 
              WHEN l.seller_type = 'user' THEN COALESCE(public.get_average_rating_float(l.seller_id, NULL), 0)
              WHEN l.seller_type = 'contractor' THEN COALESCE(public.get_average_rating_float(NULL, l.seller_id), 0)
            END AS seller_rating
          `),
          db.raw(`
            CASE 
              WHEN l.seller_type = 'user' THEN u.avatar
              WHEN l.seller_type = 'contractor' THEN c.avatar
            END AS seller_avatar
          `),
          db.raw(`
            CASE 
              WHEN l.seller_type = 'user' THEN u.username
              WHEN l.seller_type = 'contractor' THEN c.spectrum_id
            END AS seller_slug
          `),
        )
        .where("l.listing_id", id)
        .first()

      // Return 404 if listing not found (Requirement 16.9)
      if (!listing) {
        this.throwNotFound("Listing", id)
      }

      // Query listing items with game item details (Requirement 16.3)
      const listingItems = await db("listing_items as li")
        .leftJoin("game_items as gi", "li.game_item_id", "gi.id")
        .select(
          "li.item_id",
          "li.game_item_id",
          "li.pricing_mode",
          "li.base_price",
          "li.bulk_discount_tiers",
          "gi.name as game_item_name",
          "gi.type as game_item_type",
          "gi.image_url as game_item_image_url",
        )
        .where("li.listing_id", id)

      // Query listing photos (Requirement 16.12)
      const photos = await db('listing_photos_v2 as lp')
        .join('image_resources as ir', 'lp.resource_id', 'ir.resource_id')
        .where('lp.listing_id', id)
        .orderBy('lp.display_order', 'asc')
        .select(db.raw("COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) as url"));

      // For each listing item, query variants with details (Requirements 16.4-16.8)
      const items = await Promise.all(
        listingItems.map(async (item) => {
          // Query stock lots with variant information
          const lots = await db("listing_item_lots as sl")
            .join("item_variants as iv", "sl.variant_id", "iv.variant_id")
            .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
            .leftJoin("accounts as crafter", "sl.crafted_by", "crafter.user_id")
            .select(
              "sl.variant_id",
              "sl.quantity_total",
              "sl.location_id",
              "loc.name as location_name",
              "sl.crafted_by",
              "crafter.username as crafted_by_username",
              "sl.crafted_at",
              "iv.attributes",
              "iv.display_name",
              "iv.short_name",
            )
            .where("sl.item_id", item.item_id)
            .where("sl.listed", true)

          // Get pricing for each variant
          const variantPricing =
            item.pricing_mode === "per_variant"
              ? await db("variant_pricing")
                  .select("variant_id", "price")
                  .where("item_id", item.item_id)
              : []

          // Group lots by variant and aggregate quantities and locations
          const variantMap = new Map<
            string,
            {
              variant_id: string
              attributes: any
              display_name: string
              short_name: string
              quantity: number
              price: number
              locations: string[]
              crafted_by?: string
              crafted_at?: string
            }
          >()

          for (const lot of lots) {
            const existing = variantMap.get(lot.variant_id)

            // Determine price for this variant
            let price: number
            if (item.pricing_mode === "unified") {
              price = item.base_price || 0
            } else {
              const pricing = variantPricing.find(
                (vp) => vp.variant_id === lot.variant_id,
              )
              price = pricing?.price || 0
            }

            if (existing) {
              // Aggregate quantity and locations
              existing.quantity += lot.quantity_total
              if (lot.location_name && !existing.locations.includes(lot.location_name)) {
                existing.locations.push(lot.location_name)
              }
            } else {
              // Create new variant entry
              variantMap.set(lot.variant_id, {
                variant_id: lot.variant_id,
                attributes: lot.attributes,
                display_name: lot.display_name || "Standard",
                short_name: lot.short_name || "STD",
                quantity: lot.quantity_total,
                price,
                locations: lot.location_name ? [lot.location_name] : [],
                crafted_by: lot.crafted_by_username,
                crafted_at: lot.crafted_at?.toISOString(),
              })
            }
          }

          // Convert map to array
          const variants = Array.from(variantMap.values())

          return {
            item_id: item.item_id,
            game_item: {
              id: item.game_item_id,
              name: item.game_item_name || "Unknown Item",
              type: item.game_item_type || "unknown",
              image_url: item.game_item_image_url,
            },
            pricing_mode: item.pricing_mode,
            base_price: item.base_price,
            bulk_discount_tiers: item.bulk_discount_tiers || null,
            variants,
          }
        }),
      )

      logger.info("Listing detail fetched successfully", {
        listingId: id,
        itemCount: items.length,
        variantCount: items.reduce((sum, item) => sum + item.variants.length, 0),
      })

      // Return complete listing detail (Requirement 16.10)
      return {
        listing: {
          listing_id: listing.listing_id,
          seller_id: listing.seller_id,
          seller_type: listing.seller_type,
          title: listing.title,
          description: listing.description || "",
          status: listing.status,
          visibility: listing.visibility,
          sale_type: listing.sale_type,
          listing_type: listing.listing_type,
          created_at: listing.created_at.toISOString(),
          updated_at: listing.updated_at.toISOString(),
          expires_at: listing.expires_at?.toISOString(),
          photos: photos.map((p: any) => p.url),
          pickup_method: listing.pickup_method || null,
          quantity_unit: listing.quantity_unit || "unit",
          min_order_quantity: listing.min_order_quantity ?? null,
          max_order_quantity: listing.max_order_quantity ?? null,
          min_order_value: listing.min_order_value ? Number(listing.min_order_value) : null,
          max_order_value: listing.max_order_value ? Number(listing.max_order_value) : null,
        },
        seller: {
          id: listing.seller_id,
          name: listing.seller_name || "Unknown",
          type: listing.seller_type,
          slug: listing.seller_slug || "",
          rating: parseFloat(listing.seller_rating) || 0,
          avatar_url: listing.seller_avatar ? (await cdn.getFileLinkResource(listing.seller_avatar)) || undefined : undefined,
        },
        items,
      }
    } catch (error) {
      logger.error("Failed to fetch listing detail", {
        listingId: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Search listings with filters
   *
   * Searches active listings using full-text search, quality tier filters, price filters,
   * and game item filters. Uses the listing_search view for optimized query performance.
   *
   * Requirements:
   * - 15.1: GET /api/v2/listings/search endpoint
   * - 15.2: Accept text query parameter for full-text search
   * - 15.3: Accept game_item_id parameter for item filtering
   * - 15.4: Accept quality_tier_min and quality_tier_max parameters
   * - 15.5: Accept price_min and price_max parameters
   * - 15.6: Accept page and page_size parameters for pagination
   * - 15.7: Return listings with price_min, price_max, quality_tier_min, quality_tier_max
   * - 15.8: Return total count for pagination
   * - 15.9: Support sorting by created_at, price, quality, seller_rating
   * - 15.10: Include seller information in results
   * - 15.11: Include variant_count in results
   * - 15.12: Execute queries within 50ms performance target
   *
   * @summary Search listings
   * @param text Full-text search query
   * @param game_item_id Filter by specific game item UUID
   * @param quality_tier_min Minimum quality tier (1-5)
   * @param quality_tier_max Maximum quality tier (1-5)
   * @param price_min Minimum price filter
   * @param price_max Maximum price filter
   * @param page Page number for pagination (default: 1)
   * @param page_size Number of results per page (default: 20, max: 100)
   * @param sort_by Sort field (default: created_at)
   * @param sort_order Sort order (default: desc)
   * @returns Search results with pagination metadata
   */
  @Put("{id}")
  public async updateListing(
    @Path() id: string,
    @Body() requestBody: UpdateListingRequest,
    @Request() request: ExpressRequest,
  ): Promise<GetListingDetailResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Updating listing", {
      listingId: id,
      userId,
      updates: {
        hasTitle: !!requestBody.title,
        hasDescription: !!requestBody.description,
        hasBasePrice: requestBody.base_price !== undefined,
        variantPriceCount: requestBody.variant_prices?.length || 0,
        lotUpdateCount: requestBody.lot_updates?.length || 0,
      },
    })

    const db = getKnex()

    try {
      // Use database transaction for atomicity (Requirement 17.11)
      await withTransaction(async (trx) => {
        // 1. Fetch listing and verify ownership (Requirement 17.8)
        const listing = await trx("listings")
          .where({ listing_id: id })
          .first()

        if (!listing) {
          this.throwNotFound("Listing", id)
        }

        // Verify ownership
        if (listing.seller_id !== userId) {
          this.throwForbidden("You do not have permission to update this listing")
        }

        // 2. Prevent editing sold or cancelled listings (Requirement 17.7)
        if (listing.status === "sold" || listing.status === "cancelled") {
          this.throwValidationError(
            `Cannot update listing with status: ${listing.status}`,
            [
              {
                field: "status",
                message: `Listings with status '${listing.status}' cannot be edited`,
              },
            ],
          )
        }

        // 3. Update listing metadata (title, description) (Requirement 17.2)
        const listingUpdates: any = {
          updated_at: new Date(),
        }

        if (requestBody.title !== undefined) {
          // Validate title
          if (!requestBody.title || requestBody.title.trim().length === 0) {
            this.throwValidationError("Title cannot be empty", [
              { field: "title", message: "Title is required" },
            ])
          }
          if (requestBody.title.length > 500) {
            this.throwValidationError("Title too long", [
              { field: "title", message: "Title must be 500 characters or less" },
            ])
          }
          listingUpdates.title = requestBody.title
        }

        if (requestBody.description !== undefined) {
          // Validate description
          if (!requestBody.description || requestBody.description.trim().length === 0) {
            this.throwValidationError("Description cannot be empty", [
              { field: "description", message: "Description is required" },
            ])
          }
          listingUpdates.description = requestBody.description
        }

        if (requestBody.pickup_method !== undefined) {
          listingUpdates.pickup_method = requestBody.pickup_method
        }

        if (requestBody.quantity_unit !== undefined) {
          if (!['unit', 'scu'].includes(requestBody.quantity_unit)) {
            this.throwValidationError("Invalid quantity_unit", [
              { field: "quantity_unit", message: "Must be 'unit' or 'scu'" },
            ])
          }
          listingUpdates.quantity_unit = requestBody.quantity_unit
        }

        // Update per-listing order limits
        if (requestBody.min_order_quantity !== undefined) listingUpdates.min_order_quantity = requestBody.min_order_quantity
        if (requestBody.max_order_quantity !== undefined) listingUpdates.max_order_quantity = requestBody.max_order_quantity
        if (requestBody.min_order_value !== undefined) listingUpdates.min_order_value = requestBody.min_order_value
        if (requestBody.max_order_value !== undefined) listingUpdates.max_order_value = requestBody.max_order_value

        // Update listing if there are changes
        if (Object.keys(listingUpdates).length > 1) {
          // More than just updated_at
          await trx("listings")
            .where({ listing_id: id })
            .update(listingUpdates)

          logger.info("Updated listing metadata", {
            listingId: id,
            updates: Object.keys(listingUpdates),
          })
        }

        // 4. Get listing_items to determine pricing mode
        const listingItems = await trx("listing_items")
          .where({ listing_id: id })
          .select("*")

        if (listingItems.length === 0) {
          this.throwNotFound("Listing items", id)
        }

        const listingItem = listingItems[0]

        // 5. Update base_price for unified pricing (Requirement 17.3)
        if (requestBody.base_price !== undefined) {
          if (listingItem.pricing_mode !== "unified") {
            this.throwValidationError(
              "Cannot update base_price for per_variant pricing mode",
              [
                {
                  field: "base_price",
                  message: "base_price can only be updated for unified pricing mode",
                },
              ],
            )
          }

          // Validate base_price
          if (requestBody.base_price <= 0) {
            this.throwValidationError("Invalid base_price", [
              { field: "base_price", message: "Base price must be greater than 0" },
            ])
          }

          await trx("listing_items")
            .where({ item_id: listingItem.item_id })
            .update({ base_price: requestBody.base_price })

          logger.info("Updated base_price", {
            listingId: id,
            itemId: listingItem.item_id,
            basePrice: requestBody.base_price,
          })
        }

        // Update bulk discount tiers
        if (requestBody.bulk_discount_tiers !== undefined) {
          await trx("listing_items")
            .where({ item_id: listingItem.item_id })
            .update({
              bulk_discount_tiers: requestBody.bulk_discount_tiers?.length
                ? JSON.stringify(requestBody.bulk_discount_tiers)
                : null,
            })
        }

        // 6. Update per-variant prices (Requirement 17.4)
        if (requestBody.variant_prices && requestBody.variant_prices.length > 0) {
          if (listingItem.pricing_mode !== "per_variant") {
            this.throwValidationError(
              "Cannot update variant_prices for unified pricing mode",
              [
                {
                  field: "variant_prices",
                  message: "variant_prices can only be updated for per_variant pricing mode",
                },
              ],
            )
          }

          for (const variantPrice of requestBody.variant_prices) {
            // Validate price
            if (variantPrice.price <= 0) {
              this.throwValidationError("Invalid variant price", [
                {
                  field: `variant_prices[${variantPrice.variant_id}].price`,
                  message: "Price must be greater than 0",
                },
              ])
            }

            // Verify variant belongs to this listing
            const variantExists = await trx("listing_item_lots")
              .where({
                item_id: listingItem.item_id,
                variant_id: variantPrice.variant_id,
              })
              .first()

            if (!variantExists) {
              this.throwValidationError("Variant not found in listing", [
                {
                  field: `variant_prices[${variantPrice.variant_id}]`,
                  message: "Variant does not belong to this listing",
                },
              ])
            }

            // Update or insert variant pricing
            await trx("variant_pricing")
              .insert({
                item_id: listingItem.item_id,
                variant_id: variantPrice.variant_id,
                price: variantPrice.price,
                created_at: new Date(),
                updated_at: new Date(),
              })
              .onConflict(["item_id", "variant_id"])
              .merge({
                price: variantPrice.price,
                updated_at: new Date(),
              })

            logger.info("Updated variant price", {
              listingId: id,
              variantId: variantPrice.variant_id,
              price: variantPrice.price,
            })
          }
        }

        // 7. Update stock lots (Requirements 17.5, 17.6)
        if (requestBody.lot_updates && requestBody.lot_updates.length > 0) {
          for (const lotUpdate of requestBody.lot_updates) {
            // Verify lot belongs to this listing
            const lot = await trx("listing_item_lots as sl")
              .join("listing_items as li", "sl.item_id", "li.item_id")
              .where({
                "sl.lot_id": lotUpdate.lot_id,
                "li.listing_id": id,
              })
              .select("sl.*")
              .first()

            if (!lot) {
              this.throwValidationError("Stock lot not found in listing", [
                {
                  field: `lot_updates[${lotUpdate.lot_id}]`,
                  message: "Stock lot does not belong to this listing",
                },
              ])
            }

            const lotUpdates: any = {
              updated_at: new Date(),
            }

            // Update quantity_total (Requirement 17.5)
            if (lotUpdate.quantity_total !== undefined) {
              if (lotUpdate.quantity_total < 0) {
                this.throwValidationError("Invalid quantity", [
                  {
                    field: `lot_updates[${lotUpdate.lot_id}].quantity_total`,
                    message: "Quantity cannot be negative",
                  },
                ])
              }
              lotUpdates.quantity_total = lotUpdate.quantity_total
            }

            // Update listed status (Requirement 17.6)
            if (lotUpdate.listed !== undefined) {
              lotUpdates.listed = lotUpdate.listed
            }

            // Update location_id
            if (lotUpdate.location_id !== undefined) {
              lotUpdates.location_id = lotUpdate.location_id
            }

            // Apply updates
            if (Object.keys(lotUpdates).length > 1) {
              // More than just updated_at
              await trx("listing_item_lots")
                .where({ lot_id: lotUpdate.lot_id })
                .update(lotUpdates)

              logger.info("Updated stock lot", {
                listingId: id,
                lotId: lotUpdate.lot_id,
                updates: Object.keys(lotUpdates),
              })
            }
          }

          // Note: The database trigger will automatically update quantity_available
          // and variant_count in listing_items table
        }

        // TODO: Log modifications to audit trail (Requirement 17.10)
      })

      logger.info("Listing updated successfully", {
        listingId: id,
        userId,
      })

      // 8. Return updated listing with variant breakdown (Requirement 17.9)
      // TODO: Invalidate cache after updates (Requirement 17.12)
      return await this.getListingDetail(id)
    } catch (error) {
      logger.error("Failed to update listing", {
        listingId: id,
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Refresh a listing to bump it to the top of search results
   *
   * Updates the listing's updated_at timestamp to make it appear at the top of search results
   * when sorted by date. Enforces a cooldown period between refreshes to prevent abuse.
   * Validates ownership before allowing refresh.
   *
   * Requirements:
   * - 49.1: POST /api/v2/listings/:id/refresh endpoint
   * - 49.2: Update listing updated_at timestamp
   * - 49.3: Enforce cooldown period between refreshes
   * - 49.4: Validate ownership before allowing refresh
   * - 49.5: Log refresh actions to Audit_Trail
   *
   * @summary Refresh listing
   * @param id Listing UUID
   * @param request Express request for authentication
   * @returns Success message with next refresh time
   */
  @Post("{id}/refresh")
  public async refreshListing(
    @Path() id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ message: string; next_refresh_at: string }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Refreshing listing", {
      listingId: id,
      userId,
    })

    const db = getKnex()

    try {
      // 1. Fetch listing and verify ownership (Requirement 49.4)
      const listing = await db("listings")
        .where({ listing_id: id })
        .first()

      if (!listing) {
        this.throwNotFound("Listing", id)
      }

      // Verify ownership
      if (listing.seller_id !== userId) {
        this.throwForbidden("You do not have permission to refresh this listing")
      }

      // Verify listing is active
      if (listing.status !== "active") {
        this.throwValidationError(
          `Cannot refresh listing with status: ${listing.status}`,
          [
            {
              field: "status",
              message: `Only active listings can be refreshed`,
            },
          ],
        )
      }

      // 2. Enforce cooldown period (Requirement 49.3)
      // Cooldown period: 24 hours
      const COOLDOWN_HOURS = 24
      const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000
      const now = new Date()
      const lastUpdate = new Date(listing.updated_at)
      const timeSinceLastUpdate = now.getTime() - lastUpdate.getTime()

      if (timeSinceLastUpdate < cooldownMs) {
        const nextRefreshAt = new Date(lastUpdate.getTime() + cooldownMs)
        const hoursRemaining = Math.ceil((cooldownMs - timeSinceLastUpdate) / (60 * 60 * 1000))

        this.throwValidationError(
          `Listing can only be refreshed once every ${COOLDOWN_HOURS} hours`,
          [
            {
              field: "updated_at",
              message: `Please wait ${hoursRemaining} more hour(s) before refreshing again`,
            },
          ],
        )
      }

      // 3. Update listing updated_at timestamp (Requirement 49.2)
      await db("listings")
        .where({ listing_id: id })
        .update({
          updated_at: now,
        })

      const nextRefreshAt = new Date(now.getTime() + cooldownMs)

      logger.info("Listing refreshed successfully", {
        listingId: id,
        userId,
        nextRefreshAt: nextRefreshAt.toISOString(),
      })

      // TODO: Log refresh action to audit trail (Requirement 49.5)

      return {
        message: "Listing refreshed successfully",
        next_refresh_at: nextRefreshAt.toISOString(),
      }
    } catch (error) {
      logger.error("Failed to refresh listing", {
        listingId: id,
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Archive (soft delete) a listing
   *
   * Sets the listing status to 'cancelled'. Validates ownership before allowing deletion.
   *
   * @summary Delete listing
   * @param id Listing UUID
   * @param request Express request for authentication
   * @returns Success message
   */
  @Delete("{id}")
  public async deleteListing(
    @Path() id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ message: string }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    const db = getKnex()

    const listing = await db('listings').where('listing_id', id).first()
    if (!listing) {
      this.throwNotFound('Listing', id)
    }
    if (listing.seller_id !== userId) {
      this.throwValidationError('Not authorized', [{ field: 'id', message: 'You do not own this listing' }])
    }
    if (listing.status === 'cancelled') {
      return { message: 'Listing already archived' }
    }

    await db('listings').where('listing_id', id).update({ status: 'cancelled', updated_at: db.fn.now() })
    return { message: 'Listing archived successfully' }
  }

  /**
   * Track a listing view
   * @summary Increment view count
   * @param id Listing UUID
   */
  @Post("{id}/views")
  public async trackView(
    @Path() id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ views: number }> {
    this.request = request
    const db = getKnex()

    const listing = await db('listings').where('listing_id', id).first()
    if (!listing) throw this.throwNotFound('Listing', id)

    const hasTable = await db.schema.hasTable('listing_views_v2')
    if (hasTable) {
      await db('listing_views_v2').insert({
        listing_id: id,
        viewer_id: (this.request?.user as any)?.user_id || null,
        viewed_at: new Date(),
      })
      const [{ count }] = await db('listing_views_v2').where('listing_id', id).count('* as count')
      return { views: parseInt(String(count), 10) }
    }

    // Fallback: use a view_count column on listings if views table doesn't exist
    await db('listings').where('listing_id', id).increment('view_count', 1)
    const updated = await db('listings').where('listing_id', id).select('view_count').first()
    return { views: updated?.view_count || 1 }
  }

  /**
   * Upload photos for a listing
   * @summary Upload listing photos
   * @param id Listing UUID
   * @param request Express request with files
   */
  @Post("{id}/photos")
  @Security("session")
  public async uploadPhotos(
    @Path() id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ photos: Array<{ resource_id: string; url: string }> }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const db = getKnex()

    const listing = await db('listings').where('listing_id', id).first()
    if (!listing) throw this.throwNotFound('Listing', id)
    if (listing.seller_id !== userId) throw this.throwForbidden('You do not own this listing')

    const files = (request as any).files as Express.Multer.File[]
    if (!files || files.length === 0) {
      throw this.throwValidationError('No photos provided', [
        { field: 'photos', message: 'At least one photo is required' },
      ])
    }
    if (files.length > 5) {
      throw this.throwValidationError('Too many photos', [
        { field: 'photos', message: 'Maximum 5 photos per upload' },
      ])
    }

    const uploadResults: Array<{ resource_id: string; url: string }> = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.mimetype.split('/')[1] || 'png'
      const resource = await cdn.uploadFile(
        `${id}-photos-${i}-${crypto.randomUUID()}.${ext}`,
        file.path,
        file.mimetype,
      )
      uploadResults.push({
        resource_id: resource.resource_id,
        url: resource.external_url || `https://cdn.sc-market.space/${resource.filename}`,
      })
    }

    // Insert into listing_photos_v2
    const photoRows = uploadResults.map((r, i) => ({
      listing_id: id,
      resource_id: r.resource_id,
      display_order: i,
    }))
    await db('listing_photos_v2').insert(photoRows)

    // Clean up temp files
    for (const file of files) {
      try { (await import('fs')).unlinkSync(file.path) } catch {}
    }

    return { photos: uploadResults }
  }
}
