/**
 * Unit Tests for Feature Flag Service
 *
 * Tests specific scenarios and edge cases for the feature flag service.
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
})
