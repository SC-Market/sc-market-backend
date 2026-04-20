/**
 * Unit tests for WikiController
 *
 * Tests wiki item search, ship browsing, commodity listing, and manufacturer queries.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { WikiController } from "./WikiController.js"

describe("WikiController", () => {
  let controller: WikiController
  let testGameItemId: string
  let testShipId: string
  let testVersionId: string

  beforeAll(async () => {
    controller = new WikiController()
    const knex = getKnex()

    // Create test game version
    const [version] = await knex("game_versions")
      .insert({
        version_type: "LIVE",
        version_number: "4.0.0-WIKI-TEST",
        is_active: true,
      })
      .returning("*")

    testVersionId = version.version_id

    // Create test game items
    const [gameItem] = await knex("game_items")
      .insert({
        name: "Test Weapon Alpha",
        type: "WeaponGun",
        sub_type: "Ballistic",
        size: "S3",
        grade: "A",
        manufacturer: "Behring",
      })
      .returning("*")

    testGameItemId = gameItem.id

    // Create test ship
    const [ship] = await knex("game_items")
      .insert({
        name: "Test Fighter",
        type: "Ship",
        manufacturer: "Anvil Aerospace",
        size: "Small",
      })
      .returning("*")

    testShipId = ship.id

    // Create test attributes for ship
    await knex("game_item_attributes").insert([
      {
        game_item_id: testShipId,
        attribute_name: "ship_focus",
        attribute_value: "Combat",
      },
      {
        game_item_id: testShipId,
        attribute_name: "description",
        attribute_value: "A nimble fighter craft",
      },
    ])

    // Create test resource
    await knex("resources").insert({
      version_id: testVersionId,
      game_item_id: testGameItemId,
      resource_category: "Metals",
      resource_subcategory: "Refined",
      can_be_mined: true,
      can_be_purchased: true,
    })
  })

  afterAll(async () => {
    const knex = getKnex()

    // Clean up test data
    await knex("game_item_attributes").where("game_item_id", testShipId).del()
    await knex("resources").where("version_id", testVersionId).del()
    await knex("game_items").where("id", testGameItemId).del()
    await knex("game_items").where("id", testShipId).del()
    await knex("game_versions").where("version_id", testVersionId).del()
  })

  describe("searchItems", () => {
    it("should return items with default pagination", async () => {
      const result = await controller.searchItems(
        undefined, // text
        undefined, // type
        undefined, // sub_type
        undefined, // size
        undefined, // grade
        undefined, // manufacturer
        undefined, // category
        undefined, // version_id
        1, // page
        20, // page_size
      )

      expect(result).toBeDefined()
      expect(result.items).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should filter items by type", async () => {
      const result = await controller.searchItems(
        undefined,
        "WeaponGun",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
      )

      expect(result).toBeDefined()
      expect(result.items).toBeInstanceOf(Array)

      // All returned items should have type WeaponGun
      for (const item of result.items) {
        expect(item.type).toBe("WeaponGun")
      }
    })

    it("should filter items by manufacturer", async () => {
      const result = await controller.searchItems(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "Behring",
        undefined,
        undefined,
        1,
        20,
      )

      expect(result).toBeDefined()
      expect(result.items).toBeInstanceOf(Array)

      // All returned items should have manufacturer Behring
      for (const item of result.items) {
        expect(item.manufacturer).toBe("Behring")
      }
    })

    it("should search items by text", async () => {
      const result = await controller.searchItems(
        "Test Weapon",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
      )

      expect(result).toBeDefined()
      expect(result.items).toBeInstanceOf(Array)

      // Should find our test weapon
      const foundItem = result.items.find((item) => item.id === testGameItemId)
      expect(foundItem).toBeDefined()
      expect(foundItem?.name).toBe("Test Weapon Alpha")
    })
  })

  describe("getItemDetail", () => {
    it("should return item detail with attributes", async () => {
      const result = await controller.getItemDetail(testGameItemId)

      expect(result).toBeDefined()
      expect(result.id).toBe(testGameItemId)
      expect(result.name).toBe("Test Weapon Alpha")
      expect(result.type).toBe("WeaponGun")
      expect(result.attributes).toBeDefined()
      expect(result.craftable_from).toBeInstanceOf(Array)
      expect(result.rewarded_by).toBeInstanceOf(Array)
      expect(result.market_stats).toBeDefined()
    })

    it("should throw error for non-existent item", async () => {
      await expect(
        controller.getItemDetail("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow()
    })
  })

  describe("getShips", () => {
    it("should return ships with default pagination", async () => {
      const result = await controller.getShips(
        undefined, // manufacturer
        undefined, // focus
        undefined, // size
        1, // page
        20, // page_size
      )

      expect(result).toBeDefined()
      expect(result.ships).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should filter ships by manufacturer", async () => {
      const result = await controller.getShips("Anvil Aerospace", undefined, undefined, 1, 20)

      expect(result).toBeDefined()
      expect(result.ships).toBeInstanceOf(Array)

      // All returned ships should have manufacturer Anvil Aerospace
      for (const ship of result.ships) {
        expect(ship.manufacturer).toBe("Anvil Aerospace")
      }
    })
  })

  describe("getShipDetail", () => {
    it("should return ship detail with attributes", async () => {
      const result = await controller.getShipDetail(testShipId)

      expect(result).toBeDefined()
      expect(result.id).toBe(testShipId)
      expect(result.name).toBe("Test Fighter")
      expect(result.manufacturer).toBe("Anvil Aerospace")
      expect(result.focus).toBe("Combat")
      expect(result.description).toBe("A nimble fighter craft")
      expect(result.attributes).toBeDefined()
    })

    it("should throw error for non-existent ship", async () => {
      await expect(
        controller.getShipDetail("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow()
    })
  })

  describe("getCommodities", () => {
    it("should return commodities with default pagination", async () => {
      const result = await controller.getCommodities(
        undefined, // category
        undefined, // can_be_mined
        1, // page
        20, // page_size
      )

      expect(result).toBeDefined()
      expect(result.commodities).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
    })

    it("should filter commodities by category", async () => {
      const result = await controller.getCommodities("Metals", undefined, 1, 20)

      expect(result).toBeDefined()
      expect(result.commodities).toBeInstanceOf(Array)

      // All returned commodities should have category Metals
      for (const commodity of result.commodities) {
        expect(commodity.resource_category).toBe("Metals")
      }
    })

    it("should filter commodities by mineable status", async () => {
      const result = await controller.getCommodities(undefined, true, 1, 20)

      expect(result).toBeDefined()
      expect(result.commodities).toBeInstanceOf(Array)

      // All returned commodities should be mineable
      for (const commodity of result.commodities) {
        expect(commodity.can_be_mined).toBe(true)
      }
    })
  })

  describe("getLocations", () => {
    it("should return location hierarchy", async () => {
      const result = await controller.getLocations()

      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(Array)

      // Each location should have required fields
      for (const location of result) {
        expect(location.id).toBeDefined()
        expect(location.name).toBeDefined()
        expect(location.type).toBeDefined()
        expect(location.children).toBeInstanceOf(Array)
      }
    })
  })

  describe("getManufacturers", () => {
    it("should return manufacturers with item counts", async () => {
      const result = await controller.getManufacturers()

      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(Array)

      // Each manufacturer should have required fields
      for (const manufacturer of result) {
        expect(manufacturer.manufacturer).toBeDefined()
        expect(manufacturer.item_count).toBeGreaterThanOrEqual(0)
      }

      // Should include our test manufacturer
      const behring = result.find((m) => m.manufacturer === "Behring")
      expect(behring).toBeDefined()
      expect(behring?.item_count).toBeGreaterThanOrEqual(1)
    })
  })

  describe("getManufacturerDetail", () => {
    it("should return manufacturer detail with items", async () => {
      const result = await controller.getManufacturerDetail("Behring")

      expect(result).toBeDefined()
      expect(result.manufacturer).toBe("Behring")
      expect(result.item_count).toBeGreaterThanOrEqual(1)
      expect(result.items).toBeInstanceOf(Array)

      // Should include our test item
      const testItem = result.items.find((item) => item.id === testGameItemId)
      expect(testItem).toBeDefined()
      expect(testItem?.name).toBe("Test Weapon Alpha")
    })

    it("should throw error for non-existent manufacturer", async () => {
      await expect(controller.getManufacturerDetail("NonExistentManufacturer")).rejects.toThrow()
    })
  })
})
