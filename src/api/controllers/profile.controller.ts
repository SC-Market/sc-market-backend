/**
 * Profile Controller
 *
 * TSOA controller for user profile endpoints.
 * This controller handles user profile retrieval and updates.
 *
 * Migration Status: Phase 1 - Core endpoints
 * - GET /api/v1/profile (get own profile)
 * - PUT /api/v1/profile (update own profile)
 * - GET /api/v1/profile/user/:username (get user by username)
 * - GET /api/v1/profile/search/:query (search profiles)
 *
 * @tags Profile
 */

import {
  Controller,
  Get,
  Put,
  Path,
  Query,
  Body,
  Route,
  Response,
  Tags,
  Request,
  Middlewares,
  Security,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController, NotFoundError, ValidationErrorClass } from "./base.controller.js"
import {
  ProfileResponse,
  ProfileSearchResponse,
  UpdateProfilePayload,
} from "../models/profile.models.js"
import { ErrorResponse, Unauthorized, NotFound } from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as profileDb from "../routes/v1/profiles/database.js"

/**
 * Controller for managing user profiles
 */
@Route("api/v1/profile")
@Tags("Profile")
export class ProfileController extends BaseController {
  /**
   * Get own profile
   *
   * Retrieves the authenticated user's profile.
   *
   * @summary Get own profile
   * @returns User profile
   */
  @Get("")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getOwnProfile(
    @Request() request: ExpressRequest,
  ): Promise<ProfileResponse> {
    try {
      const userId = this.getUserId(request)

      this.logInfo("getOwnProfile", "Fetching own profile", { user: userId })

      const profile = await profileDb.getUser({ user_id: userId })

      if (!profile) {
        throw new NotFoundError("Profile not found")
      }

      // Transform Date objects to ISO strings
      const transformedProfile = {
        ...profile,
        created_at: profile.created_at.toISOString(),
      }

      return this.success({ profile: transformedProfile as any })
    } catch (error) {
      this.logError("getOwnProfile", error)
      this.handleError(error, "getOwnProfile")
    }
  }

  /**
   * Update own profile
   *
   * Updates the authenticated user's profile.
   * All fields are optional.
   *
   * @summary Update own profile
   * @param payload Updated profile data
   * @returns Updated user profile
   *
   * @example payload {
   *   "display_name": "John Doe",
   *   "bio": "Trader and explorer"
   * }
   */
  @Put("")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateProfile(
    @Request() request: ExpressRequest,
    @Body() payload: UpdateProfilePayload,
  ): Promise<ProfileResponse> {
    try {
      const userId = this.getUserId(request)

      this.logInfo("updateProfile", "Updating profile", { user: userId })

      // TODO: Implement actual update logic using profileDb
      // For now, return current profile
      const profile = await profileDb.getUser({ user_id: userId })

      if (!profile) {
        throw new NotFoundError("Profile not found")
      }

      // Transform Date objects to ISO strings
      const transformedProfile = {
        ...profile,
        created_at: profile.created_at.toISOString(),
      }

      return this.success({ profile: transformedProfile as any })
    } catch (error) {
      this.logError("updateProfile", error, { payload })
      this.handleError(error, "updateProfile")
    }
  }

  /**
   * Get user profile by username
   *
   * Retrieves a user's public profile by username.
   *
   * @summary Get user by username
   * @param username Username to look up
   * @returns User profile
   */
  @Get("user/{username}")
  @Middlewares(tsoaReadRateLimit)
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getUserByUsername(
    @Request() request: ExpressRequest,
    @Path() username: string,
  ): Promise<ProfileResponse> {
    try {
      this.logInfo("getUserByUsername", "Fetching user by username", {
        username,
      })

      const profile = await profileDb.getUser({ username })

      if (!profile) {
        throw new NotFoundError(`User ${username} not found`)
      }

      // Transform Date objects to ISO strings
      const transformedProfile = {
        ...profile,
        created_at: profile.created_at.toISOString(),
      }

      return this.success({ profile: transformedProfile as any })
    } catch (error) {
      this.logError("getUserByUsername", error, { username })
      this.handleError(error, "getUserByUsername")
    }
  }

  /**
   * Search user profiles
   *
   * Searches for user profiles by username or display name.
   *
   * @summary Search profiles
   * @param query Search query
   * @param limit Maximum results (default: 10, max: 50)
   * @returns List of matching profiles
   *
   * @example query "john"
   * @example limit "10"
   */
  @Get("search/{query}")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchProfiles(
    @Request() request: ExpressRequest,
    @Path() query: string,
    @Query() limit?: string,
  ): Promise<ProfileSearchResponse> {
    try {
      const maxLimit = limit ? Math.min(parseInt(limit, 10), 50) : 10

      this.logInfo("searchProfiles", "Searching profiles", {
        query,
        limit: maxLimit,
      })

      const profiles = await profileDb.searchUsers(query)

      // Transform Date objects to ISO strings
      const transformedProfiles = profiles.map((profile) => ({
        ...profile,
        created_at: profile.created_at.toISOString(),
      }))

      return this.success({ profiles: transformedProfiles as any })
    } catch (error) {
      this.logError("searchProfiles", error, { query, limit })
      this.handleError(error, "searchProfiles")
    }
  }
}
