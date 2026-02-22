import {
  Controller,
  Route,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Path,
  Security,
  Middlewares,
  Response,
  Request,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import crypto from "crypto"
import { BaseController, ValidationErrorClass, ForbiddenError, NotFoundError, ConflictError } from "./base.controller.js"
import {
  CreateTokenPayload,
  UpdateTokenPayload,
  ExtendTokenPayload,
  TokenCreationResponse,
  TokenResponse,
  TokenListResponse,
  TokenStatsResponse,
  AvailableScopesResponse,
  TokenRevocationResponse,
  TokenExtensionResponse,
  ApiToken,
  TokenScope,
} from "../models/tokens.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
} from "../models/common.models.js"
import { database } from "../../clients/database/knex-db.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"

/**
 * Helper function to convert contractor Spectrum IDs to database contractor IDs
 */
async function convertSpectrumIdsToContractorIds(
  spectrumIds: string[],
): Promise<string[]> {
  if (!spectrumIds || spectrumIds.length === 0) {
    return []
  }

  const contractors = await database
    .knex("contractors")
    .whereIn("spectrum_id", spectrumIds)
    .select("contractor_id")

  return contractors.map((c) => c.contractor_id)
}

/**
 * Helper function to convert contractor IDs back to Spectrum IDs
 */
async function convertContractorIdsToSpectrumIds(
  contractorIds: string[],
): Promise<string[]> {
  if (!contractorIds || contractorIds.length === 0) {
    return []
  }

  const contractors = await database
    .knex("contractors")
    .whereIn("contractor_id", contractorIds)
    .select("spectrum_id")

  return contractors.map((c) => c.spectrum_id)
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  const randomBytes = crypto.randomBytes(32)
  return `scm_live_${randomBytes.toString("hex")}`
}

/**
 * Hash a token for storage
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/**
 * Valid token scopes
 */
const VALID_SCOPES: TokenScope[] = [
  "profile:read",
  "profile:write",
  "market:read",
  "market:write",
  "market:purchase",
  "market:photos",
  "orders:read",
  "orders:write",
  "orders:reviews",
  "contractors:read",
  "contractors:write",
  "contractors:members",
  "contractors:webhooks",
  "contractors:blocklist",
  "orgs:read",
  "orgs:write",
  "orgs:manage",
  "services:read",
  "services:write",
  "services:photos",
  "offers:read",
  "offers:write",
  "chats:read",
  "chats:write",
  "notifications:read",
  "notifications:write",
  "moderation:read",
  "moderation:write",
  "admin:read",
  "admin:write",
  "admin:spectrum",
  "admin:stats",
  "readonly",
  "full",
  "admin",
]

