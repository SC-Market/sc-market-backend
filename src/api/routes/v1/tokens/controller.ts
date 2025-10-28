import { Request, Response } from "express"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import crypto from "crypto"
import { createResponse, createErrorResponse } from "../util/response.js"
import { has_permission } from "../util/permissions.js"

// Generate a secure token
function generateToken(): string {
  const randomBytes = crypto.randomBytes(32)
  const prefix = process.env.NODE_ENV === "production" ? "scm_live" : "scm_test"
  return `${prefix}_${randomBytes.toString("hex")}`
}

// Hash a token for storage
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

// Helper function to convert internal contractor IDs back to Spectrum IDs
async function convertContractorIdsToSpectrumIds(
  contractorIds: string[],
): Promise<string[]> {
  if (!contractorIds || contractorIds.length === 0) {
    return []
  }

  const spectrumIds: string[] = []
  for (const contractorId of contractorIds) {
    try {
      const contractor = await database.getContractor({
        contractor_id: contractorId,
      })
      spectrumIds.push(contractor.spectrum_id)
    } catch (error) {
      console.warn(
        `Failed to convert contractor ID ${contractorId} to Spectrum ID:`,
        error,
      )
    }
  }
  return spectrumIds
}

// Create a new API token
export async function createToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { name, description, scopes, expires_at, contractor_spectrum_ids } =
      req.body

    // Validate required fields
    if (!name || !scopes || !Array.isArray(scopes)) {
      res.status(400).json(createErrorResponse("Name and scopes are required"))
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
          createErrorResponse(`Invalid scopes: ${invalidScopes.join(", ")}`),
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
            "Only admins can create tokens with admin scopes",
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
          .json(createErrorResponse("contractor_spectrum_ids must be an array"))
        return
      }

      // Convert Spectrum IDs to internal contractor IDs and validate permissions
      for (const spectrumId of contractor_spectrum_ids) {
        try {
          const contractor = await database.getContractor({
            spectrum_id: spectrumId,
          })

          // Check if user has manage org permissions for this contractor
          const hasManagePermission = await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_org_details",
          )

          if (!hasManagePermission) {
            res
              .status(403)
              .json(
                createErrorResponse(
                  `You do not have manage org permissions for contractor with Spectrum ID: ${spectrumId}`,
                ),
              )
            return
          }

          validatedContractorIds.push(contractor.contractor_id)
        } catch (error) {
          res
            .status(400)
            .json(
              createErrorResponse(
                `Invalid contractor Spectrum ID: ${spectrumId}`,
              ),
            )
          return
        }
      }
    }

    // Generate token
    const token = generateToken()
    const tokenHash = hashToken(token)

    // Parse expiration date if provided
    let expiresAt = null
    if (expires_at) {
      // datetime-local sends format like "2024-01-15T14:30" (local time)
      // We need to treat this as UTC to avoid timezone issues
      // If the string doesn't end with 'Z', we'll treat it as UTC
      const dateString = expires_at.endsWith("Z")
        ? expires_at
        : `${expires_at}Z`
      expiresAt = new Date(dateString)

      if (isNaN(expiresAt.getTime())) {
        res.status(400).json(createErrorResponse("Invalid expiration date"))
        return
      }

      // Ensure the date is in the future
      if (expiresAt <= new Date()) {
        res
          .status(400)
          .json(createErrorResponse("Expiration date must be in the future"))
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
    console.error("Error creating token:", error)
    res.status(500).json(createErrorResponse("Internal server error"))
  }
}

