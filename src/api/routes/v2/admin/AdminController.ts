/**
 * Admin V2 Controller — Game Data Import with async job tracking
 */

import { Controller, Post, Get, Route, Tags, Request, Security, Path } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"
import { ImportGameDataResponse, ImportErrorResponse } from "./admin.types.js"
import { gameDataImportService, GameDataPayload } from "../../../../services/game-data/import.service.js"
import AdmZip from "adm-zip"
import * as fs from "fs"
import * as path from "path"

// ── Job tracking ───────────────────────────────────────────────────────

interface GameDataImportJob {
  id: string
  status: "validating" | "extracting" | "importing" | "completed" | "failed"
  startedAt: string
  completedAt: string | null
  progress: string | null
  result: ImportGameDataResponse | null
  error: string | null
  details: string | null
}

const jobs = new Map<string, GameDataImportJob>()
let jobCounter = 0

@Route("admin")
@Tags("Admin")
export class AdminController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Upload game data ZIP and start async import job
   * @summary Start game data import
   */
  @Post("import-game-data")
  @Security("jwt")
  public async importGameData(
    @Request() request: ExpressRequest,
  ): Promise<{ job_id: string } | ImportErrorResponse> {
    this.request = request
    this.requireAdmin()

    const adminUserId = this.getUserId()
    const file = (request as any).file as Express.Multer.File | undefined

    if (!file) {
      this.setStatus(400)
      return { success: false, error: "No file uploaded", details: "Please upload a game-data.zip file", timestamp: new Date().toISOString() }
    }

    if (!file.originalname.endsWith(".zip") && file.mimetype !== "application/zip") {
      this.setStatus(400)
      return { success: false, error: "Invalid file type", details: "Please upload a ZIP file", timestamp: new Date().toISOString() }
    }

    // Create job
    const jobId = `gdi-${++jobCounter}-${Date.now()}`
    const job: GameDataImportJob = {
      id: jobId,
      status: "validating",
      startedAt: new Date().toISOString(),
      completedAt: null,
      progress: "Validating upload...",
      result: null,
      error: null,
      details: null,
    }
    jobs.set(jobId, job)

    // Run import in background
    const uploadedFilePath = file.path
    this.runImport(job, uploadedFilePath, request.body || {}, adminUserId)

    this.setStatus(202)
    return { job_id: jobId }
  }

  /**
   * List all game data import jobs (most recent first)
   * @summary List import jobs
   */
  @Get("import-game-data")
  @Security("jwt")
  public async listGameDataImportJobs(
    @Request() request: ExpressRequest,
  ): Promise<{ jobs: GameDataImportJob[] }> {
    this.request = request
    this.requireAdmin()
    return { jobs: [...jobs.values()].reverse() }
  }

  /**
   * Get game data import job status
   * @summary Poll import job
   */
  @Get("import-game-data/{jobId}")
  @Security("jwt")
  public async getImportJobStatus(
    @Path() jobId: string,
    @Request() request: ExpressRequest,
  ): Promise<{ job: GameDataImportJob | null }> {
    this.request = request
    this.requireAdmin()

    const job = jobs.get(jobId) ?? null
    if (!job) this.setStatus(404)
    return { job }
  }

  // ── Background runner ──────────────────────────────────────────────

  private async runImport(
    job: GameDataImportJob,
    uploadedFilePath: string,
    body: any,
    adminUserId: string,
  ) {
    let tempDir: string | null = null

    try {
      // Extract
      job.status = "extracting"
      job.progress = "Extracting ZIP..."

      tempDir = path.join("/tmp", `game-data-import-${Date.now()}`)
      fs.mkdirSync(tempDir, { recursive: true })

      const zip = new AdmZip(uploadedFilePath)
      zip.extractAllTo(tempDir, true)

      const jsonPath = path.join(tempDir, "game-data.json")
      if (!fs.existsSync(jsonPath)) {
        throw new Error("ZIP must contain game-data.json at root level")
      }

      // Parse
      job.progress = "Parsing JSON..."
      const gameData: GameDataPayload = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))

      if (!gameData.items || !Array.isArray(gameData.items)) {
        throw new Error("game-data.json must contain an 'items' array")
      }

      if (body.gameVersion) gameData.gameVersion = body.gameVersion
      if (body.gameChannel) gameData.gameChannel = body.gameChannel

      // Import
      job.status = "importing"
      job.progress = `Importing ${gameData.items.length} items...`

      const knex = getKnex()
      const stats = await gameDataImportService.importGameData(knex, gameData)

      job.status = "completed"
      job.completedAt = new Date().toISOString()
      job.progress = null
      job.result = {
        success: true,
        summary: stats,
        errors: [],
        timestamp: job.completedAt,
      }

      logger.info("Game data import completed", { jobId: job.id, adminUserId, stats })
    } catch (err) {
      job.status = "failed"
      job.completedAt = new Date().toISOString()
      job.error = err instanceof Error ? err.message : String(err)
      job.details = err instanceof Error ? err.stack?.split("\n")[1]?.trim() ?? null : null
      job.progress = null

      logger.error("Game data import failed", { jobId: job.id, adminUserId, error: job.error })
    } finally {
      try { if (uploadedFilePath && fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath) } catch {}
      try { if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    }
  }
}
