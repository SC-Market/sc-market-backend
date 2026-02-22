import express from "express"
import * as adminDb from "./database.js"
import * as contractorDb from "../contractors/database.js"
import { adminAuthorized } from "../../../middleware/auth.js"
import { createResponse, createErrorResponse } from "../util/response.js"
// Legacy openapi.js has been removed - these routes need to be migrated to TSOA
// import {
//   adminOapi,
//   Response400,
//   Response401,
//   Response403,
//   Response404,
//   Response500,
// } from "../openapi.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import { User } from "../api-models.js"
import logger from "../../../../logger/logger.js"

// Temporary stub for adminOapi until migration to TSOA
const adminOapi = {
  schema: (name: string, schema?: any) => schema || {},
  validPath: (config: any) => (req: any, res: any, next: any) => next(),
}

// Temporary response type stubs
const Response400 = {}
const Response401 = {}
const Response403 = {}
const Response404 = {}
const Response500 = {}

export const adminAlertsRouter = express.Router()

// Helper function to convert database alert to API response format
async function formatAlertForAPI(alert: any) {
  let target_spectrum_id: string | null = null

  // Convert contractor ID back to Spectrum ID for API response
  if (alert.target_contractor_id) {
    try {
      const contractor = await contractorDb.getContractor({
        contractor_id: alert.target_contractor_id,
      })
      target_spectrum_id = contractor.spectrum_id
    } catch (error) {
      // If contractor not found, leave as null
      logger.warn("Could not find contractor for alert", {
        alertId: alert.alert_id,
        contractorId: alert.target_contractor_id,
      })
    }
  }

  return {
    ...alert,
    target_spectrum_id,
    // Remove internal contractor_id from response
    target_contractor_id: undefined,
  }
}

// Define schemas for admin alerts API
adminOapi.schema("AdminAlert", {
  type: "object",
  title: "AdminAlert",
  description: "An admin-created alert that is sent to users as notifications",
  properties: {
    alert_id: {
      type: "string",
      format: "uuid",
      description: "Unique identifier for the alert",
    },
    title: {
      type: "string",
      maxLength: 200,
      description: "Alert title",
      example: "System Maintenance Notice",
    },
    content: {
      type: "string",
      description: "Markdown-formatted alert content",
      example:
        "We will be performing system maintenance on **Saturday at 2 AM UTC**.",
    },
    link: {
      type: "string",
      format: "uri",
      nullable: true,
      description: "Optional URL link to include with the alert",
      example: "https://example.com/maintenance-notice",
    },
    target_type: {
      type: "string",
      enum: [
        "all_users",
        "org_members",
        "org_owners",
        "admins_only",
        "specific_org",
      ],
      description: "Type of users to target with this alert",
      example: "all_users",
    },
    target_spectrum_id: {
      type: "string",
      nullable: true,
      description:
        "Specific contractor Spectrum ID when target_type is specific_org",
    },
    created_by: {
      type: "string",
      format: "uuid",
      description: "User ID of the admin who created the alert",
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "When the alert was created",
    },
    active: {
      type: "boolean",
      description: "Whether the alert is currently active",
      default: true,
    },
  },
  required: [
    "alert_id",
    "title",
    "content",
    "target_type",
    "created_by",
    "created_at",
    "active",
  ],
})

adminOapi.schema("AdminAlertCreate", {
  type: "object",
  title: "AdminAlertCreate",
  description: "Request body for creating a new admin alert",
  properties: {
    title: {
      type: "string",
      maxLength: 200,
      description: "Alert title",
      example: "System Maintenance Notice",
    },
    content: {
      type: "string",
      description: "Markdown-formatted alert content",
      example:
        "We will be performing system maintenance on **Saturday at 2 AM UTC**.",
    },
    link: {
      type: "string",
      format: "uri",
      nullable: true,
      description: "Optional URL link to include with the alert",
      example: "https://example.com/maintenance-notice",
    },
    target_type: {
      type: "string",
      enum: [
        "all_users",
        "org_members",
        "org_owners",
        "admins_only",
        "specific_org",
      ],
      description: "Type of users to target with this alert",
      example: "all_users",
    },
    target_spectrum_id: {
      type: "string",
      nullable: true,
      description:
        "Specific contractor Spectrum ID when target_type is specific_org",
    },
  },
  required: ["title", "content", "target_type"],
})

