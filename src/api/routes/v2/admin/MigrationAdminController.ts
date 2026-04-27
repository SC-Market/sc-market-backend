/**
 * V1→V2 Migration Admin Controller
 *
 * Temporary admin endpoints for running the data migration from the admin panel.
 * Supports dry-run (transaction rollback) and execute modes.
 */

import { Post, Get, Route, Tags, Body, Request, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { v1ToV2MigrationService, MigrationSummary } from "../../../../services/market-v2/migration.service.js"
import logger from "../../../../logger/logger.js"

interface MigrationRunRequest {
  /** If true, wraps in a transaction and rolls back — no data is persisted */
  dry_run: boolean
}

interface MigrationStatusResponse {
  v1_counts: { unique: number; aggregate: number; multiple: number; total: number }
  v2_counts: { listings: number; mapped: number; stock_lots_mapped: number; photos: number }
  price_history: { v1: number; v2: number }
  auctions: { v1: number; v2: number }
}

interface MigrationRunResponse {
  dry_run: boolean
  listings: MigrationSummary
  price_history: MigrationSummary
  auctions: MigrationSummary
  duration_seconds: number
}

@Route("admin/migration")
@Tags("Admin Migration")
@Security("loggedin")
export class MigrationAdminController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get current migration status — V1 vs V2 counts
   */
  @Get("status")
  public async getMigrationStatus(
    @Request() request: ExpressRequest,
  ): Promise<MigrationStatusResponse> {
    this.request = request
    this.requireAdmin()
    const knex = getKnex()

    const [u] = await knex("market_unique_listings").count("* as c")
    const [a] = await knex("market_aggregate_listings").count("* as c")
    const [m] = await knex("market_multiple_listings").count("* as c")
    const [v2] = await knex("listings").count("* as c")
    const [mapped] = await knex("v1_v2_listing_map").count("* as c")
    const [stockMapped] = await knex("v1_v2_stock_lot_map").count("* as c")
    const [photos] = await knex("listing_photos_v2").count("* as c")
    const [phV1] = await knex("market_price_history").count("* as c")
    const [phV2] = await knex("price_history_v2").count("* as c")

    let auctionsV1 = 0, auctionsV2 = 0
    try {
      const [av1] = await knex("market_auction_details").count("* as c")
      auctionsV1 = Number(av1.c)
    } catch { /* table may not exist */ }
    try {
      const [av2] = await knex("auction_details_v2").count("* as c")
      auctionsV2 = Number(av2.c)
    } catch { /* table may not exist */ }

    return {
      v1_counts: {
        unique: Number(u.c), aggregate: Number(a.c), multiple: Number(m.c),
        total: Number(u.c) + Number(a.c) + Number(m.c),
      },
      v2_counts: {
        listings: Number(v2.c), mapped: Number(mapped.c),
        stock_lots_mapped: Number(stockMapped.c), photos: Number(photos.c),
      },
      price_history: { v1: Number(phV1.c), v2: Number(phV2.c) },
      auctions: { v1: auctionsV1, v2: auctionsV2 },
    }
  }

  /**
   * Run the V1→V2 migration (dry-run or execute)
   */
  @Post("run")
  public async runMigration(
    @Body() requestBody: MigrationRunRequest,
    @Request() request: ExpressRequest,
  ): Promise<MigrationRunResponse> {
    this.request = request
    this.requireAdmin()
    const knex = getKnex()

    logger.info("Admin migration triggered", { dry_run: requestBody.dry_run, admin: this.getUserId() })

    const start = Date.now()

    // Run the actual migration (validates full flow including inserts, triggers, constraints)
    const listings = await v1ToV2MigrationService.migrateAllListings()
    const priceHistory = await v1ToV2MigrationService.migratePriceHistory()
    const auctions = await v1ToV2MigrationService.migrateAuctionData()

    const duration = (Date.now() - start) / 1000

    if (requestBody.dry_run) {
      // Roll back: delete everything we just created using the mapping tables
      logger.info("Dry run — rolling back migrated data", { admin: this.getUserId() })
      await this.rollbackMigratedData(knex)
    } else {
      logger.info("Admin migration completed", {
        listings: { success: listings.successful, failed: listings.failed },
        priceHistory: { success: priceHistory.successful, failed: priceHistory.failed },
        auctions: { success: auctions.successful, failed: auctions.failed },
      })
    }

    return {
      dry_run: requestBody.dry_run,
      listings,
      price_history: priceHistory,
      auctions,
      duration_seconds: duration,
    }
  }

  /**
   * Roll back migrated data using the mapping tables.
   * Deletes V2 data created by the migration, clears mapping tables.
   * V1 tables are never touched.
   */
  private async rollbackMigratedData(knex: ReturnType<typeof getKnex>) {
    // Delete V2 listings (CASCADE deletes listing_items, listing_item_lots, listing_photos_v2, auction_details_v2, bids_v2)
    const mappedListings = await knex("v1_v2_listing_map").select("v2_listing_id")
    if (mappedListings.length > 0) {
      const ids = mappedListings.map((r: { v2_listing_id: string }) => r.v2_listing_id)
      await knex("listings").whereIn("listing_id", ids).delete()
    }

    // Delete migrated price history
    await knex("price_history_v2").where("event_type", "legacy_snapshot").delete()

    // Clear mapping tables
    await knex("v1_v2_stock_lot_map").delete()
    await knex("v1_v2_listing_map").delete()

    logger.info("Dry run rollback complete", {
      listings_deleted: mappedListings.length,
    })
  }
}
