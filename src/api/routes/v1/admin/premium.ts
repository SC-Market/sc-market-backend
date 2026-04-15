import express from "express"
import { adminAuthorized } from "../../../middleware/auth.js"
import {
  readRateLimit,
  writeRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  createResponse,
  createErrorResponse,
  createNotFoundErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { User } from "../api-models.js"
import { DBOrgPremiumTier } from "../../../../clients/database/db-models.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"

const knex = () => getKnex()

// Resolve spectrum_id to contractor_id
async function resolveContractorId(spectrumId: string): Promise<string | null> {
  const row = await knex()("contractors").where({ spectrum_id: spectrumId }).select("contractor_id").first()
  return row?.contractor_id ?? null
}

// Fetch premium tier row with spectrum_id (never expose contractor_id to frontend)
async function getPremiumWithSpectrum(contractorId: string) {
  return knex()("org_premium_tiers")
    .join("contractors", "contractors.contractor_id", "org_premium_tiers.contractor_id")
    .where("org_premium_tiers.contractor_id", contractorId)
    .select(
      "org_premium_tiers.id",
      "org_premium_tiers.tier",
      "org_premium_tiers.custom_domain",
      "org_premium_tiers.granted_by",
      "org_premium_tiers.granted_at",
      "org_premium_tiers.revoked_at",
      "contractors.name as contractor_name",
      "contractors.spectrum_id",
    )
    .first()
}

export const adminPremiumRouter = express.Router()

// GET /api/admin/premium — list all orgs with premium tiers
adminPremiumRouter.get("/", adminAuthorized, readRateLimit, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.page_size as string) || 20),
    )
    const offset = (page - 1) * pageSize

    const [tiers, countResult] = await Promise.all([
      knex()<DBOrgPremiumTier>("org_premium_tiers")
        .join("contractors", "contractors.contractor_id", "org_premium_tiers.contractor_id")
        .select(
          "org_premium_tiers.id",
          "org_premium_tiers.tier",
          "org_premium_tiers.custom_domain",
          "org_premium_tiers.granted_by",
          "org_premium_tiers.granted_at",
          "org_premium_tiers.revoked_at",
          "contractors.name as contractor_name",
          "contractors.spectrum_id",
        )
        .orderBy("org_premium_tiers.granted_at", "desc")
        .limit(pageSize)
        .offset(offset),
      knex()("org_premium_tiers").count("* as count").first(),
    ])

    res.json(
      createResponse({
        items: tiers,
        total: parseInt((countResult as any)?.count || "0"),
        page,
        page_size: pageSize,
      }),
    )
  } catch (err) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to fetch premium tiers"))
  }
})

// GET /api/admin/premium/:id — get by spectrum_id
adminPremiumRouter.get("/:id", adminAuthorized, readRateLimit, async (req, res) => {
  try {
    const contractorId = await resolveContractorId(req.params.id)
    if (!contractorId) {
      res.status(404).json(createNotFoundErrorResponse("Contractor", req.params.id))
      return
    }
    const tier = await getPremiumWithSpectrum(contractorId)

    if (!tier) {
      res.status(404).json(createNotFoundErrorResponse("Premium tier", req.params.id))
      return
    }
    res.json(createResponse(tier))
  } catch (err) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to fetch premium tier"))
  }
})

