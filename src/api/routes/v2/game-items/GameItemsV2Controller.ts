/**
 * Game Items V2 Controller
 *
 * TSOA controller for game item endpoints in the V2 market system.
 * Handles game item listings with quality distribution and filtering.
 *
 * Requirements: 38.1-38.12
 */

import { Controller, Get, Route, Tags, Query, Path } from "tsoa"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  GetGameItemListingsResponse,
  GameItemQualityDistribution,
  GameItemListingResult,
  GameItemMetadata,
  SearchGameItemAggregatesResponse,
  GameItemAggregate,
} from "../types/game-items.types.js"
import logger from "../../../../logger/logger.js"

/** Search result for a game item */
export interface GameItemSearchResult {
  id: string
  name: string
  type: string
}

/** Category entry */
export interface GameItemCategory {
  category: string
  game_item_categories: string
  subcategory?: string
}

@Route("game-items")
@Tags("Game Items V2")
export class GameItemsV2Controller extends BaseController {
  /**
   * Search game items by name
   * @summary Search game items
   * @param query Search text
   */
  @Get("search")
  public async searchGameItems(
    @Query() query?: string,
  ): Promise<GameItemSearchResult[]> {
    if (!query || query.length < 1) return []

    const knex = getKnex()
    const limit = query.length < 3 ? 10 : 50

    return knex("game_items")
      .whereRaw("to_tsvector('english', name) @@ plainto_tsquery('english', ?)", [query])
      .orWhere("name", "ilike", `${query}%`)
      .orderByRaw("ts_rank(to_tsvector('english', name), plainto_tsquery('english', ?)) DESC", [query])
      .orderBy("name")
      .limit(limit)
      .select("name", "type", "id")
  }

  /**
   * Get game item categories
   * @summary Get categories
   */
  @Get("categories")
  public async getCategories(): Promise<GameItemCategory[]> {
    const knex = getKnex()
    const hasTable = await knex.schema.hasTable("game_item_categories")
    if (!hasTable) return []

    return knex("game_item_categories")
      .orderBy("category")
      .orderBy("game_item_categories")
      .select()
  }
  /**
   * Get all listings for a specific game item with quality distribution
   *
   * Returns all active listings for the specified game item along with quality
   * distribution statistics. Supports filtering by quality tier and sorting options.
   * Computes quality distribution across all listings showing quantity, price ranges,
   * and seller counts per quality tier.
   *
   * Requirements:
   * - 38.1: GET /api/v2/game-items/:id/listings endpoint
   * - 38.2: Return all active listings for specified game item
   * - 38.3: Compute quality distribution across all listings
   * - 38.4: Return quantity available per quality_tier
   * - 38.5: Return price range per quality_tier (min, max, average)
   * - 38.6: Return number of sellers per quality_tier
   * - 38.7: Support filtering by quality_tier
   * - 38.8: Support sorting by price, quality, quantity, seller_rating
   * - 38.9: Support pagination with page and page_size parameters
   * - 38.10: Cache quality distribution for performance
   * - 38.11: Execute queries within 50ms performance target
   * - 38.12: Include game item metadata in response
   *
   * @summary Get listings for game item
   * @param id Game item UUID (required)
   * @param quality_tier Optional quality tier filter (1-5)
   * @param sort_by Sort field (default: price)
   * @param sort_order Sort order (default: asc)
   * @param page Page number for pagination (default: 1)
   * @param page_size Number of results per page (default: 20, max: 100)
   * @returns Game item listings with quality distribution
   */
  @Get("{id}/listings")
  public async getListings(
    @Path() id: string,
    @Query() quality_tier?: number,
    @Query() sort_by?: "price" | "quality" | "quantity" | "seller_rating",
    @Query() sort_order?: "asc" | "desc",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<GetGameItemListingsResponse> {
    const knex = getKnex()

    // Validate game_item_id
    if (!id) {
      this.throwValidationError("game_item_id is required", [
        { field: "id", message: "Game item ID is required" },
      ])
    }

    // Validate quality_tier if provided (Requirement 38.7)
    if (quality_tier !== undefined) {
      if (quality_tier < 1 || quality_tier > 5) {
        this.throwValidationError("Invalid quality_tier", [
          {
            field: "quality_tier",
            message: "Quality tier must be between 1 and 5",
          },
        ])
      }
    }

    // Validate and set defaults for pagination (Requirement 38.9)
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))
    const validatedSortBy = sort_by || "price"
    const validatedSortOrder = sort_order || "asc"

