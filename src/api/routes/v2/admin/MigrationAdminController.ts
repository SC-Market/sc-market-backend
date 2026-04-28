/**
 * V1→V2 Migration Admin Controller
 *
 * Async job-based migration with polling, matching the game data import pattern.
 * Jobs run in the background; poll GET /admin/migration/jobs/:id for status.
 */

import { Post, Get, Route, Tags, Body, Request, Path, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { v1ToV2MigrationService, MigrationSummary } from "../../../../services/market-v2/migration.service.js"
import logger from "../../../../logger/logger.js"

interface MigrationRunRequest {
  dry_run: boolean
}

interface MigrationStatusResponse {
  v1_counts: { unique: number; aggregate: number; multiple: number; total: number }
  v2_counts: { listings: number; mapped: number; stock_lots_mapped: number; photos: number }
  price_history: { v1: number; v2: number }
  auctions: { v1: number; v2: number }
  order_items: { v1: number; v2: number }
  offer_items: { v1: number; v2: number }
  buy_orders: { v1: number; v2: number }
}

interface MigrationResult {
  dry_run: boolean
  listings: MigrationSummary
  price_history: MigrationSummary
  auctions: MigrationSummary
  order_items: MigrationSummary
  offer_items: MigrationSummary
  buy_orders: MigrationSummary
  duration_seconds: number
}

interface MigrationJob {
  id: string
  status: "running" | "rolling_back" | "completed" | "failed"
  dry_run: boolean
  started_at: string
  completed_at: string | null
  progress: string | null
  result: MigrationResult | null
  error: string | null
}

const jobs = new Map<string, MigrationJob>()
let jobCounter = 0

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
    try { auctionsV1 = Number((await knex("market_auction_details").count("* as c"))[0].c) } catch {}
    try { auctionsV2 = Number((await knex("auction_details_v2").count("* as c"))[0].c) } catch {}

    const [orderV1] = await knex("market_orders").count("* as c")
    const [orderV2] = await knex("order_market_items_v2").count("* as c")
    const [offerV1] = await knex("offer_market_items").count("* as c")
    const [offerV2] = await knex("offer_market_items_v2").count("* as c")
    const [buyV1] = await knex("market_buy_orders").count("* as c")
    const [buyV2] = await knex("buy_orders_v2").count("* as c")

    return {
      v1_counts: { unique: Number(u.c), aggregate: Number(a.c), multiple: Number(m.c), total: Number(u.c) + Number(a.c) + Number(m.c) },
      v2_counts: { listings: Number(v2.c), mapped: Number(mapped.c), stock_lots_mapped: Number(stockMapped.c), photos: Number(photos.c) },
      price_history: { v1: Number(phV1.c), v2: Number(phV2.c) },
      auctions: { v1: auctionsV1, v2: auctionsV2 },
      order_items: { v1: Number(orderV1.c), v2: Number(orderV2.c) },
      offer_items: { v1: Number(offerV1.c), v2: Number(offerV2.c) },
      buy_orders: { v1: Number(buyV1.c), v2: Number(buyV2.c) },
    }
  }

  /**
   * List all migration jobs (most recent first)
   */
  @Get("jobs")
  public async listMigrationJobs(
    @Request() request: ExpressRequest,
  ): Promise<{ jobs: MigrationJob[] }> {
    this.request = request
    this.requireAdmin()
    return { jobs: [...jobs.values()].reverse() }
  }

  /**
   * Poll a migration job for status
   */
  @Get("jobs/{jobId}")
  public async getMigrationJob(
    @Path() jobId: string,
    @Request() request: ExpressRequest,
  ): Promise<{ job: MigrationJob | null }> {
    this.request = request
    this.requireAdmin()
    const job = jobs.get(jobId) ?? null
    if (!job) this.setStatus(404)
    return { job }
  }

  /**
   * Start a migration job (returns immediately, poll for status)
   */
  @Post("run")
  public async runMigration(
    @Body() requestBody: MigrationRunRequest,
    @Request() request: ExpressRequest,
  ): Promise<{ job_id: string }> {
    this.request = request
    this.requireAdmin()
    const adminId = this.getUserId()

    const jobId = `mig-${++jobCounter}-${Date.now()}`
    const job: MigrationJob = {
      id: jobId,
      status: "running",
      dry_run: requestBody.dry_run,
      started_at: new Date().toISOString(),
      completed_at: null,
      progress: "Starting migration...",
      result: null,
      error: null,
    }
    jobs.set(jobId, job)

    logger.info("Admin migration job started", { jobId, dry_run: requestBody.dry_run, admin: adminId })

    // Run in background
    this.executeMigration(job)

    this.setStatus(202)
    return { job_id: jobId }
  }

  private async executeMigration(job: MigrationJob) {
    const start = Date.now()
    const knex = getKnex()
    const empty: MigrationSummary = { total_attempted: 0, successful: 0, failed: 0, skipped: 0, errors: [] }

    // Initialize result so partial progress is visible during polling
    job.result = {
      dry_run: job.dry_run,
      listings: empty, price_history: empty, auctions: empty,
      order_items: empty, offer_items: empty, buy_orders: empty,
      duration_seconds: 0,
    }

    try {
      job.progress = "Migrating listings..."
      job.result.listings = await v1ToV2MigrationService.migrateAllListings()
      job.result.duration_seconds = (Date.now() - start) / 1000

      job.progress = "Migrating price history..."
      job.result.price_history = await v1ToV2MigrationService.migratePriceHistory()
      job.result.duration_seconds = (Date.now() - start) / 1000

      job.progress = "Migrating auction data..."
      job.result.auctions = await v1ToV2MigrationService.migrateAuctionData()
      job.result.duration_seconds = (Date.now() - start) / 1000

      job.progress = "Migrating order line items..."
      job.result.order_items = await v1ToV2MigrationService.migrateOrderLineItems()
      job.result.duration_seconds = (Date.now() - start) / 1000

      job.progress = "Migrating offer line items..."
      job.result.offer_items = await v1ToV2MigrationService.migrateOfferLineItems()
      job.result.duration_seconds = (Date.now() - start) / 1000

      job.progress = "Migrating buy orders..."
      job.result.buy_orders = await v1ToV2MigrationService.migrateBuyOrders()
      job.result.duration_seconds = (Date.now() - start) / 1000

      if (job.dry_run) {
        job.status = "rolling_back"
        job.progress = "Rolling back (dry run)..."
        await this.rollbackMigratedData(knex)
      }

      job.status = "completed"
      job.completed_at = new Date().toISOString()
      job.progress = null

      logger.info("Admin migration job completed", { jobId: job.id, dry_run: job.dry_run, duration: job.result.duration_seconds })
    } catch (err) {
      job.status = "failed"
      job.completed_at = new Date().toISOString()
      job.error = err instanceof Error ? err.message : String(err)
      job.progress = null

      logger.error("Admin migration job failed", { jobId: job.id, error: job.error })
    }
  }

  private async rollbackMigratedData(knex: ReturnType<typeof getKnex>) {
    const mappedListings = await knex("v1_v2_listing_map").select("v2_listing_id")
    const ids = mappedListings.map((r: { v2_listing_id: string }) => r.v2_listing_id)

    // Delete order/offer items pointing to migrated listings
    if (ids.length > 0) {
      await knex("order_market_items_v2").whereIn("listing_id", ids).delete()
      await knex("offer_market_items_v2").whereIn("listing_id", ids).delete()
    }

    // Also delete any order/offer items that reference V1 orders/offers
    // (catches items that might have been missed by the listing-based cleanup)
    await knex("order_market_items_v2").whereIn("order_id",
      knex("market_orders").select("order_id"),
    ).delete()
    await knex("offer_market_items_v2").whereIn("offer_id",
      knex("offer_market_items").select("offer_id"),
    ).delete()

    // Delete migrated listings (CASCADE handles listing_items, lots, photos, auction_details, bids)
    if (ids.length > 0) {
      await knex("listings").whereIn("listing_id", ids).delete()
    }

    // Delete migrated price history
    await knex("price_history_v2").where("event_type", "legacy_snapshot").delete()

    // Delete migrated buy orders (those matching V1 by buyer+game_item)
    await knex("buy_orders_v2").whereIn("buy_order_id",
      knex("buy_orders_v2").join("market_buy_orders as mbo", function () {
        this.on("buy_orders_v2.buyer_id", "mbo.buyer_id")
          .andOn("buy_orders_v2.game_item_id", "mbo.game_item_id")
      }).select("buy_orders_v2.buy_order_id")
    ).delete()

    // Clear mapping tables
    await knex("v1_v2_stock_lot_map").delete()
    await knex("v1_v2_listing_map").delete()
  }
}
