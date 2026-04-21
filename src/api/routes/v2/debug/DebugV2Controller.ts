/**
 * Debug V2 Controller
 *
 * TSOA controller for debug endpoints in the V2 market system.
 * Provides feature flag management for developers.
 *
 * Requirements: 3.1, 3.5
 */

import { Controller, Get, Post, Route, Tags, Body, Request, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { featureFlagService } from "../../../../services/market-v2/feature-flag.service.js"
import {
  GetFeatureFlagResponse,
  SetFeatureFlagRequest,
  SetFeatureFlagResponse,
} from "../types/debug.types.js"
import logger from "../../../../logger/logger.js"

@Route("debug")
@Tags("Debug V2")
export class DebugV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get current feature flag setting
   *
   * Returns the current market version (V1 or V2) for the authenticated user.
   * Also indicates whether the client should show debug / feature-flag tooling
   * (admin users, or any user when NODE_ENV is development).
   *
   * Restricted to authenticated users only.
   *
   * @summary Get feature flag
   * @returns Current feature flag setting
   */
  @Get("feature-flag")
  public async getFeatureFlag(
    @Request() request: ExpressRequest,
  ): Promise<GetFeatureFlagResponse> {
    this.request = request
    const user = request.user as any

    if (!user?.user_id) {
      return {
        user_id: "",
        market_version: "V1",
        is_developer: false,
      }
    }

    const userId = user.user_id
    const isDeveloper =
      user.role === "admin" || process.env.NODE_ENV === "development"

    logger.info("Getting feature flag", { userId, isDeveloper })

    try {
      const marketVersion = await featureFlagService.getMarketVersion(userId)

      logger.info("Retrieved feature flag", {
        userId,
        marketVersion,
        isDeveloper,
      })

      return {
        user_id: userId,
        market_version: marketVersion,
        is_developer: isDeveloper,
      }
    } catch (error) {
      logger.error("Failed to get feature flag", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Set feature flag
   *
   * Sets the market version (V1 or V2) for the authenticated user.
   * This allows developers to switch between V1 and V2 experiences.
   *
   * Restricted to users with developer privileges (admin role) only.
   *
   * @summary Set feature flag
   * @param request Feature flag setting request
   * @returns Updated feature flag setting
   */
  @Security("jwt")
  @Post("feature-flag")
  @Security("jwt")
  public async setFeatureFlag(
    @Body() request: SetFeatureFlagRequest,
    @Request() expressRequest: ExpressRequest,
  ): Promise<SetFeatureFlagResponse> {
    this.request = expressRequest
    this.requireAuth()
    // In production, require admin role. In dev mode, any authenticated user can switch.
    if (process.env.NODE_ENV !== "development") {
      this.requireAdmin()
    }
    const userId = this.getUserId()

    logger.info("Setting feature flag", {
      userId,
      marketVersion: request.market_version,
    })

    try {
      await featureFlagService.setMarketVersion(userId, request.market_version)

      logger.info("Feature flag set successfully", {
        userId,
        marketVersion: request.market_version,
      })

      return {
        user_id: userId,
        market_version: request.market_version,
        message: `Market version set to ${request.market_version}`,
      }
    } catch (error) {
      logger.error("Failed to set feature flag", {
        userId,
        marketVersion: request.market_version,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
