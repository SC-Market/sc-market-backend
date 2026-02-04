import { Router } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import * as orderDb from "./database.js"
import {
  createResponse,
  createErrorResponse,
  createNotFoundErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { userAuthorized } from "../../../middleware/auth.js"
import {
  readRateLimit,
  writeRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { org_permission, valid_contractor } from "../contractors/middleware.js"
import { validate_username } from "../profiles/middleware.js"
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
orderSettingsRouter.get(
  "/settings",
  userAuthorized,
  readRateLimit,
  async (req, res) => {
    const user = req.user as User

    try {
      const settings = await orderDb.getOrderSettings("user", user.user_id)
      res.json(
        createResponse({ settings: settings.map(serializeOrderSetting) }),
      )
    } catch (error) {
      logger.error("Error fetching user order settings", { error })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to fetch order settings",
          ),
        )
    }
  },
)

// POST /api/v1/orders/settings - Create order setting for current user
orderSettingsRouter.post(
  "/settings",
  userAuthorized,
  writeRateLimit,
  async (req, res) => {
    const user = req.user as User
    const {
      setting_type,
      message_content,
      enabled = true,
    }: CreateOrderSettingRequest = req.body

    if (!setting_type) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "setting_type is required",
          ),
        )
      return
    }

    // For require_availability, message_content is not needed (can be empty)
    // For stock_subtraction_timing, message_content must be "on_received" or "dont_subtract"
    // (on_accepted is the default when no setting exists, so we don't store it)
    // For order limit setting types, message_content must be a valid non-negative integer
    // For other setting types, message_content is required
    if (setting_type === "stock_subtraction_timing") {
      if (
        message_content !== "on_received" &&
        message_content !== "dont_subtract"
      ) {
        res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "message_content must be 'on_received' or 'dont_subtract' for stock_subtraction_timing",
          ),
        )
      return
    }
  } else if (
    [
      "min_order_size",
      "max_order_size",
      "min_order_value",
      "max_order_value",
    ].includes(setting_type)
  ) {
    // Validate numeric values for order limit settings
    if (!message_content || isNaN(parseInt(message_content, 10))) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "message_content must be a valid number for this setting_type",
          ),
        )
      return
    }
    const numValue = parseInt(message_content, 10)
    if (numValue < 0) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Value must be non-negative",
          ),
        )
      return
    }
  } else if (setting_type !== "require_availability" && !message_content) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "message_content is required for this setting_type",
        ),
      )
    return
  }

  if (
    ![
      "offer_message",
      "order_message",
      "require_availability",
      "stock_subtraction_timing",
      "min_order_size",
      "max_order_size",
      "min_order_value",
      "max_order_value",
    ].includes(setting_type)
  ) {
    res
      .status(400)
      .json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid setting_type"),
      )
    return
  }

  try {
    // Check if setting already exists
    const existing = await orderDb.getOrderSetting(
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

      const updated = await orderDb.updateOrderSetting(existing.id, {
        message_content: message_content || "", // Empty string for require_availability
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

    const setting = await orderDb.createOrderSetting({
      entity_type: "user",
      entity_id: user.user_id,
      setting_type,
      message_content: message_content || "", // Empty string for require_availability
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
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to create order setting",
        ),
      )
  }
})

// PUT /api/v1/orders/settings/:id - Update order setting
orderSettingsRouter.put(
  "/settings/:id",
  userAuthorized,
  writeRateLimit,
  async (req, res) => {
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
        res.status(404).json(createNotFoundErrorResponse("Order setting", id))
        return
      }

      const updated = await orderDb.updateOrderSetting(id, {
        message_content,
        enabled,
      })
      res.json(createResponse({ setting: serializeOrderSetting(updated) }))
    } catch (error) {
      logger.error("Error updating order setting", { error })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to update order setting",
          ),
        )
    }
  },
)

// DELETE /api/v1/orders/settings/:id - Delete order setting
orderSettingsRouter.delete(
  "/settings/:id",
  userAuthorized,
  writeRateLimit,
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

      await orderDb.deleteOrderSetting(id)
      res.status(204).send()
    } catch (error) {
      logger.error("Error deleting order setting", { error })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to delete order setting",
          ),
        )
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
  readRateLimit,
  async (req, res) => {
    const { spectrum_id } = req.params
    const contractor = req.contractor!
    logger.debug("GET contractor order settings", {
      spectrum_id,
      contractorId: contractor.contractor_id,
    })

    try {
      const settings = await orderDb.getOrderSettings(
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
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to fetch contractor order settings",
          ),
        )
    }
  },
)

