/**
 * Unit tests for BlueprintsController
 *
 * Tests blueprint search, detail retrieval, mission queries, and category listing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { BlueprintsController } from "./BlueprintsController.js"

describe("BlueprintsController", () => {
  let controller: BlueprintsController
  let testVersionId: string
  let testBlueprintId: string
  let testGameItemId: string
  let testIngredientItemId: string
  let testMissionId: string

  beforeAll(async () => {
    controller = new BlueprintsController()
    const knex = getKnex()

    // Create test game version
    const [version] = await knex("game_versions")
      .insert({
        version_type: "LIVE",
        version_number: "4.0.0-TEST-BP",
        is_active: true,
      })
      .returning("*")

    testVersionId = version.version_id

    // Create test game items
    const [outputItem] = await knex("game_items")
      .insert({
        name: "Test Crafted Weapon",
        type: "weapon",
      })
      .returning("*")

    testGameItemId = outputItem.id

    const [ingredientItem] = await knex("game_items")
      .insert({
        name: "Test Metal Ingot",
        type: "resource",
      })
      .returning("*")

    testIngredientItemId = ingredientItem.id

    // Create test blueprint
    const [blueprint] = await knex("blueprints")
      .insert({
        version_id: testVersionId,
        blueprint_code: "BP_TEST_WEAPON_001",
        blueprint_name: "Test Weapon Blueprint Alpha",
        output_game_item_id: testGameItemId,
        output_quantity: 1,
        item_category: "Weapons",
        item_subcategory: "Energy Weapons",
        rarity: "Rare",
        tier: 3,
        crafting_station_type: "Fabrication Station",
        crafting_time_seconds: 300,
        is_active: true,
      })
      .returning("*")

    testBlueprintId = blueprint.blueprint_id

    // Create blueprint ingredient
    await knex("blueprint_ingredients").insert({
      blueprint_id: testBlueprintId,
      ingredient_game_item_id: testIngredientItemId,
      quantity_required: 10,
      min_quality_tier: 2,
      recommended_quality_tier: 4,
      is_alternative: false,
      display_order: 1,
    })

    // Create test mission
    const [mission] = await knex("missions")
      .insert({
        version_id: testVersionId,
        mission_code: "TEST_MISSION_BP_001",
        mission_name: "Test Blueprint Mission",
        category: "Investigation",
        star_system: "Stanton",
      })
      .returning("*")

    testMissionId = mission.mission_id

    // Create mission blueprint reward
    await knex("mission_blueprint_rewards").insert({
      mission_id: testMissionId,
      blueprint_id: testBlueprintId,
      reward_pool_id: 1,
      reward_pool_size: 1,
      selection_count: 1,
      drop_probability: 75.0,
      is_guaranteed: false,
    })

    // Create crafting recipe
    await knex("crafting_recipes").insert({
      blueprint_id: testBlueprintId,
      version_id: testVersionId,
      quality_calculation_type: "weighted_average",
      min_output_quality_tier: 1,
      max_output_quality_tier: 5,
    })
  })

  afterAll(async () => {
    const knex = getKnex()

    // Clean up test data in reverse order of dependencies
    await knex("crafting_recipes").where("blueprint_id", testBlueprintId).del()
    await knex("mission_blueprint_rewards").where("blueprint_id", testBlueprintId).del()
    await knex("blueprint_ingredients").where("blueprint_id", testBlueprintId).del()
    await knex("blueprints").where("blueprint_id", testBlueprintId).del()
    await knex("missions").where("mission_id", testMissionId).del()
    await knex("game_items").where("id", testGameItemId).del()
    await knex("game_items").where("id", testIngredientItemId).del()
    await knex("game_versions").where("version_id", testVersionId).del()
  })

  describe("searchBlueprints", () => {
    it("should return blueprints with default pagination", async () => {
      const result = await controller.searchBlueprints(
        undefined, // text
        undefined, // item_category
        undefined, // item_subcategory
        undefined, // rarity
        undefined, // tier
        undefined, // crafting_station_type
        undefined, // output_game_item_id
        undefined, // user_owned_only
        testVersionId, // version_id
        1, // page
        20, // page_size
      )

      expect(result).toBeDefined()
      expect(result.blueprints).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(1)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should filter blueprints by text search", async () => {
      const result = await controller.searchBlueprints(
        "Test Weapon", // text
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
      expect(result.blueprints[0].blueprint_name).toContain("Test Weapon")
    })

    it("should filter blueprints by category", async () => {
      const result = await controller.searchBlueprints(
        undefined,
        "Weapons", // item_category
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
      expect(result.blueprints[0].item_category).toBe("Weapons")
    })

    it("should filter blueprints by subcategory", async () => {
      const result = await controller.searchBlueprints(
        undefined,
        undefined,
        "Energy Weapons", // item_subcategory
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
    })

    it("should filter blueprints by rarity", async () => {
      const result = await controller.searchBlueprints(
        undefined,
        undefined,
        undefined,
        "Rare", // rarity
        undefined,
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
      expect(result.blueprints[0].rarity).toBe("Rare")
    })

    it("should filter blueprints by tier", async () => {
      const result = await controller.searchBlueprints(
        undefined,
        undefined,
        undefined,
        undefined,
        3, // tier
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
      expect(result.blueprints[0].tier).toBe(3)
    })

    it("should filter blueprints by crafting station type", async () => {
      const result = await controller.searchBlueprints(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "Fabrication Station", // crafting_station_type
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
    })

    it("should include ingredient and mission counts", async () => {
      const result = await controller.searchBlueprints(
        "Test Weapon Blueprint Alpha",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
      const blueprint = result.blueprints[0]
      expect(blueprint.ingredient_count).toBeGreaterThanOrEqual(1)
      expect(blueprint.mission_count).toBeGreaterThanOrEqual(1)
    })

    it("should validate tier range", async () => {
      await expect(
        controller.searchBlueprints(
          undefined,
          undefined,
          undefined,
          undefined,
          6, // invalid tier
          undefined,
          undefined,
          undefined,
          testVersionId,
          1,
          20,
        ),
      ).rejects.toThrow()
    })

    it("should handle pagination correctly", async () => {
      const result = await controller.searchBlueprints(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        5, // small page size
      )

      expect(result.page).toBe(1)
      expect(result.page_size).toBe(5)
      expect(result.blueprints.length).toBeLessThanOrEqual(5)
    })
  })

  describe("getBlueprintDetail", () => {
    it("should return complete blueprint details", async () => {
      const result = await controller.getBlueprintDetail(testBlueprintId)

      expect(result).toBeDefined()
      expect(result.blueprint).toBeDefined()
      expect(result.blueprint.blueprint_id).toBe(testBlueprintId)
      expect(result.blueprint.blueprint_name).toBe("Test Weapon Blueprint Alpha")
      expect(result.output_item).toBeDefined()
      expect(result.output_item.name).toBe("Test Crafted Weapon")
    })

    it("should include ingredients with details", async () => {
      const result = await controller.getBlueprintDetail(testBlueprintId)

      expect(result.ingredients).toBeInstanceOf(Array)
      expect(result.ingredients.length).toBeGreaterThanOrEqual(1)

      const ingredient = result.ingredients[0]
      expect(ingredient.game_item).toBeDefined()
      expect(ingredient.game_item.name).toBe("Test Metal Ingot")
      expect(ingredient.quantity_required).toBe(10)
      expect(ingredient.min_quality_tier).toBe(2)
      expect(ingredient.recommended_quality_tier).toBe(4)
    })

    it("should include missions that reward the blueprint", async () => {
      const result = await controller.getBlueprintDetail(testBlueprintId)

      expect(result.missions_rewarding).toBeInstanceOf(Array)
      expect(result.missions_rewarding.length).toBeGreaterThanOrEqual(1)

      const mission = result.missions_rewarding[0]
      expect(mission.mission_name).toBe("Test Blueprint Mission")
      expect(mission.drop_probability).toBe(75.0)
    })

    it("should include crafting recipe", async () => {
      const result = await controller.getBlueprintDetail(testBlueprintId)

      expect(result.crafting_recipe).toBeDefined()
      expect(result.crafting_recipe?.quality_calculation_type).toBe("weighted_average")
      expect(result.crafting_recipe?.min_output_quality_tier).toBe(1)
      expect(result.crafting_recipe?.max_output_quality_tier).toBe(5)
    })

    it("should throw error for non-existent blueprint", async () => {
      await expect(
        controller.getBlueprintDetail("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow()
    })

    it("should throw error for missing blueprint_id", async () => {
      await expect(controller.getBlueprintDetail("")).rejects.toThrow()
    })
  })

  describe("getBlueprintMissions", () => {
    it("should return missions that reward the blueprint", async () => {
      const result = await controller.getBlueprintMissions(testBlueprintId)

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(1)

      const mission = result[0]
      expect(mission.mission_id).toBe(testMissionId)
      expect(mission.mission_name).toBe("Test Blueprint Mission")
      expect(mission.drop_probability).toBe(75.0)
      expect(mission.star_system).toBe("Stanton")
    })

    it("should filter by version_id when provided", async () => {
      const result = await controller.getBlueprintMissions(testBlueprintId, testVersionId)

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it("should throw error for non-existent blueprint", async () => {
      await expect(
        controller.getBlueprintMissions("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow()
    })

    it("should throw error for missing blueprint_id", async () => {
      await expect(controller.getBlueprintMissions("")).rejects.toThrow()
    })

    it("should sort missions by drop probability descending", async () => {
      const result = await controller.getBlueprintMissions(testBlueprintId)

      if (result.length > 1) {
        for (let i = 0; i < result.length - 1; i++) {
          expect(result[i].drop_probability).toBeGreaterThanOrEqual(
            result[i + 1].drop_probability,
          )
        }
      }
    })
  })

  describe("getCategories", () => {
    it("should return blueprint categories with counts", async () => {
      const result = await controller.getCategories(testVersionId)

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(1)

      const category = result.find((c) => c.category === "Weapons")
      expect(category).toBeDefined()
      expect(category?.count).toBeGreaterThanOrEqual(1)
    })

    it("should include subcategories", async () => {
      const result = await controller.getCategories(testVersionId)

      const weaponsCategory = result.find(
        (c) => c.category === "Weapons" && c.subcategory === "Energy Weapons",
      )
      expect(weaponsCategory).toBeDefined()
      expect(weaponsCategory?.count).toBeGreaterThanOrEqual(1)
    })

    it("should use active LIVE version when version_id not provided", async () => {
      // This test assumes there's an active LIVE version in the database
      const result = await controller.getCategories()

      expect(result).toBeInstanceOf(Array)
    })

    it("should sort categories alphabetically", async () => {
      const result = await controller.getCategories(testVersionId)

      if (result.length > 1) {
        for (let i = 0; i < result.length - 1; i++) {
          const current = result[i].category + (result[i].subcategory || "")
          const next = result[i + 1].category + (result[i + 1].subcategory || "")
          expect(current.localeCompare(next)).toBeLessThanOrEqual(0)
        }
      }
    })

    it("should only include active blueprints in counts", async () => {
      const knex = getKnex()

      // Create an inactive blueprint
      const [inactiveBlueprint] = await knex("blueprints")
        .insert({
          version_id: testVersionId,
          blueprint_code: "BP_INACTIVE_001",
          blueprint_name: "Inactive Blueprint",
          output_game_item_id: testGameItemId,
          output_quantity: 1,
          item_category: "Test Inactive Category",
          is_active: false,
        })
        .returning("*")

      const result = await controller.getCategories(testVersionId)

      const inactiveCategory = result.find((c) => c.category === "Test Inactive Category")
      expect(inactiveCategory).toBeUndefined()

      // Clean up
      await knex("blueprints").where("blueprint_id", inactiveBlueprint.blueprint_id).del()
    })
  })

  describe("addBlueprintToInventory", () => {
    let testUserId: string

    beforeAll(async () => {
      const knex = getKnex()

      // Create test user
      const [user] = await knex("accounts")
        .insert({
          discord_id: "test_user_bp_inventory_001",
          username: "TestUserBPInventory",
        })
        .returning("*")

      testUserId = user.user_id
    })

    afterAll(async () => {
      const knex = getKnex()

      // Clean up test data
      await knex("user_blueprint_inventory").where("user_id", testUserId).del()
      await knex("accounts").where("user_id", testUserId).del()
    })

    it("should add blueprint to user inventory", async () => {
      // Mock authentication context
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.addBlueprintToInventory(testBlueprintId, {
        acquisition_method: "mission_reward",
        acquisition_location: "Stanton System",
        acquisition_notes: "Completed Test Mission",
      })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.inventory_id).toBeDefined()

      // Verify in database
      const knex = getKnex()
      const inventory = await knex("user_blueprint_inventory")
        .where("user_id", testUserId)
        .where("blueprint_id", testBlueprintId)
        .first()

      expect(inventory).toBeDefined()
      expect(inventory.is_owned).toBe(true)
      expect(inventory.acquisition_method).toBe("mission_reward")
      expect(inventory.acquisition_location).toBe("Stanton System")
      expect(inventory.acquisition_notes).toBe("Completed Test Mission")
    })

    it("should update existing inventory record", async () => {
      ;(controller as any).user = { user_id: testUserId }

      // Add blueprint first time
      await controller.addBlueprintToInventory(testBlueprintId, {
        acquisition_method: "purchase",
        acquisition_location: "ArcCorp",
      })

      // Add again with different details
      const result = await controller.addBlueprintToInventory(testBlueprintId, {
        acquisition_method: "mission_reward",
        acquisition_location: "Crusader",
        acquisition_notes: "Updated acquisition",
      })

      expect(result.success).toBe(true)

      // Verify updated in database
      const knex = getKnex()
      const inventory = await knex("user_blueprint_inventory")
        .where("user_id", testUserId)
        .where("blueprint_id", testBlueprintId)
        .first()

      expect(inventory.acquisition_method).toBe("mission_reward")
      expect(inventory.acquisition_location).toBe("Crusader")
      expect(inventory.acquisition_notes).toBe("Updated acquisition")
    })

    it("should throw error for non-existent blueprint", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.addBlueprintToInventory("00000000-0000-0000-0000-000000000000", {}),
      ).rejects.toThrow()
    })

    it("should throw error when user not authenticated", async () => {
      ;(controller as any).user = undefined

      await expect(controller.addBlueprintToInventory(testBlueprintId, {})).rejects.toThrow()
    })

    it("should throw error for missing blueprint_id", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(controller.addBlueprintToInventory("", {})).rejects.toThrow()
    })

    it("should handle minimal acquisition details", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.addBlueprintToInventory(testBlueprintId, {})

      expect(result.success).toBe(true)

      // Verify in database
      const knex = getKnex()
      const inventory = await knex("user_blueprint_inventory")
        .where("user_id", testUserId)
        .where("blueprint_id", testBlueprintId)
        .first()

      expect(inventory.is_owned).toBe(true)
      expect(inventory.acquisition_date).toBeDefined()
    })
  })

  describe("removeBlueprintFromInventory", () => {
    let testUserId: string

    beforeAll(async () => {
      const knex = getKnex()

      // Create test user
      const [user] = await knex("accounts")
        .insert({
          discord_id: "test_user_bp_remove_001",
          username: "TestUserBPRemove",
        })
        .returning("*")

      testUserId = user.user_id
    })

    afterAll(async () => {
      const knex = getKnex()

      // Clean up test data
      await knex("user_blueprint_inventory").where("user_id", testUserId).del()
      await knex("accounts").where("user_id", testUserId).del()
    })

    it("should remove blueprint from user inventory", async () => {
      const knex = getKnex()
      ;(controller as any).user = { user_id: testUserId }

      // Add blueprint first
      await controller.addBlueprintToInventory(testBlueprintId, {})

      // Remove blueprint
      const result = await controller.removeBlueprintFromInventory(testBlueprintId)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)

      // Verify marked as not owned in database
      const inventory = await knex("user_blueprint_inventory")
        .where("user_id", testUserId)
        .where("blueprint_id", testBlueprintId)
        .first()

      expect(inventory).toBeDefined()
      expect(inventory.is_owned).toBe(false)
    })

    it("should handle removing non-existent inventory record", async () => {
      ;(controller as any).user = { user_id: testUserId }

      // Remove blueprint that was never added
      const result = await controller.removeBlueprintFromInventory(testBlueprintId)

      expect(result.success).toBe(true)
    })

    it("should throw error for non-existent blueprint", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.removeBlueprintFromInventory("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow()
    })

    it("should throw error when user not authenticated", async () => {
      ;(controller as any).user = undefined

      await expect(controller.removeBlueprintFromInventory(testBlueprintId)).rejects.toThrow()
    })

    it("should throw error for missing blueprint_id", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(controller.removeBlueprintFromInventory("")).rejects.toThrow()
    })

    it("should preserve acquisition history when removing", async () => {
      const knex = getKnex()
      ;(controller as any).user = { user_id: testUserId }

      // Add blueprint with details
      await controller.addBlueprintToInventory(testBlueprintId, {
        acquisition_method: "mission_reward",
        acquisition_location: "Stanton",
        acquisition_notes: "Important notes",
      })

      // Remove blueprint
      await controller.removeBlueprintFromInventory(testBlueprintId)

      // Verify history preserved
      const inventory = await knex("user_blueprint_inventory")
        .where("user_id", testUserId)
        .where("blueprint_id", testBlueprintId)
        .first()

      expect(inventory.acquisition_method).toBe("mission_reward")
      expect(inventory.acquisition_location).toBe("Stanton")
      expect(inventory.acquisition_notes).toBe("Important notes")
    })
  })

  describe("getUserBlueprintInventory", () => {
    let testUserId: string
    let testBlueprint2Id: string
    let testBlueprint3Id: string

    beforeAll(async () => {
      const knex = getKnex()

      // Create test user
      const [user] = await knex("accounts")
        .insert({
          discord_id: "test_user_bp_get_inventory_001",
          username: "TestUserBPGetInventory",
        })
        .returning("*")

      testUserId = user.user_id

      // Create additional test blueprints
      const [blueprint2] = await knex("blueprints")
        .insert({
          version_id: testVersionId,
          blueprint_code: "BP_TEST_WEAPON_002",
          blueprint_name: "Test Weapon Blueprint Beta",
          output_game_item_id: testGameItemId,
          output_quantity: 1,
          item_category: "Weapons",
          rarity: "Epic",
          tier: 4,
          is_active: true,
        })
        .returning("*")

      testBlueprint2Id = blueprint2.blueprint_id

      const [blueprint3] = await knex("blueprints")
        .insert({
          version_id: testVersionId,
          blueprint_code: "BP_TEST_ARMOR_001",
          blueprint_name: "Test Armor Blueprint",
          output_game_item_id: testGameItemId,
          output_quantity: 1,
          item_category: "Armor",
          rarity: "Common",
          tier: 2,
          is_active: true,
        })
        .returning("*")

      testBlueprint3Id = blueprint3.blueprint_id

      // Add blueprints to user inventory
      await knex("user_blueprint_inventory").insert([
        {
          user_id: testUserId,
          blueprint_id: testBlueprintId,
          is_owned: true,
          acquisition_date: new Date("2024-01-15"),
          acquisition_method: "mission_reward",
          acquisition_location: "Stanton",
        },
        {
          user_id: testUserId,
          blueprint_id: testBlueprint2Id,
          is_owned: true,
          acquisition_date: new Date("2024-01-20"),
          acquisition_method: "purchase",
          acquisition_location: "ArcCorp",
        },
        {
          user_id: testUserId,
          blueprint_id: testBlueprint3Id,
          is_owned: true,
          acquisition_date: new Date(),
          acquisition_method: "trade",
        },
      ])
    })

    afterAll(async () => {
      const knex = getKnex()

      // Clean up test data
      await knex("user_blueprint_inventory").where("user_id", testUserId).del()
      await knex("blueprints").where("blueprint_id", testBlueprint2Id).del()
      await knex("blueprints").where("blueprint_id", testBlueprint3Id).del()
      await knex("accounts").where("user_id", testUserId).del()
    })

    it("should return user's blueprint inventory", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        undefined, // item_category
        undefined, // rarity
        testVersionId, // version_id
        "acquisition_date", // sort_by
        "desc", // sort_order
        1, // page
        50, // page_size
      )

      expect(result).toBeDefined()
      expect(result.blueprints).toBeInstanceOf(Array)
      expect(result.blueprints.length).toBeGreaterThanOrEqual(3)
      expect(result.total).toBeGreaterThanOrEqual(3)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(50)
    })

    it("should include acquisition details", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
      )

      const blueprint = result.blueprints.find((b: any) => b.blueprint_id === testBlueprintId)
      expect(blueprint).toBeDefined()
      expect(blueprint?.acquisition_method).toBe("mission_reward")
      expect(blueprint?.acquisition_location).toBe("Stanton")
      expect(blueprint?.acquisition_date).toBeDefined()
    })

    it("should include statistics", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
      )

      expect(result.statistics).toBeDefined()
      expect(result.statistics.total_owned).toBeGreaterThanOrEqual(3)
      expect(result.statistics.total_available).toBeGreaterThanOrEqual(3)
      expect(result.statistics.completion_percentage).toBeGreaterThanOrEqual(0)
      expect(result.statistics.completion_percentage).toBeLessThanOrEqual(100)
      expect(result.statistics.recently_acquired_count).toBeGreaterThanOrEqual(1)
    })

    it("should filter by category", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        "Weapons", // item_category
        undefined,
        testVersionId,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(2)
      result.blueprints.forEach((bp: any) => {
        expect(bp.item_category).toBe("Weapons")
      })
    })

    it("should filter by rarity", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        undefined,
        "Epic", // rarity
        testVersionId,
      )

      expect(result.blueprints.length).toBeGreaterThanOrEqual(1)
      result.blueprints.forEach((bp: any) => {
        expect(bp.rarity).toBe("Epic")
      })
    })

    it("should sort by acquisition_date descending", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
        "acquisition_date",
        "desc",
      )

      if (result.blueprints.length > 1) {
        for (let i = 0; i < result.blueprints.length - 1; i++) {
          const current = new Date(result.blueprints[i].acquisition_date)
          const next = new Date(result.blueprints[i + 1].acquisition_date)
          expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime())
        }
      }
    })

    it("should sort by blueprint_name ascending", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
        "blueprint_name",
        "asc",
      )

      if (result.blueprints.length > 1) {
        for (let i = 0; i < result.blueprints.length - 1; i++) {
          expect(
            result.blueprints[i].blueprint_name.localeCompare(
              result.blueprints[i + 1].blueprint_name,
            ),
          ).toBeLessThanOrEqual(0)
        }
      }
    })

    it("should handle pagination correctly", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
        "acquisition_date",
        "desc",
        1,
        2, // small page size
      )

      expect(result.page).toBe(1)
      expect(result.page_size).toBe(2)
      expect(result.blueprints.length).toBeLessThanOrEqual(2)
    })

    it("should throw error when user not authenticated", async () => {
      ;(controller as any).user = undefined

      await expect(controller.getUserBlueprintInventory()).rejects.toThrow()
    })

    it("should use active LIVE version when version_id not provided", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.getUserBlueprintInventory()

      expect(result).toBeDefined()
      expect(result.blueprints).toBeInstanceOf(Array)
    })

    it("should only include owned blueprints", async () => {
      const knex = getKnex()
      ;(controller as any).user = { user_id: testUserId }

      // Add a not-owned blueprint
      const [notOwnedBlueprint] = await knex("blueprints")
        .insert({
          version_id: testVersionId,
          blueprint_code: "BP_NOT_OWNED_001",
          blueprint_name: "Not Owned Blueprint",
          output_game_item_id: testGameItemId,
          output_quantity: 1,
          is_active: true,
        })
        .returning("*")

      await knex("user_blueprint_inventory").insert({
        user_id: testUserId,
        blueprint_id: notOwnedBlueprint.blueprint_id,
        is_owned: false,
      })

      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
      )

      const notOwned = result.blueprints.find(
        (b: any) => b.blueprint_id === notOwnedBlueprint.blueprint_id,
      )
      expect(notOwned).toBeUndefined()

      // Clean up
      await knex("user_blueprint_inventory")
        .where("blueprint_id", notOwnedBlueprint.blueprint_id)
        .del()
      await knex("blueprints").where("blueprint_id", notOwnedBlueprint.blueprint_id).del()
    })

    it("should validate sort parameters", async () => {
      ;(controller as any).user = { user_id: testUserId }

      // Invalid sort_by should default to acquisition_date
      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
        "invalid_field" as any,
        "desc",
      )

      expect(result).toBeDefined()
      expect(result.blueprints).toBeInstanceOf(Array)
    })

    it("should validate pagination parameters", async () => {
      ;(controller as any).user = { user_id: testUserId }

      // Negative page should default to 1
      const result = await controller.getUserBlueprintInventory(
        undefined,
        undefined,
        testVersionId,
        "acquisition_date",
        "desc",
        -1,
        50,
      )

      expect(result.page).toBe(1)
    })
  })
})