adminOapi.schema("AdminAlertUpdate", {
  type: "object",
  title: "AdminAlertUpdate",
  description: "Request body for updating an admin alert",
  properties: {
    title: {
      type: "string",
      maxLength: 200,
      description: "Alert title",
    },
    content: {
      type: "string",
      description: "Markdown-formatted alert content",
    },
    link: {
      type: "string",
      format: "uri",
      nullable: true,
      description: "Optional URL link to include with the alert",
    },
    target_type: {
      type: "string",
      enum: [
        "all_users",
        "org_members",
        "org_owners",
        "admins_only",
        "specific_org",
      ],
      description: "Type of users to target with this alert",
    },
    target_spectrum_id: {
      type: "string",
      nullable: true,
      description:
        "Specific contractor Spectrum ID when target_type is specific_org",
    },
    active: {
      type: "boolean",
      description: "Whether the alert is currently active",
    },
  },
})

// Create a new admin alert
// POST /admin/alerts
adminAlertsRouter.post(
  "/",
  adminAuthorized,
  adminOapi.validPath({
    summary: "Create a new admin alert",
    description:
      "Create a new admin alert and send notifications to target users",
    operationId: "createAdminAlert",
    tags: ["AdminAlerts", "Admin"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: adminOapi.schema("AdminAlertCreate"),
        },
      },
    },
    responses: {
      "200": {
        description: "Admin alert created successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  $ref: "#/components/schemas/AdminAlert",
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [{ adminAuth: [] }],
  }),
  async (req, res) => {
    const user = req.user as User
    const { title, content, link, target_type, target_spectrum_id } = req.body

    // Validate required fields
    if (!title || !content || !target_type) {
      res.status(400).json(
        createErrorResponse({
          message: "Title, content, and target_type are required",
        }),
      )
      return
    }

    // Validate target_type
    const validTargetTypes = [
      "all_users",
      "org_members",
      "org_owners",
      "admins_only",
      "specific_org",
    ]
    if (!validTargetTypes.includes(target_type)) {
      res.status(400).json(
        createErrorResponse({
          message:
            "Invalid target_type. Must be one of: " +
            validTargetTypes.join(", "),
        }),
      )
      return
    }

    // Validate target_spectrum_id for specific_org
    if (target_type === "specific_org" && !target_spectrum_id) {
      res.status(400).json(
        createErrorResponse({
          message:
            "target_spectrum_id is required when target_type is specific_org",
        }),
      )
      return
    }

    // Validate link format if provided
    if (link) {
      try {
        new URL(link)
      } catch (error) {
        res.status(400).json(
          createErrorResponse({
            message: "Invalid link format. Must be a valid URL.",
          }),
        )
        return
      }
    }

    // Convert Spectrum ID to contractor ID if provided
    let target_contractor_id: string | null = null
    if (target_spectrum_id) {
      try {
        const contractor = await contractorDb.getContractor({
          spectrum_id: target_spectrum_id,
        })
        target_contractor_id = contractor.contractor_id
      } catch (error) {
        res.status(400).json(
          createErrorResponse({
            message: "Invalid target_spectrum_id",
          }),
        )
        return
      }
    }

    try {
      // Create the alert
      const alert = await adminDb.createAdminAlert({
        title,
        content,
        link,
        target_type,
        target_contractor_id,
        created_by: user.user_id,
        active: true,
      })

      // Send notifications to target users
      await notificationService.createAdminAlertNotification(alert)

      logger.info("Admin alert created successfully", {
        alertId: alert.alert_id,
        createdBy: user.user_id,
        targetType: target_type,
      })

      const formattedAlert = await formatAlertForAPI(alert)
      res.json(createResponse(formattedAlert))
    } catch (error) {
      logger.error("Failed to create admin alert:", error)
      res.status(500).json(
        createErrorResponse({
          message: "Failed to create admin alert",
        }),
      )
    }
  },
)