// POST /api/v1/orders/contractors/:spectrum_id/settings - Create order setting for contractor
orderSettingsRouter.post(
  "/contractors/:spectrum_id/settings",
  userAuthorized,
  org_permission("manage_orders"),
  writeRateLimit,
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

    if (!setting_type) {
      logger.warn("Missing setting_type for order setting", {
        spectrum_id,
      })
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "setting_type is required",
          ),
        )
      return
    }

    // For require_availability, message_content is not needed (can be empty)
    // For stock_subtraction_timing, message_content must be "on_received" or "dont_subtract"
    // (on_accepted is the default when no setting exists, so we don't store it)
    // For order limit setting types, message_content must be a valid non-negative integer
    // For other setting types, message_content is required
    if (setting_type === "stock_subtraction_timing") {
      if (
        message_content !== "on_received" &&
        message_content !== "dont_subtract"
      ) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "message_content must be 'on_received' or 'dont_subtract' for stock_subtraction_timing",
            ),
          )
        return
      }
    } else if (
      [
        "min_order_size",
        "max_order_size",
        "min_order_value",
        "max_order_value",
      ].includes(setting_type)
    ) {
      // Validate numeric values for order limit settings
      if (!message_content || isNaN(parseInt(message_content, 10))) {
        logger.warn("Invalid message_content for order limit setting", {
          spectrum_id,
          setting_type,
        })
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "message_content must be a valid number for this setting_type",
            ),
          )
        return
      }
      const numValue = parseInt(message_content, 10)
      if (numValue < 0) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Value must be non-negative",
            ),
          )
        return
      }
    } else if (setting_type !== "require_availability" && !message_content) {
      logger.warn("Missing message_content for order setting", {
        spectrum_id,
        setting_type,
      })
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "message_content is required for this setting_type",
          ),
        )
      return
    }

    if (
      ![
        "offer_message",
        "order_message",
        "require_availability",
        "stock_subtraction_timing",
        "min_order_size",
        "max_order_size",
        "min_order_value",
        "max_order_value",
      ].includes(setting_type)
    ) {
      logger.warn("Invalid setting type for order setting", {
        spectrum_id,
        setting_type,
      })
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Invalid setting_type",
          ),
        )
      return
    }

    try {
      // Check if setting already exists
      const existing = await orderDb.getOrderSetting(
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

        const updated = await orderDb.updateOrderSetting(existing.id, {
          message_content: message_content || "", // Empty string for require_availability
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

      const setting = await orderDb.createOrderSetting({
        entity_type: "contractor",
        entity_id: contractor.contractor_id,
        setting_type,
        message_content: message_content || "", // Empty string for require_availability
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
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to create contractor order setting",
          ),
        )
    }
  },
)

// PUT /api/v1/orders/contractors/:spectrum_id/settings/:id - Update contractor order setting
orderSettingsRouter.put(
  "/contractors/:spectrum_id/settings/:id",
  userAuthorized,
  org_permission("manage_orders"),
  writeRateLimit,
  async (req, res) => {
    const { spectrum_id, id } = req.params
    const contractor = req.contractor!
    const { message_content, enabled }: UpdateOrderSettingRequest = req.body

    if (message_content === undefined && enabled === undefined) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "At least one field must be provided for update",
          ),
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

      const updated = await orderDb.updateOrderSetting(id, {
        message_content,
        enabled,
      })
      res.json(createResponse({ setting: serializeOrderSetting(updated) }))
    } catch (error) {
      logger.error("Error updating contractor order setting", { error })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to update contractor order setting",
          ),
        )
    }
  },
)

// DELETE /api/v1/orders/contractors/:spectrum_id/settings/:id - Delete contractor order setting
orderSettingsRouter.delete(
  "/contractors/:spectrum_id/settings/:id",
  userAuthorized,
  org_permission("manage_orders"),
  writeRateLimit,
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

      await orderDb.deleteOrderSetting(id)
      res.status(204).send()
    } catch (error) {
      logger.error("Error deleting contractor order setting", { error })
      res.status(500).json(
        createErrorResponse({
          error: "Failed to delete contractor order setting",
        }),
      )
    }
  },
)

