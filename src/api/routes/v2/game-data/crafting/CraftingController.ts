/**
 * Crafting V2 Controller
 *
 * TSOA controller for crafting endpoints in the Game Data system.
 * Handles quality calculations, crafting simulations, and crafting history tracking.
 *
 * Requirements: 20.1-20.6, 21.1-21.6, 31.1-31.6, 45.1-45.10, 51.1-51.10, 52.1-52.10
 */

import { Controller, Get, Post, Route, Tags, Query, Path, Body, Security } from "tsoa"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  CalculateQualityRequest,
  CalculateQualityResponse,
  SimulateCraftingRequest,
  SimulateCraftingResponse,
  RecordCraftingRequest,
  RecordCraftingResponse,
  GetCraftingHistoryResponse,
  GetCraftingStatisticsResponse,
  CraftingInputMaterial,
  SimulationResult,
  QualityContribution,
  CraftingSessionHistory,
  BlueprintStatistics,
} from "./crafting.types.js"
import logger from "../../../../../logger/logger.js"

@Route("api/v2/game-data/crafting")
@Tags("Game Data - Crafting")
export class CraftingController extends BaseController {
  /**
   * Calculate output quality from ingredients
   *
   * Computes the expected output quality based on input material qualities
   * using the blueprint's quality calculation formula (weighted_average, minimum, or maximum).
   *
   * Requirements:
   * - 20.1: Support weighted_average calculation type
   * - 20.2: Support minimum calculation type
   * - 20.3: Support maximum calculation type
   * - 20.4: Validate input materials match blueprint requirements
   * - 20.5: Return quality tier and quality value
   * - 20.6: Include calculation breakdown
   * - 51.1-51.10: Quality calculation display requirements
   *
   * @summary Calculate output quality
   * @param request Crafting calculation request with blueprint and materials
   * @returns Quality calculation result with breakdown
   */
  @Post("calculate-quality")
  public async calculateQuality(
    @Body() request: CalculateQualityRequest,
  ): Promise<CalculateQualityResponse> {
    const knex = getKnex()

    if (!request.blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    if (!request.input_materials || request.input_materials.length === 0) {
      this.throwValidationError("input_materials is required", [
        { field: "input_materials", message: "At least one input material is required" },
      ])
    }

    logger.info("Calculating crafting quality", {
      blueprint_id: request.blueprint_id,
      material_count: request.input_materials.length,
    })

    try {
      // ========================================================================
      // Part 1: Get blueprint and recipe data
      // ========================================================================
      const blueprint = await knex("blueprints")
        .where("blueprint_id", request.blueprint_id)
        .first()

      if (!blueprint) {
        this.throwNotFound("Blueprint", request.blueprint_id)
      }

      const recipe = await knex("crafting_recipes")
        .where("blueprint_id", request.blueprint_id)
        .first()

      if (!recipe) {
        this.throwNotFound("Crafting recipe for blueprint", request.blueprint_id)
      }

      // ========================================================================
      // Part 2: Get required ingredients and validate
      // ========================================================================
      const requiredIngredients = await knex("blueprint_ingredients")
        .where("blueprint_id", request.blueprint_id)
        .select("ingredient_game_item_id", "quantity_required")

      // Validate that all required ingredients are provided (Requirement 20.4)
      const providedItemIds = new Set(request.input_materials.map((m) => m.game_item_id))
      const requiredItemIds = new Set(requiredIngredients.map((i) => i.ingredient_game_item_id))

      for (const requiredId of requiredItemIds) {
        if (!providedItemIds.has(requiredId)) {
          this.throwValidationError("Missing required ingredient", [
            { field: "input_materials", message: `Missing ingredient: ${requiredId}` },
          ])
        }
      }

      // Validate quantities
      for (const required of requiredIngredients) {
        const provided = request.input_materials.find(
          (m) => m.game_item_id === required.ingredient_game_item_id,
        )
        if (provided && provided.quantity < required.quantity_required) {
          this.throwValidationError("Insufficient ingredient quantity", [
            {
              field: "input_materials",
              message: `Insufficient quantity for ${required.ingredient_game_item_id}: need ${required.quantity_required}, got ${provided.quantity}`,
            },
          ])
        }
      }

      // ========================================================================
      // Part 3: Get material names for display
      // ========================================================================
      const materialNames = await knex("game_items")
        .whereIn(
          "id",
          request.input_materials.map((m) => m.game_item_id),
        )
        .select("id", "name")

      const nameMap = new Map(materialNames.map((m: any) => [m.id, m.name]))

      // ========================================================================
      // Part 4: Calculate output quality based on formula type
      // ========================================================================
      const calculationType = recipe.quality_calculation_type || "weighted_average"
      let outputQualityValue: number
      let inputWeights: Record<string, number> = {}
      const qualityContributions: QualityContribution[] = []

      // Requirements 20.1, 20.2, 20.3: Support different calculation types
      if (calculationType === "weighted_average") {
        // Weighted average: each material contributes based on quantity
        const totalQuantity = request.input_materials.reduce((sum, m) => sum + m.quantity, 0)

        for (const material of request.input_materials) {
          const weight = material.quantity / totalQuantity
          inputWeights[material.game_item_id] = weight

          qualityContributions.push({
            material_name: nameMap.get(material.game_item_id) || material.game_item_id,
            quality_tier: material.quality_tier,
            quality_value: material.quality_value,
            weight,
            contribution: material.quality_value * weight,
          })
        }

        outputQualityValue = qualityContributions.reduce((sum, c) => sum + c.contribution, 0)
      } else if (calculationType === "minimum") {
        // Minimum: output quality is the lowest input quality
        const minMaterial = request.input_materials.reduce((min, m) =>
          m.quality_value < min.quality_value ? m : min,
        )

        outputQualityValue = minMaterial.quality_value

        for (const material of request.input_materials) {
          const weight = material.game_item_id === minMaterial.game_item_id ? 1 : 0
          inputWeights[material.game_item_id] = weight

          qualityContributions.push({
            material_name: nameMap.get(material.game_item_id) || material.game_item_id,
            quality_tier: material.quality_tier,
            quality_value: material.quality_value,
            weight,
            contribution: weight * material.quality_value,
          })
        }
      } else if (calculationType === "maximum") {
        // Maximum: output quality is the highest input quality
        const maxMaterial = request.input_materials.reduce((max, m) =>
          m.quality_value > max.quality_value ? m : max,
        )

        outputQualityValue = maxMaterial.quality_value

        for (const material of request.input_materials) {
          const weight = material.game_item_id === maxMaterial.game_item_id ? 1 : 0
          inputWeights[material.game_item_id] = weight

          qualityContributions.push({
            material_name: nameMap.get(material.game_item_id) || material.game_item_id,
            quality_tier: material.quality_tier,
            quality_value: material.quality_value,
            weight,
            contribution: weight * material.quality_value,
          })
        }
      } else {
        this.throwValidationError("Invalid quality calculation type", [
          {
            field: "quality_calculation_type",
            message: `Unsupported calculation type: ${calculationType}`,
          },
        ])
      }

      // Convert quality value to tier (Requirement 20.5)
      const outputQualityTier = this.qualityValueToTier(outputQualityValue)

      // ========================================================================
      // Part 5: Calculate estimated costs
      // ========================================================================
      // TODO: Implement market price lookup when Market V2 integration is complete
      const materialCost = 0
      const craftingStationFee = 0
      const totalCost = materialCost + craftingStationFee

      // ========================================================================
      // Part 6: Get success probabilities from recipe
      // ========================================================================
      const successProbability = recipe.base_success_rate || 100.0
      const criticalSuccessChance = recipe.critical_success_chance || 0.0

      logger.info("Quality calculation completed", {
        blueprint_id: request.blueprint_id,
        output_quality_tier: outputQualityTier,
        output_quality_value: outputQualityValue,
        calculation_type: calculationType,
      })

      // Requirement 20.6: Include calculation breakdown
      return {
        output_quality_tier: outputQualityTier,
        output_quality_value: parseFloat(outputQualityValue.toFixed(2)),
        output_quantity: blueprint.output_quantity || 1,
        calculation_breakdown: {
          formula_used: calculationType,
          input_weights: inputWeights,
          quality_contributions: qualityContributions,
        },
        estimated_cost: {
          material_cost: materialCost,
          crafting_station_fee: craftingStationFee > 0 ? craftingStationFee : undefined,
          total_cost: totalCost,
        },
        success_probability: parseFloat(successProbability),
        critical_success_chance: parseFloat(criticalSuccessChance),
      }
    } catch (error) {
      logger.error("Failed to calculate crafting quality", {
        blueprint_id: request.blueprint_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Simulate crafting with ingredient variations
   *
   * Tests different combinations of ingredient qualities to show how
   * output quality varies. Useful for planning optimal material selection.
   *
   * Requirements:
   * - 21.1: Support testing multiple quality tier combinations
   * - 21.2: Return all simulation results
   * - 21.3: Identify best result (highest quality)
   * - 21.4: Identify worst result (lowest quality)
   * - 21.5: Identify most cost-effective result
   * - 21.6: Include material configuration for each result
   * - 52.1-52.10: Crafting simulation requirements
   *
   * @summary Simulate crafting variations
   * @param request Simulation request with material variations
   * @returns Simulation results with best/worst/cost-effective options
   */
  @Post("simulate")
  public async simulateCrafting(
    @Body() request: SimulateCraftingRequest,
  ): Promise<SimulateCraftingResponse> {
    const knex = getKnex()

    if (!request.blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    if (!request.material_variations || request.material_variations.length === 0) {
      this.throwValidationError("material_variations is required", [
        { field: "material_variations", message: "At least one material variation is required" },
      ])
    }

    logger.info("Simulating crafting variations", {
      blueprint_id: request.blueprint_id,
      variation_count: request.material_variations.length,
    })

    try {
      // ========================================================================
      // Part 1: Get blueprint data
      // ========================================================================
      const blueprint = await knex("blueprints")
        .where("blueprint_id", request.blueprint_id)
        .first()

      if (!blueprint) {
        this.throwNotFound("Blueprint", request.blueprint_id)
      }

      // ========================================================================
      // Part 2: Generate all combinations (Requirement 21.1)
      // ========================================================================
      const combinations = this.generateQualityCombinations(request.material_variations)

      // ========================================================================
      // Part 3: Calculate quality for each combination (Requirement 21.2)
      // ========================================================================
      const simulationResults: SimulationResult[] = []

      for (const combination of combinations) {
        const calcResult = await this.calculateQuality({
          blueprint_id: request.blueprint_id,
          input_materials: combination,
        })

        simulationResults.push({
          material_configuration: combination,
          output_quality_tier: calcResult.output_quality_tier,
          output_quality_value: calcResult.output_quality_value,
          estimated_cost: calcResult.estimated_cost.total_cost,
        })
      }

      // ========================================================================
      // Part 4: Identify best, worst, and most cost-effective results
      // ========================================================================
      // Requirement 21.3: Best result (highest quality)
      const bestResult = simulationResults.reduce((best, current) =>
        current.output_quality_value > best.output_quality_value ? current : best,
      )

      // Requirement 21.4: Worst result (lowest quality)
      const worstResult = simulationResults.reduce((worst, current) =>
        current.output_quality_value < worst.output_quality_value ? current : worst,
      )

      // Requirement 21.5: Most cost-effective (best quality per cost)
      const mostCostEffective = simulationResults.reduce((best, current) => {
        const currentRatio =
          current.estimated_cost > 0 ? current.output_quality_value / current.estimated_cost : current.output_quality_value
        const bestRatio =
          best.estimated_cost > 0 ? best.output_quality_value / best.estimated_cost : best.output_quality_value
        return currentRatio > bestRatio ? current : best
      })

      logger.info("Crafting simulation completed", {
        blueprint_id: request.blueprint_id,
        total_combinations: simulationResults.length,
        best_quality: bestResult.output_quality_value,
        worst_quality: worstResult.output_quality_value,
      })

      return {
        blueprint_id: request.blueprint_id,
        blueprint_name: blueprint.blueprint_name,
        simulation_results: simulationResults,
        best_result: bestResult,
        worst_result: worstResult,
        most_cost_effective: mostCostEffective,
      }
    } catch (error) {
      logger.error("Failed to simulate crafting", {
        blueprint_id: request.blueprint_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Record crafting session
   *
   * Saves a completed crafting session to the user's history for tracking
   * and statistics. Requires authentication.
   *
   * Requirements:
   * - 31.1: Record blueprint used
   * - 31.2: Record input materials with qualities
   * - 31.3: Record output quality achieved
   * - 31.4: Record success/critical success status
   * - 31.5: Record costs
   * - 31.6: Associate with user account
   *
   * @summary Record crafting session
   * @param request Crafting session data
   * @returns Success response with session ID
   */
  @Post("craft")
  @Security("discord_oauth")
  public async recordCrafting(
    @Body() request: RecordCraftingRequest,
  ): Promise<RecordCraftingResponse> {
    const knex = getKnex()

    // Get authenticated user
    const user_id = this.getUserId()

    if (!request.blueprint_id) {
      this.throwValidationError("blueprint_id is required", [
        { field: "blueprint_id", message: "Blueprint ID is required" },
      ])
    }

    logger.info("Recording crafting session", {
      blueprint_id: request.blueprint_id,
      user_id,
    })

    try {
      // Verify blueprint exists
      const blueprint = await knex("blueprints")
        .where("blueprint_id", request.blueprint_id)
        .first()

      if (!blueprint) {
        this.throwNotFound("Blueprint", request.blueprint_id)
      }

      // Insert crafting session (Requirements 31.1-31.6)
      const [session] = await knex("crafting_history")
        .insert({
          user_id,
          blueprint_id: request.blueprint_id,
          crafting_date: knex.fn.now(),
          input_materials: JSON.stringify(request.input_materials),
          output_quality_tier: request.output_quality_tier,
          output_quality_value: request.output_quality_value,
          output_quantity: request.output_quantity,
          was_critical_success: request.was_critical_success,
          total_material_cost: request.total_material_cost || null,
          crafting_station_fee: request.crafting_station_fee || null,
        })
        .returning("*")

      logger.info("Crafting session recorded", {
        session_id: session.history_id,
        blueprint_id: request.blueprint_id,
        user_id,
      })

      return {
        success: true,
        session_id: session.history_id,
      }
    } catch (error) {
      logger.error("Failed to record crafting session", {
        blueprint_id: request.blueprint_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get user's crafting history
   *
   * Returns paginated list of user's crafting sessions with optional
   * filtering by blueprint. Requires authentication.
   *
   * Requirements:
   * - 45.1: Return crafting sessions with pagination
   * - 45.2: Support filtering by blueprint
   * - 45.3: Include blueprint and output item names
   * - 45.4: Include input materials used
   * - 45.5: Include output quality achieved
   * - 45.6: Sort by date descending
   *
   * @summary Get crafting history
   * @param blueprint_id Optional blueprint filter
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Paginated crafting history
   */
  @Get("history")
  @Security("discord_oauth")
  public async getCraftingHistory(
    @Query() blueprint_id?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<GetCraftingHistoryResponse> {
    const knex = getKnex()

    // Get authenticated user
    const user_id = this.getUserId()

    // Validate pagination
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    logger.info("Fetching crafting history", {
      user_id,
      blueprint_id,
      page: validatedPage,
      page_size: validatedPageSize,
    })

    try {
      // Build query
      let query = knex("crafting_history as cs")
        .join("blueprints as b", "cs.blueprint_id", "b.blueprint_id")
        .join("game_items as gi", "b.output_game_item_id", "gi.id")
        .select(
          "cs.history_id as session_id",
          "cs.blueprint_id",
          "b.blueprint_name",
          "gi.name as output_item_name",
          "cs.crafting_date",
          "cs.input_materials",
          "cs.output_quality_tier",
          "cs.output_quality_value",
          "cs.output_quantity",
          "cs.was_critical_success",
          "cs.total_material_cost",
          "cs.crafting_station_fee",
        )
        .where("cs.user_id", user_id)

      // Apply blueprint filter (Requirement 45.2)
      if (blueprint_id) {
        query = query.where("cs.blueprint_id", blueprint_id)
      }

      // Get total count
      const countQuery = query.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply sorting and pagination (Requirement 45.6)
      query = query
        .orderBy("cs.crafting_date", "desc")
        .limit(validatedPageSize)
        .offset((validatedPage - 1) * validatedPageSize)

      const results = await query

      // Transform results
      const history: CraftingSessionHistory[] = results.map((row: any) => ({
        session_id: row.session_id,
        blueprint_id: row.blueprint_id,
        blueprint_name: row.blueprint_name,
        output_item_name: row.output_item_name,
        crafting_date: row.crafting_date.toISOString(),
        input_materials: JSON.parse(row.input_materials),
        output_quality_tier: row.output_quality_tier,
        output_quality_value: parseFloat(row.output_quality_value),
        output_quantity: row.output_quantity,
        was_critical_success: row.was_critical_success,
        total_material_cost: row.total_material_cost || undefined,
        crafting_station_fee: row.crafting_station_fee || undefined,
      }))

      logger.info("Crafting history fetched", {
        user_id,
        total,
        returned: history.length,
      })

      return {
        history,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch crafting history", {
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get user's crafting statistics
   *
   * Returns aggregate statistics about user's crafting activity including
   * success rates, average quality, and per-blueprint statistics.
   *
   * Requirements:
   * - 45.7: Calculate total sessions
   * - 45.8: Calculate average output quality
   * - 45.9: Calculate success rates
   * - 45.10: Provide per-blueprint statistics
   *
   * @summary Get crafting statistics
   * @returns Crafting statistics
   */
  @Get("statistics")
  @Security("discord_oauth")
  public async getCraftingStatistics(): Promise<GetCraftingStatisticsResponse> {
    const knex = getKnex()

    // Get authenticated user
    const user_id = this.getUserId()

    logger.info("Fetching crafting statistics", { user_id })

    try {
      // Get overall statistics (Requirements 45.7, 45.8, 45.9)
      const overallStats = await knex("crafting_history")
        .where("user_id", user_id)
        .select(
          knex.raw("COUNT(*) as total_sessions"),
          knex.raw("COUNT(DISTINCT blueprint_id) as unique_blueprints"),
          knex.raw("AVG(output_quality_value) as avg_quality"),
          knex.raw("SUM(CASE WHEN was_critical_success THEN 1 ELSE 0 END) as critical_successes"),
          knex.raw("SUM(COALESCE(total_material_cost, 0)) as total_cost"),
        )
        .first()

      const totalSessions = parseInt(overallStats?.total_sessions || "0", 10)
      const uniqueBlueprints = parseInt(overallStats?.unique_blueprints || "0", 10)
      const avgQuality = parseFloat(overallStats?.avg_quality || "0")
      const criticalSuccesses = parseInt(overallStats?.critical_successes || "0", 10)
      const totalCost = parseFloat(overallStats?.total_cost || "0")
      const criticalSuccessRate = totalSessions > 0 ? (criticalSuccesses / totalSessions) * 100 : 0

      // Get per-blueprint statistics (Requirement 45.10)
      const blueprintStats = await knex("crafting_history as cs")
        .join("blueprints as b", "cs.blueprint_id", "b.blueprint_id")
        .where("cs.user_id", user_id)
        .groupBy("cs.blueprint_id", "b.blueprint_name")
        .select(
          "cs.blueprint_id",
          "b.blueprint_name",
          knex.raw("COUNT(*) as total_crafts"),
          knex.raw("AVG(cs.output_quality_value) as avg_quality"),
          knex.raw("100.0 as success_rate"), // Placeholder - all recorded crafts are successes
          knex.raw("SUM(CASE WHEN cs.was_critical_success THEN 1 ELSE 0 END) as critical_successes"),
          knex.raw("SUM(COALESCE(cs.total_material_cost, 0)) as total_cost"),
        )
        .orderBy("total_crafts", "desc")

      const blueprintStatistics: BlueprintStatistics[] = blueprintStats.map((row: any) => ({
        blueprint_id: row.blueprint_id,
        blueprint_name: row.blueprint_name,
        total_crafts: parseInt(row.total_crafts, 10),
        average_quality: parseFloat(row.avg_quality),
        success_rate: parseFloat(row.success_rate),
        critical_successes: parseInt(row.critical_successes, 10),
        total_materials_cost: parseFloat(row.total_cost),
      }))

      logger.info("Crafting statistics fetched", {
        user_id,
        total_sessions: totalSessions,
        unique_blueprints: uniqueBlueprints,
      })

      return {
        total_sessions: totalSessions,
        unique_blueprints_crafted: uniqueBlueprints,
        average_output_quality: parseFloat(avgQuality.toFixed(2)),
        total_critical_successes: criticalSuccesses,
        critical_success_rate: parseFloat(criticalSuccessRate.toFixed(2)),
        total_materials_cost: totalCost,
        blueprint_statistics: blueprintStatistics,
      }
    } catch (error) {
      logger.error("Failed to fetch crafting statistics", {
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Convert quality value (0-100) to quality tier (1-5)
   */
  private qualityValueToTier(qualityValue: number): number {
    if (qualityValue >= 80) return 5
    if (qualityValue >= 60) return 4
    if (qualityValue >= 40) return 3
    if (qualityValue >= 20) return 2
    return 1
  }

  /**
   * Generate all combinations of quality tiers for materials
   */
  private generateQualityCombinations(
    variations: Array<{
      game_item_id: string
      quantity: number
      quality_tiers: number[]
    }>,
  ): CraftingInputMaterial[][] {
    const combinations: CraftingInputMaterial[][] = []

    const generate = (index: number, current: CraftingInputMaterial[]) => {
      if (index === variations.length) {
        combinations.push([...current])
        return
      }

      const variation = variations[index]
      for (const tier of variation.quality_tiers) {
        current.push({
          game_item_id: variation.game_item_id,
          quantity: variation.quantity,
          quality_tier: tier,
          quality_value: this.tierToQualityValue(tier),
        })

        generate(index + 1, current)
        current.pop()
      }
    }

    generate(0, [])
    return combinations
  }

  /**
   * Convert quality tier (1-5) to representative quality value
   */
  private tierToQualityValue(tier: number): number {
    const tierMidpoints: Record<number, number> = {
      1: 10,
      2: 30,
      3: 50,
      4: 70,
      5: 90,
    }
    return tierMidpoints[tier] || 50
  }
}
