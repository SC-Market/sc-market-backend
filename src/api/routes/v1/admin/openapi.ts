import { adminOapi as adminOapi } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response500 as Response500 } from "../openapi.js"
import { Response429Read, RateLimitHeaders } from "../openapi.js"

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
    average_fulfilled_value: {
      type: "number",
      description:
        "Average value of fulfilled orders for this period (monthly totals only)",
      minimum: 0,
      example: 12500.5,
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

adminOapi.schema("GrafanaTimeSeries", {
  type: "object",
  title: "GrafanaTimeSeries",
  properties: {
    target: {
      type: "string",
      description: "Metric name/series identifier",
      example: "daily_activity",
    },
    datapoints: {
      type: "array",
      description: "Array of [value, timestamp_in_ms] pairs",
      items: {
        type: "array",
        items: {
          type: "number",
        },
        minItems: 2,
        maxItems: 2,
      },
      example: [
        [10, 1704067200000],
        [15, 1704153600000],
      ],
    },
  },
  required: ["target", "datapoints"],
})

export const admin_get_activity_spec = adminOapi.validPath({
  summary: "Get platform activity statistics",
  description:
    "Returns daily, weekly, and monthly activity counts for the platform. Use format=grafana to get Grafana-compatible time series format.",
  operationId: "getPlatformActivity",
  tags: ["Admin"],
  parameters: [
    {
      name: "format",
      in: "query",
      description:
        "Response format - use 'grafana' for Grafana JSON datasource format",
      required: false,
      schema: {
        type: "string",
        enum: ["grafana"],
      },
    },
  ],
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
      headers: RateLimitHeaders,
    },
    "401": Response401,
    "403": Response403,
    "429": Response429Read,
  },
  security: [{ adminAuth: [] }],
})

export const admin_get_orders_analytics_spec = adminOapi.validPath({
  summary: "Get comprehensive order analytics",
  description:
    "Returns detailed order statistics including time-series data, top performers, and summary metrics for the admin panel. Use format=grafana to get Grafana-compatible time series format.",
  operationId: "getOrderAnalytics",
  tags: ["Admin"],
  parameters: [
    {
      name: "format",
      in: "query",
      description:
        "Response format - use 'grafana' for Grafana JSON datasource format",
      required: false,
      schema: {
        type: "string",
        enum: ["grafana"],
      },
    },
  ],
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
      headers: RateLimitHeaders,
    },
    "401": Response401,
    "403": Response403,
    "429": Response429Read,
    "500": Response500,
  },
  security: [{ adminAuth: [] }],
})

// Define AuditLogEntry schema
adminOapi.schema("AuditLogEntry", {
  type: "object",
  title: "AuditLogEntry",
  properties: {
    audit_log_id: {
      type: "string",
      format: "uuid",
      description: "Unique identifier for the audit log entry",
    },
    action: {
      type: "string",
      description: "Action that was performed (e.g., 'org.archived')",
      example: "org.archived",
    },
    actor_id: {
      type: "string",
      format: "uuid",
      nullable: true,
      description: "User ID of the actor who performed the action",
    },
    actor: {
      $ref: "#/components/schemas/MinimalUser",
      nullable: true,
      description: "User details of the actor (if actor_id exists)",
    },
    subject_type: {
      type: "string",
      description: "Type of entity the action was performed on",
      example: "contractor",
    },
    subject_id: {
      type: "string",
      description: "ID of the entity the action was performed on",
    },
    metadata: {
      type: "object",
      description: "Additional metadata about the action",
      additionalProperties: true,
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the action was performed",
    },
  },
  required: [
    "audit_log_id",
    "action",
    "subject_type",
    "subject_id",
    "metadata",
    "created_at",
  ],
})

adminOapi.schema("AuditLogsResponse", {
  type: "object",
  title: "AuditLogsResponse",
  properties: {
    items: {
      type: "array",
      items: {
        $ref: "#/components/schemas/AuditLogEntry",
      },
    },
    total: {
      type: "integer",
      description: "Total number of audit log entries matching the filters",
    },
    page: {
      type: "integer",
      description: "Current page number",
    },
    page_size: {
      type: "integer",
      description: "Number of items per page",
    },
  },
  required: ["items", "total", "page", "page_size"],
})

