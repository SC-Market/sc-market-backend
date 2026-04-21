/**
 * Import Jobs V2 Controller
 *
 * Admin-only TSOA controller for triggering and monitoring bulk game item imports.
 * Jobs run asynchronously — start returns a job ID, poll status for progress.
 */

import { Controller, Get, Post, Route, Tags, Path, Request, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { database } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"

// ── Job types ──────────────────────────────────────────────────────────

type ImportSource = "cstone-items" | "uex-items" | "uex-attributes"
type JobStatus = "running" | "completed" | "failed"

interface ImportJob {
  id: string
  source: ImportSource
  status: JobStatus
  startedAt: string
  completedAt: string | null
  result: Record<string, any> | null
  error: string | null
}

// ── In-memory job store ────────────────────────────────────────────────

const jobs = new Map<string, ImportJob>()
let jobCounter = 0

function createJob(source: ImportSource): ImportJob {
  const id = `import-${++jobCounter}-${Date.now()}`
  const job: ImportJob = {
    id,
    source,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    error: null,
  }
  jobs.set(id, job)
  return job
}

function isSourceRunning(source: ImportSource): boolean {
  for (const job of jobs.values()) {
    if (job.source === source && job.status === "running") return true
  }
  return false
}

// ── Runners ────────────────────────────────────────────────────────────

/**
 * @deprecated Use P4K-based extraction instead
 */
async function runCstoneItems(job: ImportJob) {
  logger.warn("⚠️  DEPRECATION: cstone-items import is deprecated. Use P4K-based extraction.")
  const { importItemsFromCStone } = await import("../../../../../scripts/import-items-from-cstone.js")
  const result = await importItemsFromCStone(database.knex, logger, false)
  job.result = result ?? {}
}

/**
 * @deprecated Use P4K-based extraction instead
 */
async function runUexItems(job: ImportJob) {
  logger.warn("⚠️  DEPRECATION: uex-items import is deprecated. Use P4K-based extraction.")
  const { importItemsFromUEX } = await import("../../../../../scripts/import-items-from-uex.js")
  const result = await importItemsFromUEX()
  job.result = result ?? {}
}

async function runUexAttributes(job: ImportJob) {
  const { importAllAttributes } = await import("../../../../../scripts/import-all-attributes.js")
  const result = await importAllAttributes()
  job.result = result ?? {}
}

const runners: Record<ImportSource, (job: ImportJob) => Promise<void>> = {
  "cstone-items": runCstoneItems,
  "uex-items": runUexItems,
  "uex-attributes": runUexAttributes,
}

// ── Controller ─────────────────────────────────────────────────────────

@Route("admin/imports")
@Tags("Admin Imports")
@Security("jwt")
export class ImportJobsV2Controller extends BaseController {
  /**
   * Start a bulk import job
   * @param source Import source: cstone-items, uex-items, or uex-attributes
   */
  @Post("{source}")
  public async startImport(
    @Path() source: ImportSource,
    @Request() request: ExpressRequest,
  ): Promise<{ job: ImportJob }> {
    this.request = request
    this.requireAdmin()

    if (!runners[source]) {
      this.setStatus(400)
      return { job: { id: "", source, status: "failed", startedAt: "", completedAt: null, result: null, error: `Unknown source: ${source}` } }
    }

    if (isSourceRunning(source)) {
      this.setStatus(409)
      const running = [...jobs.values()].find(j => j.source === source && j.status === "running")!
      return { job: running }
    }

    const job = createJob(source)

    // Fire and forget — the job runs in the background
    runners[source](job)
      .then(() => {
        job.status = "completed"
        job.completedAt = new Date().toISOString()
        logger.info("Import job completed", { jobId: job.id, source, result: job.result })
      })
      .catch((err) => {
        job.status = "failed"
        job.completedAt = new Date().toISOString()
        job.error = err instanceof Error ? err.message : String(err)
        logger.error("Import job failed", { jobId: job.id, source, error: job.error })
      })

    this.setStatus(202)
    return { job }
  }

  /**
   * Get status of a specific import job
   * @param jobId The job ID returned from startImport
   */
  @Get("{jobId}")
  public async getJobStatus(
    @Path() jobId: string,
    @Request() request: ExpressRequest,
  ): Promise<{ job: ImportJob | null }> {
    this.request = request
    this.requireAdmin()

    const job = jobs.get(jobId) ?? null
    if (!job) this.setStatus(404)
    return { job }
  }

  /**
   * List all import jobs (most recent first)
   */
  @Get("")
  public async listJobs(
    @Request() request: ExpressRequest,
  ): Promise<{ jobs: ImportJob[] }> {
    this.request = request
    this.requireAdmin()

    return { jobs: [...jobs.values()].reverse() }
  }
}
