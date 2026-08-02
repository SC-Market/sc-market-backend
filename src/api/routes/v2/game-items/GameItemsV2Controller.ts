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
import { buildPrefixTsquery } from "../../../../util/full-text-search.js"
import {
  GetGameItemListingsResponse,
  GameItemQualityDistribution,
  GameItemListingResult,
  GameItemMetadata,
  SearchGameItemAggregatesResponse,
  GameItemAggregate,
} from "../types/game-items.types.js"
import logger from "../../../../logger/logger.js"

/**
 * Row shape of the quality-distribution aggregate query. The integer columns are
 * explicitly cast `::integer` in SQL; the price columns are bigint aggregates,
 * which the pg driver returns as strings (hence the parseInt in the mapper).
 */
interface GameItemQualityDistributionRow {
  quality_tier: number
  quantity_available: number
  listing_count: number
  shop_count: number
  price_avg: string
  price_min: string
  price_max: string
}

/**
 * Row shape of the game-item aggregate search query over the `listing_search`
 * view. The price/quantity/count columns are bigint aggregates, which the pg
 * driver returns as strings (hence the parseInt in the mapper); the quality
 * tiers are integer aggregates.
 */
interface GameItemAggregateRow {
  game_item_id: string
  name: string | null
  type: string | null
  image_url: string | null
  listing_photo: string | null
  min_price: string | null
  max_price: string | null
  total_quantity: string | null
  listing_count: string
  shop_count: string
  quality_tier_min: number | null
  quality_tier_max: number | null
}

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
   * @param limit Max results (default 50)
   */
  @Get("search")
  public async searchGameItems(
    @Query() query?: string,
    @Query() limit?: number,
  ): Promise<GameItemSearchResult[]> {
    if (!query || query.trim().length < 1) return []

    const knex = getKnex()
    const trimmed = query.trim()
    const effectiveLimit = Math.min(limit || 50, 100)

    // Prefix-aware tsquery; empty when the input is all punctuation.
    const prefixTsquery = buildPrefixTsquery(trimmed)

    const q = knex("game_items")

    // If nothing usable survived (query was all punctuation), fall back to
    // ILIKE only — never pass an empty tsquery.
    if (prefixTsquery) {
      q.whereRaw(
        "to_tsvector('english', name) @@ to_tsquery('english', ?)",
        [prefixTsquery],
      ).orWhere("name", "ilike", `%${trimmed}%`)
    } else {
      q.where("name", "ilike", `%${trimmed}%`)
    }

    if (prefixTsquery) {
      q.orderByRaw(
        `ts_rank(to_tsvector('english', name), to_tsquery('english', ?)) DESC`,
        [prefixTsquery],
      )
    }

    return q
      .orderByRaw(
        `CASE WHEN name ILIKE ? THEN 0 ELSE 1 END`,
        [`${trimmed}%`],
      )
      .orderBy("name")
      .limit(effectiveLimit)
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
    @Query() sort_by?: "price" | "quality" | "quantity" | "shop_rating",
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
      // Short-slug is resolved to UUID by the middleware
      // ========================================================================
      const gameItem = await knex("game_items")
        .select("id", "name", "type", "image_url")
        .where("id", id)
        .first()

      if (!gameItem) {
        this.throwNotFound("Game item", id)
      }

      const gameItemId = gameItem.id

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
        .select<GameItemQualityDistributionRow[]>(
          knex.raw("(iv.attributes->>'quality_tier')::integer as quality_tier"),
          knex.raw("SUM(lil.quantity_total)::integer as quantity_available"),
          knex.raw("COUNT(DISTINCT l.listing_id)::integer as listing_count"),
          knex.raw("COUNT(DISTINCT l.shop_id)::integer as shop_count"),
          knex.raw(
            `AVG(COALESCE(vp.price, li.base_price))::bigint as price_avg`,
          ),
          knex.raw(`MIN(COALESCE(vp.price, li.base_price)) as price_min`),
          knex.raw(`MAX(COALESCE(vp.price, li.base_price)) as price_max`),
        )
        .where("li.game_item_id", gameItemId)
        .where("l.status", "active")
        .where("lil.listed", true)
        .whereRaw("iv.attributes->>'quality_tier' IS NOT NULL")
        .groupBy(knex.raw("(iv.attributes->>'quality_tier')::integer"))
        // orderByRaw is the typed equivalent of orderBy(knex.raw(...)) — knex's
        // orderBy signature only accepts a column name or QueryBuilder, not a
        // Raw. The emitted SQL is byte-identical.
        .orderByRaw("(iv.attributes->>'quality_tier')::integer asc")

      const qualityDistributionResults: GameItemQualityDistributionRow[] =
        await qualityDistributionQuery

      logger.info("Quality distribution computed", {
        game_item_id: gameItemId,
        tier_count: qualityDistributionResults.length,
      })

      // Transform results to quality distribution format (Requirements 38.4-38.6)
      const quality_distribution: GameItemQualityDistribution[] =
        qualityDistributionResults.map((row) => ({
          quality_tier: row.quality_tier,
          quantity_available: row.quantity_available,
          price_min: parseInt(row.price_min, 10),
          price_max: parseInt(row.price_max, 10),
          price_avg: parseInt(row.price_avg, 10),
          shop_count: row.shop_count,
          listing_count: row.listing_count,
        }))

      // ========================================================================
      // Part 3: Get per-variant listing rows (Requirements 38.2, 38.7, 38.8)
      // ========================================================================
      // One row per (listing_item × quality variant). Prices resolve unified vs
      // per_variant the same way as ListingsV2Controller.getListingDetail:
      //   unified     -> li.base_price
      //   per_variant -> COALESCE(vp.price, li.base_price)
      // Quantity is summed across that variant's listed lots; only variants with
      // listed stock (SUM > 0) are returned.
      const priceExpr = `CASE WHEN li.pricing_mode = 'unified' THEN li.base_price ELSE COALESCE(vp.price, li.base_price) END`

      let listingsQuery = knex("listing_item_lots as lil")
        .join("item_variants as iv", "lil.variant_id", "iv.variant_id")
        .join("listing_items as li", "lil.item_id", "li.item_id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .join("shops as s", "l.shop_id", "s.shop_id")
        .leftJoin("variant_pricing as vp", function () {
          this.on("vp.item_id", "=", "li.item_id").andOn(
            "vp.variant_id",
            "=",
            "lil.variant_id",
          )
        })
        .select(
          "l.listing_id",
          "lil.variant_id",
          "l.title",
          "l.shop_id",
          "s.name as shop_name",
          "s.slug as shop_slug",
          "l.created_at",
          "iv.display_name as variant_display_name",
          "iv.short_name as variant_short_name",
          knex.raw(
            "(iv.attributes->>'quality_tier')::integer as quality_tier",
          ),
          knex.raw(
            "(iv.attributes->>'quality_value')::numeric as quality_value",
          ),
          knex.raw("SUM(lil.quantity_total)::integer as quantity_available"),
          knex.raw(`${priceExpr} as price`),
          knex.raw(
            `(SELECT COALESCE(AVG(sr.rating)::numeric(3,2), 0) FROM shop_ratings sr WHERE sr.shop_id = l.shop_id) AS shop_rating`,
          ),
          knex.raw(
            `(SELECT COUNT(*)::integer FROM shop_ratings sr WHERE sr.shop_id = l.shop_id) AS shop_rating_count`,
          ),
          knex.raw(
            `(SELECT COALESCE(sh.badge_ids, '{}') FROM shops sh WHERE sh.shop_id = l.shop_id) AS shop_badge_ids`,
          ),
        )
        .where("li.game_item_id", gameItemId)
        .where("l.status", "active")
        .where("lil.listed", true)
        .groupBy(
          "l.listing_id",
          "lil.variant_id",
          "l.title",
          "l.shop_id",
          "s.name",
          "s.slug",
          "l.created_at",
          "iv.display_name",
          "iv.short_name",
          "iv.attributes",
          "li.pricing_mode",
          "li.base_price",
          "vp.price",
        )
        .having(knex.raw("SUM(lil.quantity_total)"), ">", 0)

      // Apply quality tier filter at the variant level (Requirement 38.7)
      if (quality_tier !== undefined) {
        listingsQuery = listingsQuery.whereRaw(
          "(iv.attributes->>'quality_tier')::integer = ?",
          [quality_tier],
        )
      }

      // Get total count of variant rows for pagination (Requirement 38.9)
      const countResult = await knex.raw(
        `SELECT COUNT(*)::integer as count FROM (${listingsQuery
          .clone()
          .clearOrder()
          .toQuery()}) as sub`,
      )
      const total = parseInt(String(countResult.rows[0].count), 10)

      // Apply sorting at the variant level (Requirement 38.8)
      switch (validatedSortBy) {
        case "price":
          listingsQuery = listingsQuery.orderByRaw(
            `${priceExpr} ${validatedSortOrder}`,
          )
          break
        case "quality":
          listingsQuery = listingsQuery.orderByRaw(
            `(iv.attributes->>'quality_tier')::integer ${validatedSortOrder}`,
          )
          break
        case "quantity":
          listingsQuery = listingsQuery.orderByRaw(
            `SUM(lil.quantity_total) ${validatedSortOrder}`,
          )
          break
        case "shop_rating":
          listingsQuery = listingsQuery.orderByRaw(
            `(SELECT COALESCE(AVG(sr.rating)::numeric(3,2), 0) FROM shop_ratings sr WHERE sr.shop_id = l.shop_id) ${validatedSortOrder}`,
          )
          break
        default:
          listingsQuery = listingsQuery.orderByRaw(
            `${priceExpr} ${validatedSortOrder}`,
          )
      }

      // Apply pagination (Requirement 38.9)
      const offset = (validatedPage - 1) * validatedPageSize
      listingsQuery = listingsQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const listingsResults = await listingsQuery

      logger.info("Variant listings fetched successfully", {
        game_item_id: gameItemId,
        variant_row_count: listingsResults.length,
        total,
      })

      // Transform results to per-variant listing format (Requirement 38.2)
      const listings: GameItemListingResult[] = listingsResults.map(
        (row: Record<string, unknown>) => ({
          listing_id: row.listing_id as string,
          variant_id: row.variant_id as string,
          title: row.title as string,
          shop_id: row.shop_id as string,
          shop_name: (row.shop_name as string) || "Unknown",
          shop_rating: parseFloat(row.shop_rating as string) || 0,
          shop_rating_count: (row.shop_rating_count as number) || 0,
          shop_badge_ids: (row.shop_badge_ids as string[]) || [],
          shop_slug: (row.shop_slug as string) || "",
          price: parseInt(row.price as string, 10) || 0,
          quantity_available: (row.quantity_available as number) || 0,
          quality_tier:
            row.quality_tier != null
              ? (row.quality_tier as number)
              : undefined,
          quality_value:
            row.quality_value != null
              ? parseFloat(row.quality_value as string)
              : undefined,
          variant_display_name:
            (row.variant_display_name as string) || undefined,
          variant_short_name: (row.variant_short_name as string) || undefined,
          created_at: (row.created_at as Date).toISOString(),
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
    @Query() quantity_min?: number,
    @Query() quantity_max?: number,
    @Query() sort_by?: "price" | "quantity" | "name" | "shop_count",
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
        .groupBy("ls.game_item_id", "gi.name", "gi.type", "gi.image_url", "ls.title", "ls.game_item_type")
        .select(
          "ls.game_item_id",
          db.raw("COALESCE(gi.name, ls.title) as name"),
          db.raw("COALESCE(gi.type, ls.game_item_type, 'Other') as type"),
          db.raw("gi.image_url"),
          db.raw(`(
            SELECT COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename)
            FROM listing_items li2
            JOIN listings l2 ON l2.listing_id = li2.listing_id AND l2.status = 'active'
            JOIN listing_photos_v2 lp ON lp.listing_id = l2.listing_id
            JOIN image_resources ir ON lp.resource_id = ir.resource_id
            WHERE li2.game_item_id::text = ls.game_item_id::text
            ORDER BY lp.display_order ASC LIMIT 1
          ) as listing_photo`),
          db.raw("MIN(ls.price_min) as min_price"),
          db.raw("MAX(ls.price_max) as max_price"),
          db.raw("SUM(ls.quantity_available) as total_quantity"),
          db.raw("COUNT(DISTINCT ls.listing_id) as listing_count"),
          db.raw("COUNT(DISTINCT ls.shop_id) as shop_count"),
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
        query = query.whereRaw("COALESCE(gi.type, ls.game_item_type) = ?", [item_type])
      }
      if (price_min !== undefined) {
        query = query.having(db.raw("MIN(ls.price_min)"), ">=", price_min)
      }
      if (price_max !== undefined) {
        query = query.having(db.raw("MAX(ls.price_max)"), "<=", price_max)
      }
      if (quantity_min !== undefined) {
        query = query.having(db.raw("SUM(ls.quantity_available)"), ">=", quantity_min)
      }
      if (quantity_max !== undefined) {
        query = query.having(db.raw("SUM(ls.quantity_available)"), "<=", quantity_max)
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
        case "shop_count": query = query.orderByRaw(`COUNT(DISTINCT ls.shop_id) ${sortDir}`); break
        default: query = query.orderByRaw(`SUM(ls.quantity_available) ${sortDir}`); break
      }

      const rows: GameItemAggregateRow[] = await query
        .limit(validatedPageSize)
        .offset(offset)

      const items: GameItemAggregate[] = rows.map((r) => ({
        game_item_id: r.game_item_id,
        name: r.name || "Unknown",
        type: r.type || "Other",
        image_url: r.listing_photo || r.image_url || undefined,
        // String() is a no-op for the string values the pg driver returns and
        // matches parseInt's own ToString coercion for null aggregates.
        min_price: parseInt(String(r.min_price), 10) || 0,
        max_price: parseInt(String(r.max_price), 10) || 0,
        total_quantity: parseInt(String(r.total_quantity), 10) || 0,
        listing_count: parseInt(r.listing_count, 10) || 0,
        shop_count: parseInt(r.shop_count, 10) || 0,
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
