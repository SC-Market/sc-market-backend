/**
 * Feature Flag Service
 *
 * Manages market version (V1/V2) rollout:
 * - Global config: default version, rollout percentage, enabled flag
 * - Per-user overrides stored in user_preferences
 * - Deterministic percentage rollout based on user ID hash
 * - Stats: counts of users on each version
 */

import { getKnex } from "../../clients/database/knex-db.js"
import crypto from "crypto"

export type MarketVersion = "V1" | "V2"

export interface UserPreference {
  preference_id: string
  user_id: string
  market_version: MarketVersion
  created_at: Date
  updated_at: Date
}

export interface FeatureFlagConfig {
  flag_name: string
  default_version: MarketVersion
  rollout_percentage: number
  enabled: boolean
  created_at: Date
  updated_at: Date
}

export interface FeatureFlagStats {
  total_overrides: number
  v1_overrides: number
  v2_overrides: number
  rollout_percentage: number
  default_version: MarketVersion
  enabled: boolean
}

export interface UserOverride {
  user_id: string
  market_version: MarketVersion
  updated_at: Date
}

const CONFIG_KEY = "market_version"

/** Session cache for per-user resolved versions */
const sessionCache = new Map<string, MarketVersion>()

/** Cached global config (short TTL) */
let configCache: FeatureFlagConfig | null = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 30_000 // 30s

/**
 * Deterministic hash of user ID to a number 0-99.
 * Same user always gets the same bucket, so rollout is stable.
 */
function userBucket(userId: string): number {
  const hash = crypto.createHash("md5").update(userId).digest()
  return hash.readUInt16BE(0) % 100
}

export class FeatureFlagService {
  // ── Global config ──────────────────────────────────────────────

  async getConfig(): Promise<FeatureFlagConfig> {
    if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
      return configCache
    }
    const db = getKnex()
    const row = await db<FeatureFlagConfig>("feature_flag_config")
      .where({ flag_name: CONFIG_KEY })
      .first()

    const config: FeatureFlagConfig = row ?? {
      flag_name: CONFIG_KEY,
      default_version: "V1",
      rollout_percentage: 0,
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    }
    configCache = config
    configCacheTime = Date.now()
    return config
  }

  async updateConfig(
    updates: Partial<Pick<FeatureFlagConfig, "default_version" | "rollout_percentage" | "enabled">>,
  ): Promise<FeatureFlagConfig> {
    const db = getKnex()
    await db("feature_flag_config")
      .where({ flag_name: CONFIG_KEY })
      .update({ ...updates, updated_at: new Date() })

    configCache = null // bust cache
    return this.getConfig()
  }

  // ── Per-user resolution ────────────────────────────────────────

  /**
   * Resolve the effective market version for a user.
   * Priority: per-user override > percentage rollout > global default
   */
  async getMarketVersion(userId: string): Promise<MarketVersion> {
    const cached = sessionCache.get(userId)
    if (cached) return cached

    const db = getKnex()

    // 1. Check per-user override
    const pref = await db<UserPreference>("user_preferences")
      .where({ user_id: userId })
      .first()

    if (pref) {
      sessionCache.set(userId, pref.market_version)
      return pref.market_version
    }

    // 2. Check global config + percentage rollout
    const config = await this.getConfig()
    if (!config.enabled) {
      sessionCache.set(userId, "V1")
      return "V1"
    }

    let version = config.default_version
    if (config.rollout_percentage > 0 && config.default_version === "V1") {
      // Rollout: give V2 to rollout_percentage% of users
      if (userBucket(userId) < config.rollout_percentage) {
        version = "V2"
      }
    } else if (config.rollout_percentage > 0 && config.default_version === "V2") {
      // Inverse: give V1 to (100 - rollout_percentage)% of users
      if (userBucket(userId) >= config.rollout_percentage) {
        version = "V1"
      }
    }

    sessionCache.set(userId, version)
    return version
  }

  async setMarketVersion(userId: string, version: MarketVersion): Promise<void> {
    if (version !== "V1" && version !== "V2") {
      throw new Error(`Invalid market version: ${version}. Must be V1 or V2.`)
    }
    const db = getKnex()
    await db<UserPreference>("user_preferences")
      .insert({
        user_id: userId,
        market_version: version,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict("user_id")
      .merge({ market_version: version, updated_at: new Date() })

    sessionCache.set(userId, version)
  }

  // ── Per-user overrides (admin) ─────────────────────────────────

  async getUserOverrides(
    page = 1,
    pageSize = 50,
  ): Promise<{ overrides: UserOverride[]; total: number }> {
    const db = getKnex()
    const offset = (page - 1) * pageSize

    const [overrides, [{ count }]] = await Promise.all([
      db<UserPreference>("user_preferences")
        .select("user_id", "market_version", "updated_at")
        .orderBy("updated_at", "desc")
        .limit(pageSize)
        .offset(offset),
      db("user_preferences").count("* as count"),
    ])

    return { overrides, total: Number(count) }
  }

  async removeUserOverride(userId: string): Promise<void> {
    const db = getKnex()
    await db("user_preferences").where({ user_id: userId }).del()
    sessionCache.delete(userId)
  }

  // ── Stats ──────────────────────────────────────────────────────

  async getStats(): Promise<FeatureFlagStats> {
    const db = getKnex()
    const config = await this.getConfig()

    const rows = await db("user_preferences")
      .select("market_version")
      .count("* as count")
      .groupBy("market_version")

    let v1 = 0
    let v2 = 0
    for (const row of rows) {
      if (row.market_version === "V1") v1 = Number(row.count)
      else if (row.market_version === "V2") v2 = Number(row.count)
    }

    return {
      total_overrides: v1 + v2,
      v1_overrides: v1,
      v2_overrides: v2,
      rollout_percentage: config.rollout_percentage,
      default_version: config.default_version,
      enabled: config.enabled,
    }
  }

  // ── Cache management ───────────────────────────────────────────

  clearCache(userId: string): void {
    sessionCache.delete(userId)
  }

  clearAllCache(): void {
    sessionCache.clear()
    configCache = null
  }
}

export const featureFlagService = new FeatureFlagService()
