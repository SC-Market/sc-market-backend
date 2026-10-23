/**
 * Feature Flag Service — multi-flag support.
 *
 * Each flag has a row in feature_flag_config with its own rollout %.
 * Per-user overrides live in user_feature_overrides (user_id, flag_name, enabled).
 * Resolution: override > rollout > default.
 */

import crypto from "crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

/**
 * Legacy name for a flag row's `default_version`: "V2" means the flag is on for
 * everyone (when enabled), "V1" means it is on only for the rollout bucket.
 */
export type MarketVersion = "V1" | "V2"

export interface FeatureFlagConfig {
  flag_name: string
  default_version: MarketVersion
  rollout_percentage: number
  enabled: boolean
}

export interface FeatureFlagStats {
  flag_name: string
  enabled: boolean
  default_version: MarketVersion
  rollout_percentage: number
  override_count: number
  enabled_overrides: number
  disabled_overrides: number
}

export interface UserFlagOverride {
  user_id: string
  flag_name: string
  enabled: boolean
  updated_at: string
}

/** Deterministic hash of user ID to 0-99 for stable rollout. */
function userBucket(userId: string): number {
  const hash = crypto.createHash("md5").update(userId).digest()
  return hash.readUInt16BE(0) % 100
}

/** Short-lived config cache */
let configCache: Map<string, FeatureFlagConfig> | null = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 30_000

export class FeatureFlagService {
  // ── Config ─────────────────────────────────────────────────────

  private async getAllConfigs(): Promise<Map<string, FeatureFlagConfig>> {
    if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
      return configCache
    }
    const db = getKnex()
    const rows = await db<FeatureFlagConfig>("feature_flag_config").select("*")
    const map = new Map<string, FeatureFlagConfig>()
    for (const r of rows) map.set(r.flag_name, r)
    configCache = map
    configCacheTime = Date.now()
    return map
  }

  async getConfig(flagName: string): Promise<FeatureFlagConfig> {
    const all = await this.getAllConfigs()
    return all.get(flagName) ?? {
      flag_name: flagName,
      default_version: "V1",
      rollout_percentage: 0,
      enabled: false,
    }
  }

  /** Whether a feature_flag_config row exists for this flag. */
  async hasConfig(flagName: string): Promise<boolean> {
    const all = await this.getAllConfigs()
    return all.has(flagName)
  }

  async getAllFlagConfigs(): Promise<FeatureFlagConfig[]> {
    const all = await this.getAllConfigs()
    return Array.from(all.values())
  }

  async updateConfig(
    flagName: string,
    updates: Partial<Pick<FeatureFlagConfig, "default_version" | "rollout_percentage" | "enabled">>,
  ): Promise<FeatureFlagConfig> {
    const db = getKnex()
    await db("feature_flag_config")
      .where({ flag_name: flagName })
      .update({ ...updates, updated_at: new Date() })
    configCache = null
    return this.getConfig(flagName)
  }

  // ── Flag resolution ────────────────────────────────────────────

  /** Resolve a single flag for a user. */
  async isFlagEnabled(userId: string, flagName: string): Promise<boolean> {
    const db = getKnex()

    // 1. Check per-user override
    const hasTable = await db.schema.hasTable("user_feature_overrides")
    if (hasTable) {
      const override = await db("user_feature_overrides")
        .where({ user_id: userId, flag_name: flagName })
        .first()
      if (override) return override.enabled
    }

    // 2. Check global config + rollout
    const config = await this.getConfig(flagName)
    if (!config.enabled) return false

    if (config.default_version === "V2") return true
    // V1 default with rollout: give V2 to rollout_percentage% of users
    return config.rollout_percentage > 0 && userBucket(userId) < config.rollout_percentage
  }

  /** Resolve all flags for a user. */
  async getAllFlags(userId: string): Promise<Record<string, boolean>> {
    const configs = await this.getAllFlagConfigs()
    const result: Record<string, boolean> = {}
    for (const c of configs) {
      result[c.flag_name] = await this.isFlagEnabled(userId, c.flag_name)
    }
    return result
  }

  // ── Per-user overrides ─────────────────────────────────────────

  async setFlagOverride(userId: string, flagName: string, enabled: boolean): Promise<void> {
    const db = getKnex()
    await db("user_feature_overrides")
      .insert({ user_id: userId, flag_name: flagName, enabled, updated_at: new Date() })
      .onConflict(["user_id", "flag_name"])
      .merge({ enabled, updated_at: new Date() })
  }

  async removeFlagOverride(userId: string, flagName: string): Promise<void> {
    const db = getKnex()
    await db("user_feature_overrides").where({ user_id: userId, flag_name: flagName }).del()
  }

  /** Get all overrides for a specific user (all flags). */
  async getUserFlagOverrides(userId: string): Promise<UserFlagOverride[]> {
    const db = getKnex()
    const hasTable = await db.schema.hasTable("user_feature_overrides")
    if (!hasTable) return []
    return db("user_feature_overrides")
      .where({ user_id: userId })
      .select("user_id", "flag_name", "enabled", "updated_at")
  }

  /** Check if user has any override. */
  async hasOverride(userId: string): Promise<boolean> {
    const db = getKnex()
    const hasTable = await db.schema.hasTable("user_feature_overrides")
    if (!hasTable) return false
    const row = await db("user_feature_overrides").where({ user_id: userId }).first()
    return !!row
  }

  // ── Stats ──────────────────────────────────────────────────────

  async getStats(): Promise<FeatureFlagStats[]> {
    const configs = await this.getAllFlagConfigs()
    const db = getKnex()
    const hasTable = await db.schema.hasTable("user_feature_overrides")

    const stats: FeatureFlagStats[] = []
    for (const c of configs) {
      let overrideCount = 0, enabledOverrides = 0, disabledOverrides = 0
      if (hasTable) {
        const rows = await db("user_feature_overrides")
          .where("flag_name", c.flag_name)
          .select(db.raw("COUNT(*) as total"), db.raw("SUM(CASE WHEN enabled THEN 1 ELSE 0 END) as enabled_count"))
          .first()
        overrideCount = parseInt(rows?.total || "0")
        enabledOverrides = parseInt(rows?.enabled_count || "0")
        disabledOverrides = overrideCount - enabledOverrides
      }
      stats.push({
        flag_name: c.flag_name,
        enabled: c.enabled,
        default_version: c.default_version,
        rollout_percentage: c.rollout_percentage,
        override_count: overrideCount,
        enabled_overrides: enabledOverrides,
        disabled_overrides: disabledOverrides,
      })
    }
    return stats
  }
}

export const featureFlagService = new FeatureFlagService()
