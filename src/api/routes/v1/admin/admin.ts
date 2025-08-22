import express from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { adminAuthorized } from "../../../middleware/auth.js"
import { createResponse } from "../util/response.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response500,
} from "../openapi.js"

export const adminRouter = express.Router()

// Define schemas
oapi.schema("OrderAnalyticsTimeSeries", {
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

oapi.schema("OrderAnalyticsTopContractor", {
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

oapi.schema("OrderAnalyticsTopUser", {
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

oapi.schema("OrderAnalyticsSummary", {
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

oapi.schema("OrderAnalyticsResponse", {
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

adminRouter.get(
  "/activity",
  oapi.validPath({
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
  oapi.validPath({
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
