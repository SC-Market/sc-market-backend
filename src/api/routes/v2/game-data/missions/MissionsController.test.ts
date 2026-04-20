/**
 * Unit tests for MissionsController
 *
 * Tests mission search, detail retrieval, and blueprint queries.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { MissionsController } from "./MissionsController.js"

describe("MissionsController", () => {
  let controller: MissionsController
  let testVersionId: string
  let testMissionId: string

  beforeAll(async () => {
    controller = new MissionsController()
    const knex = getKnex()

    // Create test game version
    const [version] = await knex("game_versions")
      .insert({
        version_type: "LIVE",
        version_number: "4.0.0-TEST",
        is_active: true,
      })
      .returning("*")

    testVersionId = version.version_id

    // Create test game item for blueprint output
    const [gameItem] = await knex("game_items")
      .insert({
        name: "Test Weapon",
        type: "weapon",
      })
      .returning("*")

    // Create test mission
    const [mission] = await knex("missions")
      .insert({
        version_id: testVersionId,
        mission_code: "TEST_MISSION_001",
        mission_name: "Test Mission Alpha",
        category: "Combat",
        career_type: "Mercenary",
        legal_status: "LEGAL",
        difficulty_level: 3,
        star_system: "Stanton",
        planet_moon: "Crusader",
        faction: "Crusader Industries",
        credit_reward_min: 10000,
        credit_reward_max: 15000,
        is_shareable: true,
        is_chain_starter: false,
      })
      .returning("*")

    testMissionId = mission.mission_id

    // Create test blueprint
    const [blueprint] = await knex("blueprints")
      .insert({
        version_id: testVersionId,
        blueprint_code: "BP_TEST_001",
        blueprint_name: "Test Weapon Blueprint",
        output_game_item_id: gameItem.id,
        output_quantity: 1,
        item_category: "Weapons",
        rarity: "Rare",
        tier: 3,
      })
      .returning("*")

    // Create mission blueprint reward
    await knex("mission_blueprint_rewards").insert({
      mission_id: testMissionId,
      blueprint_id: blueprint.blueprint_id,
      reward_pool_id: 1,
      reward_pool_size: 1,
      selection_count: 1,
      drop_probability: 100.0,
      is_guaranteed: true,
    })
  })

  afterAll(async () => {
    const knex = getKnex()

    // Clean up test data
    await knex("mission_blueprint_rewards").where("mission_id", testMissionId).del()
    await knex("blueprints").where("version_id", testVersionId).del()
    await knex("missions").where("version_id", testVersionId).del()
    await knex("game_versions").where("version_id", testVersionId).del()
  })

  describe("searchMissions", () => {
    it("should return missions with default pagination", async () => {
      const result = await controller.searchMissions(
        undefined, // text
        undefined, // category
        undefined, // career_type
        undefined, // star_system
        undefined, // planet_moon
        undefined, // faction
        undefined, // legal_status
        undefined, // difficulty_min
        undefined, // difficulty_max
        undefined, // is_shareable
        undefined, // availability_type
        undefined, // associated_event
        undefined, // is_chain_starter
        undefined, // has_blueprint_rewards
        undefined, // credit_reward_min
        undefined, // community_difficulty_min
        undefined, // community_satisfaction_min
        testVersionId, // version_id
        1, // page
        20, // page_size
      )

      expect(result).toBeDefined()
      expect(result.missions).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(1)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should filter missions by text search", async () => {
      const result = await controller.searchMissions(
        "Test Mission", // text
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
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
        20,
      )

      expect(result.missions.length).toBeGreaterThanOrEqual(1)
      expect(result.missions[0].mission_name).toContain("Test Mission")
    })

    it("should filter missions by category", async () => {
      const result = await controller.searchMissions(
        undefined,
        "Combat", // category
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
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
        20,
      )

      expect(result.missions.length).toBeGreaterThanOrEqual(1)
      expect(result.missions[0].category).toBe("Combat")
    })

    it("should filter missions by star system", async () => {
      const result = await controller.searchMissions(
        undefined,
        undefined,
        undefined,
        "Stanton", // star_system
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
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
        20,
      )

      expect(result.missions.length).toBeGreaterThanOrEqual(1)
      expect(result.missions[0].star_system).toBe("Stanton")
    })

    it("should validate difficulty range", async () => {
      await expect(
        controller.searchMissions(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          6, // difficulty_min (invalid)
          undefined,
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
          20,
        ),
      ).rejects.toThrow()
    })
  })

  describe("getMissionDetail", () => {
    it("should return complete mission details", async () => {
      const result = await controller.getMissionDetail(testMissionId)

      expect(result).toBeDefined()
      expect(result.mission).toBeDefined()
      expect(result.mission.mission_id).toBe(testMissionId)
      expect(result.mission.mission_name).toBe("Test Mission Alpha")
      expect(result.blueprint_rewards).toBeInstanceOf(Array)
      expect(result.blueprint_rewards.length).toBeGreaterThanOrEqual(1)
    })

    it("should return blueprint reward pools", async () => {
      const result = await controller.getMissionDetail(testMissionId)

      expect(result.blueprint_rewards.length).toBeGreaterThanOrEqual(1)
      const pool = result.blueprint_rewards[0]
      expect(pool.reward_pool_id).toBe(1)
      expect(pool.reward_pool_size).toBe(1)
      expect(pool.selection_count).toBe(1)
      expect(pool.blueprints).toBeInstanceOf(Array)
      expect(pool.blueprints.length).toBeGreaterThanOrEqual(1)
    })

    it("should throw error for non-existent mission", async () => {
      await expect(
        controller.getMissionDetail("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow()
    })
  })

  describe("getMissionBlueprints", () => {
    it("should return all blueprints for mission", async () => {
      const result = await controller.getMissionBlueprints(testMissionId)

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].blueprint_name).toBe("Test Weapon Blueprint")
      expect(result[0].drop_probability).toBe(100)
      expect(result[0].is_guaranteed).toBe(true)
    })

    it("should include blueprint details", async () => {
      const result = await controller.getMissionBlueprints(testMissionId)

      const blueprint = result[0]
      expect(blueprint.blueprint_id).toBeDefined()
      expect(blueprint.blueprint_code).toBe("BP_TEST_001")
      expect(blueprint.output_item_name).toBe("Test Weapon")
      expect(blueprint.item_category).toBe("Weapons")
      expect(blueprint.rarity).toBe("Rare")
      expect(blueprint.tier).toBe(3)
    })

    it("should throw error for non-existent mission", async () => {
      await expect(
        controller.getMissionBlueprints("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow()
    })
  })

  describe("completeMission", () => {
    let testUserId: string

    beforeAll(async () => {
      const knex = getKnex()

      // Create test user
      const [user] = await knex("accounts")
        .insert({
          discord_id: "test_discord_123",
          username: "TestUser",
        })
        .returning("*")

      testUserId = user.user_id
    })

    afterAll(async () => {
      const knex = getKnex()

      // Clean up test user and related data
      await knex("mission_completions").where("user_id", testUserId).del()
      await knex("accounts").where("user_id", testUserId).del()
    })

    it("should record mission completion", async () => {
      // Mock authentication context
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.completeMission(testMissionId, {
        blueprints_rewarded: [],
        completion_notes: "Test completion",
      })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.completion_id).toBeDefined()

      // Verify completion was recorded
      const knex = getKnex()
      const completion = await knex("mission_completions")
        .where("user_id", testUserId)
        .where("mission_id", testMissionId)
        .first()

      expect(completion).toBeDefined()
      expect(completion.completion_notes).toBe("Test completion")
    })

    it("should update existing completion", async () => {
      ;(controller as any).user = { user_id: testUserId }

      // First completion
      const result1 = await controller.completeMission(testMissionId, {
        completion_notes: "First completion",
      })

      // Second completion (should update)
      const result2 = await controller.completeMission(testMissionId, {
        completion_notes: "Updated completion",
      })

      expect(result1.completion_id).toBe(result2.completion_id)

      // Verify update
      const knex = getKnex()
      const completion = await knex("mission_completions")
        .where("completion_id", result2.completion_id)
        .first()

      expect(completion.completion_notes).toBe("Updated completion")
    })

    it("should validate blueprint IDs", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.completeMission(testMissionId, {
          blueprints_rewarded: ["00000000-0000-0000-0000-000000000000"],
        }),
      ).rejects.toThrow()
    })

    it("should require authentication", async () => {
      ;(controller as any).user = undefined

      await expect(
        controller.completeMission(testMissionId, {
          completion_notes: "Test",
        }),
      ).rejects.toThrow()
    })

    it("should throw error for non-existent mission", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.completeMission("00000000-0000-0000-0000-000000000000", {
          completion_notes: "Test",
        }),
      ).rejects.toThrow()
    })
  })

  describe("rateMission", () => {
    let testUserId: string

    beforeAll(async () => {
      const knex = getKnex()

      // Create test user if not exists
      const existingUser = await knex("accounts")
        .where("discord_id", "test_discord_456")
        .first()

      if (existingUser) {
        testUserId = existingUser.user_id
      } else {
        const [user] = await knex("accounts")
          .insert({
            discord_id: "test_discord_456",
            username: "TestRater",
          })
          .returning("*")

        testUserId = user.user_id
      }
    })

    afterAll(async () => {
      const knex = getKnex()

      // Clean up test ratings
      await knex("mission_ratings").where("user_id", testUserId).del()
    })

    it("should record mission rating", async () => {
      ;(controller as any).user = { user_id: testUserId }

      const result = await controller.rateMission(testMissionId, {
        difficulty_rating: 4,
        satisfaction_rating: 5,
        rating_comment: "Great mission!",
      })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.rating_id).toBeDefined()

      // Verify rating was recorded
      const knex = getKnex()
      const rating = await knex("mission_ratings")
        .where("user_id", testUserId)
        .where("mission_id", testMissionId)
        .first()

      expect(rating).toBeDefined()
      expect(rating.difficulty_rating).toBe(4)
      expect(rating.satisfaction_rating).toBe(5)
      expect(rating.rating_comment).toBe("Great mission!")
    })

    it("should update existing rating", async () => {
      ;(controller as any).user = { user_id: testUserId }

      // First rating
      const result1 = await controller.rateMission(testMissionId, {
        difficulty_rating: 3,
        satisfaction_rating: 3,
      })

      // Second rating (should update)
      const result2 = await controller.rateMission(testMissionId, {
        difficulty_rating: 5,
        satisfaction_rating: 4,
        rating_comment: "Changed my mind!",
      })

      expect(result1.rating_id).toBe(result2.rating_id)

      // Verify update
      const knex = getKnex()
      const rating = await knex("mission_ratings")
        .where("rating_id", result2.rating_id)
        .first()

      expect(rating.difficulty_rating).toBe(5)
      expect(rating.satisfaction_rating).toBe(4)
      expect(rating.rating_comment).toBe("Changed my mind!")
    })

    it("should validate difficulty rating range", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.rateMission(testMissionId, {
          difficulty_rating: 6, // Invalid
          satisfaction_rating: 3,
        }),
      ).rejects.toThrow()

      await expect(
        controller.rateMission(testMissionId, {
          difficulty_rating: 0, // Invalid
          satisfaction_rating: 3,
        }),
      ).rejects.toThrow()
    })

    it("should validate satisfaction rating range", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.rateMission(testMissionId, {
          difficulty_rating: 3,
          satisfaction_rating: 6, // Invalid
        }),
      ).rejects.toThrow()
    })

    it("should require integer ratings", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.rateMission(testMissionId, {
          difficulty_rating: 3.5, // Invalid (not integer)
          satisfaction_rating: 4,
        }),
      ).rejects.toThrow()
    })

    it("should require authentication", async () => {
      ;(controller as any).user = undefined

      await expect(
        controller.rateMission(testMissionId, {
          difficulty_rating: 4,
          satisfaction_rating: 5,
        }),
      ).rejects.toThrow()
    })

    it("should throw error for non-existent mission", async () => {
      ;(controller as any).user = { user_id: testUserId }

      await expect(
        controller.rateMission("00000000-0000-0000-0000-000000000000", {
          difficulty_rating: 4,
          satisfaction_rating: 5,
        }),
      ).rejects.toThrow()
    })
  })

  describe("getMissionChains", () => {
    let chainStarterMissionId: string
    let chainMissionId: string

    beforeAll(async () => {
      const knex = getKnex()

      // Create chain starter mission
      const [starterMission] = await knex("missions")
        .insert({
          version_id: testVersionId,
          mission_code: "TEST_CHAIN_STARTER",
          mission_name: "Chain Starter Mission",
          category: "Investigation",
          career_type: "Exploration",
          faction: "Test Faction",
          is_chain_starter: true,
          is_chain_mission: false,
        })
        .returning("*")

      chainStarterMissionId = starterMission.mission_id

      // Create chain mission
      const [chainMission] = await knex("missions")
        .insert({
          version_id: testVersionId,
          mission_code: "TEST_CHAIN_MISSION",
          mission_name: "Chain Follow-up Mission",
          category: "Investigation",
          career_type: "Exploration",
          faction: "Test Faction",
          is_chain_starter: false,
          is_chain_mission: true,
          prerequisite_missions: [chainStarterMissionId],
          rank_index: 1,
        })
        .returning("*")

      chainMissionId = chainMission.mission_id
    })

    afterAll(async () => {
      const knex = getKnex()

      // Clean up chain missions
      await knex("missions").where("mission_id", chainMissionId).del()
      await knex("missions").where("mission_id", chainStarterMissionId).del()
    })

    it("should return mission chains", async () => {
      const result = await controller.getMissionChains(testVersionId)

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(1)

      const chain = result.find((c) => c.chain_id === chainStarterMissionId)
      expect(chain).toBeDefined()
      expect(chain!.starter_mission.mission_id).toBe(chainStarterMissionId)
      expect(chain!.chain_missions).toBeInstanceOf(Array)
    })

    it("should include chain missions", async () => {
      const result = await controller.getMissionChains(testVersionId)

      const chain = result.find((c) => c.chain_id === chainStarterMissionId)
      expect(chain).toBeDefined()
      expect(chain!.chain_missions.length).toBeGreaterThanOrEqual(1)
      expect(chain!.total_missions).toBeGreaterThanOrEqual(2)
    })

    it("should return empty array when no chains exist", async () => {
      const knex = getKnex()

      // Create version with no chain missions
      const [emptyVersion] = await knex("game_versions")
        .insert({
          version_type: "PTU",
          version_number: "4.0.0-EMPTY",
          is_active: true,
        })
        .returning("*")

      const result = await controller.getMissionChains(emptyVersion.version_id)

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBe(0)

      // Clean up
      await knex("game_versions").where("version_id", emptyVersion.version_id).del()
    })

    it("should use active LIVE version by default", async () => {
      const result = await controller.getMissionChains()

      expect(result).toBeInstanceOf(Array)
      // Should not throw error
    })
  })
})
