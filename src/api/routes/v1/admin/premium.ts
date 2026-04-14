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

const knex = () => getKnex()

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
          "org_premium_tiers.*",
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

// GET /api/admin/premium/:contractor_id
adminPremiumRouter.get("/:contractor_id", adminAuthorized, readRateLimit, async (req, res) => {
  try {
    const tier = await knex()<DBOrgPremiumTier>("org_premium_tiers")
      .where({ contractor_id: req.params.contractor_id })
      .first()

    if (!tier) {
      res.status(404).json(createNotFoundErrorResponse("Premium tier", req.params.contractor_id))
      return
    }
    res.json(createResponse(tier))
  } catch (err) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to fetch premium tier"))
  }
})

// PUT /api/admin/premium/:contractor_id — set/update premium tier
adminPremiumRouter.put("/:contractor_id", adminAuthorized, writeRateLimit, async (req, res) => {
  try {
    const { tier } = req.body
    if (!tier || typeof tier !== "string") {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "tier is required"))
      return
    }

    const validTiers = ["white_label"]
    if (!validTiers.includes(tier)) {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, `Invalid tier. Must be one of: ${validTiers.join(", ")}`))
      return
    }

    // Verify contractor exists
    const contractor = await knex()("contractors")
      .where({ contractor_id: req.params.contractor_id })
      .first()
    if (!contractor) {
      res.status(404).json(createNotFoundErrorResponse("Contractor", req.params.contractor_id))
      return
    }

    const user = req.user as User
    const existing = await knex()<DBOrgPremiumTier>("org_premium_tiers")
      .where({ contractor_id: req.params.contractor_id })
      .first()

    if (existing) {
      await knex()("org_premium_tiers")
        .where({ contractor_id: req.params.contractor_id })
        .update({ tier, granted_by: user.user_id, granted_at: new Date(), revoked_at: null })
    } else {
      await knex()("org_premium_tiers").insert({
        contractor_id: req.params.contractor_id,
        tier,
        granted_by: user.user_id,
      })
    }

    const result = await knex()<DBOrgPremiumTier>("org_premium_tiers")
      .where({ contractor_id: req.params.contractor_id })
      .first()

    res.json(createResponse(result))
  } catch (err) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to set premium tier"))
  }
})

// DELETE /api/admin/premium/:contractor_id — revoke premium tier
adminPremiumRouter.delete("/:contractor_id", adminAuthorized, writeRateLimit, async (req, res) => {
  try {
    const updated = await knex()("org_premium_tiers")
      .where({ contractor_id: req.params.contractor_id })
      .whereNull("revoked_at")
      .update({ revoked_at: new Date() })

    if (!updated) {
      res.status(404).json(createNotFoundErrorResponse("Active premium tier", req.params.contractor_id))
      return
    }

    res.json(createResponse({ message: "Premium tier revoked" }))
  } catch (err) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to revoke premium tier"))
  }
})
