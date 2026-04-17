/**
 * Analytics V2 Controller
 *
 * TSOA controller for analytics endpoints in the V2 market system.
 * Handles price history, quality distribution, and seller analytics.
 *
 * Requirements: 46.1-46.5
 */

import { Controller, Get, Route, Tags, Query } from "tsoa"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  GetPriceHistoryRequest,
  GetPriceHistoryResponse,
  PriceDataPoint,
  GetQualityDistributionRequest,
  GetQualityDistributionResponse,
  QualityTierDistribution,
  GetSellerStatsRequest,
  GetSellerStatsResponse,
  QualityTierSales,
  QualityTierPremium,
} from "../types/analytics.types.js"
import logger from "../../../../logger/logger.js"

@Route("analytics")
@Tags("Analytics V2")
export class AnalyticsV2Controller extends BaseController {
  /**
   * Get price history for a game item with optional quality tier filtering
   *
   * Tracks prices per variant over time and aggregates by quality tier.
   * Returns time-series data with timestamps, average/min/max prices, and volume.
   * Supports filtering by game_item_id and quality_tier.
   *
   * Requirements:
   * - 46.1: GET /api/v2/analytics/price-history endpoint
   * - 46.2: Track prices per variant over time
   * - 46.3: Aggregate by quality tier
   * - 46.4: Support filtering by game_item_id and quality_tier
   * - 46.5: Return time-series data with timestamps, avg_price, min_price, max_price, volume
   *
   * @summary Get price history
   * @param game_item_id Game item UUID (required)
   * @param quality_tier Optional quality tier filter (1-5)
   * @param start_date Optional start date (ISO 8601 format, defaults to 30 days ago)
   * @param end_date Optional end date (ISO 8601 format, defaults to now)
   * @param interval Time interval for aggregation (default: 'day')
   * @returns Price history time-series data
   */
  @Get("price-history")
  public async getPriceHistory(
    @Query() game_item_id: string,
    @Query() quality_tier?: number,
    @Query() start_date?: string,
    @Query() end_date?: string,
    @Query() interval?: "hour" | "day" | "week" | "month",
  ): Promise<GetPriceHistoryResponse> {
    const knex = getKnex()

    // Validate game_item_id
    if (!game_item_id) {
      this.throwValidationError("game_item_id is required", [
        { field: "game_item_id", message: "Game item ID is required" },
      ])
    }

    // Validate quality_tier if provided
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

    // Set default date range (30 days ago to now)
    const endDate = end_date ? new Date(end_date) : new Date()
    const startDate = start_date
      ? new Date(start_date)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Validate date range
    if (startDate >= endDate) {
      this.throwValidationError("Invalid date range", [
        {
          field: "start_date",
          message: "start_date must be before end_date",
        },
      ])
    }

    // Set default interval
    const timeInterval = interval || "day"

    logger.info("Fetching price history", {
      game_item_id,
      quality_tier,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      interval: timeInterval,
    })

    try {
      // Get game item name
      const gameItem = await knex("game_items")
        .select("name")
        .where("id", game_item_id)
        .first()

      if (!gameItem) {
        this.throwNotFound("Game item", game_item_id)
      }

      // Determine PostgreSQL date_trunc interval
      const truncInterval = timeInterval === "hour" ? "hour" : timeInterval

      // Build query to get price history from variant_pricing
      // Join with listing_item_lots to get variant attributes and timestamps
      // Join with item_variants to filter by quality_tier
      const query = knex("variant_pricing as vp")
        .join("listing_items as li", "vp.item_id", "li.item_id")
        .join("item_variants as iv", "vp.variant_id", "iv.variant_id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .select(
          knex.raw(
            `date_trunc('${truncInterval}', vp.created_at) as time_bucket`,
          ),
          knex.raw("AVG(vp.price)::bigint as avg_price"),
          knex.raw("MIN(vp.price) as min_price"),
          knex.raw("MAX(vp.price) as max_price"),
          knex.raw("COUNT(*)::integer as volume"),
        )
        .where("li.game_item_id", game_item_id)
        .whereBetween("vp.created_at", [startDate, endDate])
        .where("l.status", "active")
        .modify((queryBuilder) => {
          // Add quality tier filter if provided (Requirement 46.4)
          if (quality_tier !== undefined) {
            queryBuilder.whereRaw(
              "(iv.attributes->>'quality_tier')::integer = ?",
              [quality_tier],
            )
            // Add quality_tier to select
            queryBuilder.select(
              knex.raw("?::integer as quality_tier", [quality_tier]),
            )
          }
        })
        .groupBy(knex.raw(`date_trunc('${truncInterval}', vp.created_at)`))
        .orderBy(knex.raw(`date_trunc('${truncInterval}', vp.created_at)`) as any, "asc")

      const results = await query

      logger.info("Price history fetched successfully", {
        game_item_id,
        data_points: results.length,
      })

      // Transform results to PriceDataPoint format (Requirement 46.5)
      const data: PriceDataPoint[] = results.map((row: any) => ({
        timestamp: new Date(row.time_bucket).toISOString(),
        avg_price: parseInt(row.avg_price, 10),
        min_price: parseInt(row.min_price, 10),
        max_price: parseInt(row.max_price, 10),
        volume: row.volume,
        quality_tier: row.quality_tier,
      }))

      return {
        game_item_id,
        game_item_name: gameItem.name,
        data,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        interval: timeInterval,
      }
    } catch (error) {
      logger.error("Failed to fetch price history", {
        game_item_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get quality tier distribution for a game item
   *
   * Shows distribution of available quality tiers with tier counts, quantities,
   * prices, and seller counts. Supports filtering by game_item_id and optional
   * date range for tracking quality tier trends over time.
   *
   * Requirements:
   * - 47.1: GET /api/v2/analytics/quality-distribution endpoint
   * - 47.2: Show distribution of available quality tiers
   * - 47.3: Track quality tier trends over time
   * - 47.4: Support filtering by game_item_id
   * - 47.5: Return histogram data with tier counts, quantities, prices, seller counts
   *
   * @summary Get quality tier distribution
   * @param game_item_id Game item UUID (required)
   * @param start_date Optional start date (ISO 8601 format)
   * @param end_date Optional end date (ISO 8601 format)
   * @returns Quality tier distribution histogram data
   */
  @Get("quality-distribution")
  public async getQualityDistribution(
    @Query() game_item_id: string,
    @Query() start_date?: string,
    @Query() end_date?: string,
  ): Promise<GetQualityDistributionResponse> {
    const knex = getKnex()

    // Validate game_item_id
    if (!game_item_id) {
      this.throwValidationError("game_item_id is required", [
        { field: "game_item_id", message: "Game item ID is required" },
      ])
    }

    // Parse and validate date range if provided
    let startDate: Date | undefined
    let endDate: Date | undefined

    if (start_date) {
      startDate = new Date(start_date)
      if (isNaN(startDate.getTime())) {
        this.throwValidationError("Invalid start_date", [
          { field: "start_date", message: "Invalid date format" },
        ])
      }
    }

    if (end_date) {
      endDate = new Date(end_date)
      if (isNaN(endDate.getTime())) {
        this.throwValidationError("Invalid end_date", [
          { field: "end_date", message: "Invalid date format" },
        ])
      }
    }

    // Validate date range
    if (startDate && endDate && startDate >= endDate) {
      this.throwValidationError("Invalid date range", [
        {
          field: "start_date",
          message: "start_date must be before end_date",
        },
      ])
    }

    logger.info("Fetching quality distribution", {
      game_item_id,
      start_date: startDate?.toISOString(),
      end_date: endDate?.toISOString(),
    })

    try {
      // Get game item name
      const gameItem = await knex("game_items")
        .select("name")
        .where("id", game_item_id)
        .first()

      if (!gameItem) {
        this.throwNotFound("Game item", game_item_id)
      }

      // Build query to get quality tier distribution
      // Join listing_item_lots with item_variants to get quality_tier
      // Join with listing_items and listings to filter active listings
      // Join with variant_pricing to get prices (or use base_price for unified pricing)
      const query = knex("listing_item_lots as lil")
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
            `AVG(COALESCE(vp.price, li.base_price))::bigint as avg_price`,
          ),
          knex.raw(`MIN(COALESCE(vp.price, li.base_price)) as min_price`),
          knex.raw(`MAX(COALESCE(vp.price, li.base_price)) as max_price`),
        )
        .where("li.game_item_id", game_item_id)
        .where("l.status", "active")
        .where("lil.listed", true)
        .whereRaw("iv.attributes->>'quality_tier' IS NOT NULL")
        .modify((queryBuilder) => {
          // Add date range filter if provided (Requirement 47.3)
          if (startDate) {
            queryBuilder.where("l.created_at", ">=", startDate)
          }
          if (endDate) {
            queryBuilder.where("l.created_at", "<=", endDate)
          }
        })
        .groupBy(knex.raw("(iv.attributes->>'quality_tier')::integer"))
        .orderBy(knex.raw("(iv.attributes->>'quality_tier')::integer") as any, "asc")

      const results = await query

      logger.info("Quality distribution fetched successfully", {
        game_item_id,
        tier_count: results.length,
      })

      // Transform results to QualityTierDistribution format (Requirement 47.5)
      const distribution: QualityTierDistribution[] = results.map(
        (row: any) => ({
          quality_tier: row.quality_tier,
          quantity_available: row.quantity_available,
          listing_count: row.listing_count,
          seller_count: row.seller_count,
          avg_price: parseInt(row.avg_price, 10),
          min_price: parseInt(row.min_price, 10),
          max_price: parseInt(row.max_price, 10),
        }),
      )

      // Calculate total quantity across all tiers
      const total_quantity = distribution.reduce(
        (sum, tier) => sum + tier.quantity_available,
        0,
      )

      return {
        game_item_id,
        game_item_name: gameItem.name,
        distribution,
        total_quantity,
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
      }
    } catch (error) {
      logger.error("Failed to fetch quality distribution", {
        game_item_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get seller analytics with sales and inventory breakdown by quality tier
   *
   * Provides comprehensive seller analytics including:
   * - Sales volume by quality tier (from completed orders)
   * - Average sale price by quality tier
   * - Time-to-sale metrics by quality tier
   * - Current inventory distribution by quality tier
   * - Price premium percentages for higher quality tiers
   *
   * Requirements:
   * - 48.1: GET /api/v2/analytics/seller-stats endpoint
   * - 48.2: Display sales volume by quality tier
   * - 48.3: Display average sale price by quality tier
   * - 48.4: Display time-to-sale by quality tier
   * - 48.5: Display quality tier distribution of current inventory
   * - 48.6: Calculate price premium percentage for higher quality tiers
   *
   * @summary Get seller analytics
   * @param seller_id Optional seller ID (defaults to current user)
   * @returns Seller analytics with sales and inventory breakdown
   */
  @Get("seller-stats")
  public async getSellerStats(
    @Query() seller_id?: string,
  ): Promise<GetSellerStatsResponse> {
    const knex = getKnex()

    // TODO: Get current user ID from authentication context
    // For now, require seller_id parameter
    if (!seller_id) {
      this.throwValidationError("seller_id is required", [
        {
          field: "seller_id",
          message: "Seller ID is required (authentication not yet implemented)",
        },
      ])
    }

    logger.info("Fetching seller stats", { seller_id })

    try {
      // ========================================================================
      // Part 1: Sales by Quality Tier (Requirements 48.2, 48.3, 48.4)
      // ========================================================================
      // Query order_market_items_v2 to get sales data
      // Join with item_variants to get quality_tier
      // Join with listings to get created_at for time-to-sale calculation
      // Join with orders to filter by completed orders
      const salesQuery = knex("order_market_items_v2 as omi")
        .join("item_variants as iv", "omi.variant_id", "iv.variant_id")
        .join("listings as l", "omi.listing_id", "l.listing_id")
        .join("orders as o", "omi.order_id", "o.order_id")
        .select(
          knex.raw("(iv.attributes->>'quality_tier')::integer as quality_tier"),
          knex.raw("SUM(omi.quantity)::integer as volume"),
          knex.raw("AVG(omi.price_per_unit)::bigint as avg_price"),
          knex.raw(`
            AVG(
              EXTRACT(EPOCH FROM (o.created_at - l.created_at)) / 3600
            )::numeric as avg_time_to_sale_hours
          `),
        )
        .where("l.seller_id", seller_id)
        .whereRaw("iv.attributes->>'quality_tier' IS NOT NULL")
        .groupBy(knex.raw("(iv.attributes->>'quality_tier')::integer"))
        .orderBy(knex.raw("(iv.attributes->>'quality_tier')::integer") as any, "asc")

      const salesResults = await salesQuery

      logger.info("Fetched sales by quality tier", {
        seller_id,
        tier_count: salesResults.length,
      })

      // Transform sales results (Requirement 48.2, 48.3, 48.4)
      const sales_by_quality: QualityTierSales[] = salesResults.map(
        (row: any) => ({
          quality_tier: row.quality_tier,
          volume: row.volume,
          avg_price: parseInt(row.avg_price, 10),
          avg_time_to_sale_hours: parseFloat(
            parseFloat(row.avg_time_to_sale_hours).toFixed(2),
          ),
        }),
      )

      // ========================================================================
      // Part 2: Current Inventory Distribution (Requirement 48.5)
      // ========================================================================
      // Query listing_item_lots to get current inventory
      // Join with item_variants to get quality_tier
      // Join with listing_items and listings to filter by seller
      const inventoryQuery = knex("listing_item_lots as lil")
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
            `AVG(COALESCE(vp.price, li.base_price))::bigint as avg_price`,
          ),
          knex.raw(`MIN(COALESCE(vp.price, li.base_price)) as min_price`),
          knex.raw(`MAX(COALESCE(vp.price, li.base_price)) as max_price`),
        )
        .where("l.seller_id", seller_id)
        .where("l.status", "active")
        .where("lil.listed", true)
        .whereRaw("iv.attributes->>'quality_tier' IS NOT NULL")
        .groupBy(knex.raw("(iv.attributes->>'quality_tier')::integer"))
        .orderBy(knex.raw("(iv.attributes->>'quality_tier')::integer") as any, "asc")

      const inventoryResults = await inventoryQuery

      logger.info("Fetched inventory distribution", {
        seller_id,
        tier_count: inventoryResults.length,
      })

      // Transform inventory results (Requirement 48.5)
      const inventory_distribution: QualityTierDistribution[] =
        inventoryResults.map((row: any) => ({
          quality_tier: row.quality_tier,
          quantity_available: row.quantity_available,
          listing_count: row.listing_count,
          seller_count: row.seller_count,
          avg_price: parseInt(row.avg_price, 10),
          min_price: parseInt(row.min_price, 10),
          max_price: parseInt(row.max_price, 10),
        }))

      // ========================================================================
      // Part 3: Price Premiums (Requirement 48.6)
      // ========================================================================
      // Calculate price premium percentage for each tier compared to tier 1
      const price_premiums: QualityTierPremium[] = []

      // Find tier 1 baseline price from inventory
      const tier1Inventory = inventory_distribution.find(
        (tier) => tier.quality_tier === 1,
      )
      const tier1BaselinePrice = tier1Inventory?.avg_price

      if (tier1BaselinePrice && tier1BaselinePrice > 0) {
        // Calculate premium for each tier
        for (const tier of inventory_distribution) {
          if (tier.quality_tier === 1) {
            // Tier 1 has 0% premium (it's the baseline)
            price_premiums.push({
              quality_tier: 1,
              premium_percentage: 0,
            })
          } else {
            // Calculate premium percentage: ((tier_price - tier1_price) / tier1_price) * 100
            const premiumPercentage =
              ((tier.avg_price - tier1BaselinePrice) / tier1BaselinePrice) * 100
            price_premiums.push({
              quality_tier: tier.quality_tier,
              premium_percentage: parseFloat(premiumPercentage.toFixed(2)),
            })
          }
        }
      } else {
        // If no tier 1 baseline, calculate premiums relative to lowest tier
        const lowestTier = inventory_distribution[0]
        if (lowestTier && lowestTier.avg_price > 0) {
          for (const tier of inventory_distribution) {
            if (tier.quality_tier === lowestTier.quality_tier) {
              price_premiums.push({
                quality_tier: tier.quality_tier,
                premium_percentage: 0,
              })
            } else {
              const premiumPercentage =
                ((tier.avg_price - lowestTier.avg_price) /
                  lowestTier.avg_price) *
                100
              price_premiums.push({
                quality_tier: tier.quality_tier,
                premium_percentage: parseFloat(premiumPercentage.toFixed(2)),
              })
            }
          }
        }
      }

      logger.info("Calculated price premiums", {
        seller_id,
        premium_count: price_premiums.length,
      })

      return {
        seller_id,
        sales_by_quality,
        inventory_distribution,
        price_premiums,
      }
    } catch (error) {
      logger.error("Failed to fetch seller stats", {
        seller_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
