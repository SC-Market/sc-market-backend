import { Router } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { createResponse, createErrorResponse } from "../util/response.js"
import { userAuthorized } from "../../../middleware/auth.js"
import { org_authorized, org_permission } from "../contractors/middleware.js"
import {
  OrderSetting,
  CreateOrderSettingRequest,
  UpdateOrderSettingRequest,
} from "../api-models.js"
import { User } from "../api-models.js"
import { DBOrderSetting } from "../../../../clients/database/db-models.js"
import logger from "../../../../logger/logger.js"

const orderSettingsRouter = Router()

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function serializeOrderSetting(setting: DBOrderSetting): OrderSetting {
  return {
    id: setting.id,
    entity_type: setting.entity_type,
    entity_id: setting.entity_id,
    setting_type: setting.setting_type,
    message_content: setting.message_content,
    enabled: setting.enabled,
    created_at: setting.created_at.toISOString(),
    updated_at: setting.updated_at.toISOString(),
  }
}

// =============================================================================
// USER ORDER SETTINGS ENDPOINTS
// =============================================================================

// GET /api/v1/orders/settings - Get current user's order settings
orderSettingsRouter.get("/settings", userAuthorized, async (req, res) => {
  const user = req.user as User

  try {
    const settings = await database.getOrderSettings("user", user.user_id)
    res.json(createResponse({ settings: settings.map(serializeOrderSetting) }))
  } catch (error) {
    console.error("Error fetching user order settings:", error)
    res
      .status(500)
      .json(createErrorResponse({ error: "Failed to fetch order settings" }))
  }
})