// Get paginated admin alerts
// GET /admin/alerts?page=0&pageSize=20
adminAlertsRouter.get(
  "/",
  adminAuthorized,
  adminOapi.validPath({
    summary: "Get paginated admin alerts",
    description: "Retrieve paginated admin alerts with optional filtering",
    operationId: "getAdminAlerts",
    tags: ["AdminAlerts", "Admin"],
    parameters: [
      {
        name: "page",
        in: "query",
        required: false,
        description: "Page number (0-based)",
        schema: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
      },
      {
        name: "pageSize",
        in: "query",
        required: false,
        description: "Number of alerts per page (1-100)",
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
      {
        name: "target_type",
        in: "query",
        required: false,
        description: "Filter by target type",
        schema: {
          type: "string",
          enum: [
            "all_users",
            "org_members",
            "org_owners",
            "admins_only",
            "specific_org",
          ],
        },
      },
      {
        name: "active",
        in: "query",
        required: false,
        description: "Filter by active status",
        schema: {
          type: "boolean",
        },
      },
    ],
    responses: {
      "200": {
        description: "Admin alerts retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    alerts: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/AdminAlert",
                      },
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "integer" },
                        page_size: { type: "integer" },
                        total: { type: "integer" },
                        total_pages: { type: "integer" },
                        has_next: { type: "boolean" },
                        has_prev: { type: "boolean" },
                      },
                    },
                  },
                  required: ["alerts", "pagination"],
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [{ adminAuth: [] }],
  }),
  async (req, res) => {
    const page = Math.max(0, parseInt(req.query.page as string) || 0)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize as string) || 20),
    )
    const targetType = req.query.target_type as string
    const active =
      req.query.active !== undefined ? req.query.active === "true" : undefined

    // Build where clause for filtering
    const whereClause: any = {}
    if (targetType) {
      whereClause.target_type = targetType
    }
    if (active !== undefined) {
      whereClause.active = active
    }

    try {
      const result = await adminDb.getAdminAlertsPaginated(
        page,
        pageSize,
        whereClause,
      )

      // Format all alerts for API response
      const formattedAlerts = await Promise.all(
        result.alerts.map((alert) => formatAlertForAPI(alert)),
      )

      res.json(
        createResponse({
          alerts: formattedAlerts,
          pagination: result.pagination,
        }),
      )
    } catch (error) {
      logger.error("Failed to fetch admin alerts:", error)
      res.status(500).json(
        createErrorResponse({
          message: "Failed to fetch admin alerts",
        }),
      )
    }
  },
)