    logger.info("Fetching game item listings", {
      game_item_id: id,
      quality_tier,
      sort_by: validatedSortBy,
      sort_order: validatedSortOrder,
      page: validatedPage,
      page_size: validatedPageSize,
    })

    try {
      // ========================================================================
      // Part 1: Get game item metadata (Requirement 38.12)
      // ========================================================================
      const gameItem = await knex("game_items")
        .select("id", "name", "type", "image_url")
        .where("id", id)
        .first()

      if (!gameItem) {
        this.throwNotFound("Game item", id)
      }

      const gameItemMetadata: GameItemMetadata = {
        id: gameItem.id,
        name: gameItem.name,
        type: gameItem.type || "unknown",
        image_url: gameItem.image_url,
      }

      // ========================================================================
      // Part 2: Compute quality distribution (Requirements 38.3-38.6, 38.10)
      // ========================================================================
      // Query to compute quality distribution across all active listings
      // This reuses the same logic as AnalyticsV2Controller.getQualityDistribution
      // but scoped to a specific game item
      const qualityDistributionQuery = knex("listing_item_lots as lil")
        .join("item_variants as iv", "lil.variant_id", "iv.variant_id")
        .join("listing_items as li", "lil.item_id", "li.item_id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .leftJoin("variant_pricing as vp", function () {
          this.on("vp.item_id", "=", "li.item_id").andOn(
            "vp.variant_id",
            "=",
            "lil.variant_id",
          )
        })
        .select(
          knex.raw("(iv.attributes->>'quality_tier')::integer as quality_tier"),
          knex.raw("SUM(lil.quantity_total)::integer as quantity_available"),
          knex.raw("COUNT(DISTINCT l.listing_id)::integer as listing_count"),
          knex.raw("COUNT(DISTINCT l.seller_id)::integer as seller_count"),
          knex.raw(
            `AVG(COALESCE(vp.price, li.base_price))::bigint as price_avg`,
          ),
          knex.raw(`MIN(COALESCE(vp.price, li.base_price)) as price_min`),
          knex.raw(`MAX(COALESCE(vp.price, li.base_price)) as price_max`),
        )
        .where("li.game_item_id", id)
        .where("l.status", "active")
        .where("lil.listed", true)
        .whereRaw("iv.attributes->>'quality_tier' IS NOT NULL")
        .groupBy(knex.raw("(iv.attributes->>'quality_tier')::integer"))
        .orderBy(knex.raw("(iv.attributes->>'quality_tier')::integer") as any, "asc")

      const qualityDistributionResults = await qualityDistributionQuery

      logger.info("Quality distribution computed", {
        game_item_id: id,
        tier_count: qualityDistributionResults.length,
      })

      // Transform results to quality distribution format (Requirements 38.4-38.6)
      const quality_distribution: GameItemQualityDistribution[] =
        qualityDistributionResults.map((row: any) => ({
          quality_tier: row.quality_tier,
          quantity_available: row.quantity_available,
          price_min: parseInt(row.price_min, 10),
          price_max: parseInt(row.price_max, 10),
          price_avg: parseInt(row.price_avg, 10),
          seller_count: row.seller_count,
          listing_count: row.listing_count,
        }))

