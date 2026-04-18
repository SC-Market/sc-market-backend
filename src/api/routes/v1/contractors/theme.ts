import express from "express"
import {
  userAuthorized,
  requireContractorsWrite,
} from "../../../middleware/auth.js"
import {
  readRateLimit,
  writeRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { org_permission, valid_contractor } from "./middleware.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  createResponse,
  createErrorResponse,
  createNotFoundErrorResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { User } from "../api-models.js"
import {
  DBOrgTheme,
  DBOrgPremiumTier,
} from "../../../../clients/database/db-models.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"

const knex = () => getKnex()

export const contractorThemeRouter = express.Router({ mergeParams: true })

// Allowed top-level keys in each mode's ThemeOptions
const ALLOWED_THEME_KEYS = new Set([
  "palette",
  "navKind",
  "borderRadius",
  "borderRadiusUnit",
  "components",
])

// Allowed palette sub-keys
const ALLOWED_PALETTE_KEYS = new Set([
  "mode",
  "primary",
  "secondary",
  "background",
  "text",
  "common",
  "outline",
  "action",
])

function validateThemeData(
  data: unknown,
): { light: Record<string, any>; dark: Record<string, any> } | string {
  if (!data || typeof data !== "object") return "theme_data must be an object"
  const obj = data as Record<string, any>
  if (!obj.light || typeof obj.light !== "object")
    return "theme_data.light is required"
  if (!obj.dark || typeof obj.dark !== "object")
    return "theme_data.dark is required"

  for (const mode of ["light", "dark"] as const) {
    const modeData = obj[mode] as Record<string, any>
    for (const key of Object.keys(modeData)) {
      if (!ALLOWED_THEME_KEYS.has(key))
        return `Invalid key in theme_data.${mode}: ${key}`
    }
    if (modeData.palette && typeof modeData.palette === "object") {
      for (const key of Object.keys(modeData.palette)) {
        if (!ALLOWED_PALETTE_KEYS.has(key))
          return `Invalid palette key in theme_data.${mode}: ${key}`
      }
    }
    // Validate components — only allow MuiPaper and MuiCard defaultProps
    if (modeData.components && typeof modeData.components === "object") {
      for (const comp of Object.keys(modeData.components)) {
        if (comp !== "MuiPaper" && comp !== "MuiCard")
          return `Invalid component override in theme_data.${mode}: ${comp}`
        const compData = modeData.components[comp]
        if (compData && typeof compData === "object") {
          for (const prop of Object.keys(compData)) {
            if (prop !== "defaultProps")
              return `Only defaultProps allowed for ${comp} in theme_data.${mode}`
          }
        }
      }
    }
  }

  return { light: obj.light, dark: obj.dark }
}

async function requireActivePremium(
  contractorId: string,
): Promise<DBOrgPremiumTier | null> {
  const row = await knex()<DBOrgPremiumTier>("org_premium_tiers")
    .where({ contractor_id: contractorId })
    .whereNull("revoked_at")
    .first()
  return row ?? null
}

// GET /:spectrum_id/theme — public, returns org theme
contractorThemeRouter.get("/", valid_contractor, readRateLimit, async (req, res) => {
  try {
    const contractor = req.contractor!
    const theme = await knex()<DBOrgTheme>("org_themes")
      .where({ contractor_id: contractor.contractor_id })
      .first()

    if (!theme) {
      res.status(404).json(createNotFoundErrorResponse("Org theme", contractor.spectrum_id))
      return
    }

    res.json(
      createResponse({
        theme_data: theme.theme_data,
        favicon_url: theme.favicon_url,
        updated_at: theme.updated_at,
      }),
    )
  } catch (err) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to fetch theme"))
  }
})

// PUT /:spectrum_id/theme — update org theme (requires manage_theme + white_label tier)
contractorThemeRouter.put(
  "/",
  userAuthorized,
  requireContractorsWrite,
  org_permission("manage_theme"),
  writeRateLimit,
  async (req, res) => {
    try {
      const contractor = req.contractor!
      const premium = await requireActivePremium(contractor.contractor_id)
      if (!premium || premium.tier !== "white_label") {
        res.status(403).json(createForbiddenErrorResponse("Organization does not have white_label premium tier"))
        return
      }

      const { theme_data, favicon_url } = req.body
      const validated = validateThemeData(theme_data)
      if (typeof validated === "string") {
        res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, validated))
        return
      }

      if (favicon_url !== undefined && favicon_url !== null && typeof favicon_url !== "string") {
        res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "favicon_url must be a string or null"))
        return
      }

      const user = req.user as User
      const existing = await knex()<DBOrgTheme>("org_themes")
        .where({ contractor_id: contractor.contractor_id })
        .first()

      if (existing) {
        await knex()("org_themes")
          .where({ contractor_id: contractor.contractor_id })
          .update({
            theme_data: JSON.stringify(validated),
            ...(favicon_url !== undefined && { favicon_url }),
            updated_at: new Date(),
            updated_by: user.user_id,
          })
      } else {
        await knex()("org_themes").insert({
          contractor_id: contractor.contractor_id,
          theme_data: JSON.stringify(validated),
          favicon_url: favicon_url ?? null,
          updated_by: user.user_id,
        })
      }

      const result = await knex()<DBOrgTheme>("org_themes")
        .where({ contractor_id: contractor.contractor_id })
        .first()

      await auditLogService.record({
        action: "theme_updated",
        actorId: user.user_id,
        subjectType: "contractor",
        subjectId: contractor.contractor_id,
      })

      res.json(
        createResponse({
          theme_data: result!.theme_data,
          favicon_url: result!.favicon_url,
          updated_at: result!.updated_at,
        }),
      )
    } catch (err) {
      res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to update theme"))
    }
  },
)

// DELETE /:spectrum_id/theme — reset org theme
contractorThemeRouter.delete(
  "/",
  userAuthorized,
  requireContractorsWrite,
  org_permission("manage_theme"),
  writeRateLimit,
  async (req, res) => {
    try {
      const contractor = req.contractor!
      const deleted = await knex()("org_themes")
        .where({ contractor_id: contractor.contractor_id })
        .del()

      if (!deleted) {
        res.status(404).json(createNotFoundErrorResponse("Org theme", contractor.spectrum_id))
        return
      }

      await auditLogService.record({
        action: "theme_deleted",
        actorId: (req.user as User).user_id,
        subjectType: "contractor",
        subjectId: contractor.contractor_id,
      })

      res.json(createResponse({ message: "Theme reset to default" }))
    } catch (err) {
      res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to delete theme"))
    }
  },
)
