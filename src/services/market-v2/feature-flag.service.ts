/**
 * Feature Flag Service
 *
 * Manages user preferences for market version (V1/V2) feature flag.
 * Supports per-user configuration with session caching.
 */

import { getKnex } from "../../clients/database/knex-db.js"

export type MarketVersion = "V1" | "V2"

export interface UserPreference {
  preference_id: string
  user_id: string
  market_version: MarketVersion
  created_at: Date
  updated_at: Date
}

/**
 * Session cache for feature flags
 * In production, this would be replaced with Redis or similar
 */
const sessionCache = new Map<string, MarketVersion>()

export class FeatureFlagService {
  /**
   * Get market version for a user
   * Returns V1 by default for users without preferences
   *
   * @param userId - User ID to get preference for
   * @returns Market version (V1 or V2)
   */
  async getMarketVersion(userId: string): Promise<MarketVersion> {
    // Check session cache first
    const cached = sessionCache.get(userId)
    if (cached) {
      return cached
    }

    // Query database
    const db = getKnex()
    const preference = await db<UserPreference>("user_preferences")
      .where({ user_id: userId })
      .first()

    const version = preference?.market_version ?? "V1"

    // Cache the result
    sessionCache.set(userId, version)

    return version
  }

  /**
   * Set market version for a user
   * Creates preference if it doesn't exist, updates if it does
   *
   * @param userId - User ID to set preference for
   * @param version - Market version to set (V1 or V2)
   */
  async setMarketVersion(
    userId: string,
    version: MarketVersion
  ): Promise<void> {
    // Validate version
    if (version !== "V1" && version !== "V2") {
      throw new Error(`Invalid market version: ${version}. Must be V1 or V2.`)
    }

    // Upsert preference
    const db = getKnex()
    await db<UserPreference>("user_preferences")
      .insert({
        user_id: userId,
        market_version: version,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict("user_id")
      .merge({
        market_version: version,
        updated_at: new Date(),
      })

    // Update cache
    sessionCache.set(userId, version)
  }

  /**
   * Clear session cache for a user
   * Useful for testing or forcing a fresh database lookup
   *
   * @param userId - User ID to clear cache for
   */
  clearCache(userId: string): void {
    sessionCache.delete(userId)
  }

  /**
   * Clear all session cache
   * Useful for testing
   */
  clearAllCache(): void {
    sessionCache.clear()
  }
}

// Export singleton instance
export const featureFlagService = new FeatureFlagService()
