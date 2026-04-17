/**
 * Unit Tests for Debug V2 Controller
 *
 * Tests the debug endpoints for feature flag management.
 * Validates authentication, authorization, and feature flag operations.
 *
 * Requirements: 2.1-2.10, 59.1-59.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { DebugV2Controller } from "./DebugV2Controller.js"
import { Request as ExpressRequest } from "express"
import { User } from "../../v1/api-models.js"
import { featureFlagService } from "../../../../services/market-v2/feature-flag.service.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { BusinessLogicError } from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"

describe("DebugV2Controller", () => {
  const db = getKnex()

  beforeEach(async () => {
    featureFlagService.clearAllCache()
  })

  afterEach(async () => {
    await db("user_preferences").delete()
    featureFlagService.clearAllCache()
  })

  /**
   * Helper to create a mock request with user
   */
  function createMockRequest(user: Partial<User> | null): ExpressRequest {
    return {
      user: user as User,
    } as ExpressRequest
  }

  describe("getFeatureFlag", () => {
    it("should return feature flag for authenticated user", async () => {
      const userId = "test-user-123"
      const user: Partial<User> = {
        user_id: userId,
        username: "testuser",
        role: "user",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      const result = await controller.getFeatureFlag(request)

      expect(result.user_id).toBe(userId)
      expect(result.market_version).toMatch(/^(V1|V2)$/)
      expect(typeof result.is_developer).toBe("boolean")
    })

    it("should return V1 as default market version", async () => {
      const userId = "test-user-456"
      const user: Partial<User> = {
        user_id: userId,
        username: "testuser2",
        role: "user",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      const result = await controller.getFeatureFlag(request)

      expect(result.market_version).toBe("V1")
    })

    it("should return is_developer=true for admin users", async () => {
      const userId = "admin-user-789"
      const user: Partial<User> = {
        user_id: userId,
        username: "adminuser",
        role: "admin",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      const result = await controller.getFeatureFlag(request)

      expect(result.is_developer).toBe(true)
    })

    it("should return is_developer=false for regular users in production", async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = "production"

      try {
        const userId = "regular-user-101"
        const user: Partial<User> = {
          user_id: userId,
          username: "regularuser",
          role: "user",
        }

        const request = createMockRequest(user)
        const controller = new DebugV2Controller(request)

        const result = await controller.getFeatureFlag(request)

        expect(result.is_developer).toBe(false)
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it("should return is_developer=true in development environment", async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = "development"

      try {
        const userId = "dev-user-202"
        const user: Partial<User> = {
          user_id: userId,
          username: "devuser",
          role: "user",
        }

        const request = createMockRequest(user)
        const controller = new DebugV2Controller(request)

        const result = await controller.getFeatureFlag(request)

        expect(result.is_developer).toBe(true)
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it("should return user's saved preference if exists", async () => {
      const userId = "pref-user-303"
      const user: Partial<User> = {
        user_id: userId,
        username: "prefuser",
        role: "user",
      }

      // Set user preference to V2
      await featureFlagService.setMarketVersion(userId, "V2")

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      const result = await controller.getFeatureFlag(request)

      expect(result.market_version).toBe("V2")
    })

    it("should throw UNAUTHORIZED for unauthenticated users", async () => {
      const request = createMockRequest(null)
      const controller = new DebugV2Controller(request)

      await expect(controller.getFeatureFlag(request)).rejects.toThrow(
        BusinessLogicError,
      )

      try {
        await controller.getFeatureFlag(request)
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessLogicError)
        expect((error as BusinessLogicError).code).toBe(ErrorCode.UNAUTHORIZED)
      }
    })
  })

  describe("setFeatureFlag", () => {
    it("should allow admin to set feature flag to V2", async () => {
      const userId = "admin-set-v2"
      const user: Partial<User> = {
        user_id: userId,
        username: "adminsetv2",
        role: "admin",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      const result = await controller.setFeatureFlag(
        { market_version: "V2" },
        request,
      )

      expect(result.user_id).toBe(userId)
      expect(result.market_version).toBe("V2")
      expect(result.message).toContain("V2")

      // Verify it was saved
      const savedVersion = await featureFlagService.getMarketVersion(userId)
      expect(savedVersion).toBe("V2")
    })

    it("should allow admin to set feature flag to V1", async () => {
      const userId = "admin-set-v1"
      const user: Partial<User> = {
        user_id: userId,
        username: "adminsetv1",
        role: "admin",
      }

      // First set to V2
      await featureFlagService.setMarketVersion(userId, "V2")

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      const result = await controller.setFeatureFlag(
        { market_version: "V1" },
        request,
      )

      expect(result.user_id).toBe(userId)
      expect(result.market_version).toBe("V1")
      expect(result.message).toContain("V1")

      // Verify it was saved
      const savedVersion = await featureFlagService.getMarketVersion(userId)
      expect(savedVersion).toBe("V1")
    })

    it("should deny regular users from setting feature flag", async () => {
      const userId = "regular-set-denied"
      const user: Partial<User> = {
        user_id: userId,
        username: "regulardenied",
        role: "user",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      await expect(
        controller.setFeatureFlag({ market_version: "V2" }, request),
      ).rejects.toThrow(BusinessLogicError)

      try {
        await controller.setFeatureFlag({ market_version: "V2" }, request)
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessLogicError)
        expect((error as BusinessLogicError).code).toBe(ErrorCode.FORBIDDEN)
      }
    })

    it("should deny unauthenticated users from setting feature flag", async () => {
      const request = createMockRequest(null)
      const controller = new DebugV2Controller(request)

      await expect(
        controller.setFeatureFlag({ market_version: "V2" }, request),
      ).rejects.toThrow(BusinessLogicError)

      try {
        await controller.setFeatureFlag({ market_version: "V2" }, request)
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessLogicError)
        expect((error as BusinessLogicError).code).toBe(ErrorCode.UNAUTHORIZED)
      }
    })

    it("should persist feature flag across multiple reads", async () => {
      const userId = "persist-test"
      const user: Partial<User> = {
        user_id: userId,
        username: "persisttest",
        role: "admin",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      // Set to V2
      await controller.setFeatureFlag({ market_version: "V2" }, request)

      // Read multiple times
      for (let i = 0; i < 3; i++) {
        const result = await controller.getFeatureFlag(request)
        expect(result.market_version).toBe("V2")
      }
    })

    it("should update existing preference when setting again", async () => {
      const userId = "update-pref"
      const user: Partial<User> = {
        user_id: userId,
        username: "updatepref",
        role: "admin",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      // Set to V2
      await controller.setFeatureFlag({ market_version: "V2" }, request)
      let result = await controller.getFeatureFlag(request)
      expect(result.market_version).toBe("V2")

      // Set back to V1
      await controller.setFeatureFlag({ market_version: "V1" }, request)
      result = await controller.getFeatureFlag(request)
      expect(result.market_version).toBe("V1")

      // Verify only one preference record exists
      const prefs = await db("user_preferences")
        .where({ user_id: userId })
        .select("*")
      expect(prefs).toHaveLength(1)
      expect(prefs[0].market_version).toBe("V1")
    })
  })

  describe("authorization edge cases", () => {
    it("should handle missing user object gracefully", async () => {
      const request = {} as ExpressRequest
      const controller = new DebugV2Controller(request)

      await expect(controller.getFeatureFlag(request)).rejects.toThrow(
        BusinessLogicError,
      )
    })

    it("should handle user without role field", async () => {
      const userId = "no-role-user"
      const user = {
        user_id: userId,
        username: "noroleuser",
        // role field missing
      } as Partial<User>

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      // Should not throw, should treat as non-admin
      const result = await controller.getFeatureFlag(request)
      expect(result.user_id).toBe(userId)
    })

    it("should handle concurrent set operations", async () => {
      const userId = "concurrent-user"
      const user: Partial<User> = {
        user_id: userId,
        username: "concurrentuser",
        role: "admin",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      // Set to V2 multiple times concurrently
      const promises = Array(5)
        .fill(null)
        .map(() =>
          controller.setFeatureFlag({ market_version: "V2" }, request),
        )

      const results = await Promise.all(promises)

      // All should succeed
      results.forEach((result) => {
        expect(result.market_version).toBe("V2")
      })

      // Final state should be V2
      const finalResult = await controller.getFeatureFlag(request)
      expect(finalResult.market_version).toBe("V2")
    })
  })

  describe("integration with feature flag service", () => {
    it("should respect global rollout configuration", async () => {
      // This test verifies the controller uses the service correctly
      const userId = "rollout-user"
      const user: Partial<User> = {
        user_id: userId,
        username: "rolloutuser",
        role: "user",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      // Get default (should be V1)
      const result = await controller.getFeatureFlag(request)
      expect(result.market_version).toBe("V1")
    })

    it("should clear cache when setting new version", async () => {
      const userId = "cache-clear-user"
      const user: Partial<User> = {
        user_id: userId,
        username: "cacheclearuser",
        role: "admin",
      }

      const request = createMockRequest(user)
      const controller = new DebugV2Controller(request)

      // Get initial version (caches it)
      await controller.getFeatureFlag(request)

      // Set new version
      await controller.setFeatureFlag({ market_version: "V2" }, request)

      // Get again - should reflect new version, not cached value
      const result = await controller.getFeatureFlag(request)
      expect(result.market_version).toBe("V2")
    })
  })
})
