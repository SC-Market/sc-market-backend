/**
 * Unit tests for CraftingController
 *
 * Tests all crafting endpoints including quality calculations, simulations,
 * and history tracking.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { CraftingController } from "./CraftingController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  CalculateQualityRequest,
  SimulateCraftingRequest,
  RecordCraftingRequest,
} from "./crafting.types.js"

// Mock dependencies
vi.mock("../../../../../clients/database/knex-db.js")
vi.mock("../../../../../logger/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe("CraftingController", () => {
  let controller: CraftingController
  let mockKnex: any

  beforeEach(() => {
    // Create mock knex instance
    mockKnex = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      first: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      join: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      count: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      clearSelect: vi.fn().mockReturnThis(),
      clearOrder: vi.fn().mockReturnThis(),
      fn: {
        now: vi.fn(() => new Date()),
      },
      raw: vi.fn((sql: string) => sql),
    }

    // Mock getKnex to return our mock
    vi.mocked(getKnex).mockReturnValue(mockKnex as any)

    // Create controller instance
    controller = new CraftingController()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================================
  // calculateQuality Tests
  // ============================================================================

  describe("calculateQuality", () => {
    const mockBlueprint = {
      blueprint_id: "bp-123",
      blueprint_name: "Test Blueprint",
      output_quantity: 1,
    }

    const mockRecipe = {
      quality_calculation_type: "weighted_average",
      base_success_rate: 95.0,
      critical_success_chance: 5.0,
    }

    const mockIngredients = [
      { ingredient_game_item_id: "item-1", quantity_required: 2 },
      { ingredient_game_item_id: "item-2", quantity_required: 1 },
    ]

    const mockMaterialNames = [
      { id: "item-1", name: "Iron Ore" },
      { id: "item-2", name: "Carbon" },
    ]

    beforeEach(() => {
      // Setup default mocks
      mockKnex.first.mockImplementation((table: string) => {
        if (table === undefined) {
          // Called on blueprints table
          return Promise.resolve(mockBlueprint)
        }
        return Promise.resolve(mockRecipe)
      })

      mockKnex.select.mockImplementation(() => {
        return {
          ...mockKnex,
          then: (resolve: any) => resolve(mockIngredients),
        }
      })

      mockKnex.whereIn.mockImplementation(() => {
        return {
          ...mockKnex,
          select: () => ({
            then: (resolve: any) => resolve(mockMaterialNames),
          }),
        }
      })
    })

    it("should calculate quality using weighted_average formula", async () => {
      const request: CalculateQualityRequest = {
        blueprint_id: "bp-123",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
          { game_item_id: "item-2", quantity: 1, quality_tier: 5, quality_value: 90 },
        ],
      }

      const result = await controller.calculateQuality(request)

      expect(result.output_quality_tier).toBe(4) // (70*2 + 90*1) / 3 = 76.67 -> tier 4
      expect(result.output_quality_value).toBeCloseTo(76.67, 1)
      expect(result.calculation_breakdown.formula_used).toBe("weighted_average")
      expect(result.calculation_breakdown.quality_contributions).toHaveLength(2)
      expect(result.success_probability).toBe(95.0)
      expect(result.critical_success_chance).toBe(5.0)
    })

    it("should calculate quality using minimum formula", async () => {
      mockKnex.first.mockImplementation(() => {
        return Promise.resolve({
          ...mockRecipe,
          quality_calculation_type: "minimum",
        })
      })

      const request: CalculateQualityRequest = {
        blueprint_id: "bp-123",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
          { game_item_id: "item-2", quantity: 1, quality_tier: 5, quality_value: 90 },
        ],
      }

      const result = await controller.calculateQuality(request)

      expect(result.output_quality_value).toBe(70) // Minimum of 70 and 90
      expect(result.output_quality_tier).toBe(4)
      expect(result.calculation_breakdown.formula_used).toBe("minimum")
    })

    it("should calculate quality using maximum formula", async () => {
      mockKnex.first.mockImplementation(() => {
        return Promise.resolve({
          ...mockRecipe,
          quality_calculation_type: "maximum",
        })
      })

      const request: CalculateQualityRequest = {
        blueprint_id: "bp-123",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
          { game_item_id: "item-2", quantity: 1, quality_tier: 5, quality_value: 90 },
        ],
      }

      const result = await controller.calculateQuality(request)

      expect(result.output_quality_value).toBe(90) // Maximum of 70 and 90
      expect(result.output_quality_tier).toBe(5)
      expect(result.calculation_breakdown.formula_used).toBe("maximum")
    })

    it("should throw validation error if blueprint_id is missing", async () => {
      const request: CalculateQualityRequest = {
        blueprint_id: "",
        input_materials: [],
      }

      await expect(controller.calculateQuality(request)).rejects.toThrow()
    })

    it("should throw validation error if input_materials is empty", async () => {
      const request: CalculateQualityRequest = {
        blueprint_id: "bp-123",
        input_materials: [],
      }

      await expect(controller.calculateQuality(request)).rejects.toThrow()
    })

    it("should throw not found error if blueprint doesn't exist", async () => {
      mockKnex.first.mockResolvedValueOnce(null)

      const request: CalculateQualityRequest = {
        blueprint_id: "bp-nonexistent",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
        ],
      }

      await expect(controller.calculateQuality(request)).rejects.toThrow()
    })

    it("should throw validation error if required ingredient is missing", async () => {
      const request: CalculateQualityRequest = {
        blueprint_id: "bp-123",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
          // Missing item-2
        ],
      }

      await expect(controller.calculateQuality(request)).rejects.toThrow()
    })

    it("should throw validation error if ingredient quantity is insufficient", async () => {
      const request: CalculateQualityRequest = {
        blueprint_id: "bp-123",
        input_materials: [
          { game_item_id: "item-1", quantity: 1, quality_tier: 4, quality_value: 70 }, // Need 2
          { game_item_id: "item-2", quantity: 1, quality_tier: 5, quality_value: 90 },
        ],
      }

      await expect(controller.calculateQuality(request)).rejects.toThrow()
    })

    it("should include quality contributions in breakdown", async () => {
      const request: CalculateQualityRequest = {
        blueprint_id: "bp-123",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
          { game_item_id: "item-2", quantity: 1, quality_tier: 5, quality_value: 90 },
        ],
      }

      const result = await controller.calculateQuality(request)

      expect(result.calculation_breakdown.quality_contributions).toEqual([
        {
          material_name: "Iron Ore",
          quality_tier: 4,
          quality_value: 70,
          weight: 2 / 3,
          contribution: 70 * (2 / 3),
        },
        {
          material_name: "Carbon",
          quality_tier: 5,
          quality_value: 90,
          weight: 1 / 3,
          contribution: 90 * (1 / 3),
        },
      ])
    })
  })

  // ============================================================================
  // simulateCrafting Tests
  // ============================================================================

  describe("simulateCrafting", () => {
    const mockBlueprint = {
      blueprint_id: "bp-123",
      blueprint_name: "Test Blueprint",
    }

    beforeEach(() => {
      mockKnex.first.mockResolvedValue(mockBlueprint)
    })

    it("should generate and test all quality combinations", async () => {
      // Mock calculateQuality to return predictable results
      const calculateQualitySpy = vi.spyOn(controller, "calculateQuality")
      calculateQualitySpy.mockImplementation(async (req) => {
        const avgQuality =
          req.input_materials.reduce((sum, m) => sum + m.quality_value, 0) /
          req.input_materials.length

        return {
          output_quality_tier: Math.ceil(avgQuality / 20),
          output_quality_value: avgQuality,
          output_quantity: 1,
          calculation_breakdown: {
            formula_used: "weighted_average",
            input_weights: {},
            quality_contributions: [],
          },
          estimated_cost: {
            material_cost: 0,
            total_cost: 0,
          },
          success_probability: 100,
          critical_success_chance: 0,
        }
      })

      const request: SimulateCraftingRequest = {
        blueprint_id: "bp-123",
        material_variations: [
          { game_item_id: "item-1", quantity: 1, quality_tiers: [3, 5] },
          { game_item_id: "item-2", quantity: 1, quality_tiers: [3, 5] },
        ],
      }

      const result = await controller.simulateCrafting(request)

      expect(result.simulation_results).toHaveLength(4) // 2 x 2 combinations
      expect(result.best_result).toBeDefined()
      expect(result.worst_result).toBeDefined()
      expect(result.most_cost_effective).toBeDefined()
      expect(result.blueprint_name).toBe("Test Blueprint")

      calculateQualitySpy.mockRestore()
    })

    it("should identify best result with highest quality", async () => {
      const calculateQualitySpy = vi.spyOn(controller, "calculateQuality")
      calculateQualitySpy.mockImplementation(async (req) => {
        const avgQuality =
          req.input_materials.reduce((sum, m) => sum + m.quality_value, 0) /
          req.input_materials.length

        return {
          output_quality_tier: Math.ceil(avgQuality / 20),
          output_quality_value: avgQuality,
          output_quantity: 1,
          calculation_breakdown: {
            formula_used: "weighted_average",
            input_weights: {},
            quality_contributions: [],
          },
          estimated_cost: {
            material_cost: 0,
            total_cost: 0,
          },
          success_probability: 100,
          critical_success_chance: 0,
        }
      })

      const request: SimulateCraftingRequest = {
        blueprint_id: "bp-123",
        material_variations: [
          { game_item_id: "item-1", quantity: 1, quality_tiers: [1, 5] },
        ],
      }

      const result = await controller.simulateCrafting(request)

      expect(result.best_result.output_quality_value).toBeGreaterThan(
        result.worst_result.output_quality_value,
      )

      calculateQualitySpy.mockRestore()
    })

    it("should throw validation error if blueprint_id is missing", async () => {
      const request: SimulateCraftingRequest = {
        blueprint_id: "",
        material_variations: [],
      }

      await expect(controller.simulateCrafting(request)).rejects.toThrow()
    })

    it("should throw validation error if material_variations is empty", async () => {
      const request: SimulateCraftingRequest = {
        blueprint_id: "bp-123",
        material_variations: [],
      }

      await expect(controller.simulateCrafting(request)).rejects.toThrow()
    })

    it("should throw not found error if blueprint doesn't exist", async () => {
      mockKnex.first.mockResolvedValue(null)

      const request: SimulateCraftingRequest = {
        blueprint_id: "bp-nonexistent",
        material_variations: [
          { game_item_id: "item-1", quantity: 1, quality_tiers: [3, 5] },
        ],
      }

      await expect(controller.simulateCrafting(request)).rejects.toThrow()
    })
  })

  // ============================================================================
  // recordCrafting Tests
  // ============================================================================

  describe("recordCrafting", () => {
    const mockBlueprint = {
      blueprint_id: "bp-123",
      blueprint_name: "Test Blueprint",
    }

    const mockSession = {
      history_id: "session-123",
    }

    beforeEach(() => {
      mockKnex.first.mockResolvedValue(mockBlueprint)
      mockKnex.returning.mockResolvedValue([mockSession])

      // Mock getUserId
      vi.spyOn(controller as any, "getUserId").mockReturnValue("user-123")
    })

    it("should record crafting session successfully", async () => {
      const request: RecordCraftingRequest = {
        blueprint_id: "bp-123",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
        ],
        output_quality_tier: 4,
        output_quality_value: 75.5,
        output_quantity: 1,
        was_critical_success: false,
        total_material_cost: 1000,
        crafting_station_fee: 50,
      }

      const result = await controller.recordCrafting(request)

      expect(result.success).toBe(true)
      expect(result.session_id).toBe("session-123")
      expect(mockKnex.insert).toHaveBeenCalled()
    })

    it("should throw validation error if blueprint_id is missing", async () => {
      const request: RecordCraftingRequest = {
        blueprint_id: "",
        input_materials: [],
        output_quality_tier: 4,
        output_quality_value: 75,
        output_quantity: 1,
        was_critical_success: false,
      }

      await expect(controller.recordCrafting(request)).rejects.toThrow()
    })

    it("should throw not found error if blueprint doesn't exist", async () => {
      mockKnex.first.mockResolvedValue(null)

      const request: RecordCraftingRequest = {
        blueprint_id: "bp-nonexistent",
        input_materials: [
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
        ],
        output_quality_tier: 4,
        output_quality_value: 75,
        output_quantity: 1,
        was_critical_success: false,
      }

      await expect(controller.recordCrafting(request)).rejects.toThrow()
    })

    it("should require authentication", async () => {
      vi.spyOn(controller as any, "getUserId").mockImplementation(() => {
        throw new Error("User not authenticated")
      })

      const request: RecordCraftingRequest = {
        blueprint_id: "bp-123",
        input_materials: [],
        output_quality_tier: 4,
        output_quality_value: 75,
        output_quantity: 1,
        was_critical_success: false,
      }

      await expect(controller.recordCrafting(request)).rejects.toThrow()
    })
  })

  // ============================================================================
  // getCraftingHistory Tests
  // ============================================================================

  describe("getCraftingHistory", () => {
    const mockHistoryResults = [
      {
        session_id: "session-1",
        blueprint_id: "bp-123",
        blueprint_name: "Test Blueprint",
        output_item_name: "Test Item",
        crafting_date: new Date("2024-01-01"),
        input_materials: JSON.stringify([
          { game_item_id: "item-1", quantity: 2, quality_tier: 4, quality_value: 70 },
        ]),
        output_quality_tier: 4,
        output_quality_value: 75.5,
        output_quantity: 1,
        was_critical_success: false,
        total_material_cost: 1000,
        crafting_station_fee: 50,
      },
    ]

    beforeEach(() => {
      vi.spyOn(controller as any, "getUserId").mockReturnValue("user-123")

      // Mock count query
      mockKnex.count.mockResolvedValue([{ count: "1" }])

      // Mock main query
      mockKnex.orderBy.mockImplementation(() => ({
        ...mockKnex,
        limit: () => ({
          ...mockKnex,
          offset: () => Promise.resolve(mockHistoryResults),
        }),
      }))
    })

    it("should return paginated crafting history", async () => {
      const result = await controller.getCraftingHistory(undefined, 1, 20)

      expect(result.history).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
      expect(result.history[0].session_id).toBe("session-1")
      expect(result.history[0].blueprint_name).toBe("Test Blueprint")
    })

    it("should filter by blueprint_id when provided", async () => {
      await controller.getCraftingHistory("bp-123", 1, 20)

      expect(mockKnex.where).toHaveBeenCalledWith("cs.blueprint_id", "bp-123")
    })

    it("should validate pagination parameters", async () => {
      const result = await controller.getCraftingHistory(undefined, -1, 200)

      expect(result.page).toBe(1) // Minimum page
      expect(result.page_size).toBe(100) // Maximum page size
    })

    it("should require authentication", async () => {
      vi.spyOn(controller as any, "getUserId").mockImplementation(() => {
        throw new Error("User not authenticated")
      })

      await expect(controller.getCraftingHistory()).rejects.toThrow()
    })
  })

  // ============================================================================
  // getCraftingStatistics Tests
  // ============================================================================

  describe("getCraftingStatistics", () => {
    const mockOverallStats = {
      total_sessions: "10",
      unique_blueprints: "3",
      avg_quality: "75.5",
      critical_successes: "2",
      total_cost: "5000",
    }

    const mockBlueprintStats = [
      {
        blueprint_id: "bp-123",
        blueprint_name: "Test Blueprint",
        total_crafts: "5",
        avg_quality: "80.0",
        success_rate: "100.0",
        critical_successes: "1",
        total_cost: "2500",
      },
    ]

    beforeEach(() => {
      vi.spyOn(controller as any, "getUserId").mockReturnValue("user-123")

      mockKnex.first.mockResolvedValue(mockOverallStats)
      mockKnex.orderBy.mockResolvedValue(mockBlueprintStats)
    })

    it("should return crafting statistics", async () => {
      const result = await controller.getCraftingStatistics()

      expect(result.total_sessions).toBe(10)
      expect(result.unique_blueprints_crafted).toBe(3)
      expect(result.average_output_quality).toBeCloseTo(75.5, 1)
      expect(result.total_critical_successes).toBe(2)
      expect(result.critical_success_rate).toBeCloseTo(20, 1)
      expect(result.total_materials_cost).toBe(5000)
      expect(result.blueprint_statistics).toHaveLength(1)
    })

    it("should include per-blueprint statistics", async () => {
      const result = await controller.getCraftingStatistics()

      const bpStats = result.blueprint_statistics[0]
      expect(bpStats.blueprint_id).toBe("bp-123")
      expect(bpStats.blueprint_name).toBe("Test Blueprint")
      expect(bpStats.total_crafts).toBe(5)
      expect(bpStats.average_quality).toBe(80.0)
      expect(bpStats.success_rate).toBe(100.0)
      expect(bpStats.critical_successes).toBe(1)
      expect(bpStats.total_materials_cost).toBe(2500)
    })

    it("should handle zero sessions gracefully", async () => {
      mockKnex.first.mockResolvedValue({
        total_sessions: "0",
        unique_blueprints: "0",
        avg_quality: null,
        critical_successes: "0",
        total_cost: "0",
      })
      mockKnex.orderBy.mockResolvedValue([])

      const result = await controller.getCraftingStatistics()

      expect(result.total_sessions).toBe(0)
      expect(result.critical_success_rate).toBe(0)
      expect(result.blueprint_statistics).toHaveLength(0)
    })

    it("should require authentication", async () => {
      vi.spyOn(controller as any, "getUserId").mockImplementation(() => {
        throw new Error("User not authenticated")
      })

      await expect(controller.getCraftingStatistics()).rejects.toThrow()
    })
  })
})
