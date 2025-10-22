import express from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { adminAuthorized } from "../../../middleware/auth.js"
import { createResponse } from "../util/response.js"
import { adminOapi, Response401, Response403, Response500 } from "../openapi.js"
import { spectrumMigrationRouter } from "./spectrum-migration.js"
import { adminAlertsRouter } from "./alerts.js"

export const adminRouter = express.Router()

// Mount spectrum migration routes
adminRouter.use("/spectrum-migration", spectrumMigrationRouter)

// Mount admin alerts routes
adminRouter.use("/alerts", adminAlertsRouter)

// Define schemas
adminOapi.schema("OrderAnalyticsTimeSeries", {
  type: "object",
  title: "OrderAnalyticsTimeSeries",
  properties: {
    date: {
      type: "string",
      format: "date",
      description: "ISO date string",
      example: "2024-01-01",
    },
    total: {
      type: "integer",
      description: "Total orders for this period",
      minimum: 0,
      example: 15,
    },
    in_progress: {
      type: "integer",
      description: "Orders currently in progress",
      minimum: 0,
      example: 5,
    },
    fulfilled: {
      type: "integer",
      description: "Completed orders",
      minimum: 0,
      example: 8,
    },
    cancelled: {
      type: "integer",
      description: "Cancelled orders",
      minimum: 0,
      example: 1,
    },
    not_started: {
      type: "integer",
      description: "Orders not yet started",
      minimum: 0,
      example: 1,
    },
  },
  required: [
    "date",
    "total",
    "in_progress",
    "fulfilled",
    "cancelled",
    "not_started",
  ],
})

adminOapi.schema("OrderAnalyticsTopContractor", {
  type: "object",
  title: "OrderAnalyticsTopContractor",
  properties: {
    name: {
      type: "string",
      description: "Contractor name",
      example: "Elite Services Corp",
    },
    fulfilled_orders: {
      type: "integer",
      description: "Number of fulfilled orders",
      minimum: 0,
      example: 25,
    },
    total_orders: {
      type: "integer",
      description: "Total number of orders",
      minimum: 0,
      example: 30,
    },
  },
  required: ["name", "fulfilled_orders", "total_orders"],
})

adminOapi.schema("OrderAnalyticsTopUser", {
  type: "object",
  title: "OrderAnalyticsTopUser",
  properties: {
    username: {
      type: "string",
      description: "User's username",
      example: "star_citizen_123",
    },
    fulfilled_orders: {
      type: "integer",
      description: "Number of fulfilled orders",
      minimum: 0,
      example: 10,
    },
    total_orders: {
      type: "integer",
      description: "Total number of orders",
      minimum: 0,
      example: 12,
    },
  },
  required: ["username", "fulfilled_orders", "total_orders"],
})

adminOapi.schema("OrderAnalyticsSummary", {
  type: "object",
  title: "OrderAnalyticsSummary",
  properties: {
    total_orders: {
      type: "integer",
      description: "Total number of orders in the system",
      minimum: 0,
      example: 150,
    },
    active_orders: {
      type: "integer",
      description: "Orders currently in progress or not started",
      minimum: 0,
      example: 45,
    },
    completed_orders: {
      type: "integer",
      description: "Total fulfilled orders",
      minimum: 0,
      example: 95,
    },
    total_value: {
      type: "integer",
      description: "Total value of all fulfilled orders",
      minimum: 0,
      example: 50000,
    },
  },
  required: [
    "total_orders",
    "active_orders",
    "completed_orders",
    "total_value",
  ],
})

adminOapi.schema("OrderAnalyticsResponse", {
  type: "object",
  title: "OrderAnalyticsResponse",
  properties: {
    daily_totals: {
      type: "array",
      items: {
        $ref: "#/components/schemas/OrderAnalyticsTimeSeries",
      },
      description: "Daily order statistics for the last 30 days",
    },
    weekly_totals: {
      type: "array",
      items: {
        $ref: "#/components/schemas/OrderAnalyticsTimeSeries",
      },
      description: "Weekly order statistics for the last 12 weeks",
    },
    monthly_totals: {
      type: "array",
      items: {
        $ref: "#/components/schemas/OrderAnalyticsTimeSeries",
      },
      description: "Monthly order statistics for the last 12 months",
    },
    top_contractors: {
      type: "array",
      items: {
        $ref: "#/components/schemas/OrderAnalyticsTopContractor",
      },
      description: "Top 10 contractors by fulfilled orders",
    },
    top_users: {
      type: "array",
      items: {
        $ref: "#/components/schemas/OrderAnalyticsTopUser",
      },
      description: "Top 10 users by fulfilled orders",
    },
    summary: {
      $ref: "#/components/schemas/OrderAnalyticsSummary",
      description: "Summary statistics for all orders",
    },
  },
  required: [
    "daily_totals",
    "weekly_totals",
    "monthly_totals",
    "top_contractors",
    "top_users",
    "summary",
  ],
})

