/**
 * Blueprints V2 Controller
 *
 * TSOA controller for blueprint endpoints in the Game Data system.
 * Handles blueprint search, detail retrieval, mission queries, categories, and inventory management.
 *
 * Requirements: 19.1-19.6, 30.1-30.6, 43.1-43.10, 44.1-44.10, 50.1-50.10
 */

import { Controller, Get, Post, Delete, Route, Tags, Query, Path, Body, Security, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  SearchBlueprintsRequest,
  SearchBlueprintsResponse,
  BlueprintSearchResult,
  BlueprintDetailResponse,
  Blueprint,
  GameItem,
  BlueprintIngredient,
  MissionRewardingBlueprint,
  BlueprintCategory,
  CraftableBlueprintResult,
} from "./blueprints.types.js"
import logger from "../../../../../logger/logger.js"
import { resolveGameItemImages } from "../../util/resolve-game-item-images.js"

@Route("game-data/blueprints")
@Tags("Game Data - Blueprints")
export class BlueprintsController extends BaseController {
  /**
   * Search blueprints with filters
   *
   * Supports filtering by category, rarity, tier, crafting station, and ownership.
   * Includes full-text search on blueprint names and displays ingredient/mission counts.
   *
   * Requirements:
   * - 19.1: Categorize blueprints by item type
   * - 19.2: Support hierarchical categories with subcategories
   * - 19.3: Display category navigation in blueprint browser
   * - 19.4: Support filtering by category in searches
   * - 19.5: Display item count per category
   * - 19.6: Support custom category views per user
   * - 43.1-43.10: Display blueprints as cards with comprehensive information
   *
   * @summary Search blueprints
   * @param text Full-text search on blueprint name
   * @param item_category Filter by item category
   * @param item_subcategory Filter by item subcategory
   * @param rarity Filter by rarity
   * @param tier Filter by tier (1-5)
   * @param crafting_station_type Filter by crafting station type
   * @param output_game_item_id Filter by output game item ID
   * @param user_owned_only Filter to show only user-owned blueprints
   * @param version_id Game version ID (defaults to active LIVE version)
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Blueprint search results with pagination
   */
  @Get("search")
  public async searchBlueprints(
    @Query() text?: string,
    @Query() item_category?: string,
    @Query() item_subcategory?: string,
    @Query() rarity?: string,
    @Query() tier?: number,
    @Query() crafting_station_type?: string,
    @Query() output_game_item_id?: string,
    @Query() user_owned_only?: boolean,
    /** Filter by blueprint source (default, mission_reward) */
    @Query() source?: string,
    /** Filter by manufacturer name */
    @Query() manufacturer?: string,
    /** Filter by ingredient material name */
    @Query() ingredient_name?: string,
    @Query() version_id?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
    @Request() request?: ExpressRequest,
  ): Promise<SearchBlueprintsResponse> {
    if (request) this.request = request
    const user_id = this.tryGetUserId()
    const knex = getKnex()

    // Validate pagination parameters
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    // Validate tier range
    if (tier !== undefined && (tier < 1 || tier > 5)) {
      this.throwValidationError("Invalid tier", [
        { field: "tier", message: "Tier must be between 1 and 5" },
      ])
    }

    logger.info("Searching blueprints", {
      text,
      item_category,
      rarity,
      tier,
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
      // Part 2: Build blueprint search query with filters
      // ========================================================================
      let blueprintsQuery = knex("blueprints as b")
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
        .leftJoin(
          knex("mission_blueprint_rewards")
            .select("blueprint_id")
            .countDistinct("mission_id as mission_count")
            .groupBy("blueprint_id")
            .as("mission_counts"),
          "b.blueprint_id",
          "mission_counts.blueprint_id",
        )
        .select(
          "b.blueprint_id",
          "b.blueprint_code",
          "b.blueprint_name",
          "gi.name as output_item_name",
          "gi.image_url as output_item_icon",
          "gi.manufacturer",
          "b.item_category",
          "b.item_subcategory",
          "b.rarity",
          "b.tier",
          "b.source",
          "b.crafting_time_seconds",
          knex.raw("COALESCE(ingredient_counts.ingredient_count, 0)::integer as ingredient_count"),
          knex.raw("COALESCE(mission_counts.mission_count, 0)::integer as mission_count"),
          knex.raw(`(SELECT array_agg(DISTINCT bsm.property) FROM blueprint_slot_modifiers bsm WHERE bsm.blueprint_id = b.blueprint_id) as modifier_properties`),
        )
        .where("b.version_id", effectiveVersionId)
        .where("b.is_active", true)

      // Apply text search filter (Requirement 19.4: support filtering by category in searches)
      if (text && text.length > 0) {
        blueprintsQuery = blueprintsQuery.where(function () {
          this.whereRaw(
            "to_tsvector('english', b.blueprint_name || ' ' || COALESCE(gi.name, '')) @@ plainto_tsquery('english', ?)",
            [text],
          )
            .orWhere("b.blueprint_name", "ilike", `%${text}%`)
            .orWhere("gi.name", "ilike", `%${text}%`)
        })
      }

      // Apply category filter (Requirement 19.1: categorize blueprints by item type)
      if (item_category) {
        blueprintsQuery = blueprintsQuery.where("b.item_category", item_category)
      }

      // Apply subcategory filter (Requirement 19.2: support hierarchical categories)
      if (item_subcategory) {
        blueprintsQuery = blueprintsQuery.where("b.item_subcategory", item_subcategory)
      }

      // Apply rarity filter
      if (rarity) {
        blueprintsQuery = blueprintsQuery.where("b.rarity", rarity)
      }

      // Apply tier filter
      if (tier !== undefined) {
        blueprintsQuery = blueprintsQuery.where("b.tier", tier)
      }

      // Apply crafting station filter
      if (crafting_station_type) {
        blueprintsQuery = blueprintsQuery.where("b.crafting_station_type", crafting_station_type)
      }

      // Apply output game item filter
      if (output_game_item_id) {
        blueprintsQuery = blueprintsQuery.where("b.output_game_item_id", output_game_item_id)
      }

      // Apply source filter
      if (source) {
        blueprintsQuery = blueprintsQuery.where("b.source", source)
      }

      // Apply manufacturer filter
      if (manufacturer) {
        blueprintsQuery = blueprintsQuery.where("gi.manufacturer", manufacturer)
      }

      // Apply ingredient material filter
      if (ingredient_name) {
        blueprintsQuery = blueprintsQuery.whereExists(
          knex("blueprint_ingredients as bi_filter")
            .join("game_items as gi_filter", "bi_filter.game_item_id", "gi_filter.id")
            .whereRaw("bi_filter.blueprint_id = b.blueprint_id")
            .where("gi_filter.name", "ilike", `%${ingredient_name}%`),
        )
      }

      // Apply user ownership filter (if user_owned_only is true)
      // Note: This requires user_id from authentication context
      if (user_owned_only) {
        if (!user_id) {
          this.throwUnauthorized("User must be authenticated to filter by ownership")
        }

        blueprintsQuery = blueprintsQuery
          .join("user_blueprint_inventory as ubi", function () {
            this.on("ubi.blueprint_name", "=", "b.blueprint_name").andOn(
              "ubi.user_id",
              "=",
              knex.raw("?", [user_id]),
            )
          })
          .where("ubi.is_owned", true)
      }

      // ========================================================================
      // Part 3: Get total count for pagination
      // ========================================================================
      const countQuery = blueprintsQuery.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // ========================================================================
      // Part 4: Apply sorting and pagination
      // ========================================================================
      // Default sort: by blueprint name
      blueprintsQuery = blueprintsQuery.orderBy("b.blueprint_name", "asc")

      // Apply pagination
      const offset = (validatedPage - 1) * validatedPageSize
      blueprintsQuery = blueprintsQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const blueprintsResults = await blueprintsQuery

      // ========================================================================
      // Part 5: Get user ownership data (if authenticated)
      // ========================================================================
      let userOwnedBlueprintNames: Set<string> = new Set()

      if (user_id && !user_owned_only) {
        const ownedBlueprints = await knex("user_blueprint_inventory")
          .where("user_id", user_id)
          .where("is_owned", true)
          .whereIn(
            "blueprint_name",
            blueprintsResults.map((b: any) => b.blueprint_name),
          )
          .select("blueprint_name")

        userOwnedBlueprintNames = new Set(ownedBlueprints.map((b: any) => b.blueprint_name))
      }

      logger.info("Blueprints search completed", {
        total,
        returned: blueprintsResults.length,
        page: validatedPage,
      })

      // Transform results
      const blueprintIds = blueprintsResults.map((r: any) => r.blueprint_id)

      // Batch fetch ingredients for all results
      const ingredientRows = blueprintIds.length > 0
        ? await knex("blueprint_ingredients as bi")
            .join("game_items as gi", "bi.ingredient_game_item_id", "gi.id")
            .whereIn("bi.blueprint_id", blueprintIds)
            .select("bi.blueprint_id", "gi.name", "gi.sub_type", "gi.image_url", "bi.quantity_required")
            .orderBy("bi.display_order")
        : []

      const ingredientsByBp = new Map<string, any[]>()
      for (const row of ingredientRows) {
        if (!ingredientsByBp.has(row.blueprint_id)) ingredientsByBp.set(row.blueprint_id, [])
        ingredientsByBp.get(row.blueprint_id)!.push({
          name: row.name,
          sub_type: row.sub_type || undefined,
          icon_url: row.image_url || undefined,
          quantity_required: parseFloat(row.quantity_required) || 0,
        })
      }

      const blueprints: BlueprintSearchResult[] = blueprintsResults.map((row: any) => ({
        blueprint_id: row.blueprint_id,
        blueprint_code: row.blueprint_code,
        blueprint_name: row.blueprint_name,
        output_item_name: row.output_item_name,
        output_item_icon: row.output_item_icon || undefined,
        manufacturer: row.manufacturer || undefined,
        item_category: row.item_category || undefined,
        item_subcategory: row.item_subcategory || undefined,
        rarity: row.rarity || undefined,
        tier: row.tier || undefined,
        source: row.source || undefined,
        ingredient_count: row.ingredient_count || 0,
        ingredients: ingredientsByBp.get(row.blueprint_id) || [],
        mission_count: row.mission_count || 0,
        crafting_time_seconds: row.crafting_time_seconds || undefined,
        modifier_properties: row.modifier_properties || undefined,
        user_owns: user_id
          ? user_owned_only
            ? true
            : userOwnedBlueprintNames.has(row.blueprint_name)
          : undefined,
      }))

      return {
        blueprints,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to search blueprints", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get blueprint detail with ingredients and missions
   *
   * Returns complete blueprint information including all required ingredients
   * with market prices, missions that reward this blueprint, and crafting recipe details.
   *
   * Requirements:
   * - 50.1: List all required ingredients with names
   * - 50.2: Display required quantity for each ingredient
   * - 50.3: Display ingredient quality requirements if applicable
   * - 50.4: Highlight ingredients the player doesn't have
   * - 50.5: Display ingredient icons or images
   * - 50.6: Support clicking ingredients to view details
   * - 50.7: Display total ingredient count
   * - 50.8: Group ingredients by category
   * - 50.9: Display alternative ingredients if substitutions are allowed
   * - 50.10: Calculate total material cost based on market prices
   *
   * @summary Get blueprint details
   * @param blueprint_id Blueprint UUID
   * @param request Express request for optional JWT auth
   * @returns Complete blueprint details with ingredients and missions
   */
  @Get("{blueprint_id}")
  public async getBlueprintDetail(
    @Path() blueprint_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<BlueprintDetailResponse> {
    if (request) this.request = request
    const user_id = this.tryGetUserId()
    const knex = getKnex()

    // Resolve blueprint_id from name
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(blueprint_id || "")
    if (blueprint_id && !isUuid) {
      const row = await knex("blueprints").where("blueprint_name", blueprint_id).first("blueprint_id")
      if (!row) this.throwNotFound("Blueprint", blueprint_id)
      blueprint_id = row.blueprint_id
    }

    if (!blueprint_id) {
      this.throwValidationError("Invalid blueprint_id", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    logger.info("Fetching blueprint detail", { blueprint_id, user_id })

    try {
      // ========================================================================
      // Part 1: Get blueprint data
      // ========================================================================
      const blueprintRow = await knex("blueprints").where("blueprint_id", blueprint_id).first()

      if (!blueprintRow) {
        this.throwNotFound("Blueprint", blueprint_id)
      }

      const blueprint: Blueprint = {
        blueprint_id: blueprintRow.blueprint_id,
        version_id: blueprintRow.version_id,
        blueprint_code: blueprintRow.blueprint_code,
        blueprint_name: blueprintRow.blueprint_name,
        blueprint_description: blueprintRow.blueprint_description || undefined,
        output_game_item_id: blueprintRow.output_game_item_id,
        output_quantity: blueprintRow.output_quantity,
        item_category: blueprintRow.item_category || undefined,
        item_subcategory: blueprintRow.item_subcategory || undefined,
        rarity: blueprintRow.rarity || undefined,
        tier: blueprintRow.tier || undefined,
        crafting_station_type: blueprintRow.crafting_station_type || undefined,
        crafting_time_seconds: blueprintRow.crafting_time_seconds || undefined,
        required_skill_level: blueprintRow.required_skill_level || undefined,
        icon_url: blueprintRow.icon_url || undefined,
        is_active: blueprintRow.is_active || false,
        created_at: blueprintRow.created_at.toISOString(),
        updated_at: blueprintRow.updated_at.toISOString(),
      }

      // ========================================================================
      // Part 2: Get output item data
      // ========================================================================
      const outputItemRow = await knex("game_items")
        .where("id", blueprint.output_game_item_id)
        .first()

      if (!outputItemRow) {
        this.throwNotFound("Output game item", blueprint.output_game_item_id)
      }

      const output_item: GameItem = {
        game_item_id: outputItemRow.id,
        name: outputItemRow.name,
        type: outputItemRow.type || "unknown",
        icon_url: outputItemRow.image_url || undefined,
      }

      // ========================================================================
      // Part 3: Get ingredients with game item data (Requirement 50.1-50.10)
      // ========================================================================
      const ingredientsQuery = await knex("blueprint_ingredients as bi")
        .join("game_items as gi", "bi.ingredient_game_item_id", "gi.id")
        .select(
          "bi.ingredient_id",
          "bi.quantity_required",
          "bi.min_quality_tier",
          "bi.recommended_quality_tier",
          "bi.is_alternative",
          "bi.alternative_group",
          "bi.display_order",
          "gi.id as game_item_id",
          "gi.name as game_item_name",
          "gi.type as game_item_type",
          "gi.sub_type as game_item_sub_type",
          "gi.image_url as game_item_icon",
          "bi.slot_name",
          "bi.slot_display_name",
        )
        .where("bi.blueprint_id", blueprint_id)
        .orderBy("bi.display_order", "asc")
        .orderBy("gi.name", "asc")

      // TODO: Add market price queries when Market V2 integration is complete
      // For now, we'll leave market prices as undefined

      const ingredients: BlueprintIngredient[] = ingredientsQuery.map((row: any) => ({
        ingredient_id: row.ingredient_id,
        game_item: {
          game_item_id: row.game_item_id,
          name: row.game_item_name,
          type: row.game_item_type || "unknown",
          sub_type: row.game_item_sub_type || undefined,
          icon_url: row.game_item_icon || undefined,
        },
        quantity_required: row.quantity_required,
        min_quality_tier: row.min_quality_tier || undefined,
        recommended_quality_tier: row.recommended_quality_tier || undefined,
        is_alternative: row.is_alternative || false,
        alternative_group: row.alternative_group || undefined,
        slot_name: row.slot_name || undefined,
        slot_display_name: row.slot_display_name || undefined,
        market_price_min: undefined,
        market_price_max: undefined,
        user_inventory_quantity: undefined,
      }))

      // Resolve missing ingredient icons from listing photos
      const missingIconIds = ingredients
        .filter(i => !i.game_item.icon_url)
        .map(i => i.game_item.game_item_id)
      if (missingIconIds.length > 0) {
        try {
          const resolved = await resolveGameItemImages(missingIconIds)
          for (const ing of ingredients) {
            if (!ing.game_item.icon_url) {
              const url = resolved.get(ing.game_item.game_item_id)
              if (url) ing.game_item.icon_url = url
            }
          }
        } catch { /* silently ignore — icons are optional */ }
      }

      // ========================================================================
      // Part 4: Get missions that reward this blueprint
      // ========================================================================
      const missionsQuery = await knex("mission_blueprint_rewards as mbr")
        .join("missions as m", "mbr.mission_id", "m.mission_id")
        .select(
          "m.mission_id",
          "m.mission_name",
          "m.star_system",
          "mbr.drop_probability",
        )
        .where("mbr.blueprint_id", blueprint_id)
        .orderBy("mbr.drop_probability", "desc")
        .orderBy("m.mission_name", "asc")

      const missions_rewarding: MissionRewardingBlueprint[] = missionsQuery.map((row: any) => ({
        mission_id: row.mission_id,
        mission_name: row.mission_name,
        drop_probability: parseFloat(row.drop_probability),
        star_system: row.star_system || undefined,
      }))

      // ========================================================================
      // Part 5: Get crafting recipe (if available)
      // ========================================================================
      const recipeRow = await knex("crafting_recipes")
        .where("blueprint_id", blueprint_id)
        .first()

      const crafting_recipe = recipeRow
        ? {
            quality_calculation_type: recipeRow.quality_calculation_type,
            min_output_quality_tier: recipeRow.min_output_quality_tier,
            max_output_quality_tier: recipeRow.max_output_quality_tier,
          }
        : undefined

      // ========================================================================
      // Part 6: Get user-specific data (if user_id provided)
      // ========================================================================
      let user_owns: boolean | undefined
      let user_acquisition: any | undefined

      if (user_id) {
        const inventoryRow = await knex("user_blueprint_inventory")
          .where("user_id", user_id)
          .where("blueprint_name", blueprintRow.blueprint_name)
          .first()

        if (inventoryRow) {
          user_owns = inventoryRow.is_owned || false

          if (inventoryRow.is_owned) {
            user_acquisition = {
              acquisition_date: inventoryRow.acquisition_date
                ? inventoryRow.acquisition_date.toISOString()
                : undefined,
              acquisition_method: inventoryRow.acquisition_method || undefined,
              acquisition_location: inventoryRow.acquisition_location || undefined,
              acquisition_notes: inventoryRow.acquisition_notes || undefined,
            }
          }
        }
      }

      logger.info("Blueprint detail fetched successfully", {
        blueprint_id,
        ingredient_count: ingredients.length,
        mission_count: missions_rewarding.length,
      })

      // Fetch slot modifiers (quality curves per ingredient)
      const slotModifierRows = await knex("blueprint_slot_modifiers")
        .where("blueprint_id", blueprint_id)
        .orderBy("slot_name")
        .orderBy("property")

      // Fetch output item attributes (base stats for Product Stats display)
      const itemAttributeRows = await knex("game_item_attributes")
        .where("game_item_id", blueprint.output_game_item_id)
        .select("attribute_name", "attribute_value")

      const item_attributes: Record<string, string> = {}
      for (const row of itemAttributeRows) {
        item_attributes[row.attribute_name] = row.attribute_value
      }

      const slot_modifiers = slotModifierRows.map((r: any) => ({
        slot_name: r.slot_name,
        slot_display_name: r.slot_display_name || r.slot_name,
        property: r.property,
        start_quality: r.start_quality,
        end_quality: r.end_quality,
        modifier_at_start: parseFloat(r.modifier_at_start),
        modifier_at_end: parseFloat(r.modifier_at_end),
      }))

      return {
        blueprint,
        output_item,
        ingredients,
        missions_rewarding,
        crafting_recipe,
        slot_modifiers,
        item_attributes,
        user_owns,
        user_acquisition,
      }
    } catch (error) {
      logger.error("Failed to fetch blueprint detail", {
        blueprint_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get missions that reward this blueprint
   *
   * Returns all missions that can reward the specified blueprint,
  /**
   * Get blueprint detail by blueprint_code (string identifier)
   * @summary Get blueprint by code
   * @param blueprint_code The blueprint code string
   */
  @Get("by-code/{blueprint_code}")
  public async getBlueprintDetailByCode(
    @Path() blueprint_code: string,
    @Request() request?: ExpressRequest,
  ): Promise<BlueprintDetailResponse> {
    if (request) this.request = request
    const knex = getKnex()
    const row = await knex("blueprints").where("blueprint_code", blueprint_code).first("blueprint_id")
    if (!row) this.throwNotFound("Blueprint", blueprint_code)
    return this.getBlueprintDetail(row.blueprint_id, request)
  }

  /**
   * Get missions that reward a specific blueprint
   *
   * including drop probabilities and mission locations.
   *
   * @summary Get blueprint missions
   * @param blueprint_id Blueprint UUID
   * @param version_id Optional game version ID
   * @returns Array of missions that reward this blueprint
   */
  @Get("{blueprint_id}/missions")
  public async getBlueprintMissions(
    @Path() blueprint_id: string,
    @Query() version_id?: string,
  ): Promise<MissionRewardingBlueprint[]> {
    const knex = getKnex()

    if (!blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    logger.info("Fetching blueprint missions", { blueprint_id, version_id })

    try {
      // Verify blueprint exists
      const blueprintExists = await knex("blueprints")
        .where("blueprint_id", blueprint_id)
        .first()

      if (!blueprintExists) {
        this.throwNotFound("Blueprint", blueprint_id)
      }

      // Build query
      let missionsQuery = knex("mission_blueprint_rewards as mbr")
        .join("missions as m", "mbr.mission_id", "m.mission_id")
        .select(
          "m.mission_id",
          "m.mission_name",
          "m.star_system",
          "mbr.drop_probability",
        )
        .where("mbr.blueprint_id", blueprint_id)

      // Apply version filter if provided
      if (version_id) {
        missionsQuery = missionsQuery.where("m.version_id", version_id)
      }

      // Execute query
      const missionsResults = await missionsQuery
        .orderBy("mbr.drop_probability", "desc")
        .orderBy("m.mission_name", "asc")

      const missions: MissionRewardingBlueprint[] = missionsResults.map((row: any) => ({
        mission_id: row.mission_id,
        mission_name: row.mission_name,
        drop_probability: parseFloat(row.drop_probability),
        star_system: row.star_system || undefined,
      }))

      logger.info("Blueprint missions fetched successfully", {
        blueprint_id,
        mission_count: missions.length,
      })

      return missions
    } catch (error) {
      logger.error("Failed to fetch blueprint missions", {
        blueprint_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  
  /**
   * Add blueprint to user inventory
   *
   * Marks a blueprint as owned by the authenticated user. Records acquisition
   * details including date, method, location, and notes for tracking purposes.
   *
   * Requirements:
   * - 30.1: Allow players to mark blueprints as owned/not owned
   * - 30.2: Display owned blueprint count vs. total available
   * - 30.3: Support filtering blueprints by owned status
   * - 30.4: Display acquisition progress
   * - 44.1: Support Discord OAuth integration for authentication
   * - 44.2: Associate blueprint inventory with Discord user account
   *
   * @summary Add blueprint to inventory
   * @param blueprint_id Blueprint UUID
   * @param body Acquisition details
   * @returns Success response with inventory ID
   */
  @Post("{blueprint_id}/inventory")
  @Security("jwt")
  public async addBlueprintToInventory(
    @Path() blueprint_id: string,
    @Body()
    body: {
      acquisition_method?: string
      acquisition_location?: string
      acquisition_notes?: string
    },
    @Request() request: ExpressRequest,
  ): Promise<{ success: boolean; inventory_id: string }> {
    this.request = request
    this.requireAuth()
    const knex = getKnex()

    if (!blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    // Get user_id from authentication context
    const user_id = this.getUserId()
    logger.info("Adding blueprint to user inventory", { blueprint_id, user_id })

    try {
      // Verify blueprint exists
      const blueprintExists = await knex("blueprints")
        .where("blueprint_id", blueprint_id)
        .first()

      if (!blueprintExists) {
        this.throwNotFound("Blueprint", blueprint_id)
      }

      // Check if user already has this blueprint in inventory (by name for version stability)
      const existingInventory = await knex("user_blueprint_inventory")
        .where("user_id", user_id)
        .where("blueprint_name", blueprintExists.blueprint_name)
        .first()

      let inventory_id: string

      if (existingInventory) {
        // Update existing inventory record
        await knex("user_blueprint_inventory")
          .where("inventory_id", existingInventory.inventory_id)
          .update({
            is_owned: true,
            blueprint_id: blueprint_id, // update to current version's ID
            acquisition_date: knex.fn.now(),
            acquisition_method: body.acquisition_method || null,
            acquisition_location: body.acquisition_location || null,
            acquisition_notes: body.acquisition_notes || null,
            updated_at: knex.fn.now(),
          })

        inventory_id = existingInventory.inventory_id

        logger.info("Updated existing blueprint inventory record", {
          inventory_id,
          blueprint_id,
          user_id,
        })
      } else {
        // Insert new inventory record
        const [inventory] = await knex("user_blueprint_inventory")
          .insert({
            user_id,
            blueprint_id,
            blueprint_name: blueprintExists.blueprint_name,
            is_owned: true,
            acquisition_date: knex.fn.now(),
            acquisition_method: body.acquisition_method || null,
            acquisition_location: body.acquisition_location || null,
            acquisition_notes: body.acquisition_notes || null,
          })
          .returning("inventory_id")

        inventory_id = inventory.inventory_id

        logger.info("Added blueprint to user inventory", {
          inventory_id,
          blueprint_id,
          user_id,
        })
      }

      return {
        success: true,
        inventory_id,
      }
    } catch (error) {
      logger.error("Failed to add blueprint to inventory", {
        blueprint_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Remove blueprint from user inventory
   *
   * Marks a blueprint as not owned by the authenticated user. This allows users
   * to maintain accurate inventory tracking when they lose access to blueprints.
   *
   * Requirements:
   * - 30.1: Allow players to mark blueprints as owned/not owned
   * - 30.3: Support filtering blueprints by owned status
   * - 44.2: Associate blueprint inventory with Discord user account
   *
   * @summary Remove blueprint from inventory
   * @param blueprint_id Blueprint UUID
   * @returns Success response
   */
  @Delete("{blueprint_id}/inventory")
  @Security("jwt")
  public async removeBlueprintFromInventory(
    @Path() blueprint_id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ success: boolean }> {
    this.request = request
    this.requireAuth()
    const knex = getKnex()

    if (!blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    // Get user_id from authentication context
    const user_id = this.getUserId()
    logger.info("Removing blueprint from user inventory", { blueprint_id, user_id })

    try {
      // Verify blueprint exists
      const blueprintExists = await knex("blueprints")
        .where("blueprint_id", blueprint_id)
        .first()

      if (!blueprintExists) {
        this.throwNotFound("Blueprint", blueprint_id)
      }

      // Check if user has this blueprint in inventory (by name for version stability)
      const existingInventory = await knex("user_blueprint_inventory")
        .where("user_id", user_id)
        .where("blueprint_name", blueprintExists.blueprint_name)
        .first()

      if (existingInventory) {
        // Mark as not owned instead of deleting to preserve history
        await knex("user_blueprint_inventory")
          .where("inventory_id", existingInventory.inventory_id)
          .update({
            is_owned: false,
            updated_at: knex.fn.now(),
          })

        logger.info("Marked blueprint as not owned", {
          inventory_id: existingInventory.inventory_id,
          blueprint_id,
          user_id,
        })
      } else {
        // No inventory record exists, nothing to do
        logger.info("No inventory record found for blueprint", {
          blueprint_id,
          user_id,
        })
      }

      return {
        success: true,
      }
    } catch (error) {
      logger.error("Failed to remove blueprint from inventory", {
        blueprint_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get blueprint categories
   *
   * Returns all blueprint categories with item counts, supporting
   * hierarchical category navigation in the blueprint browser.
   *
   * Requirements:
   * - 19.1: Categorize blueprints by item type
   * - 19.2: Support hierarchical categories with subcategories
   * - 19.5: Display item count per category
   *
   * @summary Get categories
   * @param version_id Optional game version ID (defaults to active LIVE version)
   * @returns Array of categories with counts
   */
  @Get("categories")
  public async getBlueprintCategories(
    @Query() version_id?: string,
  ): Promise<BlueprintCategory[]> {
    const knex = getKnex()

    logger.info("Fetching blueprint categories", { version_id })

    try {
      // ========================================================================
      // Get or validate version_id
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
      // Get categories with counts (Requirement 19.5)
      // ========================================================================
      const categoriesQuery = await knex("blueprints")
        .select(
          "item_category as category",
          "item_subcategory as subcategory",
        )
        .count("* as count")
        .where("version_id", effectiveVersionId)
        .where("is_active", true)
        .groupBy("item_category", "item_subcategory")
        .orderBy("item_category", "asc")
        .orderBy("item_subcategory", "asc")

      const categories: BlueprintCategory[] = categoriesQuery.map((row: any) => ({
        category: row.category,
        subcategory: row.subcategory || undefined,
        count: parseInt(String(row.count), 10),
      }))

      logger.info("Blueprint categories fetched successfully", {
        category_count: categories.length,
      })

      return categories
    } catch (error) {
      logger.error("Failed to fetch blueprint categories", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }


  /**
   * Get user's blueprint inventory
   *
   * Returns all blueprints owned by the authenticated user with acquisition details.
   * Supports filtering by category, rarity, and version. Displays acquisition progress
   * and statistics.
   *
   * Requirements:
   * - 30.1: Record which blueprints each player owns
   * - 30.2: Display owned blueprint count vs. total available
   * - 30.3: Display acquisition date for each blueprint
   * - 30.4: Support filtering blueprints by owned status
   * - 30.5: Display acquisition progress
   * - 30.6: Support bulk import of owned blueprints
   * - 44.3: Allow players to mark blueprints as owned/not owned
   * - 44.4: Display owned blueprint count vs. total available
   * - 44.5: Support filtering blueprints by owned status
   * - 44.6: Display acquisition progress
   * - 44.7: Sync blueprint inventory across devices
   * - 44.8: Support bulk import of blueprint lists
   * - 44.9: Display recently acquired blueprints
   * - 44.10: Support blueprint collection goals and achievements
   *
   * @summary Get user inventory
   * @param item_category Filter by item category
   * @param rarity Filter by rarity
   * @param version_id Game version ID (defaults to active LIVE version)
   * @param sort_by Sort field (acquisition_date, blueprint_name)
   * @param sort_order Sort order (asc, desc)
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 50, max: 100)
   * @returns User's blueprint inventory with statistics
   */
  @Get("inventory")
  @Security("jwt")
  public async getUserBlueprintInventory(
    @Query() item_category?: string,
    @Query() rarity?: string,
    @Query() version_id?: string,
    @Query() sort_by: "acquisition_date" | "blueprint_name" = "acquisition_date",
    @Query() sort_order: "asc" | "desc" = "desc",
    @Query() page: number = 1,
    @Query() page_size: number = 50,
  ): Promise<{
    blueprints: Array<{
      blueprint_id: string
      blueprint_name: string
      output_item_name: string
      output_item_icon?: string
      item_category?: string
      rarity?: string
      tier?: number
      acquisition_date: string
      acquisition_method?: string
      acquisition_location?: string
      acquisition_notes?: string
    }>
    statistics: {
      total_owned: number
      total_available: number
      completion_percentage: number
      recently_acquired_count: number
    }
    total: number
    page: number
    page_size: number
  }> {
    const knex = getKnex()

    // Get user_id from authentication context
    const user_id = this.getUserId()

    if (!user_id) {
      this.throwUnauthorized("User must be authenticated to view blueprint inventory")
    }

    // Validate pagination parameters
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 50))

    // Validate sort parameters
    const validSortBy = ["acquisition_date", "blueprint_name"].includes(sort_by)
      ? sort_by
      : "acquisition_date"
    const validSortOrder = ["asc", "desc"].includes(sort_order) ? sort_order : "desc"

    logger.info("Fetching user blueprint inventory", {
      user_id,
      item_category,
      rarity,
      version_id,
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
      // Part 2: Build inventory query with filters
      // ========================================================================
      let inventoryQuery = knex("user_blueprint_inventory as ubi")
        .join("blueprints as b", "ubi.blueprint_id", "b.blueprint_id")
        .join("game_items as gi", "b.output_game_item_id", "gi.id")
        .select(
          "b.blueprint_id",
          "b.blueprint_name",
          "gi.name as output_item_name",
          "gi.image_url as output_item_icon",
          "b.item_category",
          "b.rarity",
          "b.tier",
          "ubi.acquisition_date",
          "ubi.acquisition_method",
          "ubi.acquisition_location",
          "ubi.acquisition_notes",
        )
        .where("ubi.user_id", user_id)
        .where("ubi.is_owned", true)
        .where("b.version_id", effectiveVersionId)
        .where("b.is_active", true)

      // Apply category filter
      if (item_category) {
        inventoryQuery = inventoryQuery.where("b.item_category", item_category)
      }

      // Apply rarity filter
      if (rarity) {
        inventoryQuery = inventoryQuery.where("b.rarity", rarity)
      }

      // ========================================================================
      // Part 3: Get total count for pagination
      // ========================================================================
      const countQuery = inventoryQuery.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // ========================================================================
      // Part 4: Apply sorting and pagination
      // ========================================================================
      if (validSortBy === "acquisition_date") {
        inventoryQuery = inventoryQuery.orderBy("ubi.acquisition_date", validSortOrder)
      } else if (validSortBy === "blueprint_name") {
        inventoryQuery = inventoryQuery.orderBy("b.blueprint_name", validSortOrder)
      }

      // Apply pagination
      const offset = (validatedPage - 1) * validatedPageSize
      inventoryQuery = inventoryQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const inventoryResults = await inventoryQuery

      // ========================================================================
      // Part 5: Calculate statistics (Requirement 30.2, 44.4)
      // ========================================================================
      // Get total owned count
      const [{ count: totalOwnedCount }] = await knex("user_blueprint_inventory")
        .join("blueprints", "user_blueprint_inventory.blueprint_id", "blueprints.blueprint_id")
        .where("user_blueprint_inventory.user_id", user_id)
        .where("user_blueprint_inventory.is_owned", true)
        .where("blueprints.version_id", effectiveVersionId)
        .where("blueprints.is_active", true)
        .count("* as count")

      const total_owned = parseInt(String(totalOwnedCount), 10)

      // Get total available count
      const [{ count: totalAvailableCount }] = await knex("blueprints")
        .where("version_id", effectiveVersionId)
        .where("is_active", true)
        .count("* as count")

      const total_available = parseInt(String(totalAvailableCount), 10)

      // Calculate completion percentage
      const completion_percentage =
        total_available > 0 ? Math.round((total_owned / total_available) * 100) : 0

      // Get recently acquired count (last 7 days) (Requirement 44.9)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const [{ count: recentlyAcquiredCount }] = await knex("user_blueprint_inventory")
        .join("blueprints", "user_blueprint_inventory.blueprint_id", "blueprints.blueprint_id")
        .where("user_blueprint_inventory.user_id", user_id)
        .where("user_blueprint_inventory.is_owned", true)
        .where("blueprints.version_id", effectiveVersionId)
        .where("blueprints.is_active", true)
        .where("user_blueprint_inventory.acquisition_date", ">=", sevenDaysAgo)
        .count("* as count")

      const recently_acquired_count = parseInt(String(recentlyAcquiredCount), 10)

      logger.info("User blueprint inventory fetched successfully", {
        user_id,
        total_owned,
        total_available,
        completion_percentage,
        returned: inventoryResults.length,
      })

      // Transform results
      const blueprints = inventoryResults.map((row: any) => ({
        blueprint_id: row.blueprint_id,
        blueprint_name: row.blueprint_name,
        output_item_name: row.output_item_name,
        output_item_icon: row.output_item_icon || undefined,
        item_category: row.item_category || undefined,
        rarity: row.rarity || undefined,
        tier: row.tier || undefined,
        acquisition_date: row.acquisition_date ? row.acquisition_date.toISOString() : new Date().toISOString(),
        acquisition_method: row.acquisition_method || undefined,
        acquisition_location: row.acquisition_location || undefined,
        acquisition_notes: row.acquisition_notes || undefined,
      }))

      return {
        blueprints,
        statistics: {
          total_owned,
          total_available,
          completion_percentage,
          recently_acquired_count,
        },
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch user blueprint inventory", {
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get org members who own a specific blueprint
   * @param blueprint_id Blueprint UUID
   * @param spectrum_id Org spectrum ID
   */
  @Get("{blueprint_id}/org-owners/{spectrum_id}")
  @Security("jwt")
  public async getOrgBlueprintOwners(
    @Path() blueprint_id: string,
    @Path() spectrum_id: string,
  ): Promise<{ members: { user_id: string; username: string; display_name: string; avatar?: string; acquisition_date?: string }[] }> {
    const knex = getKnex()

    const rows = await knex("user_blueprint_inventory as ubi")
      .join("contractor_members as cm", "ubi.user_id", "cm.user_id")
      .join("contractors as c", "cm.contractor_id", "c.contractor_id")
      .join("accounts as a", "ubi.user_id", "a.user_id")
      .where("ubi.blueprint_id", blueprint_id)
      .where("c.spectrum_id", spectrum_id)
      .where("ubi.is_owned", true)
      .select(
        "a.user_id",
        "a.username",
        "a.display_name",
        "a.avatar",
        "ubi.acquisition_date",
      )
      .orderBy("a.display_name")

    return {
      members: rows.map((r: any) => ({
        user_id: r.user_id,
        username: r.username,
        display_name: r.display_name || r.username,
        avatar: r.avatar || undefined,
        acquisition_date: r.acquisition_date?.toISOString() || undefined,
      })),
    }
  }

  /**
   * Find blueprints craftable with given materials.
   * Returns blueprints where all ingredients are satisfied, with max craftable count.
   * @summary Find craftable blueprints
   */
  @Post("craftable")
  public async findCraftableBlueprints(
    @Body() body: { materials: Array<{ game_item_id: string; quantity_scu: number; quality_value?: number }> },
  ): Promise<CraftableBlueprintResult[]> {
    const knex = getKnex()

    if (!body.materials?.length) return []

    // Build a map of available materials
    const available = new Map<string, { qty: number; quality: number }>()
    for (const m of body.materials) {
      available.set(m.game_item_id, { qty: m.quantity_scu, quality: m.quality_value ?? 500 })
    }

    // Get the active version
    const version = await knex("game_versions").where("is_active", true).first("version_id")
    if (!version) return []

    // Find all blueprints with their ingredients
    const blueprints = await knex("blueprints as b")
      .join("game_items as gi", "b.output_game_item_id", "gi.id")
      .where("b.version_id", version.version_id)
      .where("b.is_active", true)
      .select("b.blueprint_id", "b.blueprint_code", "b.blueprint_name", "b.crafting_time_seconds",
        "gi.name as output_item_name", "gi.image_url as output_item_icon", "b.item_category")

    const results: CraftableBlueprintResult[] = []

    for (const bp of blueprints) {
      const ingredients = await knex("blueprint_ingredients as bi")
        .join("game_items as ig", "bi.game_item_id", "ig.id")
        .where("bi.blueprint_id", bp.blueprint_id)
        .select("bi.game_item_id", "ig.name", "bi.quantity_required")

      if (!ingredients.length) continue

      // Check if all ingredients are available and compute max craftable
      let maxCraftable = Infinity
      let allAvailable = true

      for (const ing of ingredients) {
        const mat = available.get(ing.game_item_id)
        if (!mat || mat.qty <= 0) { allAvailable = false; break }
        const qty = parseFloat(ing.quantity_required)
        if (qty > 0) maxCraftable = Math.min(maxCraftable, Math.floor(mat.qty / qty))
      }

      if (!allAvailable || maxCraftable <= 0) continue

      results.push({
        blueprint_id: bp.blueprint_id,
        blueprint_code: bp.blueprint_code,
        blueprint_name: bp.blueprint_name,
        output_item_name: bp.output_item_name,
        output_item_icon: bp.output_item_icon || undefined,
        item_category: bp.item_category || undefined,
        crafting_time_seconds: bp.crafting_time_seconds || undefined,
        max_craftable: maxCraftable === Infinity ? 0 : maxCraftable,
        ingredients: ingredients.map(ing => ({
          game_item_id: ing.game_item_id,
          name: ing.name,
          quantity_required: parseFloat(ing.quantity_required),
          available_quantity: available.get(ing.game_item_id)?.qty || 0,
          quality_value: available.get(ing.game_item_id)?.quality,
        })),
      })
    }

    // Sort by max craftable descending
    results.sort((a, b) => b.max_craftable - a.max_craftable)
    return results
  }
}
