/**
 * Property-Based Tests for Feature Flag Service
 *
 * Tests correctness properties using fast-check for property-based testing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { FeatureFlagService, MarketVersion } from "./feature-flag.service.js"
import { getKnex } from "../../clients/database/knex-db.js"

describe("Feature Flag Service - Property Tests", () => {
  let service: FeatureFlagService
  const db = getKnex()

  beforeEach(async () => {
    service = new FeatureFlagService()
    // Clear cache before each test
    service.clearAllCache()
  })

  afterEach(async () => {
    // Clean up test data
    await db("user_preferences").delete()
    service.clearAllCache()
  })

  /**
   * Property 2: Feature Flag Routing
   * Validates: Requirements 2.1, 2.2, 2.3
   *
   * For any user with a feature flag set to V1 or V2,
   * the service must return the correct version consistently.
   */
  describe("Property 2: Feature Flag Routing", () => {
    it("should consistently return the set market version for any user", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // user_id
          fc.constantFrom<MarketVersion>("V1", "V2"), // market_version
          async (userId, marketVersion) => {
            // Set the market version
            await service.setMarketVersion(userId, marketVersion)

            // Get the market version multiple times
            const result1 = await service.getMarketVersion(userId)
            const result2 = await service.getMarketVersion(userId)
            const result3 = await service.getMarketVersion(userId)

            // All results should match the set version
            expect(result1).toBe(marketVersion)
            expect(result2).toBe(marketVersion)
            expect(result3).toBe(marketVersion)

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            service.clearCache(userId)
          },
        ),
        { numRuns: 50 },
      )
    })

    it("should route different users to their respective versions", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              userId: fc.uuid(),
              version: fc.constantFrom<MarketVersion>("V1", "V2"),
            }),
            { minLength: 2, maxLength: 10 },
          ),
          async (users) => {
            // Set market versions for all users
            for (const user of users) {
              await service.setMarketVersion(user.userId, user.version)
            }

            // Verify each user gets their correct version
            for (const user of users) {
              const result = await service.getMarketVersion(user.userId)
              expect(result).toBe(user.version)
            }

            // Clean up
            for (const user of users) {
              await db("user_preferences")
                .where({ user_id: user.userId })
                .delete()
              service.clearCache(user.userId)
            }
          },
        ),
        { numRuns: 20 },
      )
    })

    it("should default to V1 for users without preferences", async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (userId) => {
          // Ensure no preference exists
          await db("user_preferences").where({ user_id: userId }).delete()
          service.clearCache(userId)

          // Get market version should default to V1
          const result = await service.getMarketVersion(userId)
          expect(result).toBe("V1")
        }),
        { numRuns: 50 },
      )
    })

    it("should allow switching between V1 and V2", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(fc.constantFrom<MarketVersion>("V1", "V2"), {
            minLength: 2,
            maxLength: 10,
          }),
          async (userId, versions) => {
            // Switch through all versions in sequence
            for (const version of versions) {
              await service.setMarketVersion(userId, version)
              const result = await service.getMarketVersion(userId)
              expect(result).toBe(version)
            }

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            service.clearCache(userId)
          },
        ),
        { numRuns: 20 },
      )
    })
  })

  /**
   * Property: Cache Consistency
   *
   * The cache should always return the same value as the database.
   */
  describe("Property: Cache Consistency", () => {
    it("should maintain consistency between cache and database", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom<MarketVersion>("V1", "V2"),
          async (userId, marketVersion) => {
            // Set version (populates cache)
            await service.setMarketVersion(userId, marketVersion)

            // Get from cache
            const cachedResult = await service.getMarketVersion(userId)

            // Clear cache and get from database
            service.clearCache(userId)
            const dbResult = await service.getMarketVersion(userId)

            // Both should match
            expect(cachedResult).toBe(marketVersion)
            expect(dbResult).toBe(marketVersion)
            expect(cachedResult).toBe(dbResult)

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            service.clearCache(userId)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  /**
   * Property: Idempotency
   *
   * Setting the same version multiple times should have the same effect as setting it once.
   */
  describe("Property: Idempotency", () => {
    it("should be idempotent when setting the same version multiple times", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom<MarketVersion>("V1", "V2"),
          fc.integer({ min: 1, max: 5 }),
          async (userId, marketVersion, repeatCount) => {
            // Set the version multiple times
            for (let i = 0; i < repeatCount; i++) {
              await service.setMarketVersion(userId, marketVersion)
            }

            // Should still return the correct version
            const result = await service.getMarketVersion(userId)
            expect(result).toBe(marketVersion)

            // Should only have one record in database
            const records = await db("user_preferences")
              .where({ user_id: userId })
              .select("*")
            expect(records).toHaveLength(1)
            expect(records[0].market_version).toBe(marketVersion)

            // Clean up
            await db("user_preferences").where({ user_id: userId }).delete()
            service.clearCache(userId)
          },
        ),
        { numRuns: 30 },
      )
    })
  })
})
