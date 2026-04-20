/**
 * Blueprints V2 Controller
 *
 * TSOA controller for blueprint endpoints in the Game Data system.
 * Handles blueprint search, detail retrieval, mission queries, categories, and inventory management.
 *
 * Requirements: 19.1-19.6, 30.1-30.6, 43.1-43.10, 44.1-44.10, 50.1-50.10
 */

import { Controller, Get, Post, Delete, Route, Tags, Query, Path, Body, Security } from "tsoa"
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
} from "./blueprints.types.js"
import logger from "../../../../../logger/logger.js"

@Route("api/v2/game-data/blueprints")
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
    @Query() version_id?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<SearchBlueprintsResponse> {
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
          "b.blueprint_name",
          "gi.name as output_item_name",
          "gi.image_url as output_item_icon",
          "b.item_category",
          "b.rarity",
          "b.tier",
          "b.crafting_time_seconds",
          knex.raw("COALESCE(ingredient_counts.ingredient_count, 0)::integer as ingredient_count"),
          knex.raw("COALESCE(mission_counts.mission_count, 0)::integer as mission_count"),
        )
        .where("b.version_id", effectiveVersionId)
        .where("b.is_active", true)

      // Apply text search filter (Requirement 19.4: support filtering by category in searches)
      if (text && text.length > 0) {
        blueprintsQuery = blueprintsQuery.where(function () {
          this.whereRaw(
            "to_tsvector('english', b.blueprint_name) @@ plainto_tsquery('english', ?)",
            [text],
          ).orWhere("b.blueprint_name", "ilike", `%${text}%`)
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

      // Apply user ownership filter (if user_owned_only is true)
      // Note: This requires user_id from authentication context
      if (user_owned_only) {
        const user_id = (this as any).user?.user_id

        if (!user_id) {
          this.throwUnauthorized("User must be authenticated to filter by ownership")
        }

        blueprintsQuery = blueprintsQuery
          .join("user_blueprint_inventory as ubi", function () {
            this.on("ubi.blueprint_id", "=", "b.blueprint_id").andOn(
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
      const user_id = (this as any).user?.user_id
      let userOwnedBlueprintIds: Set<string> = new Set()

      if (user_id && !user_owned_only) {
        const ownedBlueprints = await knex("user_blueprint_inventory")
          .where("user_id", user_id)
          .where("is_owned", true)
          .whereIn(
            "blueprint_id",
            blueprintsResults.map((b: any) => b.blueprint_id),
          )
          .select("blueprint_id")

        userOwnedBlueprintIds = new Set(ownedBlueprints.map((b: any) => b.blueprint_id))
      }

      logger.info("Blueprints search completed", {
        total,
        returned: blueprintsResults.length,
        page: validatedPage,
      })

      // Transform results
      const blueprints: BlueprintSearchResult[] = blueprintsResults.map((row: any) => ({
        blueprint_id: row.blueprint_id,
        blueprint_name: row.blueprint_name,
        output_item_name: row.output_item_name,
        output_item_icon: row.output_item_icon || undefined,
        item_category: row.item_category || undefined,
        rarity: row.rarity || undefined,
        tier: row.tier || undefined,
        ingredient_count: row.ingredient_count || 0,
        mission_count: row.mission_count || 0,
        crafting_time_seconds: row.crafting_time_seconds || undefined,
        user_owns: user_id
          ? user_owned_only
            ? true
            : userOwnedBlueprintIds.has(row.blueprint_id)
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
   * @param user_id Optional user ID for user-specific data
   * @returns Complete blueprint details with ingredients and missions
   */
  @Get("{blueprint_id}")
  public async getBlueprintDetail(
    @Path() blueprint_id: string,
    @Query() user_id?: string,
  ): Promise<BlueprintDetailResponse> {
    const knex = getKnex()

    if (!blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
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
          "gi.image_url as game_item_icon",
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
          icon_url: row.game_item_icon || undefined,
        },
        quantity_required: row.quantity_required,
        min_quality_tier: row.min_quality_tier || undefined,
        recommended_quality_tier: row.recommended_quality_tier || undefined,
        is_alternative: row.is_alternative || false,
        alternative_group: row.alternative_group || undefined,
        market_price_min: undefined, // TODO: Implement market price lookup
        market_price_max: undefined, // TODO: Implement market price lookup
        user_inventory_quantity: undefined, // TODO: Implement user inventory lookup
      }))

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
          .where("blueprint_id", blueprint_id)
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

      return {
        blueprint,
        output_item,
        ingredients,
        missions_rewarding,
        crafting_recipe,
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
  @Security("discord_oauth")
  public async addBlueprintToInventory(
    @Path() blueprint_id: string,
    @Body()
    body: {
      acquisition_method?: string
      acquisition_location?: string
      acquisition_notes?: string
    },
  ): Promise<{ success: boolean; inventory_id: string }> {
    const knex = getKnex()

    if (!blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    // Get user_id from authentication context
    const user_id = (this as any).user?.user_id

    if (!user_id) {
      this.throwUnauthorized("User must be authenticated to manage blueprint inventory")
    }

    logger.info("Adding blueprint to user inventory", { blueprint_id, user_id })

    try {
      // Verify blueprint exists
      const blueprintExists = await knex("blueprints")
        .where("blueprint_id", blueprint_id)
        .first()

      if (!blueprintExists) {
        this.throwNotFound("Blueprint", blueprint_id)
      }

      // Check if user already has this blueprint in inventory
      const existingInventory = await knex("user_blueprint_inventory")
        .where("user_id", user_id)
        .where("blueprint_id", blueprint_id)
        .first()

      let inventory_id: string

      if (existingInventory) {
        // Update existing inventory record
        await knex("user_blueprint_inventory")
          .where("inventory_id", existingInventory.inventory_id)
          .update({
            is_owned: true,
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
  @Security("discord_oauth")
  public async removeBlueprintFromInventory(
    @Path() blueprint_id: string,
  ): Promise<{ success: boolean }> {
    const knex = getKnex()

    if (!blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    // Get user_id from authentication context
    const user_id = (this as any).user?.user_id

    if (!user_id) {
      this.throwUnauthorized("User must be authenticated to manage blueprint inventory")
    }

    logger.info("Removing blueprint from user inventory", { blueprint_id, user_id })

    try {
      // Verify blueprint exists
      const blueprintExists = await knex("blueprints")
        .where("blueprint_id", blueprint_id)
        .first()

      if (!blueprintExists) {
        this.throwNotFound("Blueprint", blueprint_id)
      }

      // Check if user has this blueprint in inventory
      const existingInventory = await knex("user_blueprint_inventory")
        .where("user_id", user_id)
        .where("blueprint_id", blueprint_id)
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
  @Security("discord_oauth")
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
    const user_id = (this as any).user?.user_id

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
}