// POST /api/v1/orders/settings - Create order setting for current user
orderSettingsRouter.post("/settings", userAuthorized, async (req, res) => {
  const user = req.user as User
  const {
    setting_type,
    message_content,
    enabled = true,
  }: CreateOrderSettingRequest = req.body

  if (!setting_type || !message_content) {
    res.status(400).json(
      createErrorResponse({
        error: "setting_type and message_content are required",
      }),
    )
    return
  }

  if (!["offer_message", "order_message"].includes(setting_type)) {
    res.status(400).json(createErrorResponse({ error: "Invalid setting_type" }))
    return
  }

  try {
    // Check if setting already exists
    const existing = await database.getOrderSetting(
      "user",
      user.user_id,
      setting_type,
    )
    if (existing) {
      // Update existing setting instead of creating new one
      logger.debug("Updating existing user order setting", {
        userId: user.user_id,
        settingId: existing.id,
        setting_type,
      })

      const updated = await database.updateOrderSetting(existing.id, {
        message_content,
        enabled,
      })
      res
        .status(200)
        .json(createResponse({ setting: serializeOrderSetting(updated) }))
      return
    }

    // Create new setting
    logger.debug("Creating new user order setting", {
      userId: user.user_id,
      setting_type,
    })

    const setting = await database.createOrderSetting({
      entity_type: "user",
      entity_id: user.user_id,
      setting_type,
      message_content,
      enabled,
    })

    res
      .status(201)
      .json(createResponse({ setting: serializeOrderSetting(setting) }))
  } catch (error) {
    logger.error("Error creating user order setting", {
      userId: user.user_id,
      setting_type,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    res
      .status(500)
      .json(createErrorResponse({ error: "Failed to create order setting" }))
  }
})

// PUT /api/v1/orders/settings/:id - Update order setting
orderSettingsRouter.put("/settings/:id", userAuthorized, async (req, res) => {
  const user = req.user as User
  const { id } = req.params
  const { message_content, enabled }: UpdateOrderSettingRequest = req.body

  if (message_content === undefined && enabled === undefined) {
    res.status(400).json(
      createErrorResponse({
        error: "At least one field must be provided for update",
      }),
    )
    return
  }

  try {
    // First check if the setting exists and belongs to the user
    const existing = await database
      .knex<DBOrderSetting>("order_settings")
      .where({ id, entity_type: "user", entity_id: user.user_id })
      .first()

    if (!existing) {
      res
        .status(404)
        .json(createErrorResponse({ error: "Order setting not found" }))
      return
    }

    const updated = await database.updateOrderSetting(id, {
      message_content,
      enabled,
    })
    res.json(createResponse({ setting: serializeOrderSetting(updated) }))
  } catch (error) {
    console.error("Error updating order setting:", error)
    res
      .status(500)
      .json(createErrorResponse({ error: "Failed to update order setting" }))
  }
})

// DELETE /api/v1/orders/settings/:id - Delete order setting
orderSettingsRouter.delete(
  "/settings/:id",
  userAuthorized,
  async (req, res) => {
    const user = req.user as User
    const { id } = req.params

    try {
      // First check if the setting exists and belongs to the user
      const existing = await database
        .knex<DBOrderSetting>("order_settings")
        .where({ id, entity_type: "user", entity_id: user.user_id })
        .first()

      if (!existing) {
        res
          .status(404)
          .json(createErrorResponse({ error: "Order setting not found" }))
        return
      }

      await database.deleteOrderSetting(id)
      res.status(204).send()
    } catch (error) {
      console.error("Error deleting order setting:", error)
      res
        .status(500)
        .json(createErrorResponse({ error: "Failed to delete order setting" }))
    }
  },
)

// =============================================================================
// CONTRACTOR ORDER SETTINGS ENDPOINTS
// =============================================================================

// GET /api/v1/orders/contractors/:spectrum_id/settings - Get contractor's order settings
orderSettingsRouter.get(
  "/contractors/:spectrum_id/settings",
  userAuthorized,
  org_permission("manage_orders"),
  async (req, res) => {
    const { spectrum_id } = req.params
    const contractor = req.contractor!
    logger.debug("GET contractor order settings", {
      spectrum_id,
      contractorId: contractor.contractor_id,
    })

    try {
      const settings = await database.getOrderSettings(
        "contractor",
        contractor.contractor_id,
      )
      logger.debug("Found contractor order settings", {
        spectrum_id,
        contractorId: contractor.contractor_id,
        settingsCount: settings.length,
      })
      res.json(
        createResponse({ settings: settings.map(serializeOrderSetting) }),
      )
    } catch (error) {
      logger.error("Error fetching contractor order settings", {
        spectrum_id,
        contractorId: contractor.contractor_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      res.status(500).json(
        createErrorResponse({
          error: "Failed to fetch contractor order settings",
        }),
      )
    }
  },
)

// POST /api/v1/orders/contractors/:spectrum_id/settings - Create order setting for contractor
orderSettingsRouter.post(
  "/contractors/:spectrum_id/settings",
  userAuthorized,
  org_permission("manage_orders"),
  async (req, res) => {
    const { spectrum_id } = req.params
    const contractor = req.contractor!
    const {
      setting_type,
      message_content,
      enabled = true,
    }: CreateOrderSettingRequest = req.body
    logger.debug("POST contractor order setting", {
      spectrum_id,
      contractorId: contractor.contractor_id,
      setting_type,
      messageContentLength: message_content?.length || 0,
      enabled,
    })

    if (!setting_type || !message_content) {
      logger.warn("Missing required fields for order setting", {
        spectrum_id,
        setting_type,
        hasMessageContent: !!message_content,
      })
      res.status(400).json(
        createErrorResponse({
          error: "setting_type and message_content are required",
        }),
      )
      return
    }

    if (!["offer_message", "order_message"].includes(setting_type)) {
      logger.warn("Invalid setting type for order setting", {
        spectrum_id,
        setting_type,
      })
      res
        .status(400)
        .json(createErrorResponse({ error: "Invalid setting_type" }))
      return
    }

    try {
      // Check if setting already exists
      const existing = await database.getOrderSetting(
        "contractor",
        contractor.contractor_id,
        setting_type,
      )
      if (existing) {
        // Update existing setting instead of creating new one
        logger.debug("Updating existing order setting", {
          spectrum_id,
          contractorId: contractor.contractor_id,
          settingId: existing.id,
          setting_type,
        })

        const updated = await database.updateOrderSetting(existing.id, {
          message_content,
          enabled,
        })
        res
          .status(200)
          .json(createResponse({ setting: serializeOrderSetting(updated) }))
        return
      }

      // Create new setting
      logger.debug("Creating new order setting", {
        spectrum_id,
        contractorId: contractor.contractor_id,
        setting_type,
      })

      const setting = await database.createOrderSetting({
        entity_type: "contractor",
        entity_id: contractor.contractor_id,
        setting_type,
        message_content,
        enabled,
      })

      res
        .status(201)
        .json(createResponse({ setting: serializeOrderSetting(setting) }))
    } catch (error) {
      logger.error("Error creating contractor order setting", {
        spectrum_id,
        contractorId: contractor.contractor_id,
        setting_type,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      res.status(500).json(
        createErrorResponse({
          error: "Failed to create contractor order setting",
        }),
      )
    }
  },
)

// PUT /api/v1/orders/contractors/:spectrum_id/settings/:id - Update contractor order setting
orderSettingsRouter.put(
  "/contractors/:spectrum_id/settings/:id",
  userAuthorized,
  org_permission("manage_orders"),
  async (req, res) => {
    const { spectrum_id, id } = req.params
    const contractor = req.contractor!
    const { message_content, enabled }: UpdateOrderSettingRequest = req.body

    if (message_content === undefined && enabled === undefined) {
      res.status(400).json(
        createErrorResponse({
          error: "At least one field must be provided for update",
        }),
      )
      return
    }

    try {
      // First check if the setting exists and belongs to the contractor
      const existing = await database
        .knex<DBOrderSetting>("order_settings")
        .where({
          id,
          entity_type: "contractor",
          entity_id: contractor.contractor_id,
        })
        .first()

      if (!existing) {
        res
          .status(404)
          .json(createErrorResponse({ error: "Order setting not found" }))
        return
      }

      const updated = await database.updateOrderSetting(id, {
        message_content,
        enabled,
      })
      res.json(createResponse({ setting: serializeOrderSetting(updated) }))
    } catch (error) {
      console.error("Error updating contractor order setting:", error)
      res.status(500).json(
        createErrorResponse({
          error: "Failed to update contractor order setting",
        }),
      )
    }
  },
)

// DELETE /api/v1/orders/contractors/:spectrum_id/settings/:id - Delete contractor order setting
orderSettingsRouter.delete(
  "/contractors/:spectrum_id/settings/:id",
  userAuthorized,
  org_permission("manage_orders"),
  async (req, res) => {
    const { spectrum_id, id } = req.params
    const contractor = req.contractor!

    try {
      // First check if the setting exists and belongs to the contractor
      const existing = await database
        .knex<DBOrderSetting>("order_settings")
        .where({
          id,
          entity_type: "contractor",
          entity_id: contractor.contractor_id,
        })
        .first()

      if (!existing) {
        res
          .status(404)
          .json(createErrorResponse({ error: "Order setting not found" }))
        return
      }

      await database.deleteOrderSetting(id)
      res.status(204).send()
    } catch (error) {
      console.error("Error deleting contractor order setting:", error)
      res.status(500).json(
        createErrorResponse({
          error: "Failed to delete contractor order setting",
        }),
      )
    }
  },
)

export default orderSettingsRouter