adminOapi.schema("MembershipAnalyticsTimeSeries", {
  type: "object",
  title: "MembershipAnalyticsTimeSeries",
  properties: {
    date: {
      type: "string",
      format: "date",
      description: "ISO date string",
      example: "2024-01-01",
    },
    new_members: {
      type: "integer",
      description: "Total new members registered in this period",
      minimum: 0,
      example: 25,
    },
    new_members_rsi_verified: {
      type: "integer",
      description: "New RSI verified members registered in this period",
      minimum: 0,
      example: 15,
    },
    new_members_rsi_unverified: {
      type: "integer",
      description: "New RSI unverified members registered in this period",
      minimum: 0,
      example: 10,
    },
    cumulative_members: {
      type: "integer",
      description: "Total members up to this period",
      minimum: 0,
      example: 1250,
    },
    cumulative_members_rsi_verified: {
      type: "integer",
      description: "Total RSI verified members up to this period",
      minimum: 0,
      example: 750,
    },
    cumulative_members_rsi_unverified: {
      type: "integer",
      description: "Total RSI unverified members up to this period",
      minimum: 0,
      example: 500,
    },
  },
  required: [
    "date",
    "new_members",
    "new_members_rsi_verified",
    "new_members_rsi_unverified",
    "cumulative_members",
    "cumulative_members_rsi_verified",
    "cumulative_members_rsi_unverified",
  ],
})

adminOapi.schema("MembershipAnalyticsSummary", {
  type: "object",
  title: "MembershipAnalyticsSummary",
  properties: {
    total_members: {
      type: "integer",
      description: "Total number of registered members",
      minimum: 0,
      example: 1500,
    },
    admin_members: {
      type: "integer",
      description: "Number of admin members",
      minimum: 0,
      example: 5,
    },
    regular_members: {
      type: "integer",
      description: "Number of regular user members",
      minimum: 0,
      example: 1495,
    },
    rsi_confirmed_members: {
      type: "integer",
      description: "Number of RSI confirmed members",
      minimum: 0,
      example: 850,
    },
    banned_members: {
      type: "integer",
      description: "Number of banned members",
      minimum: 0,
      example: 12,
    },
    new_members_30d: {
      type: "integer",
      description: "New members in the last 30 days",
      minimum: 0,
      example: 75,
    },
    new_members_7d: {
      type: "integer",
      description: "New members in the last 7 days",
      minimum: 0,
      example: 18,
    },
  },
  required: [
    "total_members",
    "admin_members",
    "regular_members",
    "rsi_confirmed_members",
    "banned_members",
    "new_members_30d",
    "new_members_7d",
  ],
})

adminOapi.schema("MembershipAnalyticsResponse", {
  type: "object",
  title: "MembershipAnalyticsResponse",
  properties: {
    daily_totals: {
      type: "array",
      items: {
        $ref: "#/components/schemas/MembershipAnalyticsTimeSeries",
      },
      description: "Daily membership statistics for the last 30 days",
    },
    weekly_totals: {
      type: "array",
      items: {
        $ref: "#/components/schemas/MembershipAnalyticsTimeSeries",
      },
      description: "Weekly membership statistics for the last 12 weeks",
    },
    monthly_totals: {
      type: "array",
      items: {
        $ref: "#/components/schemas/MembershipAnalyticsTimeSeries",
      },
      description: "Monthly membership statistics for the last 12 months",
    },
    summary: {
      $ref: "#/components/schemas/MembershipAnalyticsSummary",
      description: "Summary statistics for all members",
    },
  },
  required: ["daily_totals", "weekly_totals", "monthly_totals", "summary"],
})

adminRouter.get(
  "/activity",
  adminOapi.validPath({
    summary: "Get platform activity statistics",
    description:
      "Returns daily, weekly, and monthly activity counts for the platform",
    operationId: "getPlatformActivity",
    tags: ["Admin"],
    parameters: [],
    responses: {
      "200": {
        description: "Activity statistics retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    daily: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          date: {
                            type: "string",
                            format: "date",
                          },
                          count: {
                            type: "integer",
                            minimum: 0,
                          },
                        },
                      },
                    },
                    weekly: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          date: {
                            type: "string",
                            format: "date",
                          },
                          count: {
                            type: "integer",
                            minimum: 0,
                          },
                        },
                      },
                    },
                    monthly: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          date: {
                            type: "string",
                            format: "date",
                          },
                          count: {
                            type: "integer",
                            minimum: 0,
                          },
                        },
                      },
                    },
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
    },
    security: [{ adminAuth: [] }],
  }),
  adminAuthorized,
  async (req, res) => {
    const daily = await database.getDailyActivity()
    const weekly = await database.getWeeklyActivity()
    const monthly = await database.getMonthlyActivity()
    res.json(createResponse({ daily, weekly, monthly }))
    return
  },
)