// List user's tokens
export async function listTokens(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User

    const tokens = await database
      .knex("api_tokens")
      .where("user_id", user.user_id)
      .select(
        "id",
        "name",
        "description",
        "scopes",
        "contractor_ids",
        "expires_at",
        "last_used_at",
        "created_at",
        "updated_at",
      )
      .orderBy("created_at", "desc")

    // Convert contractor IDs to Spectrum IDs for each token
    const tokensWithSpectrumIds = await Promise.all(
      tokens.map(async (token) => {
        const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
          token.contractor_ids || [],
        )
        return {
          ...token,
          contractor_spectrum_ids: contractorSpectrumIds,
        }
      }),
    )

    res.json(createResponse(tokensWithSpectrumIds))
  } catch (error) {
    console.error("Error fetching tokens:", error)
    res.status(500).json(createErrorResponse("Internal server error"))
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
      .select(
        "id",
        "name",
        "description",
        "scopes",
        "contractor_ids",
        "expires_at",
        "last_used_at",
        "created_at",
        "updated_at",
      )
      .first()

    if (!token) {
      res.status(404).json(createErrorResponse("Token not found"))
      return
    }

    // Convert contractor IDs to Spectrum IDs
    const contractorSpectrumIds = await convertContractorIdsToSpectrumIds(
      token.contractor_ids || [],
    )

    res.json(
      createResponse({
        ...token,
        contractor_spectrum_ids: contractorSpectrumIds,
      }),
    )
  } catch (error) {
    console.error("Error fetching token:", error)
    res.status(500).json(createErrorResponse("Internal server error"))
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
      res.status(404).json(createErrorResponse("Token not found"))
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
            createErrorResponse(`Invalid scopes: ${invalidScopes.join(", ")}`),
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
              "Only admins can create tokens with admin scopes",
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
      } else if (Array.isArray(contractor_spectrum_ids)) {
        // Convert Spectrum IDs to internal contractor IDs and validate permissions
        for (const spectrumId of contractor_spectrum_ids) {
          try {
            const contractor = await database.getContractor({
              spectrum_id: spectrumId,
            })

            // Check if user has manage org permissions for this contractor
            const hasManagePermission = await has_permission(
              contractor.contractor_id,
              user.user_id,
              "manage_org_details",
            )

            if (!hasManagePermission) {
              res
                .status(403)
                .json(
                  createErrorResponse(
                    `You do not have manage org permissions for contractor with Spectrum ID: ${spectrumId}`,
                  ),
                )
              return
            }

            validatedContractorIds.push(contractor.contractor_id)
          } catch (error) {
            res
              .status(400)
              .json(
                createErrorResponse(
                  `Invalid contractor Spectrum ID: ${spectrumId}`,
                ),
              )
            return
          }
        }
      } else {
        res
          .status(400)
          .json(
            createErrorResponse(
              "contractor_spectrum_ids must be an array or null",
            ),
          )
        return
      }
    }

    // Parse expiration date if provided
    let expiresAt = existingToken.expires_at
    if (expires_at !== undefined) {
      if (expires_at === null) {
        expiresAt = null
      } else {
        // datetime-local sends format like "2024-01-15T14:30" (local time)
        // We need to treat this as UTC to avoid timezone issues
        // If the string doesn't end with 'Z', we'll treat it as UTC
        const dateString = expires_at.endsWith("Z")
          ? expires_at
          : `${expires_at}Z`
        expiresAt = new Date(dateString)

        if (isNaN(expiresAt.getTime())) {
          res.status(400).json(createErrorResponse("Invalid expiration date"))
          return
        }

        // Ensure the date is in the future
        if (expiresAt <= new Date()) {
          res
            .status(400)
            .json(createErrorResponse("Expiration date must be in the future"))
          return
        }
      }
    }

    // Update token
    const updateData: any = {
      updated_at: new Date(),
    }

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (scopes !== undefined) updateData.scopes = scopes
    if (contractor_spectrum_ids !== undefined)
      updateData.contractor_ids = validatedContractorIds
    if (expires_at !== undefined) updateData.expires_at = expiresAt

    const [updatedToken] = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .update(updateData)
      .returning("*")

    // Convert contractor IDs back to Spectrum IDs for response
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
        last_used_at: updatedToken.last_used_at,
        created_at: updatedToken.created_at,
        updated_at: updatedToken.updated_at,
      }),
    )
  } catch (error) {
    console.error("Error updating token:", error)
    res.status(500).json(createErrorResponse("Internal server error"))
  }
}

// Revoke token
export async function revokeToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { tokenId } = req.params

    const deletedCount = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .del()

    if (deletedCount === 0) {
      res.status(404).json(createErrorResponse("Token not found"))
      return
    }

    res.json(createResponse({ message: "Token revoked successfully" }))
  } catch (error) {
    console.error("Error revoking token:", error)
    res.status(500).json(createErrorResponse("Internal server error"))
  }
}

// Extend token expiration
export async function extendToken(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user! as User
    const { tokenId } = req.params
    const { expires_at } = req.body

    if (!expires_at) {
      res.status(400).json(createErrorResponse("expires_at is required"))
      return
    }

    // datetime-local sends format like "2024-01-15T14:30" (local time)
    // We need to treat this as UTC to avoid timezone issues
    // If the string doesn't end with 'Z', we'll treat it as UTC
    const dateString = expires_at.endsWith("Z") ? expires_at : `${expires_at}Z`
    const newExpiration = new Date(dateString)

    if (isNaN(newExpiration.getTime())) {
      res.status(400).json(createErrorResponse("Invalid expiration date"))
      return
    }

    // Ensure the date is in the future
    if (newExpiration <= new Date()) {
      res
        .status(400)
        .json(createErrorResponse("Expiration date must be in the future"))
      return
    }

    // Check if token exists and belongs to user
    const existingToken = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .first()

    if (!existingToken) {
      res.status(404).json(createErrorResponse("Token not found"))
      return
    }

    // Update expiration
    const [updatedToken] = await database
      .knex("api_tokens")
      .where("id", tokenId)
      .where("user_id", user.user_id)
      .update({
        expires_at: newExpiration,
        updated_at: new Date(),
      })
      .returning("*")

    res.json(
      createResponse({
        id: updatedToken.id,
        name: updatedToken.name,
        expires_at: updatedToken.expires_at,
        updated_at: updatedToken.updated_at,
      }),
    )
  } catch (error) {
    console.error("Error extending token:", error)
    res.status(500).json(createErrorResponse("Internal server error"))
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
      .select("id", "name", "created_at", "last_used_at", "expires_at")
      .first()

    if (!token) {
      res.status(404).json(createErrorResponse("Token not found"))
      return
    }

    // Calculate days since creation and last use
    const now = new Date()
    const daysSinceCreation = Math.floor(
      (now.getTime() - new Date(token.created_at).getTime()) /
        (1000 * 60 * 60 * 24),
    )
    const daysSinceLastUse = token.last_used_at
      ? Math.floor(
          (now.getTime() - new Date(token.last_used_at).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null

    // Check if token is expired
    const isExpired = token.expires_at
      ? new Date(token.expires_at) < now
      : false
    const daysUntilExpiration = token.expires_at
      ? Math.floor(
          (new Date(token.expires_at).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null

    res.json(
      createResponse({
        id: token.id,
        name: token.name,
        created_at: token.created_at,
        last_used_at: token.last_used_at,
        expires_at: token.expires_at,
        is_expired: isExpired,
        days_since_creation: daysSinceCreation,
        days_since_last_use: daysSinceLastUse,
        days_until_expiration: daysUntilExpiration,
      }),
    )
  } catch (error) {
    console.error("Error fetching token stats:", error)
    res.status(500).json(createErrorResponse("Internal server error"))
  }
}
