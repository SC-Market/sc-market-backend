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

    return {
      v1_counts: { unique: Number(u.c), aggregate: Number(a.c), multiple: Number(m.c), total: Number(u.c) + Number(a.c) + Number(m.c) },
      v2_counts: { listings: Number(v2.c), mapped: Number(mapped.c), stock_lots_mapped: Number(stockMapped.c), photos: Number(photos.c) },
      price_history: { v1: Number(phV1.c), v2: Number(phV2.c) },
      auctions: { v1: auctionsV1, v2: auctionsV2 },
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

    try {
      job.progress = "Migrating listings..."
      const listings = await v1ToV2MigrationService.migrateAllListings()

      job.progress = "Migrating price history..."
      const priceHistory = await v1ToV2MigrationService.migratePriceHistory()

      job.progress = "Migrating auction data..."
      const auctions = await v1ToV2MigrationService.migrateAuctionData()

      job.progress = "Migrating order line items..."
      const orderItems = await v1ToV2MigrationService.migrateOrderLineItems()

      job.progress = "Migrating offer line items..."
      const offerItems = await v1ToV2MigrationService.migrateOfferLineItems()

      job.progress = "Migrating buy orders..."
      const buyOrders = await v1ToV2MigrationService.migrateBuyOrders()

      const duration = (Date.now() - start) / 1000

      const result: MigrationResult = {
        dry_run: job.dry_run,
        listings, price_history: priceHistory, auctions,
        order_items: orderItems, offer_items: offerItems, buy_orders: buyOrders,
        duration_seconds: duration,
      }

      if (job.dry_run) {
        job.status = "rolling_back"
        job.progress = "Rolling back (dry run)..."
        await this.rollbackMigratedData(knex)
      }

      job.status = "completed"
      job.completed_at = new Date().toISOString()
      job.progress = null
      job.result = result

      logger.info("Admin migration job completed", { jobId: job.id, dry_run: job.dry_run, duration })
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

    if (ids.length > 0) {
      await knex("order_market_items_v2").whereIn("listing_id", ids).delete()
      await knex("offer_market_items_v2").whereIn("listing_id", ids).delete()
      await knex("listings").whereIn("listing_id", ids).delete()
    }

    await knex("price_history_v2").where("event_type", "legacy_snapshot").delete()
    await knex("v1_v2_stock_lot_map").delete()
    await knex("v1_v2_listing_map").delete()
  }
}