@Route("api/v1/tokens")
export class TokensController extends BaseController {
  /**
   * Create a new API token
   * @summary Create a new API token with specified scopes and contractor access
   */
  @Post()
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(201, "Created")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createToken(
    @Body() payload: CreateTokenPayload,
    @Request() request: ExpressRequest,
  ): Promise<TokenCreationResponse> {
    try {
      const user = this.getUser(request)

      // Validate scopes
      const invalidScopes = payload.scopes.filter(
        (scope) => !VALID_SCOPES.includes(scope),
      )
      if (invalidScopes.length > 0) {
        throw new ValidationErrorClass(
          `Invalid scopes: ${invalidScopes.join(", ")}`,
        )
      }

      // Check for admin scopes (only admins can create admin tokens)
      const hasAdminScopes = payload.scopes.some(
        (scope) => scope.startsWith("admin:") || scope === "admin",
      )
      if (hasAdminScopes && !this.isAdmin(request)) {
        throw new ForbiddenError(
          "Only admins can create tokens with admin scopes",
        )
      }

      // Check for moderation scopes (only admins can create moderation tokens)
      const hasModerationScopes = payload.scopes.some(
        (scope) => scope === "moderation:read" || scope === "moderation:write",
      )
      if (hasModerationScopes && !this.isAdmin(request)) {
        throw new ForbiddenError(
          "Only admins can create tokens with moderation scopes",
        )
      }

      // Validate contractor_spectrum_ids if provided
      let validatedContractorIds: string[] = []
      if (payload.contractor_spectrum_ids) {
        validatedContractorIds = await convertSpectrumIdsToContractorIds(
          payload.contractor_spectrum_ids,
        )

        if (
          validatedContractorIds.length !==
          payload.contractor_spectrum_ids.length
        ) {
          throw new ValidationErrorClass(
            "One or more contractor spectrum IDs are invalid",
          )
        }
      }

      // Generate token
      const token = generateToken()
      const tokenHash = hashToken(token)

      // Parse expiration date
      let expiresAt: Date | null = null
      if (payload.expires_at) {
        const dateString = payload.expires_at.endsWith("Z")
          ? payload.expires_at
          : `${payload.expires_at}Z`
        expiresAt = new Date(dateString)

        if (isNaN(expiresAt.getTime())) {
          throw new ValidationErrorClass("Invalid expiration date")
        }

        if (expiresAt <= new Date()) {
          throw new ValidationErrorClass(
            "Expiration date must be in the future",
          )
        }
      }

      // Insert token into database
      const [tokenRecord] = await database
        .knex("api_tokens")
        .insert({
          user_id: user.user_id,
          name: payload.name,
          description: payload.description || null,
          token_hash: tokenHash,
          scopes: payload.scopes,
          contractor_ids: validatedContractorIds,
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*")

      // Convert contractor IDs back to Spectrum IDs for response
      const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
        tokenRecord.contractor_ids || [],
      )

      const tokenData: ApiToken = {
        id: tokenRecord.id,
        name: tokenRecord.name,
        description: tokenRecord.description,
        scopes: tokenRecord.scopes,
        contractor_spectrum_ids: contractorSpectrumIds,
        expires_at: tokenRecord.expires_at,
        created_at: tokenRecord.created_at,
        updated_at: tokenRecord.updated_at,
        last_used_at: tokenRecord.last_used_at,
      }

      return this.success({
        token, // Only shown on creation
        data: tokenData,
      })
    } catch (error) {
      return this.handleError(error, "createToken")
    }
  }

  /**
   * List user's API tokens
   * @summary Retrieve all API tokens belonging to the authenticated user
   */
  @Get()
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async listTokens(
    @Request() request: ExpressRequest,
  ): Promise<TokenListResponse> {
    try {
      const user = this.getUser(request)

      const tokens = await database
        .knex("api_tokens")
        .where("user_id", user.user_id)
        .select("*")
        .orderBy("created_at", "desc")

      // Convert contractor IDs to Spectrum IDs for each token
      const tokensWithSpectrumIds = await Promise.all(
        tokens.map(async (token) => {
          const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
            token.contractor_ids || [],
          )
          return {
            id: token.id,
            name: token.name,
            description: token.description,
            scopes: token.scopes,
            contractor_spectrum_ids: contractorSpectrumIds,
            expires_at: token.expires_at,
            created_at: token.created_at,
            updated_at: token.updated_at,
            last_used_at: token.last_used_at,
          }
        }),
      )

      return this.success(tokensWithSpectrumIds)
    } catch (error) {
      return this.handleError(error, "listTokens")
    }
  }

