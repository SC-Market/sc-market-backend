/**
 * Unit tests for ResourcesController
 *
 * Tests resource search, detail retrieval, and category listing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { ResourcesController } from "./ResourcesController.js"

describe("ResourcesController", () => {
  let controller: ResourcesController
  let testVersionId: string
  let testResourceId: string
  let testGameItemId: string
  let testBlueprintId: string
  let testOutputItemId: string

  beforeAll(async () => {
    controller = new ResourcesController()
    const knex = getKnex()

    // Create test game version
    const [version] = await knex("game_versions")
      .insert({
        version_type: "LIVE",
        version_number: "4.0.0-TEST-RES",
        is_active: true,
      })
      .returning("*")

    testVersionId = version.version_id

    // Create test game item for resource
    const [resourceItem] = await knex("game_items")
      .insert({
        name: "Test Titanium Ore",
        type: "resource",
      })
      .returning("*")

    testGameItemId = resourceItem.id

    // Create test resource
    const [resource] = await knex("resources")
      .insert({
        version_id: testVersionId,
        game_item_id: testGameItemId,
        resource_category: "Metals",
        resource_subcategory: "Ores",
        max_stack_size: 1000,
        base_value: 50,
        can_be_mined: true,
        can_be_purchased: true,
        can_be_salvaged: false,
        can_be_looted: false,
        mining_locations: JSON.stringify([
          {
            star_system: "Stanton",
            planet_moon: "Lyria",
            location_detail: "Surface deposits",
            abundance: "High",
          },
        ]),
        purchase_locations: JSON.stringify([
          {
            star_system: "Stanton",
            planet_moon: "Hurston",
            station: "Lorville",
            average_price: 55,
          },
        ]),
      })
      .returning("*")

    testResourceId = resource.resource_id

    // Create test output item for blueprint
    const [outputItem] = await knex("game_items")
      .insert({
        name: "Test Titanium Component",
        type: "component",
      })
      .returning("*")

    testOutputItemId = outputItem.id

    // Create test blueprint that uses this resource
    const [blueprint] = await knex("blueprints")
      .insert({
        version_id: testVersionId,
        blueprint_code: "BP_TEST_COMPONENT_001",
        blueprint_name: "Test Component Blueprint",
        output_game_item_id: testOutputItemId,
        output_quantity: 1,
        item_category: "Components",
        is_active: true,
      })
      .returning("*")

    testBlueprintId = blueprint.blueprint_id

    // Create blueprint ingredient linking resource to blueprint
    await knex("blueprint_ingredients").insert({
      blueprint_id: testBlueprintId,
      ingredient_game_item_id: testGameItemId,
      quantity_required: 25,
      min_quality_tier: 1,
      recommended_quality_tier: 3,
      is_alternative: false,
      display_order: 1,
    })
  })

  afterAll(async () => {
    const knex = getKnex()

    // Clean up test data in reverse order of dependencies
    await knex("blueprint_ingredients").where("blueprint_id", testBlueprintId).del()
    await knex("blueprints").where("blueprint_id", testBlueprintId).del()
    await knex("resources").where("resource_id", testResourceId).del()
    await knex("game_items").where("id", testGameItemId).del()
    await knex("game_items").where("id", testOutputItemId).del()
    await knex("game_versions").where("version_id", testVersionId).del()
  })

  describe("searchResources", () => {
    it("should return resources with default pagination", async () => {
      const result = await controller.searchResources(
        undefined, // text
        undefined, // resource_category
        undefined, // resource_subcategory
        undefined, // acquisition_method
        testVersionId, // version_id
        1, // page
        20, // page_size
      )

      expect(result).toBeDefined()
      expect(result.resources).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(1)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should filter resources by text search", async () => {
      const result = await controller.searchResources(
        "Titanium", // text
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.resources.length).toBeGreaterThanOrEqual(1)
      expect(result.resources[0].resource_name).toContain("Titanium")
    })

    it("should filter resources by category", async () => {
      const result = await controller.searchResources(
        undefined,
        "Metals", // resource_category
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.resources.length).toBeGreaterThanOrEqual(1)
      expect(result.resources[0].resource_category).toBe("Metals")
    })

    it("should filter resources by subcategory", async () => {
      const result = await controller.searchResources(
        undefined,
        undefined,
        "Ores", // resource_subcategory
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.resources.length).toBeGreaterThanOrEqual(1)
      expect(result.resources[0].resource_subcategory).toBe("Ores")
    })

    it("should filter resources by acquisition method - mined", async () => {
      const result = await controller.searchResources(
        undefined,
        undefined,
        undefined,
        "mined", // acquisition_method
        testVersionId,
        1,
        20,
      )

      expect(result.resources.length).toBeGreaterThanOrEqual(1)
      expect(result.resources[0].can_be_mined).toBe(true)
    })

    it("should filter resources by acquisition method - purchased", async () => {
      const result = await controller.searchResources(
        undefined,
        undefined,
        undefined,
        "purchased", // acquisition_method
        testVersionId,
        1,
        20,
      )

      expect(result.resources.length).toBeGreaterThanOrEqual(1)
      expect(result.resources[0].can_be_purchased).toBe(true)
    })

    it("should include blueprint count in results", async () => {
      const result = await controller.searchResources(
        "Titanium",
        undefined,
        undefined,
        undefined,
        testVersionId,
        1,
        20,
      )

      expect(result.resources.length).toBeGreaterThanOrEqual(1)
      expect(result.resources[0].blueprint_count).toBeGreaterThanOrEqual(1)
    })

    it("should validate pagination parameters", async () => {
      const result = await controller.searchResources(
        undefined,
        undefined,
        undefined,
        undefined,
        testVersionId,
        -1, // invalid page
        200, // exceeds max page_size
      )

      expect(result.page).toBe(1) // Should default to 1
      expect(result.page_size).toBe(100) // Should cap at 100
    })
  })

  describe("getResource", () => {
    it("should return complete resource details", async () => {
      const result = await controller.getResource(testResourceId)

      expect(result).toBeDefined()
      expect(result.resource).toBeDefined()
      expect(result.resource.resource_id).toBe(testResourceId)
      expect(result.resource.resource_name).toBe("Test Titanium Ore")
      expect(result.resource.resource_category).toBe("Metals")
      expect(result.resource.resource_subcategory).toBe("Ores")
      expect(result.resource.max_stack_size).toBe(1000)
      expect(result.resource.base_value).toBe(50)
      expect(result.resource.can_be_mined).toBe(true)
      expect(result.resource.can_be_purchased).toBe(true)
    })

    it("should include mining locations", async () => {
      const result = await controller.getResource(testResourceId)

      expect(result.resource.mining_locations).toBeDefined()
      expect(result.resource.mining_locations).toBeInstanceOf(Array)
      expect(result.resource.mining_locations!.length).toBeGreaterThanOrEqual(1)
      expect(result.resource.mining_locations![0].star_system).toBe("Stanton")
      expect(result.resource.mining_locations![0].planet_moon).toBe("Lyria")
    })

    it("should include purchase locations", async () => {
      const result = await controller.getResource(testResourceId)

      expect(result.resource.purchase_locations).toBeDefined()
      expect(result.resource.purchase_locations).toBeInstanceOf(Array)
      expect(result.resource.purchase_locations!.length).toBeGreaterThanOrEqual(1)
      expect(result.resource.purchase_locations![0].station).toBe("Lorville")
    })

    it("should include blueprints requiring this resource", async () => {
      const result = await controller.getResource(testResourceId)

      expect(result.blueprints_requiring).toBeDefined()
      expect(result.blueprints_requiring).toBeInstanceOf(Array)
      expect(result.blueprints_requiring.length).toBeGreaterThanOrEqual(1)
      expect(result.blueprints_requiring[0].blueprint_id).toBe(testBlueprintId)
      expect(result.blueprints_requiring[0].quantity_required).toBe(25)
      expect(result.blueprints_requiring[0].min_quality_tier).toBe(1)
      expect(result.blueprints_requiring[0].recommended_quality_tier).toBe(3)
    })

    it("should throw error for non-existent resource", async () => {
      const fakeResourceId = "00000000-0000-0000-0000-000000000000"

      await expect(controller.getResource(fakeResourceId)).rejects.toThrow()
    })

    it("should throw validation error for missing resource_id", async () => {
      await expect(controller.getResource("")).rejects.toThrow()
    })
  })

  describe("getCategories", () => {
    it("should return resource categories with counts", async () => {
      const result = await controller.getCategories(testVersionId)

      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it("should include category and subcategory", async () => {
      const result = await controller.getCategories(testVersionId)

      const metalsCategory = result.find((c) => c.category === "Metals")
      expect(metalsCategory).toBeDefined()
      expect(metalsCategory!.count).toBeGreaterThanOrEqual(1)
    })

    it("should include subcategory when present", async () => {
      const result = await controller.getCategories(testVersionId)

      const oresSubcategory = result.find(
        (c) => c.category === "Metals" && c.subcategory === "Ores",
      )
      expect(oresSubcategory).toBeDefined()
      expect(oresSubcategory!.count).toBeGreaterThanOrEqual(1)
    })

    it("should use active LIVE version when version_id not provided", async () => {
      const result = await controller.getCategories()

      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(Array)
    })

    it("should sort categories alphabetically", async () => {
      const result = await controller.getCategories(testVersionId)

      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          expect(result[i].category >= result[i - 1].category).toBe(true)
        }
      }
    })
  })
})
