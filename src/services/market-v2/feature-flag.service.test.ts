/**
 * Unit Tests for Feature Flag Service
 *
 * Tests specific scenarios and edge cases for the feature flag service.
 * Requirements: 2.6
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { FeatureFlagService } from "./feature-flag.service.js"
import { getKnex } from "../../clients/database/knex-db.js"

describe("Feature Flag Service - Unit Tests", () => {
  let service: FeatureFlagService
  const db = getKnex()

  beforeEach(async () => {
    service = new FeatureFlagService()
    service.clearAllCache()
  })

  afterEach(async () => {
    await db("user_preferences").delete()
    await db("feature_flag_config").where({ key: "market_version" }).delete()
    service.clearAllCache()
  })

  describe("getMarketVersion", () => {
    it("should default to V1 for new users", async () => {
      const userId = "test-user-1"

      const result = await service.getMarketVersion(userId)

      expect(result).toBe("V1")
    })

    it("should return V1 when explicitly set", async () => {
      const userId = "test-user-2"

      await service.setMarketVersion(userId, "V1")
      const result = await service.getMarketVersion(userId)

      expect(result).toBe("V1")
    })

    it("should return V2 when explicitly set", async () => {
      const userId = "test-user-3"

      await service.setMarketVersion(userId, "V2")
      const result = await service.getMarketVersion(userId)

      expect(result).toBe("V2")
    })

    it("should use cached value on subsequent calls", async () => {
      const userId = "test-user-4"

      await service.setMarketVersion(userId, "V2")

      // First call - populates cache
      const result1 = await service.getMarketVersion(userId)
      expect(result1).toBe("V2")

      // Delete from database to verify cache is used
      await db("user_preferences").where({ user_id: userId }).delete()

      // Second call - should still return V2 from cache
      const result2 = await service.getMarketVersion(userId)
      expect(result2).toBe("V2")
    })

    it("should fetch from database when cache is cleared", async () => {
      const userId = "test-user-5"

      await service.setMarketVersion(userId, "V2")

      // First call - populates cache
      const result1 = await service.getMarketVersion(userId)
      expect(result1).toBe("V2")

      // Clear cache
      service.clearCache(userId)

      // Second call - should fetch from database
      const result2 = await service.getMarketVersion(userId)
      expect(result2).toBe("V2")
    })
  })

  describe("setMarketVersion", () => {
    it("should create preference for new user", async () => {
      const userId = "test-user-6"

      await service.setMarketVersion(userId, "V2")

      const preference = await db("user_preferences")
        .where({ user_id: userId })
        .first()

      expect(preference).toBeDefined()
      expect(preference?.market_version).toBe("V2")
    })

    it("should update preference for existing user", async () => {
      const userId = "test-user-7"

      // Set to V1
      await service.setMarketVersion(userId, "V1")
      let preference = await db("user_preferences")
        .where({ user_id: userId })
        .first()
      expect(preference?.market_version).toBe("V1")

      // Update to V2
      await service.setMarketVersion(userId, "V2")
      preference = await db("user_preferences")
        .where({ user_id: userId })
        .first()
      expect(preference?.market_version).toBe("V2")
    })

    it("should update cache when setting version", async () => {
      const userId = "test-user-8"

      await service.setMarketVersion(userId, "V2")

      // Delete from database
      await db("user_preferences").where({ user_id: userId }).delete()

      // Should still return V2 from cache
      const result = await service.getMarketVersion(userId)
      expect(result).toBe("V2")
    })

    it("should reject invalid market version", async () => {
      const userId = "test-user-9"

      await expect(
        service.setMarketVersion(userId, "V3" as any),
      ).rejects.toThrow("Invalid market version")
    })

    it("should not create duplicate records", async () => {
      const userId = "test-user-10"

      // Set version multiple times
      await service.setMarketVersion(userId, "V1")
      await service.setMarketVersion(userId, "V2")
      await service.setMarketVersion(userId, "V1")

      // Should only have one record
      const records = await db("user_preferences")
        .where({ user_id: userId })
        .select("*")

      expect(records).toHaveLength(1)
      expect(records[0].market_version).toBe("V1")
    })
  })

  describe("switching between V1 and V2", () => {
    it("should allow switching from V1 to V2", async () => {
      const userId = "test-user-11"

      await service.setMarketVersion(userId, "V1")
      let result = await service.getMarketVersion(userId)
      expect(result).toBe("V1")

      await service.setMarketVersion(userId, "V2")
      result = await service.getMarketVersion(userId)
      expect(result).toBe("V2")
    })

    it("should allow switching from V2 to V1", async () => {
      const userId = "test-user-12"

      await service.setMarketVersion(userId, "V2")
      let result = await service.getMarketVersion(userId)
      expect(result).toBe("V2")

      await service.setMarketVersion(userId, "V1")
      result = await service.getMarketVersion(userId)
      expect(result).toBe("V1")
    })

    it("should allow multiple switches", async () => {
      const userId = "test-user-13"

      await service.setMarketVersion(userId, "V1")
      expect(await service.getMarketVersion(userId)).toBe("V1")

      await service.setMarketVersion(userId, "V2")
      expect(await service.getMarketVersion(userId)).toBe("V2")

      await service.setMarketVersion(userId, "V1")
      expect(await service.getMarketVersion(userId)).toBe("V1")

      await service.setMarketVersion(userId, "V2")
      expect(await service.getMarketVersion(userId)).toBe("V2")
    })
  })

  describe("persistence across sessions", () => {
    it("should persist preference after cache clear", async () => {
      const userId = "test-user-14"

      await service.setMarketVersion(userId, "V2")
      service.clearCache(userId)

      const result = await service.getMarketVersion(userId)
      expect(result).toBe("V2")
    })

    it("should persist preference after service restart", async () => {
      const userId = "test-user-15"

      await service.setMarketVersion(userId, "V2")

      // Simulate service restart by creating new instance
      const newService = new FeatureFlagService()
      const result = await newService.getMarketVersion(userId)

      expect(result).toBe("V2")
    })

    it("should persist preference after full cache clear", async () => {
      const userId = "test-user-16"

      await service.setMarketVersion(userId, "V2")
      service.clearAllCache()

      const result = await service.getMarketVersion(userId)
      expect(result).toBe("V2")
    })
  })

  describe("cache management", () => {
    it("should clear cache for specific user", async () => {
      const userId1 = "test-user-17"
      const userId2 = "test-user-18"

      await service.setMarketVersion(userId1, "V2")
      await service.setMarketVersion(userId2, "V1")

      // Delete user1 from database
      await db("user_preferences").where({ user_id: userId1 }).delete()

      // Clear only user1's cache
      service.clearCache(userId1)

      // User1 should default to V1 (no database record)
      expect(await service.getMarketVersion(userId1)).toBe("V1")

      // User2 should still have V1 from cache
      await db("user_preferences").where({ user_id: userId2 }).delete()
      expect(await service.getMarketVersion(userId2)).toBe("V1")
    })

    it("should clear all cache", async () => {
      const userId1 = "test-user-19"
      const userId2 = "test-user-20"

      await service.setMarketVersion(userId1, "V2")
      await service.setMarketVersion(userId2, "V2")

      // Delete from database
      await db("user_preferences")
        .whereIn("user_id", [userId1, userId2])
        .delete()

      // Clear all cache
      service.clearAllCache()

      // Both should default to V1 (no database records)
      expect(await service.getMarketVersion(userId1)).toBe("V1")
      expect(await service.getMarketVersion(userId2)).toBe("V1")
    })
  })

  describe("concurrent users", () => {
    it("should handle multiple users independently", async () => {
      const user1 = "test-user-21"
      const user2 = "test-user-22"
      const user3 = "test-user-23"

      await service.setMarketVersion(user1, "V1")
      await service.setMarketVersion(user2, "V2")
      await service.setMarketVersion(user3, "V1")

      expect(await service.getMarketVersion(user1)).toBe("V1")
      expect(await service.getMarketVersion(user2)).toBe("V2")
      expect(await service.getMarketVersion(user3)).toBe("V1")
    })

    it("should not interfere with other users when updating", async () => {
      const user1 = "test-user-24"
      const user2 = "test-user-25"

      await service.setMarketVersion(user1, "V1")
      await service.setMarketVersion(user2, "V2")

      // Update user1
      await service.setMarketVersion(user1, "V2")

      // User2 should be unchanged
      expect(await service.getMarketVersion(user2)).toBe("V2")
      expect(await service.getMarketVersion(user1)).toBe("V2")
    })
  })

  describe("percentage rollout (Requirement 2.6)", () => {
    it("should support percentage-based rollout when default is V1", async () => {
      // Set up 50% rollout to V2
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 50,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      // Test 100 users - approximately 50% should get V2
      const users = Array.from({ length: 100 }, (_, i) => `test-user-${i}`)
      const results = await Promise.all(
        users.map((userId) => service.getMarketVersion(userId)),
      )

      const v2Count = results.filter((v) => v === "V2").length
      const v1Count = results.filter((v) => v === "V1").length

      // Allow 10% variance (45-55 users should get V2)
      expect(v2Count).toBeGreaterThanOrEqual(40)
      expect(v2Count).toBeLessThanOrEqual(60)
      expect(v1Count).toBeGreaterThanOrEqual(40)
      expect(v1Count).toBeLessThanOrEqual(60)
      expect(v2Count + v1Count).toBe(100)
    })

    it("should support percentage-based rollout when default is V2", async () => {
      // Set up 70% rollout to V2 (30% get V1)
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V2",
          rollout_percentage: 70,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      const users = Array.from({ length: 100 }, (_, i) => `test-user-${i}`)
      const results = await Promise.all(
        users.map((userId) => service.getMarketVersion(userId)),
      )

      const v2Count = results.filter((v) => v === "V2").length
      const v1Count = results.filter((v) => v === "V1").length

      // 70% should get V2, 30% should get V1 (allow 10% variance)
      expect(v2Count).toBeGreaterThanOrEqual(60)
      expect(v2Count).toBeLessThanOrEqual(80)
      expect(v1Count).toBeGreaterThanOrEqual(20)
      expect(v1Count).toBeLessThanOrEqual(40)
    })

    it("should give same user consistent version across calls", async () => {
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 50,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      const userId = "consistent-user"

      // Call multiple times
      const version1 = await service.getMarketVersion(userId)
      service.clearCache(userId)
      const version2 = await service.getMarketVersion(userId)
      service.clearCache(userId)
      const version3 = await service.getMarketVersion(userId)

      // Should always get same version
      expect(version1).toBe(version2)
      expect(version2).toBe(version3)
    })

    it("should respect 0% rollout (all users get default)", async () => {
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 0,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      const users = Array.from({ length: 20 }, (_, i) => `test-user-${i}`)
      const results = await Promise.all(
        users.map((userId) => service.getMarketVersion(userId)),
      )

      // All should get V1
      expect(results.every((v) => v === "V1")).toBe(true)
    })

    it("should respect 100% rollout to V2", async () => {
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 100,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      const users = Array.from({ length: 20 }, (_, i) => `test-user-${i}`)
      const results = await Promise.all(
        users.map((userId) => service.getMarketVersion(userId)),
      )

      // All should get V2
      expect(results.every((v) => v === "V2")).toBe(true)
    })

    it("should prioritize user override over percentage rollout", async () => {
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 100, // 100% rollout to V2
          enabled: true,
        })
        .onConflict("key")
        .merge()

      const userId = "override-user"

      // Set explicit override to V1
      await service.setMarketVersion(userId, "V1")

      // Should get V1 despite 100% rollout to V2
      const version = await service.getMarketVersion(userId)
      expect(version).toBe("V1")
    })

    it("should return V1 when feature flag is disabled", async () => {
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V2",
          rollout_percentage: 100,
          enabled: false, // Disabled
        })
        .onConflict("key")
        .merge()

      const users = Array.from({ length: 10 }, (_, i) => `test-user-${i}`)
      const results = await Promise.all(
        users.map((userId) => service.getMarketVersion(userId)),
      )

      // All should get V1 when disabled
      expect(results.every((v) => v === "V1")).toBe(true)
    })

    it("should handle config updates and cache invalidation", async () => {
      // Start with 0% rollout
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 0,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      const userId = "test-user-config-update"
      const version1 = await service.getMarketVersion(userId)
      expect(version1).toBe("V1")

      // Update to 100% rollout
      await service.updateConfig({ rollout_percentage: 100 })
      service.clearCache(userId)

      const version2 = await service.getMarketVersion(userId)
      expect(version2).toBe("V2")
    })
  })

  describe("stats and admin features (Requirement 2.6)", () => {
    it("should return accurate stats", async () => {
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 50,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      // Create some overrides
      await service.setMarketVersion("user1", "V1")
      await service.setMarketVersion("user2", "V2")
      await service.setMarketVersion("user3", "V2")

      const stats = await service.getStats()

      expect(stats.total_overrides).toBe(3)
      expect(stats.v1_overrides).toBe(1)
      expect(stats.v2_overrides).toBe(2)
      expect(stats.rollout_percentage).toBe(50)
      expect(stats.default_version).toBe("V1")
      expect(stats.enabled).toBe(true)
    })

    it("should list user overrides with pagination", async () => {
      // Create 10 overrides
      for (let i = 0; i < 10; i++) {
        await service.setMarketVersion(`user${i}`, i % 2 === 0 ? "V1" : "V2")
      }

      // Get first page
      const page1 = await service.getUserOverrides(1, 5)
      expect(page1.overrides).toHaveLength(5)
      expect(page1.total).toBe(10)

      // Get second page
      const page2 = await service.getUserOverrides(2, 5)
      expect(page2.overrides).toHaveLength(5)
      expect(page2.total).toBe(10)

      // Ensure no duplicates
      const allUserIds = [
        ...page1.overrides.map((o) => o.user_id),
        ...page2.overrides.map((o) => o.user_id),
      ]
      const uniqueUserIds = new Set(allUserIds)
      expect(uniqueUserIds.size).toBe(10)
    })

    it("should remove user override", async () => {
      const userId = "user-to-remove"

      await service.setMarketVersion(userId, "V2")
      expect(await service.getMarketVersion(userId)).toBe("V2")

      await service.removeUserOverride(userId)

      // Should now use default/rollout logic
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 0,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      service.clearCache(userId)
      expect(await service.getMarketVersion(userId)).toBe("V1")
    })

    it("should update config successfully", async () => {
      await db("feature_flag_config")
        .insert({
          key: "market_version",
          default_version: "V1",
          rollout_percentage: 0,
          enabled: true,
        })
        .onConflict("key")
        .merge()

      const updated = await service.updateConfig({
        default_version: "V2",
        rollout_percentage: 75,
        enabled: false,
      })

      expect(updated.default_version).toBe("V2")
      expect(updated.rollout_percentage).toBe(75)
      expect(updated.enabled).toBe(false)

      // Verify it persisted
      const config = await service.getConfig()
      expect(config.default_version).toBe("V2")
      expect(config.rollout_percentage).toBe(75)
      expect(config.enabled).toBe(false)
    })
  })
})