// Get a specific admin alert
// GET /admin/alerts/:alert_id
adminAlertsRouter.get(
  "/:alert_id",
  adminAuthorized,
  adminOapi.validPath({
    summary: "Get a specific admin alert",
    description: "Retrieve details of a specific admin alert",
    operationId: "getAdminAlert",
    tags: ["AdminAlerts", "Admin"],
    parameters: [
      {
        name: "alert_id",
        in: "path",
        required: true,
        description: "ID of the alert to retrieve",
        schema: {
          type: "string",
          format: "uuid",
        },
      },
    ],
    responses: {
      "200": {
        description: "Admin alert retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  $ref: "#/components/schemas/AdminAlert",
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "500": Response500,
    },
    security: [{ adminAuth: [] }],
  }),
  async (req, res) => {
    const alertId = req.params.alert_id

    try {
      const alerts = await adminDb.getAdminAlerts({ alert_id: alertId })

      if (alerts.length === 0) {
        res.status(404).json(
          createErrorResponse({
            message: "Admin alert not found",
          }),
        )
        return
      }

      const formattedAlert = await formatAlertForAPI(alerts[0])
      res.json(createResponse(formattedAlert))
    } catch (error) {
      logger.error("Failed to fetch admin alert:", error)
      res.status(500).json(
        createErrorResponse({
          message: "Failed to fetch admin alert",
        }),
      )
    }
  },
)

// Update an admin alert
// PATCH /admin/alerts/:alert_id
adminAlertsRouter.patch(
  "/:alert_id",
  adminAuthorized,
  adminOapi.validPath({
    summary: "Update an admin alert",
    description: "Update an existing admin alert",
    operationId: "updateAdminAlert",
    tags: ["AdminAlerts", "Admin"],
    parameters: [
      {
        name: "alert_id",
        in: "path",
        required: true,
        description: "ID of the alert to update",
        schema: {
          type: "string",
          format: "uuid",
        },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: adminOapi.schema("AdminAlertUpdate"),
        },
      },
    },
    responses: {
      "200": {
        description: "Admin alert updated successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  $ref: "#/components/schemas/AdminAlert",
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "500": Response500,
    },
    security: [{ adminAuth: [] }],
  }),
  async (req, res) => {
    const alertId = req.params.alert_id
    const updates = req.body

    // Validate link format if provided
    if (updates.link) {
      try {
        new URL(updates.link)
      } catch (error) {
        res.status(400).json(
          createErrorResponse({
            message: "Invalid link format. Must be a valid URL.",
          }),
        )
        return
      }
    }

    // Validate target_type if provided
    if (updates.target_type) {
      const validTargetTypes = [
        "all_users",
        "org_members",
        "org_owners",
        "admins_only",
        "specific_org",
      ]
      if (!validTargetTypes.includes(updates.target_type)) {
        res.status(400).json(
          createErrorResponse({
            message:
              "Invalid target_type. Must be one of: " +
              validTargetTypes.join(", "),
          }),
        )
        return
      }
    }

    // Validate target_spectrum_id for specific_org
    if (updates.target_type === "specific_org" && !updates.target_spectrum_id) {
      res.status(400).json(
        createErrorResponse({
          message:
            "target_spectrum_id is required when target_type is specific_org",
        }),
      )
      return
    }

    // Convert Spectrum ID to contractor ID if provided
    if (updates.target_spectrum_id) {
      try {
        const contractor = await contractorDb.getContractor({
          spectrum_id: updates.target_spectrum_id,
        })
        updates.target_contractor_id = contractor.contractor_id
        // Remove spectrum_id from updates since we store contractor_id internally
        delete updates.target_spectrum_id
      } catch (error) {
        res.status(400).json(
          createErrorResponse({
            message: "Invalid target_spectrum_id",
          }),
        )
        return
      }
    }

    try {
      const updatedAlert = await adminDb.updateAdminAlert(alertId, updates)

      if (!updatedAlert) {
        res.status(404).json(
          createErrorResponse({
            message: "Admin alert not found",
          }),
        )
        return
      }

      logger.info("Admin alert updated successfully", {
        alertId,
        updatedFields: Object.keys(updates),
      })

      const formattedAlert = await formatAlertForAPI(updatedAlert)
      res.json(createResponse(formattedAlert))
    } catch (error) {
      logger.error("Failed to update admin alert:", error)
      res.status(500).json(
        createErrorResponse({
          message: "Failed to update admin alert",
        }),
      )
    }
  },
)

// Delete an admin alert
// DELETE /admin/alerts/:alert_id
adminAlertsRouter.delete(
  "/:alert_id",
  adminAuthorized,
  adminOapi.validPath({
    summary: "Delete an admin alert",
    description: "Delete an admin alert",
    operationId: "deleteAdminAlert",
    tags: ["AdminAlerts", "Admin"],
    parameters: [
      {
        name: "alert_id",
        in: "path",
        required: true,
        description: "ID of the alert to delete",
        schema: {
          type: "string",
          format: "uuid",
        },
      },
    ],
    responses: {
      "200": {
        description: "Admin alert deleted successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                  },
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "500": Response500,
    },
    security: [{ adminAuth: [] }],
  }),
  async (req, res) => {
    const alertId = req.params.alert_id

    try {
      const deleted = await adminDb.deleteAdminAlert(alertId)

      if (!deleted) {
        res.status(404).json(
          createErrorResponse({
            message: "Admin alert not found",
          }),
        )
        return
      }

      logger.info("Admin alert deleted successfully", { alertId })

      res.json(
        createResponse({
          success: true,
          message: "Admin alert deleted successfully",
        }),
      )
    } catch (error) {
      logger.error("Failed to delete admin alert:", error)
      res.status(500).json(
        createErrorResponse({
          message: "Failed to delete admin alert",
        }),
      )
    }
  },
)
