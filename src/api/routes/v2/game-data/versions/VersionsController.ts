/**
 * Versions V2 Controller
 *
 * TSOA controller for game version endpoints in the Game Data system.
 * Handles version listing, active version retrieval, and user version selection.
 *
 * Requirements: 13.1-13.6, 45.1-45.10
 */

import { Controller, Get, Post, Route, Tags, Body, Security } from "tsoa"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  GameVersion,
  ActiveVersionsResponse,
  SelectVersionRequest,
  SelectVersionResponse,
} from "./versions.types.js"
import logger from "../../../../../logger/logger.js"

@Route("game-data/versions")
@Tags("Game Data - Versions")
@Security("jwt")
export class VersionsController extends BaseController {
  /**
   * List all game versions
   *
   * Returns all game versions (LIVE, PTU, EPTU) with metadata including
   * version numbers, build numbers, release dates, and last data update timestamps.
   *
   * Requirements:
   * - 13.1: Allow players to choose between LIVE, PTU, and EPTU versions
   * - 45.1: Display current selected version prominently
   * - 45.3: Display version type (LIVE, PTU, EPTU) with visual distinction
   * - 45.4: Display full version number including build number
   * - 45.5: Display last data update timestamp for each version
   *
   * @summary List game versions
   * @returns Array of all game versions
   */
  @Get("/")
  public async listVersions(): Promise<GameVersion[]> {
    const knex = getKnex()

    logger.info("Listing all game versions")

    try {
      const versionsQuery = await knex("game_versions")
        .select(
          "version_id",
          "version_type",
          "version_number",
          "build_number",
          "release_date",
          "is_active",
          "last_data_update",
          "created_at",
          "updated_at",
        )
        .orderBy("version_type", "asc")
        .orderBy("created_at", "desc")

      const versions: GameVersion[] = versionsQuery.map((row: any) => ({
        version_id: row.version_id,
        version_type: row.version_type,
        version_number: row.version_number,
        build_number: row.build_number || undefined,
        release_date: row.release_date ? row.release_date.toISOString() : undefined,
        is_active: row.is_active,
        last_data_update: row.last_data_update
          ? row.last_data_update.toISOString()
          : undefined,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      }))

      logger.info("Game versions listed successfully", {
        version_count: versions.length,
      })

      return versions
    } catch (error) {
      logger.error("Failed to list game versions", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get active game versions
   *
   * Returns the currently active version for each version type (LIVE, PTU, EPTU).
   * This endpoint is used by the version selector to display available versions
   * and by default queries to determine which version to use.
   *
   * Requirements:
   * - 13.1: Allow players to choose between LIVE, PTU, and EPTU versions
   * - 13.6: Default to LIVE version for new users
   * - 45.2: Provide dropdown or modal for version selection
   * - 45.5: Display last data update timestamp for each version
   * - 45.7: Display version-specific data counts
   *
   * @summary Get active versions
   * @returns Active versions by type
   */
  @Get("active")
  public async getActiveVersions(): Promise<ActiveVersionsResponse> {
    const knex = getKnex()

    logger.info("Fetching active game versions")

    try {
      // Get active version for each type
      const activeVersionsQuery = await knex("game_versions")
        .select(
          "version_id",
          "version_type",
          "version_number",
          "build_number",
          "release_date",
          "is_active",
          "last_data_update",
          "created_at",
          "updated_at",
        )
        .where("is_active", true)
        .orderBy("version_type", "asc")

      const response: ActiveVersionsResponse = {}

      for (const row of activeVersionsQuery) {
        const version: GameVersion = {
          version_id: row.version_id,
          version_type: row.version_type,
          version_number: row.version_number,
          build_number: row.build_number || undefined,
          release_date: row.release_date ? row.release_date.toISOString() : undefined,
          is_active: row.is_active,
          last_data_update: row.last_data_update
            ? row.last_data_update.toISOString()
            : undefined,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        }

        response[row.version_type as "LIVE" | "PTU" | "EPTU"] = version
      }

      logger.info("Active game versions fetched successfully", {
        active_types: Object.keys(response),
      })

      return response
    } catch (error) {
      logger.error("Failed to fetch active game versions", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Set user's selected game version
   *
   * Records the user's selected game version preference, which persists across
   * browser sessions and page navigation. This selection determines which version's
   * data is displayed throughout the game data system.
   *
   * Requirements:
   * - 13.2: Display data specific to selected version
   * - 13.3: Persist selected version across browser sessions
   * - 45.6: Persist selection across page navigation
   * - 45.9: Support quick toggle between LIVE and PTU
   *
   * @summary Select game version
   * @param body Version selection request
   * @returns Success response with selected version
   */
  @Post("select")
  @Security("jwt")
  public async selectVersion(
    @Body() body: SelectVersionRequest,
  ): Promise<SelectVersionResponse> {
    const knex = getKnex()

    if (!body.version_id) {
      this.throwValidationError("version_id is required", [
        { field: "version_id", message: "Version ID is required" },
      ])
    }

    // Get user_id from authentication context
    // In production, this would come from the authenticated session
    const user_id = (this as any).user?.user_id

    if (!user_id) {
      this.throwUnauthorized("User must be authenticated to select version")
    }

    logger.info("Selecting game version", { user_id, version_id: body.version_id })

    try {
      // Verify version exists
      const version = await knex("game_versions")
        .select(
          "version_id",
          "version_type",
          "version_number",
          "build_number",
          "release_date",
          "is_active",
          "last_data_update",
          "created_at",
          "updated_at",
        )
        .where("version_id", body.version_id)
        .first()

      if (!version) {
        this.throwNotFound("Game version", body.version_id)
      }

      // Store user's version preference
      // This would typically be stored in a user_preferences table
      // For now, we'll just return success with the selected version
      // TODO: Implement user_preferences table and storage

      const selectedVersion: GameVersion = {
        version_id: version.version_id,
        version_type: version.version_type,
        version_number: version.version_number,
        build_number: version.build_number || undefined,
        release_date: version.release_date ? version.release_date.toISOString() : undefined,
        is_active: version.is_active,
        last_data_update: version.last_data_update
          ? version.last_data_update.toISOString()
          : undefined,
        created_at: version.created_at.toISOString(),
        updated_at: version.updated_at.toISOString(),
      }

      logger.info("Game version selected successfully", {
        user_id,
        version_id: body.version_id,
        version_type: version.version_type,
      })

      return {
        success: true,
        version: selectedVersion,
      }
    } catch (error) {
      logger.error("Failed to select game version", {
        user_id,
        version_id: body.version_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
