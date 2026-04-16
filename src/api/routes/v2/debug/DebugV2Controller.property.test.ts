/**
 * Property-Based Tests for Debug V2 Controller
 *
 * Tests authorization properties using fast-check for property-based testing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { DebugV2Controller } from "./DebugV2Controller.js"
import { Request as ExpressRequest } from "express"
import { User } from "../../v1/api-models.js"
import { featureFlagService, MarketVersion } from "../../../../services/market-v2/feature-flag.service.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { BusinessLogicError } from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"

describe("Debug V2 Controller - Property Tests", () => {
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

  /**
   * Property 3: Debug Panel Authorization
   * Validates: Requirements 3.5
   *
   * Only users with developer privileges (admin role) should be able to set feature flags.
   * All authenticated users should be able to read their feature flag.
   */
  describe("Property 3: Debug Panel Authorization", () => {
    it("should allow admin users to set feature flags", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // user_id
          fc.string({ minLength: 3, maxLength: 20 }), // username
          fc.constantFrom<MarketVersion>("V1", "V2"), // market_version
          async (userId, username, marketVersion) => {
            // Create admin user
            const adminUser: Partial<User> = {
              user_id: userId,
              username,
              role: "admin",
            }

            const request = createMockRequest(adminUser)
            const controller = new DebugV2Controller(request)

            // Admin should be able to set feature flag
            const result = await controller.setFeatureFlag({
              market_version: marketVersion,
            })

            expect(result.user_id).toBe(userId)
            expect(result.market_version).toBe(marketVersion)
            expect(result.message).toContain(marketVersion)

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            featureFlagService.clearCache(userId)
          },
        ),
        { numRuns: 30 },
      )
    })

    it("should deny non-admin users from setting feature flags", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // user_id
          fc.string({ minLength: 3, maxLength: 20 }), // username
          fc.constantFrom<MarketVersion>("V1", "V2"), // market_version
          async (userId, username, marketVersion) => {
            // Create regular user (non-admin)
            const regularUser: Partial<User> = {
              user_id: userId,
              username,
              role: "user",
            }

            const request = createMockRequest(regularUser)
            const controller = new DebugV2Controller(request)

            // Regular user should NOT be able to set feature flag
            await expect(
              controller.setFeatureFlag({
                market_version: marketVersion,
              }),
            ).rejects.toThrow(BusinessLogicError)

            // Verify it throws FORBIDDEN error
            try {
              await controller.setFeatureFlag({
                market_version: marketVersion,
              })
            } catch (error) {
              expect(error).toBeInstanceOf(BusinessLogicError)
              expect((error as BusinessLogicError).code).toBe(
                ErrorCode.FORBIDDEN,
              )
            }

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            featureFlagService.clearCache(userId)
          },
        ),
        { numRuns: 30 },
      )
    })

    it("should deny unauthenticated users from setting feature flags", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<MarketVersion>("V1", "V2"),
          async (marketVersion) => {
            // No user in request
            const request = createMockRequest(null)
            const controller = new DebugV2Controller(request)

            // Unauthenticated user should NOT be able to set feature flag
            await expect(
              controller.setFeatureFlag({
                market_version: marketVersion,
              }),
            ).rejects.toThrow(BusinessLogicError)

            // Verify it throws UNAUTHORIZED error
            try {
              await controller.setFeatureFlag({
                market_version: marketVersion,
              })
            } catch (error) {
              expect(error).toBeInstanceOf(BusinessLogicError)
              expect((error as BusinessLogicError).code).toBe(
                ErrorCode.UNAUTHORIZED,
              )
            }
          },
        ),
        { numRuns: 20 },
      )
    })

    it("should allow all authenticated users to read their feature flag", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // user_id
          fc.string({ minLength: 3, maxLength: 20 }), // username
          fc.constantFrom<"user" | "admin">("user", "admin"), // role
          async (userId, username, role) => {
            // Create user with any role
            const user: Partial<User> = {
              user_id: userId,
              username,
              role,
            }

            const request = createMockRequest(user)
            const controller = new DebugV2Controller(request)

            // Any authenticated user should be able to read feature flag
            const result = await controller.getFeatureFlag()

            expect(result.user_id).toBe(userId)
            expect(result.market_version).toMatch(/^(V1|V2)$/)
            expect(result.is_developer).toBe(role === "admin")

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            featureFlagService.clearCache(userId)
          },
        ),
        { numRuns: 30 },
      )
    })

    it("should deny unauthenticated users from reading feature flags", async () => {
      // No user in request
      const request = createMockRequest(null)
      const controller = new DebugV2Controller(request)

      // Unauthenticated user should NOT be able to read feature flag
      await expect(controller.getFeatureFlag()).rejects.toThrow(
        BusinessLogicError,
      )

      // Verify it throws UNAUTHORIZED error
      try {
        await controller.getFeatureFlag()
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessLogicError)
        expect((error as BusinessLogicError).code).toBe(ErrorCode.UNAUTHORIZED)
      }
    })

    it("should correctly identify developers based on admin role", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 3, maxLength: 20 }),
          fc.constantFrom<"user" | "admin">("user", "admin"),
          async (userId, username, role) => {
            const user: Partial<User> = {
              user_id: userId,
              username,
              role,
            }

            const request = createMockRequest(user)
            const controller = new DebugV2Controller(request)

            const result = await controller.getFeatureFlag()

            // is_developer should be true only for admin role
            expect(result.is_developer).toBe(role === "admin")

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            featureFlagService.clearCache(userId)
          },
        ),
        { numRuns: 30 },
      )
    })
  })

  /**
   * Property: Authorization Consistency
   *
   * Authorization decisions should be consistent across multiple calls.
   */
  describe("Property: Authorization Consistency", () => {
    it("should consistently enforce authorization for the same user", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 3, maxLength: 20 }),
          fc.constantFrom<"user" | "admin">("user", "admin"),
          fc.constantFrom<MarketVersion>("V1", "V2"),
          fc.integer({ min: 2, max: 5 }),
          async (userId, username, role, marketVersion, attempts) => {
            const user: Partial<User> = {
              user_id: userId,
              username,
              role,
            }

            // Try setting feature flag multiple times
            for (let i = 0; i < attempts; i++) {
              const request = createMockRequest(user)
              const controller = new DebugV2Controller(request)

              if (role === "admin") {
                // Admin should always succeed
                const result = await controller.setFeatureFlag({
                  market_version: marketVersion,
                })
                expect(result.market_version).toBe(marketVersion)
              } else {
                // Regular user should always fail
                await expect(
                  controller.setFeatureFlag({
                    market_version: marketVersion,
                  }),
                ).rejects.toThrow(BusinessLogicError)
              }
            }

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            featureFlagService.clearCache(userId)
          },
        ),
        { numRuns: 20 },
      )
    })
  })
})
