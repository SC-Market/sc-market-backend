/**
 * Resources V2 Controller
 *
 * TSOA controller for resource endpoints in the Game Data system.
 * Handles resource search, detail retrieval, and category queries.
 *
 * Requirements: 44.1-44.10
 */

import { Controller, Get, Route, Tags, Query, Path } from "tsoa"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  SearchResourcesRequest,
  SearchResourcesResponse,
  ResourceSearchResult,
  ResourceDetailResponse,
  Resource,
  BlueprintRequiringResource,
  ResourceCategory,
  MiningLocation,
  PurchaseLocation,
} from "./resources.types.js"
import logger from "../../../../../logger/logger.js"

@Route("game-data/resources")
@Tags("Game Data - Resources")
export class ResourcesController extends BaseController {
  /**
   * Search resources with filters
   *
   * Supports filtering by category, subcategory, and acquisition method.
   * Includes full-text search on resource names and displays blueprint counts.
   *
   * Requirements:
   * - 44.1: Maintain a database of all craftable resources (178+ resources)
   * - 44.2: Categorize resources by type (Metals, Gases, Minerals, Components, etc.)
   * - 44.3: Display resource properties (quality tiers, stack sizes, etc.)
   * - 44.4: Support filtering resources by category
   * - 44.5: Display which blueprints require each resource
   * - 44.6: Display where resources can be obtained (mining, purchase, salvage)
   * - 44.7: Support resource search by name or properties
   *
   * @summary Search resources
   * @param text Full-text search on resource name
   * @param resource_category Filter by resource category
   * @param resource_subcategory Filter by resource subcategory
   * @param acquisition_method Filter by acquisition method
   * @param version_id Game version ID (defaults to active LIVE version)
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Resource search results with pagination
   */
  @Get("search")
  public async searchResources(
    @Query() text?: string,
    @Query() resource_category?: string,
    @Query() resource_subcategory?: string,
    @Query() acquisition_method?: "mined" | "purchased" | "salvaged" | "looted",
    @Query() version_id?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<SearchResourcesResponse> {
    const knex = getKnex()

    // Validate pagination parameters
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    logger.info("Searching resources", {
      text,
      resource_category,
      resource_subcategory,
      acquisition_method,
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
      // Part 2: Build resource search query with filters
      // ========================================================================
      let resourcesQuery = knex("resources as r")
        .join("game_items as gi", "r.game_item_id", "gi.id")
        .leftJoin(
          knex("blueprint_ingredients")
            .select("ingredient_game_item_id")
            .countDistinct("blueprint_id as blueprint_count")
            .groupBy("ingredient_game_item_id")
            .as("blueprint_counts"),
          "r.game_item_id",
          "blueprint_counts.ingredient_game_item_id",
        )
        .select(
          "r.resource_id",
          "r.game_item_id",
          "gi.name as resource_name",
          "gi.image_url as resource_icon",
          "r.resource_category",
          "r.resource_subcategory",
          "r.max_stack_size",
          "r.base_value",
          "r.can_be_mined",
          "r.can_be_purchased",
          "r.can_be_salvaged",
          "r.can_be_looted",
          knex.raw("COALESCE(blueprint_counts.blueprint_count, 0)::integer as blueprint_count"),
        )
        .where("r.version_id", effectiveVersionId)

      // Apply text search filter (Requirement 44.7: support resource search by name)
      if (text && text.length > 0) {
        resourcesQuery = resourcesQuery.where(function () {
          this.whereRaw(
            "to_tsvector('english', gi.name) @@ plainto_tsquery('english', ?)",
            [text],
          ).orWhere("gi.name", "ilike", `%${text}%`)
        })
      }

      // Apply category filter (Requirement 44.4: support filtering by category)
      if (resource_category) {
        resourcesQuery = resourcesQuery.where("r.resource_category", resource_category)
      }

      // Apply subcategory filter
      if (resource_subcategory) {
        resourcesQuery = resourcesQuery.where("r.resource_subcategory", resource_subcategory)
      }

      // Apply acquisition method filter (Requirement 44.6: display where resources can be obtained)
      if (acquisition_method) {
        switch (acquisition_method) {
          case "mined":
            resourcesQuery = resourcesQuery.where("r.can_be_mined", true)
            break
          case "purchased":
            resourcesQuery = resourcesQuery.where("r.can_be_purchased", true)
            break
          case "salvaged":
            resourcesQuery = resourcesQuery.where("r.can_be_salvaged", true)
            break
          case "looted":
            resourcesQuery = resourcesQuery.where("r.can_be_looted", true)
            break
        }
      }

      // ========================================================================
      // Part 3: Get total count for pagination
      // ========================================================================
      const countQuery = resourcesQuery.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // ========================================================================
      // Part 4: Apply sorting and pagination
      // ========================================================================
      // Default sort: by resource name
      resourcesQuery = resourcesQuery.orderBy("gi.name", "asc")

      // Apply pagination
      const offset = (validatedPage - 1) * validatedPageSize
      resourcesQuery = resourcesQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const resourcesResults = await resourcesQuery

      logger.info("Resources search completed", {
        total,
        returned: resourcesResults.length,
        page: validatedPage,
      })

      // Transform results
      const resources: ResourceSearchResult[] = resourcesResults.map((row: any) => ({
        resource_id: row.resource_id,
        game_item_id: row.game_item_id,
        resource_name: row.resource_name,
        resource_icon: row.resource_icon || undefined,
        resource_category: row.resource_category,
        resource_subcategory: row.resource_subcategory || undefined,
        max_stack_size: row.max_stack_size || undefined,
        base_value: row.base_value || undefined,
        can_be_mined: row.can_be_mined || false,
        can_be_purchased: row.can_be_purchased || false,
        can_be_salvaged: row.can_be_salvaged || false,
        can_be_looted: row.can_be_looted || false,
        blueprint_count: row.blueprint_count || 0,
      }))

      return {
        resources,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to search resources", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get resource detail with blueprints and locations
   *
   * Returns complete resource information including all blueprints that require
   * this resource, mining/purchase locations, and market price data.
   *
   * Requirements:
   * - 44.3: Display resource properties (quality tiers, stack sizes, etc.)
   * - 44.5: Display which blueprints require each resource
   * - 44.6: Display where resources can be obtained (mining, purchase, salvage)
   * - 44.8: Display resource market prices and availability
   *
   * @summary Get resource details
   * @param resource_id Resource UUID
   * @returns Complete resource details with blueprints and locations
   */
  @Get("{resource_id}")
  public async getResource(
    @Path() resource_id: string,
  ): Promise<ResourceDetailResponse> {
    const knex = getKnex()

    if (!resource_id) {
      this.throwValidationError("resource_id is required", [
        { field: "resource_id", message: "Resource ID is required" },
      ])
    }

    logger.info("Fetching resource detail", { resource_id })

    try {
      // ========================================================================
      // Part 1: Get resource data
      // ========================================================================
      const resourceRow = await knex("resources as r")
        .join("game_items as gi", "r.game_item_id", "gi.id")
        .select(
          "r.resource_id",
          "r.version_id",
          "r.game_item_id",
          "gi.name as resource_name",
          "gi.image_url as resource_icon",
          "r.resource_category",
          "r.resource_subcategory",
          "r.max_stack_size",
          "r.base_value",
          "r.can_be_mined",
          "r.can_be_purchased",
          "r.can_be_salvaged",
          "r.can_be_looted",
          "r.mining_locations",
          "r.purchase_locations",
          "r.created_at",
          "r.updated_at",
        )
        .where("r.resource_id", resource_id)
        .first()

      if (!resourceRow) {
        this.throwNotFound("Resource", resource_id)
      }

      const resource: Resource = {
        resource_id: resourceRow.resource_id,
        version_id: resourceRow.version_id,
        game_item_id: resourceRow.game_item_id,
        resource_name: resourceRow.resource_name,
        resource_icon: resourceRow.resource_icon || undefined,
        resource_category: resourceRow.resource_category,
        resource_subcategory: resourceRow.resource_subcategory || undefined,
        max_stack_size: resourceRow.max_stack_size || undefined,
        base_value: resourceRow.base_value || undefined,
        can_be_mined: resourceRow.can_be_mined || false,
        can_be_purchased: resourceRow.can_be_purchased || false,
        can_be_salvaged: resourceRow.can_be_salvaged || false,
        can_be_looted: resourceRow.can_be_looted || false,
        mining_locations: resourceRow.mining_locations as MiningLocation[] | undefined,
        purchase_locations: resourceRow.purchase_locations as PurchaseLocation[] | undefined,
        created_at: resourceRow.created_at.toISOString(),
        updated_at: resourceRow.updated_at.toISOString(),
      }

      // ========================================================================
      // Part 2: Get blueprints that require this resource (Requirement 44.5)
      // ========================================================================
      const blueprintsQuery = await knex("blueprint_ingredients as bi")
        .join("blueprints as b", "bi.blueprint_id", "b.blueprint_id")
        .join("game_items as gi", "b.output_game_item_id", "gi.id")
        .select(
          "b.blueprint_id",
          "b.blueprint_name",
          "gi.name as output_item_name",
          "gi.image_url as output_item_icon",
          "bi.quantity_required",
          "bi.min_quality_tier",
          "bi.recommended_quality_tier",
        )
        .where("bi.ingredient_game_item_id", resource.game_item_id)
        .where("b.is_active", true)
        .orderBy("b.blueprint_name", "asc")

      const blueprints_requiring: BlueprintRequiringResource[] = blueprintsQuery.map((row: any) => ({
        blueprint_id: row.blueprint_id,
        blueprint_name: row.blueprint_name,
        output_item_name: row.output_item_name,
        output_item_icon: row.output_item_icon || undefined,
        quantity_required: row.quantity_required,
        min_quality_tier: row.min_quality_tier || undefined,
        recommended_quality_tier: row.recommended_quality_tier || undefined,
      }))

      // ========================================================================
      // Part 3: Get market price data (if available) (Requirement 44.8)
      // ========================================================================
      // TODO: Implement market price lookup when Market V2 integration is complete
      // For now, we'll leave market prices as undefined

      logger.info("Resource detail fetched successfully", {
        resource_id,
        blueprint_count: blueprints_requiring.length,
      })

      return {
        resource,
        blueprints_requiring,
        market_price: undefined, // TODO: Implement market price lookup
      }
    } catch (error) {
      logger.error("Failed to fetch resource detail", {
        resource_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get resource categories
   *
   * Returns all resource categories with item counts, supporting
   * hierarchical category navigation in the resource browser.
   *
   * Requirements:
   * - 44.2: Categorize resources by type (Metals, Gases, Minerals, Components, etc.)
   * - 44.4: Support filtering resources by category
   *
   * @summary Get categories
   * @param version_id Optional game version ID (defaults to active LIVE version)
   * @returns Array of categories with counts
   */
  @Get("categories")
  public async getResourceCategories(
    @Query() version_id?: string,
  ): Promise<ResourceCategory[]> {
    const knex = getKnex()

    logger.info("Fetching resource categories", { version_id })

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
      // Get categories with counts (Requirement 44.2)
      // ========================================================================
      const categoriesQuery = await knex("resources")
        .select(
          "resource_category as category",
          "resource_subcategory as subcategory",
        )
        .count("* as count")
        .where("version_id", effectiveVersionId)
        .groupBy("resource_category", "resource_subcategory")
        .orderBy("resource_category", "asc")
        .orderBy("resource_subcategory", "asc")

      const categories: ResourceCategory[] = categoriesQuery.map((row: any) => ({
        category: row.category,
        subcategory: row.subcategory || undefined,
        count: parseInt(String(row.count), 10),
      }))

      logger.info("Resource categories fetched successfully", {
        category_count: categories.length,
      })

      return categories
    } catch (error) {
      logger.error("Failed to fetch resource categories", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
