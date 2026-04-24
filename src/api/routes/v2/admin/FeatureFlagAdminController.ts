/**
 * Feature Flag Admin Controller
 *
 * Admin-only endpoints for managing the V1/V2 market rollout:
 * - Get/update global config (default version, rollout %)
 * - View stats (how many users on each version)
 * - List/add/remove per-user overrides
 */

import { Controller, Get, Put, Post, Delete, Route, Tags, Body, Query, Path, Request, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import {
  featureFlagService,
  type MarketVersion,
  type FeatureFlagConfig,
  type FeatureFlagStats,
  type UserOverride,
} from "../../../../services/market-v2/feature-flag.service.js"
import logger from "../../../../logger/logger.js"
import { getKnex } from "../../../../clients/database/knex-db.js"

// ── Request / Response types ─────────────────────────────────────

export interface UpdateConfigRequest {
  /** Which flag to update (defaults to market_v2) */
  flag_name?: string
  /** Global default version for users without overrides */
  default_version?: MarketVersion
  /** Percentage of users (0-100) to receive V2 via rollout */
  rollout_percentage?: number
  /** Master kill-switch: when false, everyone gets V1 */
  enabled?: boolean
}

export interface SetUserOverrideRequest {
  username: string
  flag_name: string
  enabled: boolean
}

export interface UserOverrideWithName {
  user_id: string
  username: string
  flag_name: string
  enabled: boolean
  updated_at: string
}

export interface UserOverridesResponse {
  overrides: UserOverrideWithName[]
  total: number
}

// ── Controller ───────────────────────────────────────────────────

@Route("admin/feature-flags")
@Tags("Admin Feature Flags")
@Security("loggedin")
export class FeatureFlagAdminController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get global feature flag configuration
   * @summary Get config
   */
  @Get("config")
  public async getConfig(
    @Request() request: ExpressRequest,
  ): Promise<FeatureFlagConfig> {
    this.request = request
    this.requireAdmin()
    return featureFlagService.getConfig()
  }

  /**
   * Update global feature flag configuration
   * @summary Update config
   */
  @Put("config")
  public async updateConfig(
    @Request() request: ExpressRequest,
    @Body() body: UpdateConfigRequest,
  ): Promise<FeatureFlagConfig> {
    this.request = request
    this.requireAdmin()

    if (body.rollout_percentage !== undefined) {
      if (body.rollout_percentage < 0 || body.rollout_percentage > 100) {
        this.throwValidationError("rollout_percentage must be between 0 and 100", [
          { field: "rollout_percentage", message: "Must be between 0 and 100" }
        ])
      }
    }
    if (body.default_version !== undefined) {
      if (body.default_version !== "V1" && body.default_version !== "V2") {
        this.throwValidationError("default_version must be V1 or V2", [
          { field: "default_version", message: "Must be V1 or V2" }
        ])
      }
    }

    logger.info("Admin updating feature flag config", {
      admin: this.getUserId(),
      updates: body,
    })

    return featureFlagService.updateConfig(body.flag_name || "market_v2", body)
  }

  /**
   * Get feature flag stats (override counts, config summary)
   * @summary Get stats
   */
  @Get("stats")
  public async getStats(
    @Request() request: ExpressRequest,
  ): Promise<FeatureFlagStats[]> {
    this.request = request
    this.requireAdmin()
    return featureFlagService.getStats()
  }

  /**
   * List per-user overrides with pagination
   * @summary List user overrides
   */
  @Get("overrides")
  public async getUserOverrides(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() pageSize?: number,
    @Query() search?: string,
    @Query() flag_name?: string,
  ): Promise<UserOverridesResponse> {
    this.request = request
    this.requireAdmin()
    const db = getKnex()
    const p = page ?? 1
    const ps = pageSize ?? 50
    const offset = (p - 1) * ps

    const hasTable = await db.schema.hasTable("user_feature_overrides")
    if (!hasTable) return { overrides: [], total: 0 }

    let query = db("user_feature_overrides as uo")
      .leftJoin("accounts as a", "uo.user_id", "a.user_id")
      .select("uo.user_id", "a.username", "uo.flag_name", "uo.enabled", "uo.updated_at")

    if (flag_name) query = query.where("uo.flag_name", flag_name)
    if (search) query = query.where("a.username", "ilike", `%${search}%`)

    const countQuery = query.clone().clearSelect().clearOrder().count("* as count")
    const [overrides, [{ count }]] = await Promise.all([
      query.orderBy("uo.updated_at", "desc").limit(ps).offset(offset),
      countQuery,
    ])

    return {
      overrides: overrides.map((o: any) => ({
        user_id: o.user_id,
        username: o.username || "Unknown",
        flag_name: o.flag_name,
        enabled: o.enabled,
        updated_at: o.updated_at?.toISOString?.() || new Date().toISOString(),
      })),
      total: Number(count),
    }
  }

  /**
   * Set a per-user version override
   * @summary Set user override
   */
  @Post("overrides")
  public async setUserOverride(
    @Request() request: ExpressRequest,
    @Body() body: SetUserOverrideRequest,
  ): Promise<{ message: string }> {
    this.request = request
    this.requireAdmin()

    const db = getKnex()
    const user = await db("accounts").where("username", body.username).first("user_id")
    if (!user) {
      this.throwNotFound("User", body.username)
    }

    logger.info("Admin setting user override", {
      admin: this.getUserId(),
      target_user: body.username,
      flag_name: body.flag_name,
      enabled: body.enabled,
    })

    await featureFlagService.setFlagOverride(user.user_id, body.flag_name, body.enabled)
    return { message: `Set ${body.username} ${body.flag_name}=${body.enabled}` }
  }

  /**
   * Remove a per-user version override (user falls back to global config)
   * @summary Remove user override
   */
  @Delete("overrides/{username}")
  public async removeUserOverride(
    @Request() request: ExpressRequest,
    @Path() username: string,
    @Query() flag_name?: string,
  ): Promise<{ message: string }> {
    this.request = request
    this.requireAdmin()

    const db = getKnex()
    const user = await db("accounts").where("username", username).first("user_id")
    if (!user) {
      this.throwNotFound("User", username)
    }

    if (flag_name) {
      await featureFlagService.removeFlagOverride(user.user_id, flag_name)
    } else {
      // Remove all overrides for this user
      const hasTable = await db.schema.hasTable("user_feature_overrides")
      if (hasTable) await db("user_feature_overrides").where({ user_id: user.user_id }).del()
      await featureFlagService.removeUserOverride(user.user_id)
    }

    return { message: `Removed override for ${username}${flag_name ? ` (${flag_name})` : " (all flags)"}` }
  }
}