// PUT /api/admin/premium/:id — set/update premium tier
adminPremiumRouter.put("/:id", adminAuthorized, writeRateLimit, async (req, res) => {
  try {
    const { tier, custom_domain } = req.body
    if (!tier || typeof tier !== "string") {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "tier is required"))
      return
    }

    const validTiers = ["white_label"]
    if (!validTiers.includes(tier)) {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, `Invalid tier. Must be one of: ${validTiers.join(", ")}`))
      return
    }

    if (custom_domain !== undefined && custom_domain !== null && typeof custom_domain !== "string") {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "custom_domain must be a string or null"))
      return
    }

    if (custom_domain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(custom_domain)) {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid domain format"))
      return
    }

    const contractorId = await resolveContractorId(req.params.id)
    if (!contractorId) {
      res.status(404).json(createNotFoundErrorResponse("Contractor", req.params.id))
      return
    }

    const user = req.user as User
    const existing = await knex()<DBOrgPremiumTier>("org_premium_tiers")
      .where({ contractor_id: contractorId })
      .first()

    const updateData: Record<string, any> = {
      tier,
      granted_by: user.user_id,
      granted_at: new Date(),
      revoked_at: null,
    }
    if (custom_domain !== undefined) updateData.custom_domain = custom_domain

    if (existing) {
      await knex()("org_premium_tiers")
        .where({ contractor_id: contractorId })
        .update(updateData)
    } else {
      await knex()("org_premium_tiers").insert({
        contractor_id: contractorId,
        ...updateData,
      })
    }

    const result = await getPremiumWithSpectrum(contractorId)

    await auditLogService.record({
      action: "premium_tier_granted",
      actorId: user.user_id,
      subjectType: "contractor",
      subjectId: contractorId,
      metadata: { tier, custom_domain: custom_domain ?? null },
    })

    res.json(createResponse(result))
  } catch (err: any) {
    if (err?.constraint === "org_premium_tiers_custom_domain_key") {
      res.status(409).json(createErrorResponse(ErrorCode.CONFLICT, "Domain is already in use by another organization"))
      return
    }
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to set premium tier"))
  }
})

// PATCH /api/admin/premium/:id/domain — update custom domain only
adminPremiumRouter.patch("/:id/domain", adminAuthorized, writeRateLimit, async (req, res) => {
  try {
    const { custom_domain } = req.body
    if (custom_domain !== undefined && custom_domain !== null && typeof custom_domain !== "string") {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "custom_domain must be a string or null"))
      return
    }

    if (custom_domain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(custom_domain)) {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid domain format"))
      return
    }

    const contractorId = await resolveContractorId(req.params.id)
    if (!contractorId) {
      res.status(404).json(createNotFoundErrorResponse("Contractor", req.params.id))
      return
    }

    const updated = await knex()("org_premium_tiers")
      .where({ contractor_id: contractorId })
      .whereNull("revoked_at")
      .update({ custom_domain: custom_domain ?? null })

    if (!updated) {
      res.status(404).json(createNotFoundErrorResponse("Active premium tier", req.params.id))
      return
    }

    const result = await getPremiumWithSpectrum(contractorId)

    await auditLogService.record({
      action: "premium_domain_updated",
      actorId: (req.user as User).user_id,
      subjectType: "contractor",
      subjectId: contractorId,
      metadata: { custom_domain: custom_domain ?? null },
    })

    res.json(createResponse(result))
  } catch (err: any) {
    if (err?.constraint === "org_premium_tiers_custom_domain_key") {
      res.status(409).json(createErrorResponse(ErrorCode.CONFLICT, "Domain is already in use by another organization"))
      return
    }
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to update domain"))
  }
})

// DELETE /api/admin/premium/:id — revoke premium tier
adminPremiumRouter.delete("/:id", adminAuthorized, writeRateLimit, async (req, res) => {
  try {
    const contractorId = await resolveContractorId(req.params.id)
    if (!contractorId) {
      res.status(404).json(createNotFoundErrorResponse("Contractor", req.params.id))
      return
    }

    const updated = await knex()("org_premium_tiers")
      .where({ contractor_id: contractorId })
      .whereNull("revoked_at")
      .update({ revoked_at: new Date() })

    if (!updated) {
      res.status(404).json(createNotFoundErrorResponse("Active premium tier", req.params.id))
      return
    }

    await auditLogService.record({
      action: "premium_tier_revoked",
      actorId: (req.user as User).user_id,
      subjectType: "contractor",
      subjectId: contractorId,
    })

    res.json(createResponse({ message: "Premium tier revoked" }))
  } catch (err) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to revoke premium tier"))
  }
})
