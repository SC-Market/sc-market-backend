import { Request, Response } from "express"
import crypto from "crypto"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  createResponse,
  createErrorResponse,
  createNotFoundErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"

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

// Create a new API token
export async function createToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { name, description, scopes, expires_at, contractor_spectrum_ids } =
      req.body

    // Validate required fields
    if (!name || !scopes || !Array.isArray(scopes)) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Name and scopes are required",
          ),
        )
      return
    }

    // Validate scopes
    const validScopes = [
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

    const invalidScopes = scopes.filter(
      (scope: string) => !validScopes.includes(scope),
    )
    if (invalidScopes.length > 0) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            `Invalid scopes: ${invalidScopes.join(", ")}`,
          ),
        )
      return
    }

    // Check for admin scopes (only admins can create admin tokens)
    const hasAdminScopes = scopes.some(
      (scope: string) => scope.startsWith("admin:") || scope === "admin",
    )
    if (hasAdminScopes && user.role !== "admin") {
      res
        .status(403)
        .json(
          createErrorResponse(
            ErrorCode.FORBIDDEN,
            "Only admins can create tokens with admin scopes",
          ),
        )
      return
    }

    // Check for moderation scopes (only admins can create moderation tokens)
    const hasModerationScopes = scopes.some(
      (scope: string) =>
        scope === "moderation:read" || scope === "moderation:write",
    )
    if (hasModerationScopes && user.role !== "admin") {
      res
        .status(403)
        .json(
          createErrorResponse(
            ErrorCode.FORBIDDEN,
            "Only admins can create tokens with moderation scopes",
          ),
        )
      return
    }

    // Validate contractor_spectrum_ids if provided
    let validatedContractorIds: string[] = []
    if (contractor_spectrum_ids) {
      if (!Array.isArray(contractor_spectrum_ids)) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "contractor_spectrum_ids must be an array",
            ),
          )
        return
      }

      validatedContractorIds = await convertSpectrumIdsToContractorIds(
        contractor_spectrum_ids,
      )

      if (validatedContractorIds.length !== contractor_spectrum_ids.length) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "One or more contractor spectrum IDs are invalid",
            ),
          )
        return
      }
    }

    // Generate token
    const token = generateToken()
    const tokenHash = hashToken(token)

    // Parse expiration date
    let expiresAt: Date | null = null

    if (expires_at) {
      // datetime-local sends format like "2024-01-15T14:30" (local time)
      // We need to treat this as UTC to avoid timezone issues
      // If the string doesn't end with 'Z', we'll treat it as UTC
      const dateString = expires_at.endsWith("Z")
        ? expires_at
        : `${expires_at}Z`
      expiresAt = new Date(dateString)

      if (isNaN(expiresAt.getTime())) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Invalid expiration date",
            ),
          )
        return
      }

      // Ensure the date is in the future
      if (expiresAt <= new Date()) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Expiration date must be in the future",
            ),
          )
        return
      }
    }

    // Insert token into database
    const [tokenRecord] = await database
      .knex("api_tokens")
      .insert({
        user_id: user.user_id,
        name,
        description: description || null,
        token_hash: tokenHash,
        scopes,
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

    res.status(201).json(
      createResponse({
        token, // Only shown on creation
        data: {
          id: tokenRecord.id,
          name: tokenRecord.name,
          description: tokenRecord.description,
          scopes: tokenRecord.scopes,
          contractor_spectrum_ids: contractorSpectrumIds,
          expires_at: tokenRecord.expires_at,
          created_at: tokenRecord.created_at,
          updated_at: tokenRecord.updated_at,
        },
      }),
    )
  } catch (error) {
    logger.error("Error creating token", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

// List user's tokens
export async function listTokens(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User

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

    res.json(createResponse(tokensWithSpectrumIds))
  } catch (error) {
    logger.error("Error listing tokens", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

// Get specific token details
export async function getToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { tokenId } = req.params

    const token = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .first()

    if (!token) {
      res.status(404).json(createNotFoundErrorResponse("Token not found"))
      return
    }

    const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
      token.contractor_ids || [],
    )

    res.json(
      createResponse({
        id: token.id,
        name: token.name,
        description: token.description,
        scopes: token.scopes,
        contractor_spectrum_ids: contractorSpectrumIds,
        expires_at: token.expires_at,
        created_at: token.created_at,
        updated_at: token.updated_at,
        last_used_at: token.last_used_at,
      }),
    )
  } catch (error) {
    logger.error("Error getting token", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

// Update token (scopes, expiration, etc.)
export async function updateToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { tokenId } = req.params
    const { name, description, scopes, expires_at, contractor_spectrum_ids } =
      req.body

    // Check if token exists and belongs to user
    const existingToken = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .first()

    if (!existingToken) {
      res.status(404).json(createNotFoundErrorResponse("Token not found"))
      return
    }

    // Validate scopes if provided
    if (scopes && Array.isArray(scopes)) {
      const validScopes = [
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

      const invalidScopes = scopes.filter(
        (scope: string) => !validScopes.includes(scope),
      )
      if (invalidScopes.length > 0) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              `Invalid scopes: ${invalidScopes.join(", ")}`,
            ),
          )
        return
      }

      // Check for admin scopes
      const hasAdminScopes = scopes.some(
        (scope: string) => scope.startsWith("admin:") || scope === "admin",
      )
      if (hasAdminScopes && user.role !== "admin") {
        res
          .status(403)
          .json(
            createErrorResponse(
              ErrorCode.FORBIDDEN,
              "Only admins can create tokens with admin scopes",
            ),
          )
        return
      }

      // Check for moderation scopes (only admins can create moderation tokens)
      const hasModerationScopes = scopes.some(
        (scope: string) =>
          scope === "moderation:read" || scope === "moderation:write",
      )
      if (hasModerationScopes && user.role !== "admin") {
        res
          .status(403)
          .json(
            createErrorResponse(
              ErrorCode.FORBIDDEN,
              "Only admins can create tokens with moderation scopes",
            ),
          )
        return
      }
    }

    // Validate contractor_spectrum_ids if provided
    let validatedContractorIds: string[] = existingToken.contractor_ids || []
    if (contractor_spectrum_ids !== undefined) {
      if (contractor_spectrum_ids === null) {
        validatedContractorIds = []
      } else if (!Array.isArray(contractor_spectrum_ids)) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "contractor_spectrum_ids must be an array or null",
            ),
          )
        return
      } else {
        validatedContractorIds = await convertSpectrumIdsToContractorIds(
          contractor_spectrum_ids,
        )

        if (validatedContractorIds.length !== contractor_spectrum_ids.length) {
          res
            .status(400)
            .json(
              createErrorResponse(
                "One or more contractor spectrum IDs are invalid",
              ),
            )
          return
        }
      }
    }

    // Parse expiration date if provided
    let expiresAt: Date | null = existingToken.expires_at
    if (expires_at !== undefined) {
      if (expires_at === null) {
        expiresAt = null
      } else {
        const dateString = expires_at.endsWith("Z")
          ? expires_at
          : `${expires_at}Z`
        expiresAt = new Date(dateString)

        if (isNaN(expiresAt.getTime())) {
          res
            .status(400)
            .json(
              createErrorResponse(
                ErrorCode.VALIDATION_ERROR,
                "Invalid expiration date",
              ),
            )
          return
        }

        // Ensure the date is in the future (if being set)
        if (expiresAt <= new Date()) {
          res
            .status(400)
            .json(
              createErrorResponse(
                ErrorCode.VALIDATION_ERROR,
                "Expiration date must be in the future",
              ),
            )
          return
        }
      }
    }

    // Update token
    const [updatedToken] = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .update({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(scopes !== undefined && { scopes }),
        ...(contractor_spectrum_ids !== undefined && {
          contractor_ids: validatedContractorIds,
        }),
        ...(expires_at !== undefined && { expires_at: expiresAt }),
        updated_at: new Date(),
      })
      .returning("*")

    const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
      updatedToken.contractor_ids || [],
    )

    res.json(
      createResponse({
        id: updatedToken.id,
        name: updatedToken.name,
        description: updatedToken.description,
        scopes: updatedToken.scopes,
        contractor_spectrum_ids: contractorSpectrumIds,
        expires_at: updatedToken.expires_at,
        created_at: updatedToken.created_at,
        updated_at: updatedToken.updated_at,
      }),
    )
  } catch (error) {
    logger.error("Error updating token", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

// Revoke token
export async function revokeToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { tokenId } = req.params

    const token = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .first()

    if (!token) {
      res.status(404).json(createNotFoundErrorResponse("Token not found"))
      return
    }

    await database.knex("api_tokens").where("id", tokenId).delete()

    res.json(createResponse({ message: "Token revoked successfully" }))
  } catch (error) {
    logger.error("Error revoking token", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

// Extend token expiration
export async function extendToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { tokenId } = req.params
    const { expires_at } = req.body

    const token = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .first()

    if (!token) {
      res.status(404).json(createNotFoundErrorResponse("Token not found"))
      return
    }

    if (!expires_at) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "expires_at is required",
          ),
        )
      return
    }

    const dateString = expires_at.endsWith("Z") ? expires_at : `${expires_at}Z`
    const expiresAt = new Date(dateString)

    if (isNaN(expiresAt.getTime())) {
      res.status(400).json(createErrorResponse("Invalid expiration date"))
      return
    }

    if (expiresAt <= new Date()) {
      res
        .status(400)
        .json(createErrorResponse("Expiration date must be in the future"))
      return
    }

    await database.knex("api_tokens").where("id", tokenId).update({
      expires_at: expiresAt,
      updated_at: new Date(),
    })

    res.json(createResponse({ message: "Token expiration extended" }))
  } catch (error) {
    logger.error("Error extending token", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

// Get token usage statistics
export async function getTokenStats(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const user = req.user! as User
    const { tokenId } = req.params

    const token = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .first()

    if (!token) {
      res.status(404).json(createNotFoundErrorResponse("Token not found"))
      return
    }

    // Get usage stats (last_used_at, created_at, etc.)
    res.json(
      createResponse({
        id: token.id,
        name: token.name,
        created_at: token.created_at,
        last_used_at: token.last_used_at,
        expires_at: token.expires_at,
      }),
    )
  } catch (error) {
    logger.error("Error getting token stats", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

/**
 * Get available scopes for the current user
 * Returns scopes filtered based on user role
 */
export async function getAvailableScopes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const user = req.user! as User

    const allScopes = [
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

    // Filter scopes based on user role
    const availableScopes =
      user.role === "admin"
        ? allScopes
        : allScopes.filter(
            (scope) =>
              !scope.startsWith("admin:") &&
              scope !== "admin" &&
              scope !== "moderation:read" &&
              scope !== "moderation:write",
          )

    res.json(createResponse({ scopes: availableScopes }))
  } catch (error) {
    logger.error("Error getting available scopes", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}
