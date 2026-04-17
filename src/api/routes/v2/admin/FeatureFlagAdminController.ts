/**
 * Feature Flag Admin Controller
 *
 * Admin-only endpoints for managing the V1/V2 market rollout:
 * - Get/update global config (default version, rollout %)
 * - View stats (how many users on each version)
 * - List/add/remove per-user overrides
 */

import { Controller, Get, Put, Post, Delete, Route, Tags, Body, Query, Path, Request } from "tsoa"
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

// ── Request / Response types ─────────────────────────────────────

export interface UpdateConfigRequest {
  /** Global default version for users without overrides */
  default_version?: MarketVersion
  /** Percentage of users (0-100) to receive V2 via rollout */
  rollout_percentage?: number
  /** Master kill-switch: when false, everyone gets V1 */
  enabled?: boolean
}

export interface SetUserOverrideRequest {
  user_id: string
  market_version: MarketVersion
}

export interface UserOverridesResponse {
  overrides: UserOverride[]
  total: number
}

// ── Controller ───────────────────────────────────────────────────

@Route("admin/feature-flags")
@Tags("Admin Feature Flags")
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

    return featureFlagService.updateConfig(body)
  }

  /**
   * Get feature flag stats (override counts, config summary)
   * @summary Get stats
   */
  @Get("stats")
  public async getStats(
    @Request() request: ExpressRequest,
  ): Promise<FeatureFlagStats> {
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
  ): Promise<UserOverridesResponse> {
    this.request = request
    this.requireAdmin()
    return featureFlagService.getUserOverrides(page ?? 1, pageSize ?? 50)
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

    if (body.market_version !== "V1" && body.market_version !== "V2") {
      this.throwValidationError("market_version must be V1 or V2", [
        { field: "market_version", message: "Must be V1 or V2" }
      ])
    }

    logger.info("Admin setting user override", {
      admin: this.getUserId(),
      target_user: body.user_id,
      version: body.market_version,
    })

    await featureFlagService.setMarketVersion(body.user_id, body.market_version)
    return { message: `Set ${body.user_id} to ${body.market_version}` }
  }

  /**
   * Remove a per-user version override (user falls back to global config)
   * @summary Remove user override
   */
  @Delete("overrides/{userId}")
  public async removeUserOverride(
    @Request() request: ExpressRequest,
    @Path() userId: string,
  ): Promise<{ message: string }> {
    this.request = request
    this.requireAdmin()

    logger.info("Admin removing user override", {
      admin: this.getUserId(),
      target_user: userId,
    })

    await featureFlagService.removeUserOverride(userId)
    return { message: `Removed override for ${userId}` }
  }
}