      // ========================================================================
      // Part 3: Get individual listings (Requirements 38.2, 38.7, 38.8)
      // ========================================================================
      // Build query for individual listings using listing_search view
      let listingsQuery = knex("listing_search as ls")
        .leftJoin("accounts as u", function () {
          this.on("ls.seller_id", "=", "u.user_id").andOn(
            knex.raw("ls.seller_type = 'user'"),
          )
        })
        .leftJoin("contractors as c", function () {
          this.on("ls.seller_id", "=", "c.contractor_id").andOn(
            knex.raw("ls.seller_type = 'contractor'"),
          )
        })
        .select(
          "ls.listing_id",
          "ls.title",
          "ls.seller_id",
          "ls.seller_type",
          "ls.quantity_available",
          "ls.variant_count",
          "ls.price_min",
          "ls.price_max",
          "ls.quality_tier_min",
          "ls.quality_tier_max",
          "ls.created_at",
          knex.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN u.username
              WHEN ls.seller_type = 'contractor' THEN c.name
            END AS seller_name
          `),
          knex.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN COALESCE(u.rating, 0)
              WHEN ls.seller_type = 'contractor' THEN COALESCE(c.rating, 0)
            END AS seller_rating
          `),
          knex.raw(`
            CASE 
              WHEN ls.seller_type = 'user' THEN u.username
              WHEN ls.seller_type = 'contractor' THEN c.spectrum_id
            END AS seller_slug
          `),
        )
        .where("ls.game_item_id", id)
        .where("ls.status", "active")

      // Apply quality tier filter if provided (Requirement 38.7)
      if (quality_tier !== undefined) {
        listingsQuery = listingsQuery.where(function () {
          this.whereNull("ls.quality_tier_min")
            .orWhere("ls.quality_tier_min", "<=", quality_tier)
        }).where(function () {
          this.whereNull("ls.quality_tier_max")
            .orWhere("ls.quality_tier_max", ">=", quality_tier)
        })
      }

      // Get total count for pagination
      const countQuery = listingsQuery
        .clone()
        .clearSelect()
        .clearOrder()
        .count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply sorting (Requirement 38.8)
      switch (validatedSortBy) {
        case "price":
          listingsQuery = listingsQuery.orderBy(
            "ls.price_min",
            validatedSortOrder,
          )
          break
        case "quality":
          listingsQuery = listingsQuery.orderBy(
            "ls.quality_tier_max",
            validatedSortOrder,
          )
          break
        case "quantity":
          listingsQuery = listingsQuery.orderBy(
            "ls.quantity_available",
            validatedSortOrder,
          )
          break
        case "seller_rating":
          listingsQuery = listingsQuery.orderByRaw(
            `CASE 
              WHEN ls.seller_type = 'user' THEN COALESCE(u.rating, 0)
              WHEN ls.seller_type = 'contractor' THEN COALESCE(c.rating, 0)
            END ${validatedSortOrder}`,
          )
          break
        default:
          listingsQuery = listingsQuery.orderBy(
            "ls.price_min",
            validatedSortOrder,
          )
      }

      // Apply pagination (Requirement 38.9)
      const offset = (validatedPage - 1) * validatedPageSize
      listingsQuery = listingsQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const listingsResults = await listingsQuery

      logger.info("Listings fetched successfully", {
        game_item_id: id,
        listing_count: listingsResults.length,
        total,
      })

      // Transform results to listing format (Requirement 38.2)
      const listings: GameItemListingResult[] = listingsResults.map(
        (row: any) => ({
          listing_id: row.listing_id,
          title: row.title,
          seller_id: row.seller_id,
          seller_name: row.seller_name || "Unknown",
          seller_rating: parseFloat(row.seller_rating) || 0,
          seller_type: row.seller_type,
          seller_slug: row.seller_slug || "",
          price_min: parseInt(row.price_min, 10) || 0,
          price_max: parseInt(row.price_max, 10) || 0,
          quantity_available: row.quantity_available || 0,
          quality_tier_min: row.quality_tier_min || undefined,
          quality_tier_max: row.quality_tier_max || undefined,
          variant_count: row.variant_count || 0,
          created_at: row.created_at.toISOString(),
        }),
      )

      // Return complete response
      return {
        game_item: gameItemMetadata,
        quality_distribution,
        listings,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch game item listings", {
        game_item_id: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Search game item aggregates for the bulk items page.
   * Returns one row per game item with totals across all sellers.
   *
   * @summary Search game item aggregates
   */
  @Get("aggregates")
  public async searchGameItemAggregates(
    @Query() text?: string,
    @Query() item_type?: string,
    @Query() price_min?: number,
    @Query() price_max?: number,
    @Query() sort_by?: "price" | "quantity" | "name" | "seller_count",
    @Query() sort_order?: "asc" | "desc",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<SearchGameItemAggregatesResponse> {
    const db = getKnex()
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 24))
    const offset = (validatedPage - 1) * validatedPageSize

    try {
      let query = db("listing_search as ls")
        .leftJoin("game_items as gi", db.raw("ls.game_item_id::text = gi.id::text"))
        .where("ls.status", "active")
        .whereNotNull("ls.game_item_id")
        .groupBy("ls.game_item_id", "gi.name", "gi.type", "gi.image_url")
        .select(
          "ls.game_item_id",
          db.raw("COALESCE(gi.name, ls.title) as name"),
          db.raw("COALESCE(gi.type, ls.game_item_type, 'Other') as type"),
          db.raw("gi.image_url"),
          db.raw("MIN(ls.price_min) as min_price"),
          db.raw("MAX(ls.price_max) as max_price"),
          db.raw("SUM(ls.quantity_available) as total_quantity"),
          db.raw("COUNT(DISTINCT ls.listing_id) as listing_count"),
          db.raw("COUNT(DISTINCT ls.seller_id) as seller_count"),
          db.raw("MIN(ls.quality_tier_min) as quality_tier_min"),
          db.raw("MAX(ls.quality_tier_max) as quality_tier_max"),
        )

      if (text && text.trim()) {
        query = query.whereRaw(
          "ls.search_vector @@ plainto_tsquery('english', ?)",
          [text.trim()],
        )
      }
      if (item_type) {
        query = query.where(db.raw("COALESCE(gi.type, ls.game_item_type)"), item_type)
      }
      if (price_min !== undefined) {
        query = query.having(db.raw("MIN(ls.price_min)"), ">=", price_min)
      }
      if (price_max !== undefined) {
        query = query.having(db.raw("MAX(ls.price_max)"), "<=", price_max)
      }

      // Count total
      const countQuery = db.raw(
        `SELECT COUNT(*) as count FROM (${query.toQuery()}) as sub`,
      )
      const [{ count: totalCount }] = (await countQuery).rows
      const total = parseInt(String(totalCount), 10)

      // Sort
      const sortField = sort_by || "quantity"
      const sortDir = sort_order || "desc"
      switch (sortField) {
        case "price": query = query.orderByRaw(`MIN(ls.price_min) ${sortDir}`); break
        case "name": query = query.orderByRaw(`COALESCE(gi.name, ls.title) ${sortDir}`); break
        case "seller_count": query = query.orderByRaw(`COUNT(DISTINCT ls.seller_id) ${sortDir}`); break
        default: query = query.orderByRaw(`SUM(ls.quantity_available) ${sortDir}`); break
      }

      const rows = await query.limit(validatedPageSize).offset(offset)

      const items: GameItemAggregate[] = rows.map((r: any) => ({
        game_item_id: r.game_item_id,
        name: r.name || "Unknown",
        type: r.type || "Other",
        image_url: r.image_url || undefined,
        min_price: parseInt(r.min_price, 10) || 0,
        max_price: parseInt(r.max_price, 10) || 0,
        total_quantity: parseInt(r.total_quantity, 10) || 0,
        listing_count: parseInt(r.listing_count, 10) || 0,
        seller_count: parseInt(r.seller_count, 10) || 0,
        quality_tier_min: r.quality_tier_min || undefined,
        quality_tier_max: r.quality_tier_max || undefined,
      }))

      return { items, total, page: validatedPage, page_size: validatedPageSize }
    } catch (error) {
      logger.error("Failed to search game item aggregates", { error })
      throw error
    }
  }
}