  /**
   * Get specific API token details
   * @summary Retrieve details for a specific API token belonging to the authenticated user
   */
  @Get("{tokenId}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getToken(
    @Path() tokenId: string,
    @Request() request: ExpressRequest,
  ): Promise<TokenResponse> {
    try {
      const user = this.getUser(request)

      const token = await database
        .knex("api_tokens")
        .where("id", tokenId)
        .where("user_id", user.user_id)
        .first()

      if (!token) {
        throw new NotFoundError("Token not found")
      }

      const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
        token.contractor_ids || [],
      )

      const tokenData: ApiToken = {
        id: token.id,
        name: token.name,
        description: token.description,
        scopes: token.scopes,
        contractor_spectrum_ids: contractorSpectrumIds,
        expires_at: token.expires_at,
        created_at: token.created_at,
        updated_at: token.updated_at,
        last_used_at: token.last_used_at,
      }

      return this.success(tokenData)
    } catch (error) {
      return this.handleError(error, "getToken")
    }
  }

  /**
   * Update API token
   * @summary Update an existing API token's properties including scopes, expiration, and contractor access
   */
  @Put("{tokenId}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateToken(
    @Path() tokenId: string,
    @Body() payload: UpdateTokenPayload,
    @Request() request: ExpressRequest,
  ): Promise<TokenResponse> {
    try {
      const user = this.getUser(request)

      // Check if token exists and belongs to user
      const existingToken = await database
        .knex("api_tokens")
        .where("id", tokenId)
        .where("user_id", user.user_id)
        .first()

      if (!existingToken) {
        throw new NotFoundError("Token not found")
      }

      // Validate scopes if provided
      if (payload.scopes && Array.isArray(payload.scopes)) {
        const invalidScopes = payload.scopes.filter(
          (scope) => !VALID_SCOPES.includes(scope),
        )
        if (invalidScopes.length > 0) {
          throw new ValidationErrorClass(
            `Invalid scopes: ${invalidScopes.join(", ")}`,
          )
        }

        // Check for admin scopes
        const hasAdminScopes = payload.scopes.some(
          (scope) => scope.startsWith("admin:") || scope === "admin",
        )
        if (hasAdminScopes && !this.isAdmin(request)) {
          throw new ForbiddenError(
            "Only admins can create tokens with admin scopes",
          )
        }

        // Check for moderation scopes
        const hasModerationScopes = payload.scopes.some(
          (scope) =>
            scope === "moderation:read" || scope === "moderation:write",
        )
        if (hasModerationScopes && !this.isAdmin(request)) {
          throw new ForbiddenError(
            "Only admins can create tokens with moderation scopes",
          )
        }
      }

      // Validate contractor_spectrum_ids if provided
      let validatedContractorIds: string[] = existingToken.contractor_ids || []
      if (payload.contractor_spectrum_ids !== undefined) {
        if (payload.contractor_spectrum_ids === null) {
          validatedContractorIds = []
        } else if (!Array.isArray(payload.contractor_spectrum_ids)) {
          throw new ValidationErrorClass(
            "contractor_spectrum_ids must be an array or null",
          )
        } else {
          validatedContractorIds = await convertSpectrumIdsToContractorIds(
            payload.contractor_spectrum_ids,
          )

          if (
            validatedContractorIds.length !==
            payload.contractor_spectrum_ids.length
          ) {
            throw new ValidationErrorClass(
              "One or more contractor spectrum IDs are invalid",
            )
          }
        }
      }

      // Parse expiration date if provided
      let expiresAt: Date | null = existingToken.expires_at
      if (payload.expires_at !== undefined) {
        if (payload.expires_at === null) {
          expiresAt = null
        } else {
          const dateString = payload.expires_at.endsWith("Z")
            ? payload.expires_at
            : `${payload.expires_at}Z`
          expiresAt = new Date(dateString)

          if (isNaN(expiresAt.getTime())) {
            throw new ValidationErrorClass("Invalid expiration date")
          }

          if (expiresAt <= new Date()) {
            throw new ValidationErrorClass(
              "Expiration date must be in the future",
            )
          }
        }
      }

      // Update token
      const [updatedToken] = await database
        .knex("api_tokens")
        .where("id", tokenId)
        .update({
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.description !== undefined && {
            description: payload.description,
          }),
          ...(payload.scopes !== undefined && { scopes: payload.scopes }),
          ...(payload.contractor_spectrum_ids !== undefined && {
            contractor_ids: validatedContractorIds,
          }),
          ...(payload.expires_at !== undefined && { expires_at: expiresAt }),
          updated_at: new Date(),
        })
        .returning("*")

      const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
        updatedToken.contractor_ids || [],
      )

      const tokenData: ApiToken = {
        id: updatedToken.id,
        name: updatedToken.name,
        description: updatedToken.description,
        scopes: updatedToken.scopes,
        contractor_spectrum_ids: contractorSpectrumIds,
        expires_at: updatedToken.expires_at,
        created_at: updatedToken.created_at,
        updated_at: updatedToken.updated_at,
        last_used_at: updatedToken.last_used_at,
      }

      return this.success(tokenData)
    } catch (error) {
      return this.handleError(error, "updateToken")
    }
  }

  /**
   * Revoke API token
   * @summary Permanently revoke an API token, making it unusable
   */
  @Delete("{tokenId}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async revokeToken(
    @Path() tokenId: string,
    @Request() request: ExpressRequest,
  ): Promise<TokenRevocationResponse> {
    try {
      const user = this.getUser(request)

      const token = await database
        .knex("api_tokens")
        .where("id", tokenId)
        .where("user_id", user.user_id)
        .first()

      if (!token) {
        throw new NotFoundError("Token not found")
      }

      await database.knex("api_tokens").where("id", tokenId).delete()

      return this.success({ message: "Token revoked successfully" })
    } catch (error) {
      return this.handleError(error, "revokeToken")
    }
  }

  /**
   * Extend API token expiration
   * @summary Extend the expiration date of an existing API token
   */
  @Post("{tokenId}/extend")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async extendToken(
    @Path() tokenId: string,
    @Body() payload: ExtendTokenPayload,
    @Request() request: ExpressRequest,
  ): Promise<TokenExtensionResponse> {
    try {
      const user = this.getUser(request)

      const token = await database
        .knex("api_tokens")
        .where("id", tokenId)
        .where("user_id", user.user_id)
        .first()

      if (!token) {
        throw new NotFoundError("Token not found")
      }

      const dateString = payload.expires_at.endsWith("Z")
        ? payload.expires_at
        : `${payload.expires_at}Z`
      const expiresAt = new Date(dateString)

      if (isNaN(expiresAt.getTime())) {
        throw new ValidationErrorClass("Invalid expiration date")
      }

      if (expiresAt <= new Date()) {
        throw new ValidationErrorClass(
          "Expiration date must be in the future",
        )
      }

      await database.knex("api_tokens").where("id", tokenId).update({
        expires_at: expiresAt,
        updated_at: new Date(),
      })

      return this.success({ message: "Token expiration extended" })
    } catch (error) {
      return this.handleError(error, "extendToken")
    }
  }

  /**
   * Get API token usage statistics
   * @summary Retrieve usage statistics for a specific API token
   */
  @Get("{tokenId}/stats")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getTokenStats(
    @Path() tokenId: string,
    @Request() request: ExpressRequest,
  ): Promise<TokenStatsResponse> {
    try {
      const user = this.getUser(request)

      const token = await database
        .knex("api_tokens")
        .where("id", tokenId)
        .where("user_id", user.user_id)
        .first()

      if (!token) {
        throw new NotFoundError("Token not found")
      }

      return this.success({
        id: token.id,
        name: token.name,
        created_at: token.created_at,
        last_used_at: token.last_used_at,
        expires_at: token.expires_at,
      })
    } catch (error) {
      return this.handleError(error, "getTokenStats")
    }
  }

  /**
   * Get available scopes
   * @summary Retrieve list of available scopes for the authenticated user
   */
  @Get("scopes")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getAvailableScopes(
    @Request() request: ExpressRequest,
  ): Promise<AvailableScopesResponse> {
    try {
      const user = this.getUser(request)

      // Filter scopes based on user role
      const availableScopes =
        user.role === "admin"
          ? VALID_SCOPES
          : VALID_SCOPES.filter(
              (scope) =>
                !scope.startsWith("admin:") &&
                scope !== "admin" &&
                scope !== "moderation:read" &&
                scope !== "moderation:write",
            )

      return this.success({ scopes: availableScopes })
    } catch (error) {
      return this.handleError(error, "getAvailableScopes")
    }
  }
}