export const admin_get_audit_logs_spec = adminOapi.validPath({
  summary: "Get audit logs",
  description:
    "Retrieve a paginated list of audit log entries with optional filtering by action, subject type, actor, and date range. Admin only.",
  operationId: "getAuditLogs",
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
      description: "Number of audit log entries per page",
      required: false,
      schema: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
      },
    },
    {
      name: "action",
      in: "query",
      description: "Filter by action type (e.g., 'org.archived')",
      required: false,
      schema: {
        type: "string",
      },
    },
    {
      name: "subject_type",
      in: "query",
      description: "Filter by subject type (e.g., 'contractor')",
      required: false,
      schema: {
        type: "string",
      },
    },
    {
      name: "subject_id",
      in: "query",
      description: "Filter by specific subject ID",
      required: false,
      schema: {
        type: "string",
      },
    },
    {
      name: "actor_id",
      in: "query",
      description: "Filter by actor user ID",
      required: false,
      schema: {
        type: "string",
        format: "uuid",
      },
    },
    {
      name: "start_date",
      in: "query",
      description: "Filter logs after this date (ISO 8601 format)",
      required: false,
      schema: {
        type: "string",
        format: "date-time",
      },
    },
    {
      name: "end_date",
      in: "query",
      description: "Filter logs before this date (ISO 8601 format)",
      required: false,
      schema: {
        type: "string",
        format: "date-time",
      },
    },
  ],
  responses: {
    "200": {
      description: "Audit logs retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                $ref: "#/components/schemas/AuditLogsResponse",
              },
            },
            required: ["data"],
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "401": Response401,
    "403": Response403,
    "429": Response429Read,
    "500": Response500,
  },
  security: [{ adminAuth: [] }],
})

export const admin_get_users_spec = adminOapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "401": Response401,
    "403": Response403,
    "429": Response429Read,
    "500": Response500,
  },
  security: [{ adminAuth: [] }],
})

export const admin_get_membership_analytics_spec = adminOapi.validPath({
  summary: "Get membership analytics over time",
  description:
    "Returns detailed membership growth statistics including time-series data and summary metrics for the admin panel. Use format=grafana to get Grafana-compatible time series format.",
  operationId: "getMembershipAnalytics",
  tags: ["Admin"],
  parameters: [
    {
      name: "format",
      in: "query",
      description:
        "Response format - use 'grafana' for Grafana JSON datasource format",
      required: false,
      schema: {
        type: "string",
        enum: ["grafana"],
      },
    },
  ],
  responses: {
    "200": {
      description:
        "Membership analytics data retrieved successfully. Returns Grafana format if format=grafana is specified.",
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
      headers: RateLimitHeaders,
    },
    "401": Response401,
    "403": Response403,
    "429": Response429Read,
    "500": Response500,
  },
  security: [{ adminAuth: [] }],
})

export const admin_post_users_username_unlink_spec = adminOapi.validPath({
  summary: "Unlink user's Star Citizen account",
  description:
    "Admin endpoint to unlink a user's Star Citizen account, returning them to unverified status and resetting usernames to default values based on their Discord ID.",
  operationId: "adminUnlinkUserAccount",
  tags: ["Admin"],
  parameters: [
    {
      name: "username",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Username of the user to unlink",
    },
  ],
  responses: {
    "200": {
      description: "User account successfully unlinked",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                example: "User account successfully unlinked",
              },
              username: { type: "string", example: "new_user123456789" },
            },
          },
        },
      },
    },
    "400": {
      description: "User is not currently verified",
      content: { "application/json": { schema: Response400 } },
    },
    "401": Response401,
    "403": Response403,
    "404": {
      description: "User not found",
      content: { "application/json": { schema: Response400 } },
    },
    "429": Response429Read,
    "500": Response500,
  },
  security: [{ adminAuth: [] }],
  ...RateLimitHeaders,
})