adminRouter.get(
  "/orders/analytics",
  adminOapi.validPath({
    summary: "Get comprehensive order analytics",
    description:
      "Returns detailed order statistics including time-series data, top performers, and summary metrics for the admin panel",
    operationId: "getOrderAnalytics",
    tags: ["Admin"],
    parameters: [],
    responses: {
      "200": {
        description: "Order analytics data retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  $ref: "#/components/schemas/OrderAnalyticsResponse",
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
  adminAuthorized,
  async (req, res) => {
    try {
      const analytics = await database.getOrderAnalytics()
      res.json(createResponse(analytics))
    } catch (error) {
      console.error("Error fetching order analytics:", error)
      res
        .status(500)
        .json(createResponse({ error: "Failed to fetch order analytics" }))
    }
    return
  },
)

adminRouter.get(
  "/users",
  adminOapi.validPath({
    summary: "Get all users with pagination",
    description:
      "Retrieve all users with pagination support. Only accessible by administrators.",
    operationId: "getAllUsers",
    tags: ["Admin"],
    parameters: [
      {
        name: "page",
        in: "query",
        description: "Page number (1-based)",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          default: 1,
        },
      },
      {
        name: "page_size",
        in: "query",
        description: "Number of users per page",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
      {
        name: "role",
        in: "query",
        description: "Filter by user role",
        required: false,
        schema: {
          type: "string",
          enum: ["user", "admin"],
        },
      },
      {
        name: "banned",
        in: "query",
        description: "Filter by banned status",
        required: false,
        schema: {
          type: "boolean",
        },
      },
      {
        name: "rsi_confirmed",
        in: "query",
        description: "Filter by RSI confirmation status",
        required: false,
        schema: {
          type: "boolean",
        },
      },
      {
        name: "sort_by",
        in: "query",
        description: "Field to sort by",
        required: false,
        schema: {
          type: "string",
          enum: [
            "created_at",
            "username",
            "display_name",
            "role",
            "banned",
            "rsi_confirmed",
            "balance",
            "locale",
          ],
          default: "created_at",
        },
      },
      {
        name: "sort_order",
        in: "query",
        description: "Sort order (ascending or descending)",
        required: false,
        schema: {
          type: "string",
          enum: ["asc", "desc"],
          default: "desc",
        },
      },
    ],
    responses: {
      "200": {
        description: "Users retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          discord_id: { type: "string" },
                          user_id: { type: "string", format: "uuid" },
                          display_name: { type: "string" },
                          profile_description: { type: "string" },
                          role: { type: "string", enum: ["user", "admin"] },
                          banned: { type: "boolean" },
                          username: { type: "string" },
                          avatar: { type: "string" },
                          banner: { type: "string" },
                          balance: { type: "string" },
                          created_at: { type: "string", format: "date-time" },
                          locale: { type: "string" },
                          rsi_confirmed: { type: "boolean" },
                          official_server_id: {
                            type: "string",
                            nullable: true,
                          },
                          discord_thread_channel_id: {
                            type: "string",
                            nullable: true,
                          },
                          market_order_template: { type: "string" },
                        },
                      },
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "integer" },
                        page_size: { type: "integer" },
                        total_users: { type: "integer" },
                        total_pages: { type: "integer" },
                        has_next: { type: "boolean" },
                        has_prev: { type: "boolean" },
                      },
                    },
                  },
                  required: ["users", "pagination"],
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
  adminAuthorized,
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1)
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(req.query.page_size as string) || 20),
      )
      const role = req.query.role as string
      const banned =
        req.query.banned !== undefined ? req.query.banned === "true" : undefined
      const rsiConfirmed =
        req.query.rsi_confirmed !== undefined
          ? req.query.rsi_confirmed === "true"
          : undefined

      // Get sorting parameters
      const validSortFields = [
        "created_at",
        "username",
        "display_name",
        "role",
        "banned",
        "rsi_confirmed",
        "balance",
        "locale",
      ]
      const sortBy = validSortFields.includes(req.query.sort_by as string)
        ? (req.query.sort_by as string)
        : "created_at"
      const sortOrder = (req.query.sort_order as "asc" | "desc") || "desc"

      // Build where clause for filtering
      const whereClause: any = {}
      if (role) {
        whereClause.role = role
      }
      if (banned !== undefined) {
        whereClause.banned = banned
      }
      if (rsiConfirmed !== undefined) {
        whereClause.rsi_confirmed = rsiConfirmed
      }

      const result = await database.getUsersPaginated(
        page,
        pageSize,
        whereClause,
        sortBy,
        sortOrder,
      )

      res.json(createResponse(result))
    } catch (error) {
      console.error("Error fetching users:", error)
      res.status(500).json(createResponse({ error: "Failed to fetch users" }))
    }
    return
  },
)

adminRouter.get(
  "/membership/analytics",
  adminOapi.validPath({
    summary: "Get membership analytics over time",
    description:
      "Returns detailed membership growth statistics including time-series data and summary metrics for the admin panel",
    operationId: "getMembershipAnalytics",
    tags: ["Admin"],
    parameters: [],
    responses: {
      "200": {
        description: "Membership analytics data retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  $ref: "#/components/schemas/MembershipAnalyticsResponse",
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
  adminAuthorized,
  async (req, res) => {
    try {
      const analytics = await database.getMembershipAnalytics()
      res.json(createResponse(analytics))
    } catch (error) {
      console.error("Error fetching membership analytics:", error)
      res
        .status(500)
        .json(createResponse({ error: "Failed to fetch membership analytics" }))
    }
    return
  },
)
