/**
 * Admin Controller
 *
 * Admin-only endpoints for system administration tasks:
 * - Game data import from uploaded ZIP files
 * - System maintenance operations
 *
 * Requirements: 4.1-4.6 (Mission Data Extraction)
 */

import { Controller, Post, Route, Tags, Request, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { gameDataImportService } from "../../../../services/game-data/import.service.js"
import type { GameDataPayload } from "../../../../services/game-data/import.service.js"
import { ImportGameDataResponse, ImportErrorResponse } from "./admin.types.js"
import logger from "../../../../logger/logger.js"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

@Route("admin")
@Tags("Admin")
export class AdminController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Import game data from uploaded ZIP file
   *
   * Accepts a game-data.zip file upload, extracts the game-data.json,
   * and runs the same import logic as the command-line script.
   *
   * The import process:
   * 1. Validates ZIP file format
   * 2. Extracts game-data.json
   * 3. Matches P4K items to existing database items using:
   *    - Exact name match (case-insensitive)
   *    - CStone UUID match
   *    - Fuzzy name match (Levenshtein distance ≤ 2)
   * 4. Updates matched items with P4K metadata
   * 5. Inserts new items not found in database
   * 6. Regenerates "Full Set" synthetic items from "Core" items
   * 7. Rebuilds full-text search indexes
   *
   * Requirements:
   * - 4.1: Parse game data files to extract mission information
   * - 4.2: Identify mission names, locations, and rewards
   * - 4.3: Extract blueprint reward pools and probabilities
   * - 4.4: Validate extracted data for completeness
   * - 4.5: Log extraction errors with descriptive messages
   * - 4.6: Support multiple game versions simultaneously
   *
   * @summary Import game data
   * @param request Express request with uploaded file
   * @returns Import summary with statistics
   */
  @Post("import-game-data")
  @Security("jwt")
  public async importGameData(
    @Request() request: ExpressRequest,
  ): Promise<ImportGameDataResponse | ImportErrorResponse> {
    // Require admin authentication
    this.request = request
    this.requireAdmin()

    const adminUserId = this.getUserId()
    logger.info("Admin initiating game data import", { admin: adminUserId })

    let tempDir: string | null = null
    let uploadedFilePath: string | null = null

    try {
      // ========================================================================
      // STEP 1: Validate file upload
      // ========================================================================
      const file = (request as Express.Request & { file?: Express.Multer.File }).file

      if (!file) {
        logger.warn("No file uploaded", { admin: adminUserId })
        return {
          success: false,
          error: "No file uploaded",
          details: "Please upload a game-data.zip file",
          timestamp: new Date().toISOString(),
        }
      }

      uploadedFilePath = file.path
      logger.info("File uploaded", {
        admin: adminUserId,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      })

      // Validate file is a ZIP
      if (!file.originalname.endsWith(".zip") && file.mimetype !== "application/zip") {
        logger.warn("Invalid file type", {
          admin: adminUserId,
          filename: file.originalname,
          mimetype: file.mimetype,
        })
        return {
          success: false,
          error: "Invalid file type",
          details: "Please upload a ZIP file (game-data.zip)",
          timestamp: new Date().toISOString(),
        }
      }

      // ========================================================================
      // STEP 2: Extract ZIP file
      // ========================================================================
      logger.info("Extracting ZIP file", { admin: adminUserId })

      tempDir = path.join("/tmp", `game-data-import-${Date.now()}-${adminUserId}`)
      fs.mkdirSync(tempDir, { recursive: true })

      try {
        // Validate path contains no shell metacharacters
        if (/[;&|`$]/.test(uploadedFilePath!)) {
          throw new Error("Invalid file path")
        }
        execSync(`unzip -o "${uploadedFilePath}" -d "${tempDir}"`, {
          stdio: "pipe",
          timeout: 30000,
        })
      } catch (error) {
        logger.error("Failed to extract ZIP", {
          admin: adminUserId,
          error: error instanceof Error ? error.message : String(error),
        })
        return {
          success: false,
          error: "Failed to extract ZIP file",
          details: "The uploaded file may be corrupted or not a valid ZIP archive",
          timestamp: new Date().toISOString(),
        }
      }

      const jsonPath = path.join(tempDir, "game-data.json")
      if (!fs.existsSync(jsonPath)) {
        logger.error("game-data.json not found in ZIP", { admin: adminUserId })
        return {
          success: false,
          error: "Invalid ZIP structure",
          details: "The ZIP file must contain a game-data.json file at the root level",
          timestamp: new Date().toISOString(),
        }
      }

      // ========================================================================
      // STEP 3: Parse JSON
      // ========================================================================
      logger.info("Parsing game-data.json", { admin: adminUserId })

      let gameData: GameDataPayload
      try {
        const jsonContent = fs.readFileSync(jsonPath, "utf-8")
        gameData = JSON.parse(jsonContent) as GameDataPayload
      } catch (error) {
        logger.error("Failed to parse JSON", {
          admin: adminUserId,
          error: error instanceof Error ? error.message : String(error),
        })
        return {
          success: false,
          error: "Failed to parse game-data.json",
          details: "The JSON file may be malformed or corrupted",
          timestamp: new Date().toISOString(),
        }
      }

      // Validate JSON structure
      if (!gameData.items || !Array.isArray(gameData.items)) {
        logger.error("Invalid JSON structure", { admin: adminUserId })
        return {
          success: false,
          error: "Invalid game-data.json structure",
          details: 'The JSON file must contain an "items" array',
          timestamp: new Date().toISOString(),
        }
      }

      // Apply version info from form fields (override JSON defaults)
      const body = request.body || {}
      if (body.gameVersion) gameData.gameVersion = body.gameVersion
      if (body.gameChannel) gameData.gameChannel = body.gameChannel

      // ========================================================================
      // STEP 4: Run import
      // ========================================================================
      logger.info("Starting import process", {
        admin: adminUserId,
        itemCount: gameData.items.length,
      })

      const knex = getKnex()
      const stats = await gameDataImportService.importGameData(knex, gameData)

      logger.info("Import completed successfully", {
        admin: adminUserId,
        stats,
      })

      return {
        success: true,
        summary: {
          totalP4KItems: stats.totalP4KItems,
          validP4KItems: stats.validP4KItems,
          existingDBItems: stats.existingDBItems,
          matched: stats.matched,
          matchedExact: stats.matchedExact,
          matchedCStoneUUID: stats.matchedCStoneUUID,
          matchedFuzzy: stats.matchedFuzzy,
          inserted: stats.inserted,
          updated: stats.updated,
          nameChanges: stats.nameChanges,
          fullSetsCreated: stats.fullSetsCreated,
          missionsProcessed: stats.missionsProcessed,
          missionsInserted: stats.missionsInserted,
          missionsUpdated: stats.missionsUpdated,
          blueprintsProcessed: stats.blueprintsProcessed,
          blueprintsInserted: stats.blueprintsInserted,
          blueprintsUpdated: stats.blueprintsUpdated,
        },
        errors: stats.errors,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined

      logger.error("Import failed with exception", {
        admin: adminUserId,
        error: errorMessage,
        stack: errorStack,
      })

      return {
        success: false,
        error: "Import failed",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      }
    } finally {
      // ========================================================================
      // CLEANUP: Remove temporary files
      // ========================================================================
      try {
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath)
          logger.debug("Cleaned up uploaded file", { path: uploadedFilePath })
        }
      } catch (error) {
        logger.warn("Failed to clean up uploaded file", {
          path: uploadedFilePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      try {
        if (tempDir && fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
          logger.debug("Cleaned up temp directory", { path: tempDir })
        }
      } catch (error) {
        logger.warn("Failed to clean up temp directory", {
          path: tempDir,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}
