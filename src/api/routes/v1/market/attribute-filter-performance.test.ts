import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  getTestDatabase,
  setupTestDb,
  teardownTestDb,
} from "../../../../test-utils/testDb.js"
import { AttributeFilter } from "./types.js"
import { applyAttributeFilters } from "./attribute-query-optimizer.js"

describe("Attribute Filter Performance Tests", () => {
  const PERFORMANCE_THRESHOLD_MS = 2000 // Requirement 7.5: queries must complete within 2 seconds

  beforeAll(async () => {
    await setupTestDb()
  })

  afterAll(async () => {
    await teardownTestDb()
  })

  describe("Query Performance with Different Filter Counts", () => {
    it("should complete query with 0 attribute filters within 2 seconds", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const startTime = Date.now()

      // Query without any attribute filters
      const query = knex("market_search_materialized")
        .select("*")
        .where("quantity_available", ">", 0)
        .limit(100)

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })

    it("should complete query with 1 attribute filter within 2 seconds", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["4"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })

    it("should complete query with 2 attribute filters within 2 seconds", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["4"], operator: "in" },
        { name: "class", values: ["Military"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })

    it("should complete query with 3+ attribute filters within 2 seconds", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["4", "5"], operator: "in" },
        { name: "class", values: ["Military", "Stealth"], operator: "in" },
        { name: "grade", values: ["A", "B"], operator: "in" },
        { name: "manufacturer", values: ["Behring"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })
  })

  describe("Query Performance with Multiple Values", () => {
    it("should handle OR logic within single attribute efficiently", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        {
          name: "size",
          values: ["1", "2", "3", "4", "5", "6"],
          operator: "in",
        },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })

    it("should handle complex multi-attribute multi-value filters efficiently", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["1", "2", "3", "4"], operator: "in" },
        {
          name: "class",
          values: ["Military", "Stealth", "Industrial"],
          operator: "in",
        },
        { name: "grade", values: ["A", "B", "C"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })
  })

  describe("Buy Order Query Performance", () => {
    it("should complete buy order query with attribute filters within 2 seconds", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["4"], operator: "in" },
        { name: "class", values: ["Military"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("buy_orders")
        .join("game_items", "buy_orders.game_item_id", "game_items.id")
        .select("buy_orders.*")
        .where("buy_orders.status", "active")
        .limit(100)

      query = applyAttributeFilters(query, filters, "game_items.id", knex)

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })
  })

  describe("Materialized View Refresh Performance", () => {
    it("should refresh market_search_materialized view within reasonable time", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const startTime = Date.now()

      // Refresh the materialized view
      await knex.raw(
        "REFRESH MATERIALIZED VIEW CONCURRENTLY market_search_materialized",
      )

      const duration = Date.now() - startTime

      // Materialized view refresh can take longer than query execution
      // Set a reasonable threshold (e.g., 30 seconds for large datasets)
      const REFRESH_THRESHOLD_MS = 30000

      expect(duration).toBeLessThan(REFRESH_THRESHOLD_MS)
    }, 35000) // Set test timeout to 35 seconds
  })

  describe("Common Filter Combinations Performance", () => {
    it("should handle quantum drive filters (size + class) efficiently", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["4"], operator: "in" },
        { name: "class", values: ["Military"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("item_type", "Quantum Drive")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })

    it("should handle component filters (size + grade) efficiently", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["2"], operator: "in" },
        { name: "grade", values: ["A"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("item_type", "Cooler")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })

    it("should handle armor filters (armor_type + color) efficiently", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "armor_type", values: ["Heavy"], operator: "in" },
        { name: "color", values: ["Black"], operator: "in" },
      ]

      const startTime = Date.now()

      let query = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("item_type", "Armor")
        .where("quantity_available", ">", 0)
        .limit(100)

      query = applyAttributeFilters(
        query,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )

      await query

      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
    })
  })

  describe("Performance Degradation Tests", () => {
    it("should not degrade significantly with pagination", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["4"], operator: "in" },
        { name: "class", values: ["Military"], operator: "in" },
      ]

      // Test first page
      const startTime1 = Date.now()

      let query1 = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("quantity_available", ">", 0)
        .limit(100)
        .offset(0)

      query1 = applyAttributeFilters(
        query1,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )
      await query1

      const duration1 = Date.now() - startTime1

      // Test deep pagination (page 10)
      const startTime2 = Date.now()

      let query2 = knex("market_search_materialized")
        .select("market_search_materialized.*")
        .where("quantity_available", ">", 0)
        .limit(100)
        .offset(1000)

      query2 = applyAttributeFilters(
        query2,
        filters,
        "market_search_materialized.game_item_id",
        knex,
      )
      await query2

      const duration2 = Date.now() - startTime2

      // Both should be under threshold
      expect(duration1).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
      expect(duration2).toBeLessThan(PERFORMANCE_THRESHOLD_MS)

      // Deep pagination should not be significantly slower (within 50% of first page)
      expect(duration2).toBeLessThan(duration1 * 1.5)
    })

    it("should maintain performance with sorting", async () => {
      const db = getTestDatabase()
      const knex = db.knex

      const filters: AttributeFilter[] = [
        { name: "size", values: ["4"], operator: "in" },
      ]

      const sortOptions = ["price_per_unit", "timestamp", "quantity_available"]

      for (const sortBy of sortOptions) {
        const startTime = Date.now()

        let query = knex("market_search_materialized")
          .select("market_search_materialized.*")
          .where("quantity_available", ">", 0)
          .orderBy(sortBy, "desc")
          .limit(100)

        query = applyAttributeFilters(
          query,
          filters,
          "market_search_materialized.game_item_id",
          knex,
        )

        await query

        const duration = Date.now() - startTime

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
      }
    })
  })
})