// =============================================================================
// AVAILABILITY REQUIREMENT CHECK ENDPOINTS
// =============================================================================
import { isAvailabilityRequired, hasAvailabilitySet } from "./helpers.js"

// GET /api/v1/orders/availability/contractor/:spectrum_id/check - Check if availability is required for contractor
orderSettingsRouter.get(
  "/availability/contractor/:spectrum_id/check",
  userAuthorized,
  valid_contractor,
  readRateLimit,
  async (req, res) => {
    const user = req.user as User
    const contractor = req.contractor!

    try {
      // Check if availability is required
      const required = await isAvailabilityRequired(
        contractor.contractor_id,
        null,
      )

      // If required, check if user has availability set
      let hasAvailability = false
      if (required) {
        hasAvailability = await hasAvailabilitySet(
          user.user_id,
          contractor.contractor_id,
        )
      }

      res.json(
        createResponse({
          required,
          hasAvailability,
        }),
      )
    } catch (error) {
      logger.error("Error checking availability requirement", {
        userId: user.user_id,
        contractorId: contractor.contractor_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to check availability requirement",
          ),
        )
    }
  },
)

// GET /api/v1/orders/availability/user/:username/check - Check if availability is required for user
orderSettingsRouter.get(
  "/availability/user/:username/check",
  userAuthorized,
  validate_username("username"),
  readRateLimit,
  async (req, res) => {
    const user = req.user as User
    const sellerUser = req.users!.get("username")!

    try {
      // Check if availability is required
      const required = await isAvailabilityRequired(null, sellerUser.user_id)

      // If required, check if user has availability set
      // For user sellers, check global availability (contractor_id = null)
      let hasAvailability = false
      if (required) {
        hasAvailability = await hasAvailabilitySet(user.user_id, null)
      }

      res.json(
        createResponse({
          required,
          hasAvailability,
        }),
      )
    } catch (error) {
      logger.error("Error checking availability requirement", {
        userId: user.user_id,
        sellerUserId: sellerUser.user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to check availability requirement",
          ),
        )
    }
  },
)

// =============================================================================
// ORDER LIMITS CHECK ENDPOINTS
// =============================================================================

// GET /api/v1/orders/limits/contractor/:spectrum_id/check - Get order limits for contractor
orderSettingsRouter.get(
  "/limits/contractor/:spectrum_id/check",
  userAuthorized,
  valid_contractor,
  readRateLimit,
  async (req, res) => {
    const contractor = req.contractor!

    try {
      const settings = await orderDb.getOrderSettings(
        "contractor",
        contractor.contractor_id,
      )

      const limits = {
        min_order_size: settings.find(
          (s) => s.setting_type === "min_order_size" && s.enabled,
        )?.message_content,
        max_order_size: settings.find(
          (s) => s.setting_type === "max_order_size" && s.enabled,
        )?.message_content,
        min_order_value: settings.find(
          (s) => s.setting_type === "min_order_value" && s.enabled,
        )?.message_content,
        max_order_value: settings.find(
          (s) => s.setting_type === "max_order_value" && s.enabled,
        )?.message_content,
      }

      res.json(createResponse({ limits }))
    } catch (error) {
      logger.error("Error fetching contractor order limits", {
        contractorId: contractor.contractor_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to fetch order limits",
          ),
        )
    }
  },
)

// GET /api/v1/orders/limits/user/:username/check - Get order limits for user
orderSettingsRouter.get(
  "/limits/user/:username/check",
  userAuthorized,
  validate_username("username"),
  readRateLimit,
  async (req, res) => {
    const sellerUser = req.users!.get("username")!

    try {
      const settings = await orderDb.getOrderSettings(
        "user",
        sellerUser.user_id,
      )

      const limits = {
        min_order_size: settings.find(
          (s) => s.setting_type === "min_order_size" && s.enabled,
        )?.message_content,
        max_order_size: settings.find(
          (s) => s.setting_type === "max_order_size" && s.enabled,
        )?.message_content,
        min_order_value: settings.find(
          (s) => s.setting_type === "min_order_value" && s.enabled,
        )?.message_content,
        max_order_value: settings.find(
          (s) => s.setting_type === "max_order_value" && s.enabled,
        )?.message_content,
      }

      res.json(createResponse({ limits }))
    } catch (error) {
      logger.error("Error fetching user order limits", {
        userId: sellerUser.user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to fetch order limits",
          ),
        )
    }
  },
)

export default orderSettingsRouter
