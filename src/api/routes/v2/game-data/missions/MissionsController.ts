/**
 * Missions V2 Controller
 *
 * TSOA controller for mission endpoints in the Game Data system.
 * Handles mission search, detail retrieval, and blueprint reward queries.
 *
 * Requirements: 1.1-1.6, 2.1-2.6, 41.1-41.10, 42.1-42.10
 */

import { Controller, Get, Post, Route, Tags, Query, Path, Body, Security, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  SearchMissionsRequest,
  SearchMissionsResponse,
  MissionSearchResult,
  MissionDetailResponse,
  Mission,
  MissionRewardPool,
  MissionBlueprintReward,
  BlueprintDetail,
  ReputationRank,
  GameEvent,
} from "./missions.types.js"
import logger from "../../../../../logger/logger.js"

@Route("game-data/missions")
@Tags("Game Data - Missions")
export class MissionsController extends BaseController {
  /**
   * Search missions with comprehensive filters
   *
   * Supports filtering by category, career type, location, faction, legal status,
   * difficulty, sharing status, events, and blueprint rewards. Includes full-text
   * search on mission names and community ratings.
   *
   * Requirements:
   * - 1.1: Return all missions that can reward specified blueprint
   * - 1.2: Display mission name, location, career type, organization
   * - 1.3: Display reward probability for each blueprint
   * - 1.4: Display total credit reward for each mission
   * - 1.5: Support partial name matching for searches
   * - 1.6: Return results within 200ms for typical queries
   * - 41.1-41.10: Support comprehensive filtering (category, system, type, faction, etc.)
   *
   * @summary Search missions
   * @param text Full-text search on mission name
   * @param category Filter by mission category
   * @param career_type Filter by career type
   * @param star_system Filter by star system
   * @param planet_moon Filter by planet or moon
   * @param faction Filter by faction
   * @param legal_status Filter by legal status
   * @param difficulty_min Minimum difficulty level (1-5)
   * @param difficulty_max Maximum difficulty level (1-5)
   * @param is_shareable Filter by shareable status
   * @param availability_type Filter by availability type
   * @param associated_event Filter by associated event
   * @param is_chain_starter Filter for chain starter missions
   * @param has_blueprint_rewards Filter for missions with blueprint rewards
   * @param credit_reward_min Minimum credit reward
   * @param community_difficulty_min Minimum community difficulty rating
   * @param community_satisfaction_min Minimum community satisfaction rating
   * @param version_id Game version ID (defaults to active LIVE version)
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Mission search results with pagination
   */
  @Get("search")
  public async searchMissions(
    @Query() text?: string,
    @Query() category?: string,
    @Query() career_type?: string,
    @Query() star_system?: string,
    @Query() planet_moon?: string,
    @Query() faction?: string,
    @Query() mission_giver_org?: string,
    @Query() legal_status?: "LEGAL" | "ILLEGAL",
    @Query() difficulty_min?: number,
    @Query() difficulty_max?: number,
    @Query() is_shareable?: boolean,
    @Query() availability_type?: string,
    @Query() associated_event?: string,
    @Query() is_chain_starter?: boolean,
    @Query() has_blueprint_rewards?: boolean,
    @Query() credit_reward_min?: number,
    @Query() community_difficulty_min?: number,
    @Query() community_satisfaction_min?: number,
    /** Filter by event code (show only missions for this event) */
    @Query() event_code?: string,
    /** Exclude event-only missions (default: true — hides seasonal missions) */
    @Query() exclude_events?: boolean,
    @Query() version_id?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<SearchMissionsResponse> {
    const knex = getKnex()

    // Validate pagination parameters
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    // Validate difficulty range
    if (difficulty_min !== undefined && (difficulty_min < 1 || difficulty_min > 5)) {
      this.throwValidationError("Invalid difficulty_min", [
        { field: "difficulty_min", message: "Difficulty must be between 1 and 5" },
      ])
    }
    if (difficulty_max !== undefined && (difficulty_max < 1 || difficulty_max > 5)) {
      this.throwValidationError("Invalid difficulty_max", [
        { field: "difficulty_max", message: "Difficulty must be between 1 and 5" },
      ])
    }

    logger.info("Searching missions", {
      text,
      category,
      career_type,
      star_system,
      page: validatedPage,
      page_size: validatedPageSize,
    })

    try {
      // ========================================================================
      // Part 1: Get or validate version_id
      // ========================================================================
      let effectiveVersionId = version_id

      if (!effectiveVersionId) {
        // Get active LIVE version
        const activeVersion = await knex("game_versions")
          .where("version_type", "LIVE")
          .where("is_active", true)
          .orderBy("created_at", "desc")
          .first()

        if (!activeVersion) {
          this.throwNotFound("Active LIVE game version", "LIVE")
        }

        effectiveVersionId = activeVersion.version_id
      }

      // ========================================================================
      // Part 2: Build mission search query with filters
      // ========================================================================
      let missionsQuery = knex("missions as m")
        .leftJoin(
          knex("mission_blueprint_rewards as mbr")
            .select("mission_id")
            .count("* as blueprint_count")
            .groupBy("mission_id")
            .as("reward_counts"),
          "m.mission_id",
          "reward_counts.mission_id",
        )
        .leftJoin(
          knex("mission_ship_encounters as mse")
            .select("mission_id")
            .select(knex.raw("SUM((SELECT SUM((w->>'shipCount')::int) FROM jsonb_array_elements(mse.waves::jsonb) w)) as total_ships"))
            .groupBy("mission_id")
            .as("ship_counts"),
          "m.mission_id",
          "ship_counts.mission_id",
        )
        .select(
          "m.mission_id",
          "m.mission_code",
          "m.mission_name",
          "m.category",
          "m.career_type",
          "m.legal_status",
          "m.difficulty_level",
          "m.star_system",
          "m.planet_moon",
          "m.faction",
          "m.mission_giver_org",
          "m.credit_reward_min",
          "m.credit_reward_max",
          "m.community_difficulty_avg",
          "m.community_satisfaction_avg",
          "m.is_chain_starter",
          "m.is_chain_mission",
          "m.is_shareable",
          "m.is_unique_mission",
          "m.is_illegal",
          "m.reputation_reward",
          "m.reward_scope",
          "m.associated_event",
          knex.raw("COALESCE(reward_counts.blueprint_count, 0)::integer as blueprint_reward_count"),
          knex.raw("COALESCE(ship_counts.total_ships, 0)::integer as ship_encounter_count"),
          knex.raw(`(SELECT json_agg(json_build_object('resource_name', mho.resource_name, 'min_scu', mho.min_scu, 'max_scu', mho.max_scu)) FROM mission_hauling_orders mho WHERE mho.mission_id = m.mission_id) as hauling_orders`),
        )
        .where("m.version_id", effectiveVersionId)

      // Apply text search filter (Requirement 1.5: partial name matching)
      if (text && text.length > 0) {
        missionsQuery = missionsQuery.where(function () {
          this.whereRaw(
            "to_tsvector('english', m.mission_name) @@ plainto_tsquery('english', ?)",
            [text],
          ).orWhere("m.mission_name", "ilike", `%${text}%`)
        })
      }

      // Apply category filter (Requirement 41.1)
      if (category) {
        const cats = category.split(",").map(c => c.trim()).filter(Boolean)
        if (cats.length === 1) missionsQuery = missionsQuery.where("m.category", cats[0])
        else if (cats.length > 1) missionsQuery = missionsQuery.whereIn("m.category", cats)
      }

      // Apply career type filter (Requirement 41.1)
      if (career_type) {
        missionsQuery = missionsQuery.where("m.career_type", career_type)
      }

      // Apply star system filter (Requirement 41.2)
      if (star_system) {
        const systems = star_system.split(",").map(s => s.trim()).filter(Boolean)
        if (systems.length === 1) missionsQuery = missionsQuery.where("m.star_system", systems[0])
        else if (systems.length > 1) missionsQuery = missionsQuery.whereIn("m.star_system", systems)
      }

      // Apply planet/moon filter
      if (planet_moon) {
        missionsQuery = missionsQuery.where("m.planet_moon", planet_moon)
      }

      // Apply faction filter (Requirement 41.4)
      if (faction) {
        missionsQuery = missionsQuery.where("m.faction", faction)
      }

      if (mission_giver_org) {
        missionsQuery = missionsQuery.where("m.mission_giver_org", "ilike", `%${mission_giver_org}%`)
      }

      // Apply legal status filter
      if (legal_status) {
        missionsQuery = missionsQuery.where("m.legal_status", legal_status)
      }

      // Apply difficulty range filter (include NULLs - most missions don't have difficulty set)
      if (difficulty_min !== undefined) {
        missionsQuery = missionsQuery.where(function() {
          this.where("m.difficulty_level", ">=", difficulty_min).orWhereNull("m.difficulty_level")
        })
      }
      if (difficulty_max !== undefined) {
        missionsQuery = missionsQuery.where(function() {
          this.where("m.difficulty_level", "<=", difficulty_max).orWhereNull("m.difficulty_level")
        })
      }

      // Apply shareable filter (Requirement 41.5)
      if (is_shareable !== undefined) {
        missionsQuery = missionsQuery.where("m.is_shareable", is_shareable)
      }

      // Apply availability type filter (Requirement 41.6)
      if (availability_type) {
        missionsQuery = missionsQuery.where("m.availability_type", availability_type)
      }

      // Apply event filter (Requirement 41.7)
      if (associated_event) {
        missionsQuery = missionsQuery.where("m.associated_event", associated_event)
      }

      // Filter by specific event or exclude event-only missions
      if (event_code) {
        missionsQuery = missionsQuery.whereExists(
          knex("mission_events as me")
            .join("game_events as ge", "me.event_id", "ge.event_id")
            .whereRaw("me.mission_id = m.mission_id")
            .where("ge.event_code", event_code),
        )
      } else if (exclude_events !== false) {
        // Default: exclude missions that require events
        missionsQuery = missionsQuery.whereNotExists(
          knex("mission_events as me").whereRaw("me.mission_id = m.mission_id"),
        )
      }

      // Apply chain starter filter
      if (is_chain_starter !== undefined) {
        missionsQuery = missionsQuery.where("m.is_chain_starter", is_chain_starter)
      }

      // Apply blueprint rewards filter
      if (has_blueprint_rewards !== undefined) {
        if (has_blueprint_rewards) {
          missionsQuery = missionsQuery.whereRaw("reward_counts.blueprint_count > 0")
        } else {
          missionsQuery = missionsQuery.whereRaw(
            "reward_counts.blueprint_count IS NULL OR reward_counts.blueprint_count = 0",
          )
        }
      }

      // Apply credit reward filter
      if (credit_reward_min !== undefined) {
        missionsQuery = missionsQuery.where(function () {
          this.where("m.credit_reward_min", ">=", credit_reward_min).orWhere(
            "m.credit_reward_max",
            ">=",
            credit_reward_min,
          )
        })
      }

      // Apply community rating filters
      if (community_difficulty_min !== undefined) {
        missionsQuery = missionsQuery.where(
          "m.community_difficulty_avg",
          ">=",
          community_difficulty_min,
        )
      }
      if (community_satisfaction_min !== undefined) {
        missionsQuery = missionsQuery.where(
          "m.community_satisfaction_avg",
          ">=",
          community_satisfaction_min,
        )
      }

      // ========================================================================
      // Part 3: Get total count for pagination
      // ========================================================================
      const countQuery = missionsQuery.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // ========================================================================
      // Part 4: Apply sorting and pagination
      // ========================================================================
      // Default sort: by mission name
      missionsQuery = missionsQuery.orderBy("m.mission_name", "asc")

      // Apply pagination
      const offset = (validatedPage - 1) * validatedPageSize
      missionsQuery = missionsQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const missionsResults = await missionsQuery

      logger.info("Missions search completed", {
        total,
        returned: missionsResults.length,
        page: validatedPage,
      })

      // Transform results
      const missions: MissionSearchResult[] = missionsResults.map((row: any) => ({
        mission_id: row.mission_id,
        mission_code: row.mission_code,
        mission_name: row.mission_name,
        category: row.category,
        career_type: row.career_type || undefined,
        legal_status: row.legal_status || undefined,
        difficulty_level: row.difficulty_level || undefined,
        star_system: row.star_system || undefined,
        planet_moon: row.planet_moon || undefined,
        faction: row.faction || undefined,
        credit_reward_min: row.credit_reward_min || undefined,
        credit_reward_max: row.credit_reward_max || undefined,
        blueprint_reward_count: row.blueprint_reward_count || 0,
        community_difficulty_avg: row.community_difficulty_avg
          ? parseFloat(row.community_difficulty_avg)
          : undefined,
        community_satisfaction_avg: row.community_satisfaction_avg
          ? parseFloat(row.community_satisfaction_avg)
          : undefined,
        is_chain_starter: row.is_chain_starter || false,
        is_chain_mission: row.is_chain_mission || false,
        is_shareable: row.is_shareable || false,
        is_unique_mission: row.is_unique_mission || false,
        is_illegal: row.is_illegal ?? undefined,
        reputation_reward: row.reputation_reward ?? undefined,
        reward_scope: row.reward_scope || undefined,
        mission_giver_org: row.mission_giver_org || undefined,
        associated_event: row.associated_event || undefined,
        ship_encounter_count: row.ship_encounter_count || 0,
        hauling_orders: row.hauling_orders || undefined,
      }))

      return {
        missions,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to search missions", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get mission detail with blueprint rewards
   *
   * Returns complete mission information including all blueprint reward pools,
   * prerequisite missions, and user-specific data (completion status, ratings).
   *
   * Requirements:
   * - 2.1: Display all blueprints in reward pool
   * - 2.2: Display probability of receiving each blueprint
   * - 2.3: Display total number of blueprints in reward pool
   * - 2.4: Display selection mechanism (e.g., "1 of 6 blueprints")
   * - 2.5: Group blueprints by reward pool when multiple pools exist
   * - 2.6: Display blueprint rarity or tier information
   *
   * @summary Get mission details
   * @param mission_id Mission UUID
   * @param request Express request for optional JWT auth
   * @returns Complete mission details with reward pools
   */
  @Get("{mission_id}")
  public async getMissionDetail(
    @Path() mission_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<MissionDetailResponse> {
    if (request) this.request = request
    const user_id = this.tryGetUserId()
    const knex = getKnex()

    // Resolve mission_id from code
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(mission_id || "")
    if (mission_id && !isUuid) {
      const row = await knex("missions").where("mission_code", mission_id).first("mission_id")
      if (!row) this.throwNotFound("Mission", mission_id)
      mission_id = row.mission_id
    }

    if (!mission_id) {
      this.throwValidationError("mission_id is required", [
        { field: "mission_id", message: "Mission ID is required" },
      ])
    }

    logger.info("Fetching mission detail", { mission_id, user_id })

    try {
      // ========================================================================
      // Part 1: Get mission data
      // ========================================================================
      const missionRow = await knex("missions")
        .where("mission_id", mission_id)
        .first()

      if (!missionRow) {
        this.throwNotFound("Mission", mission_id)
      }

      const mission: Mission = {
        mission_id: missionRow.mission_id,
        version_id: missionRow.version_id,
        mission_code: missionRow.mission_code,
        mission_name: missionRow.mission_name,
        mission_description: missionRow.mission_description || undefined,
        category: missionRow.category,
        mission_type: missionRow.mission_type || undefined,
        career_type: missionRow.career_type || undefined,
        legal_status: missionRow.legal_status || undefined,
        difficulty_level: missionRow.difficulty_level || undefined,
        star_system: missionRow.star_system || undefined,
        planet_moon: missionRow.planet_moon || undefined,
        location_detail: missionRow.location_detail || undefined,
        mission_giver_org: missionRow.mission_giver_org || undefined,
        faction: missionRow.faction || undefined,
        credit_reward_min: missionRow.credit_reward_min || undefined,
        credit_reward_max: missionRow.credit_reward_max || undefined,
        reputation_reward: missionRow.reputation_reward ?? undefined,
        is_shareable: missionRow.is_shareable || false,
        availability_type: missionRow.availability_type || undefined,
        associated_event: missionRow.associated_event || undefined,
        required_rank: missionRow.required_rank || undefined,
        required_reputation: missionRow.required_reputation || undefined,
        is_chain_starter: missionRow.is_chain_starter || false,
        is_chain_mission: missionRow.is_chain_mission || false,
        is_unique_mission: missionRow.is_unique_mission || false,
        prerequisite_missions: missionRow.prerequisite_missions || undefined,
        estimated_uec_per_hour: missionRow.estimated_uec_per_hour || undefined,
        estimated_rep_per_hour: missionRow.estimated_rep_per_hour || undefined,
        rank_index: missionRow.rank_index || undefined,
        reward_scope: missionRow.reward_scope || undefined,
        min_standing: missionRow.min_standing || undefined,
        max_standing: missionRow.max_standing || undefined,
        min_standing_display: await this.resolveStandingName(knex, missionRow.min_standing),
        max_standing_display: await this.resolveStandingName(knex, missionRow.max_standing),
        can_reaccept_after_failing: missionRow.can_reaccept_after_failing ?? undefined,
        can_reaccept_after_abandoning: missionRow.can_reaccept_after_abandoning ?? undefined,
        abandoned_cooldown_time: missionRow.abandoned_cooldown_time || undefined,
        personal_cooldown_time: missionRow.personal_cooldown_time || undefined,
        deadline_seconds: missionRow.deadline_seconds || undefined,
        available_in_prison: missionRow.available_in_prison ?? undefined,
        is_illegal: missionRow.is_illegal ?? undefined,
        is_lawful: missionRow.is_lawful ?? undefined,
        max_crimestat: missionRow.max_crimestat ?? undefined,
        difficulty_from_broker: missionRow.difficulty_from_broker || undefined,
        time_to_complete: missionRow.time_to_complete || undefined,
        accept_locations: missionRow.accept_locations ? (typeof missionRow.accept_locations === "string" ? JSON.parse(missionRow.accept_locations) : missionRow.accept_locations) : undefined,
        destinations: missionRow.destinations ? (typeof missionRow.destinations === "string" ? JSON.parse(missionRow.destinations) : missionRow.destinations) : undefined,
        item_rewards: missionRow.item_rewards ? (typeof missionRow.item_rewards === "string" ? JSON.parse(missionRow.item_rewards) : missionRow.item_rewards) : undefined,
        token_substitutions: missionRow.token_substitutions ? (typeof missionRow.token_substitutions === "string" ? JSON.parse(missionRow.token_substitutions) : missionRow.token_substitutions) : undefined,
        community_difficulty_avg: missionRow.community_difficulty_avg
          ? parseFloat(missionRow.community_difficulty_avg)
          : undefined,
        community_difficulty_count: missionRow.community_difficulty_count || 0,
        community_satisfaction_avg: missionRow.community_satisfaction_avg
          ? parseFloat(missionRow.community_satisfaction_avg)
          : undefined,
        community_satisfaction_count: missionRow.community_satisfaction_count || 0,
        data_source: missionRow.data_source,
        is_verified: missionRow.is_verified || false,
        created_at: missionRow.created_at.toISOString(),
        updated_at: missionRow.updated_at.toISOString(),
      }

      // ========================================================================
      // Part 2: Get blueprint rewards grouped by reward pool (Requirement 2.5)
      // ========================================================================
      const rewardsQuery = await knex("mission_blueprint_rewards as mbr")
        .join("blueprints as b", "mbr.blueprint_id", "b.blueprint_id")
        .join("game_items as gi", "b.output_game_item_id", "gi.id")
        .leftJoin("user_blueprint_inventory as ubi", function () {
          this.on("ubi.blueprint_id", "=", "b.blueprint_id")
          if (user_id) {
            this.andOn("ubi.user_id", "=", knex.raw("?", [user_id]))
          }
        })
        .select(
          "mbr.reward_pool_id",
          "mbr.reward_pool_size",
          "mbr.selection_count",
          "mbr.pool_name",
          "mbr.pool_chance",
          "mbr.drop_probability",
          "mbr.is_guaranteed",
          "b.blueprint_id",
          "b.blueprint_code",
          "b.blueprint_name",
          "gi.name as output_item_name",
          "gi.image_url as output_item_icon",
          "b.rarity",
          "b.tier",
          knex.raw("CASE WHEN ubi.is_owned = true THEN true ELSE false END as user_owns"),
        )
        .where("mbr.mission_id", mission_id)
        .orderBy("mbr.reward_pool_id", "asc")
        .orderBy("b.blueprint_name", "asc")

      // Group rewards by reward pool (Requirement 2.5)
      const rewardPoolsMap = new Map<number, MissionRewardPool>()

      for (const row of rewardsQuery) {
        const poolId = row.reward_pool_id

        if (!rewardPoolsMap.has(poolId)) {
          rewardPoolsMap.set(poolId, {
            reward_pool_id: poolId,
            pool_name: row.pool_name || undefined,
            pool_chance: row.pool_chance ? parseFloat(row.pool_chance) : undefined,
            reward_pool_size: row.reward_pool_size,
            selection_count: row.selection_count,
            blueprints: [],
          })
        }

        const pool = rewardPoolsMap.get(poolId)!
        pool.blueprints.push({
          blueprint_id: row.blueprint_id,
          blueprint_code: row.blueprint_code,
          blueprint_name: row.blueprint_name,
          output_item_name: row.output_item_name,
          output_item_icon: row.output_item_icon || undefined,
          drop_probability: parseFloat(row.drop_probability),
          is_guaranteed: row.is_guaranteed || false,
          rarity: row.rarity || undefined,
          tier: row.tier || undefined,
          user_owns: user_id ? row.user_owns : undefined,
        })
      }

      const blueprint_rewards = Array.from(rewardPoolsMap.values())

      // ========================================================================
      // Part 3: Get prerequisite missions (if any)
      // ========================================================================
      let prerequisite_missions: Mission[] | undefined

      if (
        missionRow.prerequisite_missions &&
        Array.isArray(missionRow.prerequisite_missions) &&
        missionRow.prerequisite_missions.length > 0
      ) {
        const prereqRows = await knex("missions")
          .whereIn("mission_id", missionRow.prerequisite_missions)
          .select()

        prerequisite_missions = prereqRows.map((row: any) => ({
          mission_id: row.mission_id,
          version_id: row.version_id,
          mission_code: row.mission_code,
          mission_name: row.mission_name,
          mission_description: row.mission_description || undefined,
          category: row.category,
          mission_type: row.mission_type || undefined,
          career_type: row.career_type || undefined,
          legal_status: row.legal_status || undefined,
          difficulty_level: row.difficulty_level || undefined,
          star_system: row.star_system || undefined,
          planet_moon: row.planet_moon || undefined,
          location_detail: row.location_detail || undefined,
          mission_giver_org: row.mission_giver_org || undefined,
          faction: row.faction || undefined,
          credit_reward_min: row.credit_reward_min || undefined,
          credit_reward_max: row.credit_reward_max || undefined,
          reputation_reward: row.reputation_reward ?? undefined,
          is_shareable: row.is_shareable || false,
          availability_type: row.availability_type || undefined,
          associated_event: row.associated_event || undefined,
          required_rank: row.required_rank || undefined,
          required_reputation: row.required_reputation || undefined,
          is_chain_starter: row.is_chain_starter || false,
          is_chain_mission: row.is_chain_mission || false,
          is_unique_mission: row.is_unique_mission || false,
          prerequisite_missions: row.prerequisite_missions || undefined,
          estimated_uec_per_hour: row.estimated_uec_per_hour || undefined,
          estimated_rep_per_hour: row.estimated_rep_per_hour || undefined,
          rank_index: row.rank_index || undefined,
          reward_scope: row.reward_scope || undefined,
          community_difficulty_avg: row.community_difficulty_avg
            ? parseFloat(row.community_difficulty_avg)
            : undefined,
          community_difficulty_count: row.community_difficulty_count || 0,
          community_satisfaction_avg: row.community_satisfaction_avg
            ? parseFloat(row.community_satisfaction_avg)
            : undefined,
          community_satisfaction_count: row.community_satisfaction_count || 0,
          data_source: row.data_source,
          is_verified: row.is_verified || false,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        }))
      }

      // ========================================================================
      // Part 4: Get user-specific data (if user_id provided)
      // ========================================================================
      let user_completed: boolean | undefined
      let user_rating: any | undefined

      if (user_id) {
        // Check if user completed this mission
        const completionRow = await knex("mission_completions")
          .where("user_id", user_id)
          .where("mission_id", mission_id)
          .first()

        user_completed = !!completionRow

        // Get user's rating
        const ratingRow = await knex("mission_ratings")
          .where("user_id", user_id)
          .where("mission_id", mission_id)
          .first()

        if (ratingRow) {
          user_rating = {
            difficulty_rating: ratingRow.difficulty_rating,
            satisfaction_rating: ratingRow.satisfaction_rating,
            rating_comment: ratingRow.rating_comment || undefined,
          }
        }
      }

      logger.info("Mission detail fetched successfully", {
        mission_id,
        blueprint_pools: blueprint_rewards.length,
        total_blueprints: blueprint_rewards.reduce((sum, pool) => sum + pool.blueprints.length, 0),
      })

      // ========================================================================
      // Part 5: Get encounter data (Combat tab)
      // ========================================================================
      const shipEncounterRows = await knex("mission_ship_encounters")
        .where("mission_id", mission_id)
      const ship_encounters = shipEncounterRows.map((r: any) => ({
        role: r.role,
        alignment: r.alignment || "neutral",
        waves: (typeof r.waves === "string" ? JSON.parse(r.waves) : r.waves || []).map((w: any) => ({
          name: w.name,
          min_ships: w.minShips ?? w.min_ships ?? w.shipCount ?? w.ship_count ?? 0,
          max_ships: w.maxShips ?? w.max_ships ?? w.shipCount ?? w.ship_count ?? 0,
        })),
        ship_pool: r.ship_pool ? (typeof r.ship_pool === "string" ? JSON.parse(r.ship_pool) : r.ship_pool) : undefined,
      }))

      const npcEncounterRows = await knex("mission_npc_encounters")
        .where("mission_id", mission_id)
      const npc_encounters = npcEncounterRows.map((r: any) => ({
        name: r.name,
        count: r.count,
      }))

      const haulingRows = await knex("mission_hauling_orders")
        .where("mission_id", mission_id)
      const hauling_orders = haulingRows.map((r: any) => ({
        resource_name: r.resource_name,
        min_scu: parseFloat(r.min_scu),
        max_scu: parseFloat(r.max_scu),
      }))

      const entityRows = await knex("mission_entity_spawns")
        .where("mission_id", mission_id)
      const entity_spawns = entityRows.map((r: any) => ({
        name: r.name,
        count: r.count,
      }))

      return {
        mission,
        blueprint_rewards,
        prerequisite_missions,
        ship_encounters: ship_encounters.length ? ship_encounters : undefined,
        npc_encounters: npc_encounters.length ? npc_encounters : undefined,
        hauling_orders: hauling_orders.length ? hauling_orders : undefined,
        entity_spawns: entity_spawns.length ? entity_spawns : undefined,
        user_completed,
        user_rating,
      }
    } catch (error) {
      logger.error("Failed to fetch mission detail", {
        mission_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get mission detail by mission_code (string identifier)
   * @param mission_code The mission code string (e.g., pu_eliminatespecific_lawful_stanton4_intro)
   */
  @Get("by-code/{mission_code}")
  public async getMissionDetailByCode(
    @Path() mission_code: string,
    @Request() request?: ExpressRequest,
  ): Promise<MissionDetailResponse> {
    if (request) this.request = request
    const knex = getKnex()
    const row = await knex("missions").where("mission_code", mission_code).first("mission_id")
    if (!row) this.throwNotFound("Mission", mission_code)
    return this.getMissionDetail(row.mission_id)
  }

  /**
   * Get blueprints rewarded by mission
   *
   * Returns detailed information about all blueprints that can be rewarded
   * by the specified mission, including drop probabilities and ingredient counts.
   *
   * @summary Get mission blueprints
   * @param mission_id Mission UUID
   * @returns Array of blueprint details with reward information
   */
  @Get("{mission_id}/blueprints")
  public async getMissionBlueprints(
    @Path() mission_id: string,
  ): Promise<BlueprintDetail[]> {
    const knex = getKnex()

    if (!mission_id) {
      this.throwValidationError("mission_id is required", [
        { field: "mission_id", message: "Mission ID is required" },
      ])
    }

    logger.info("Fetching mission blueprints", { mission_id })

    try {
      // Verify mission exists
      const missionExists = await knex("missions")
        .where("mission_id", mission_id)
        .first()

      if (!missionExists) {
        this.throwNotFound("Mission", mission_id)
      }

      // Get blueprints with ingredient counts
      const blueprintsQuery = await knex("mission_blueprint_rewards as mbr")
        .join("blueprints as b", "mbr.blueprint_id", "b.blueprint_id")
        .join("game_items as gi", "b.output_game_item_id", "gi.id")
        .leftJoin(
          knex("blueprint_ingredients")
            .select("blueprint_id")
            .count("* as ingredient_count")
            .groupBy("blueprint_id")
            .as("ingredient_counts"),
          "b.blueprint_id",
          "ingredient_counts.blueprint_id",
        )
        .select(
          "b.blueprint_id",
          "b.blueprint_code",
          "b.blueprint_name",
          "b.blueprint_description",
          "b.output_game_item_id",
          "gi.name as output_item_name",
          "gi.type as output_item_type",
          "gi.image_url as output_item_icon",
          "b.output_quantity",
          "b.item_category",
          "b.item_subcategory",
          "b.rarity",
          "b.tier",
          "b.crafting_station_type",
          "b.crafting_time_seconds",
          "b.required_skill_level",
          "b.icon_url",
          "mbr.drop_probability",
          "mbr.is_guaranteed",
          knex.raw("COALESCE(ingredient_counts.ingredient_count, 0)::integer as ingredient_count"),
        )
        .where("mbr.mission_id", mission_id)
        .orderBy("b.blueprint_name", "asc")

      const blueprints: BlueprintDetail[] = blueprintsQuery.map((row: any) => ({
        blueprint_id: row.blueprint_id,
        blueprint_code: row.blueprint_code,
        blueprint_name: row.blueprint_name,
        blueprint_description: row.blueprint_description || undefined,
        output_game_item_id: row.output_game_item_id,
        output_item_name: row.output_item_name,
        output_item_type: row.output_item_type || "unknown",
        output_item_icon: row.output_item_icon || undefined,
        output_quantity: row.output_quantity,
        item_category: row.item_category || undefined,
        item_subcategory: row.item_subcategory || undefined,
        rarity: row.rarity || undefined,
        tier: row.tier || undefined,
        crafting_station_type: row.crafting_station_type || undefined,
        crafting_time_seconds: row.crafting_time_seconds || undefined,
        required_skill_level: row.required_skill_level || undefined,
        icon_url: row.icon_url || undefined,
        ingredient_count: row.ingredient_count || 0,
        drop_probability: parseFloat(row.drop_probability),
        is_guaranteed: row.is_guaranteed || false,
      }))

      logger.info("Mission blueprints fetched successfully", {
        mission_id,
        blueprint_count: blueprints.length,
      })

      return blueprints
    } catch (error) {
      logger.error("Failed to fetch mission blueprints", {
        mission_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Mark mission as completed
   *
   * Records mission completion for the authenticated user, including which
   * blueprints were rewarded. This enables completion tracking and filtering.
   *
   * Requirements:
   * - 29.1: Allow players to mark missions as completed
   * - 29.2: Record completion date for each mission
   * - 29.3: Record which blueprints were rewarded from each completion
   * - 29.4: Display completion status on mission search results
   * - 29.5: Compute completion statistics per player
   * - 29.6: Support filtering missions by completion status
   *
   * @summary Complete mission
   * @param mission_id Mission UUID
   * @param body Completion details
   * @returns Success response
   */
  @Post("{mission_id}/complete")
  @Security("jwt")
  public async completeMission(
    @Path() mission_id: string,
    @Body()
    body: {
      blueprints_rewarded?: string[]
      completion_notes?: string
    },
  ): Promise<{ success: boolean; completion_id: string }> {
    const knex = getKnex()

    if (!mission_id) {
      this.throwValidationError("mission_id is required", [
        { field: "mission_id", message: "Mission ID is required" },
      ])
    }

    // Get user_id from authentication context
    // In production, this would come from the authenticated session
    // For now, we'll require it to be passed or use a placeholder
    const user_id = (this as any).user?.user_id

    if (!user_id) {
      this.throwUnauthorized("User must be authenticated to complete missions")
    }

    logger.info("Recording mission completion", { mission_id, user_id })

    try {
      // Verify mission exists
      const missionExists = await knex("missions").where("mission_id", mission_id).first()

      if (!missionExists) {
        this.throwNotFound("Mission", mission_id)
      }

      // Validate blueprints_rewarded if provided
      if (body.blueprints_rewarded && body.blueprints_rewarded.length > 0) {
        const validBlueprints = await knex("blueprints")
          .whereIn("blueprint_id", body.blueprints_rewarded)
          .select("blueprint_id")

        if (validBlueprints.length !== body.blueprints_rewarded.length) {
          this.throwValidationError("Invalid blueprint IDs provided", [
            {
              field: "blueprints_rewarded",
              message: "One or more blueprint IDs are invalid",
            },
          ])
        }
      }

      // Check if user already completed this mission
      const existingCompletion = await knex("mission_completions")
        .where("user_id", user_id)
        .where("mission_id", mission_id)
        .first()

      let completion_id: string

      if (existingCompletion) {
        // Update existing completion
        await knex("mission_completions")
          .where("completion_id", existingCompletion.completion_id)
          .update({
            completion_date: knex.fn.now(),
            blueprints_rewarded: body.blueprints_rewarded || [],
            completion_notes: body.completion_notes || null,
          })

        completion_id = existingCompletion.completion_id

        logger.info("Updated existing mission completion", {
          completion_id,
          mission_id,
          user_id,
        })
      } else {
        // Insert new completion
        const [completion] = await knex("mission_completions")
          .insert({
            user_id,
            mission_id,
            completion_date: knex.fn.now(),
            blueprints_rewarded: body.blueprints_rewarded || [],
            completion_notes: body.completion_notes || null,
          })
          .returning("completion_id")

        completion_id = completion.completion_id

        logger.info("Recorded new mission completion", {
          completion_id,
          mission_id,
          user_id,
        })
      }

      return {
        success: true,
        completion_id,
      }
    } catch (error) {
      logger.error("Failed to record mission completion", {
        mission_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Rate mission difficulty and satisfaction
   *
   * Records user's rating for a mission. Ratings are aggregated to compute
   * community averages displayed on mission search results. Database triggers
   * automatically update the mission's aggregate ratings.
   *
   * Requirements:
   * - 49.1: Allow authenticated users to rate mission difficulty (1-5 stars)
   * - 49.2: Allow authenticated users to rate mission satisfaction (1-5 stars)
   * - 49.3: Display average community difficulty rating
   * - 49.4: Display average community satisfaction rating
   *
   * @summary Rate mission
   * @param mission_id Mission UUID
   * @param body Rating details
   * @returns Success response
   */
  @Post("{mission_id}/rate")
  @Security("jwt")
  public async rateMission(
    @Path() mission_id: string,
    @Body()
    body: {
      difficulty_rating: number
      satisfaction_rating: number
      rating_comment?: string
    },
  ): Promise<{ success: boolean; rating_id: string }> {
    const knex = getKnex()

    if (!mission_id) {
      this.throwValidationError("mission_id is required", [
        { field: "mission_id", message: "Mission ID is required" },
      ])
    }

    // Validate ratings are in range 1-5
    if (
      body.difficulty_rating < 1 ||
      body.difficulty_rating > 5 ||
      !Number.isInteger(body.difficulty_rating)
    ) {
      this.throwValidationError("Invalid difficulty_rating", [
        {
          field: "difficulty_rating",
          message: "Difficulty rating must be an integer between 1 and 5",
        },
      ])
    }

    if (
      body.satisfaction_rating < 1 ||
      body.satisfaction_rating > 5 ||
      !Number.isInteger(body.satisfaction_rating)
    ) {
      this.throwValidationError("Invalid satisfaction_rating", [
        {
          field: "satisfaction_rating",
          message: "Satisfaction rating must be an integer between 1 and 5",
        },
      ])
    }

    // Get user_id from authentication context
    const user_id = (this as any).user?.user_id

    if (!user_id) {
      this.throwUnauthorized("User must be authenticated to rate missions")
    }

    logger.info("Recording mission rating", {
      mission_id,
      user_id,
      difficulty_rating: body.difficulty_rating,
      satisfaction_rating: body.satisfaction_rating,
    })

    try {
      // Verify mission exists
      const missionExists = await knex("missions").where("mission_id", mission_id).first()

      if (!missionExists) {
        this.throwNotFound("Mission", mission_id)
      }

      // Check if user already rated this mission
      const existingRating = await knex("mission_ratings")
        .where("user_id", user_id)
        .where("mission_id", mission_id)
        .first()

      let rating_id: string

      if (existingRating) {
        // Update existing rating
        await knex("mission_ratings")
          .where("rating_id", existingRating.rating_id)
          .update({
            difficulty_rating: body.difficulty_rating,
            satisfaction_rating: body.satisfaction_rating,
            rating_comment: body.rating_comment || null,
            updated_at: knex.fn.now(),
          })

        rating_id = existingRating.rating_id

        logger.info("Updated existing mission rating", {
          rating_id,
          mission_id,
          user_id,
        })
      } else {
        // Insert new rating
        const [rating] = await knex("mission_ratings")
          .insert({
            user_id,
            mission_id,
            difficulty_rating: body.difficulty_rating,
            satisfaction_rating: body.satisfaction_rating,
            rating_comment: body.rating_comment || null,
          })
          .returning("rating_id")

        rating_id = rating.rating_id

        logger.info("Recorded new mission rating", {
          rating_id,
          mission_id,
          user_id,
        })
      }

      // Note: Database trigger automatically updates mission aggregate ratings

      return {
        success: true,
        rating_id,
      }
    } catch (error) {
      logger.error("Failed to record mission rating", {
        mission_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get mission chains
   *
   * Returns all mission chains with their starter missions and progression paths.
   * Mission chains are series of related missions that must be completed in order.
   *
   * Requirements:
   * - 47.1: Identify mission chains (series of related missions)
   * - 47.2: Display starter missions (entry points to chains)
   * - 47.3: Display unique missions (one-time only)
   * - 47.4: Display mission prerequisites and unlock requirements
   *
   * @summary Get mission chains
   * @param version_id Game version ID (defaults to active LIVE version)
   * @returns Array of mission chains
   */
  @Get("chains")
  public async getMissionChains(
    @Query() version_id?: string,
  ): Promise<
    Array<{
      chain_id: string
      chain_name: string
      starter_mission: Mission
      chain_missions: Mission[]
      total_missions: number
    }>
  > {
    const knex = getKnex()

    logger.info("Fetching mission chains", { version_id })

    try {
      // Get or validate version_id
      let effectiveVersionId = version_id

      if (!effectiveVersionId) {
        // Get active LIVE version
        const activeVersion = await knex("game_versions")
          .where("version_type", "LIVE")
          .where("is_active", true)
          .orderBy("created_at", "desc")
          .first()

        if (!activeVersion) {
          this.throwNotFound("Active LIVE game version", "LIVE")
        }

        effectiveVersionId = activeVersion.version_id
      }

      // Get all chain starter missions
      const starterMissions = await knex("missions")
        .where("version_id", effectiveVersionId)
        .where("is_chain_starter", true)
        .orderBy("mission_name", "asc")

      if (starterMissions.length === 0) {
        logger.info("No mission chains found", { version_id: effectiveVersionId })
        return []
      }

      // For each starter mission, build the chain
      const chains = []

      for (const starterRow of starterMissions) {
        const chainMissions: Mission[] = []

        // Get all missions that are part of this chain
        // We identify chain missions by checking if they have the starter as a prerequisite
        // or are marked as chain missions with matching criteria
        const relatedMissions = await knex("missions")
          .where("version_id", effectiveVersionId)
          .where("is_chain_mission", true)
          .where(function () {
            // Missions that have this starter in their prerequisites
            this.whereRaw("prerequisite_missions @> ?", [
              JSON.stringify([starterRow.mission_id]),
            ])
              // Or missions with the same faction/category as the starter
              .orWhere(function () {
                if (starterRow.faction) {
                  this.where("faction", starterRow.faction)
                }
                if (starterRow.category) {
                  this.where("category", starterRow.category)
                }
              })
          })
          .orderBy("rank_index", "asc")
          .orderBy("mission_name", "asc")

        // Transform missions to Mission type
        for (const row of relatedMissions) {
          chainMissions.push(this.transformMissionRow(row))
        }

        chains.push({
          chain_id: starterRow.mission_id, // Use starter mission ID as chain ID
          chain_name: `${starterRow.mission_name} Chain`,
          starter_mission: this.transformMissionRow(starterRow),
          chain_missions: chainMissions,
          total_missions: chainMissions.length + 1, // +1 for starter
        })
      }

      logger.info("Mission chains fetched successfully", {
        version_id: effectiveVersionId,
        chain_count: chains.length,
      })

      return chains
    } catch (error) {
      logger.error("Failed to fetch mission chains", {
        version_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Helper method to transform database row to Mission type
   */
  private transformMissionRow(row: any): Mission {
    return {
      mission_id: row.mission_id,
      version_id: row.version_id,
      mission_code: row.mission_code,
      mission_name: row.mission_name,
      mission_description: row.mission_description || undefined,
      category: row.category,
      mission_type: row.mission_type || undefined,
      career_type: row.career_type || undefined,
      legal_status: row.legal_status || undefined,
      difficulty_level: row.difficulty_level || undefined,
      star_system: row.star_system || undefined,
      planet_moon: row.planet_moon || undefined,
      location_detail: row.location_detail || undefined,
      mission_giver_org: row.mission_giver_org || undefined,
      faction: row.faction || undefined,
      credit_reward_min: row.credit_reward_min || undefined,
      credit_reward_max: row.credit_reward_max || undefined,
      reputation_reward: row.reputation_reward ?? undefined,
      is_shareable: row.is_shareable || false,
      availability_type: row.availability_type || undefined,
      associated_event: row.associated_event || undefined,
      required_rank: row.required_rank || undefined,
      required_reputation: row.required_reputation || undefined,
      is_chain_starter: row.is_chain_starter || false,
      is_chain_mission: row.is_chain_mission || false,
      is_unique_mission: row.is_unique_mission || false,
      prerequisite_missions: row.prerequisite_missions || undefined,
      estimated_uec_per_hour: row.estimated_uec_per_hour || undefined,
      estimated_rep_per_hour: row.estimated_rep_per_hour || undefined,
      rank_index: row.rank_index || undefined,
      reward_scope: row.reward_scope || undefined,
      community_difficulty_avg: row.community_difficulty_avg
        ? parseFloat(row.community_difficulty_avg)
        : undefined,
      community_difficulty_count: row.community_difficulty_count || 0,
      community_satisfaction_avg: row.community_satisfaction_avg
        ? parseFloat(row.community_satisfaction_avg)
        : undefined,
      community_satisfaction_count: row.community_satisfaction_count || 0,
      data_source: row.data_source,
      is_verified: row.is_verified || false,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    }
  }

  /**
   * Get reputation rank thresholds for a scope (e.g., headhunter, salvage)
   * @param scope_code The reputation scope code
   * @summary Get reputation ranks
   */
  @Get("reputation-ranks")
  public async getReputationRanks(
    @Query() scope_code?: string,
  ): Promise<{ ranks: ReputationRank[]; scopes: string[]; display_name: string }> {
    const knex = getKnex()

    // Get all unique scopes
    const scopeRows = await knex("reputation_ranks")
      .distinct("scope_code", "scope_display_name")
      .orderBy("scope_display_name")

    const scopes = scopeRows.map((r: any) => r.scope_code)

    // Get ranks for the requested scope (or all if not specified)
    let query = knex("reputation_ranks").orderBy("scope_code").orderBy("rank_index")
    if (scope_code) {
      query = query.where("scope_code", scope_code)
    }

    const rows = await query
    const ranks: ReputationRank[] = rows.map((r: any) => ({
      scope_code: r.scope_code,
      scope_display_name: r.scope_display_name,
      standing_code: r.standing_code,
      standing_display_name: r.standing_display_name,
      threshold: r.threshold,
      ceiling: r.ceiling,
      rank_index: r.rank_index,
    }))

    return { ranks, scopes, display_name: ranks[0]?.scope_display_name || scope_code || "" }
  }

  private async resolveStandingName(knex: any, code: string | null | undefined): Promise<string | undefined> {
    if (!code) return undefined
    try {
      const row = await knex("reputation_ranks").where("standing_code", code).select("standing_display_name").first()
      return row?.standing_display_name || code
    } catch {
      return code
    }
  }

  /**
   * List all game events/scenarios that have associated missions
   * @summary Get game events
   */
  @Get("events")
  public async getGameEvents(): Promise<{ events: GameEvent[] }> {
    const knex = getKnex()
    const rows = await knex("game_events as ge")
      .join("mission_events as me", "ge.event_id", "me.event_id")
      .select("ge.event_id", "ge.event_code", "ge.event_name")
      .count("me.mission_id as mission_count")
      .groupBy("ge.event_id", "ge.event_code", "ge.event_name")
      .orderBy("ge.event_name")
    return {
      events: rows.map((r: any) => ({
        event_id: r.event_id,
        event_code: r.event_code,
        event_name: r.event_name,
        mission_count: parseInt(r.mission_count) || 0,
      })),
    }
  }
}
