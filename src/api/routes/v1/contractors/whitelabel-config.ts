import express from "express"
import { userAuthorized, requireContractorsWrite } from "../../../middleware/auth.js"
import { readRateLimit, writeRateLimit } from "../../../middleware/enhanced-ratelimiting.js"
import { org_permission, valid_contractor } from "./middleware.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { createResponse, createErrorResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { User } from "../api-models.js"
import { DBOrgWhitelabelConfig, DBOrgSidebarConfig } from "../../../../clients/database/db-models.js"

const knex = () => getKnex()

export const whitelabelConfigRouter = express.Router({ mergeParams: true })

// ── Whitelabel Config ──────────────────────────────────────────────────

// Public — used by domain resolution
whitelabelConfigRouter.get("/", valid_contractor, readRateLimit, async (req, res) => {
  try {
    const contractor = req.contractor!
    const config = await knex()<DBOrgWhitelabelConfig>("org_whitelabel_config")
      .where({ contractor_id: contractor.contractor_id })
      .first()

    res.json(createResponse(config || {
      focus_mode: "public",
      homepage_path: null,
      require_membership: false,
      drawer_style: "elevation",
    }))
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to get config"))
  }
})

whitelabelConfigRouter.put(
  "/",
  userAuthorized,
  requireContractorsWrite,
  org_permission("manage_org_details"),
  writeRateLimit,
  async (req, res) => {
    try {
      const contractor = req.contractor!
      const user = req.user as User
      const { focus_mode, homepage_path, require_membership, drawer_style } = req.body

      if (focus_mode && !["public", "internal"].includes(focus_mode)) {
        res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "focus_mode must be 'public' or 'internal'"))
        return
      }

      if (drawer_style && !["elevation", "outlined"].includes(drawer_style)) {
        res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "drawer_style must be 'elevation' or 'outlined'"))
        return
      }

      const existing = await knex()("org_whitelabel_config")
        .where({ contractor_id: contractor.contractor_id })
        .first()

      const data: Partial<DBOrgWhitelabelConfig> = {
        ...(focus_mode !== undefined && { focus_mode }),
        ...(homepage_path !== undefined && { homepage_path }),
        ...(require_membership !== undefined && { require_membership }),
        ...(drawer_style !== undefined && { drawer_style }),
        updated_at: new Date(),
        updated_by: user.user_id,
      }

      if (existing) {
        await knex()("org_whitelabel_config")
          .where({ contractor_id: contractor.contractor_id })
          .update(data)
      } else {
        await knex()("org_whitelabel_config").insert({
          contractor_id: contractor.contractor_id,
          ...data,
        })
      }

      const updated = await knex()<DBOrgWhitelabelConfig>("org_whitelabel_config")
        .where({ contractor_id: contractor.contractor_id })
        .first()

      res.json(createResponse(updated))
    } catch (error) {
      res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to update config"))
    }
  },
)

// ── Sidebar Config ─────────────────────────────────────────────────────

// Tabs that org admins CANNOT disable (always visible for org management)
const PROTECTED_TABS = new Set([
  "sc_market_home",
  "org_settings",
  "org_manage",
  "org_roles",
  "org_members",
])

whitelabelConfigRouter.get("/sidebar", valid_contractor, readRateLimit, async (req, res) => {
  try {
    const contractor = req.contractor!
    const items = await knex()<DBOrgSidebarConfig>("org_sidebar_config")
      .where({ contractor_id: contractor.contractor_id })
      .orderBy("sort_order", "asc")

    res.json(createResponse(items))
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to get sidebar config"))
  }
})

whitelabelConfigRouter.put(
  "/sidebar",
  userAuthorized,
  requireContractorsWrite,
  org_permission("manage_org_details"),
  writeRateLimit,
  async (req, res) => {
    try {
      const contractor = req.contractor!
      const { items } = req.body as { items: Array<Partial<DBOrgSidebarConfig>> }

      if (!Array.isArray(items)) {
        res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "items must be an array"))
        return
      }

      // Validate: protected tabs cannot be disabled
      for (const item of items) {
        if (item.standard_tab_key && PROTECTED_TABS.has(item.standard_tab_key) && item.enabled === false) {
          res.status(400).json(createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            `Cannot disable protected tab: ${item.standard_tab_key}`,
          ))
          return
        }
      }

      // Replace all sidebar config for this org
      await knex().transaction(async (trx) => {
        await trx("org_sidebar_config").where({ contractor_id: contractor.contractor_id }).del()
        if (items.length > 0) {
          await trx("org_sidebar_config").insert(
            items.map((item, i) => ({
              contractor_id: contractor.contractor_id,
              standard_tab_key: item.standard_tab_key || null,
              custom_label: item.custom_label || null,
              custom_path: item.custom_path || null,
              custom_icon: item.custom_icon || null,
              is_external: item.is_external || false,
              enabled: item.enabled !== false,
              sort_order: item.sort_order ?? i,
            })),
          )
        }
      })

      const updated = await knex()<DBOrgSidebarConfig>("org_sidebar_config")
        .where({ contractor_id: contractor.contractor_id })
        .orderBy("sort_order", "asc")

      res.json(createResponse(updated))
    } catch (error) {
      res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to update sidebar config"))
    }
  },
)
