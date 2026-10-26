/**
 * Debug V2 Controller
 *
 * TSOA controller for debug endpoints in the V2 market system.
 * Provides feature flag management for developers.
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
import { isSiteAdmin } from "../../../util/site-role.js"

@Route("debug")
@Tags("Debug V2")
export class DebugV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get current feature flag settings
   *
   * Returns every resolved flag for the authenticated user (anonymous callers
   * get an empty map). Also indicates whether the client should show debug / feature-flag tooling
   * (admin users, or any user when NODE_ENV is development).
   *
   * @summary Get feature flag
   * @returns Current feature flag setting
   */
  @Get("feature-flag")
  public async getFeatureFlag(
    @Request() request: ExpressRequest,
  ): Promise<GetFeatureFlagResponse> {
    this.request = request
    const user = request.user

    if (!user?.user_id) {
      return {
        user_id: "",
        market_version: "V2",
        is_developer: false,
        has_override: false,
        flags: {},
        overridden_flags: [],
      }
    }

    const userId = user.user_id
    const isDeveloper =
      isSiteAdmin(user) || process.env.NODE_ENV === "development"

    logger.info("Getting feature flag", { userId, isDeveloper })

    try {
      const flags = await featureFlagService.getAllFlags(userId)
      const hasOverride = await featureFlagService.hasOverride(userId)
      const userOverrides = await featureFlagService.getUserFlagOverrides(userId)

      return {
        user_id: userId,
        market_version: "V2",
        is_developer: isDeveloper,
        has_override: hasOverride,
        flags,
        overridden_flags: userOverrides.map((o) => o.flag_name),
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
   * Sets a per-user override of one flag for the authenticated user.
   *
   * Restricted to admins, users who already have an override, and any user
   * when NODE_ENV is development.
   *
   * @summary Set feature flag
   * @param request Feature flag setting request
   * @returns Updated feature flag setting
   */
  @Security("loggedin")
  @Post("feature-flag")
  public async setFeatureFlag(
    @Body() request: SetFeatureFlagRequest,
    @Request() expressRequest: ExpressRequest,
  ): Promise<SetFeatureFlagResponse> {
    this.request = expressRequest
    this.requireAuth()
    const userId = this.getUserId()

    // Admins switching flags need a fresh MFA step-up.
    if (process.env.NODE_ENV !== "development" && this.isAdmin()) {
      await this.requireStepUp()
    }

    // Allow switching if: dev mode, admin, or user has an existing override
    if (process.env.NODE_ENV !== "development" && !this.isAdmin()) {
      const hasOvr = await featureFlagService.hasOverride(userId)
      if (!hasOvr) {
        this.throwForbidden("Only admin or override users can switch versions")
      }
    }

    if (!(await featureFlagService.hasConfig(request.flag_name))) {
      this.throwNotFound("Feature flag", request.flag_name)
    }

    logger.info("Setting feature flag", {
      userId,
      flagName: request.flag_name,
      enabled: request.enabled,
    })

    try {
      await featureFlagService.setFlagOverride(userId, request.flag_name, request.enabled)
      return { user_id: userId, message: `Set ${request.flag_name}=${request.enabled}` }
    } catch (error) {
      logger.error("Failed to set feature flag", {
        userId,
        flagName: request.flag_name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
