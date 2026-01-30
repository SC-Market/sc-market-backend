import { adminOapi as adminOapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response404 as Response404 } from "../openapi.js"
import {
  Response500 as Response500,
  Response429Write,
  Response429Read,
  Response429Critical,
  RateLimitHeaders,
} from "../openapi.js"

export const moderation_post_report_spec = adminOapi.validPath({
  summary: "Report content for moderation",
  description:
    "Report content that violates community guidelines. Users can report any content by providing the relative URL path and optional details.",
  operationId: "reportContent",
  tags: ["ModerationReports", "Moderation"],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            reported_url: {
              type: "string",
              description:
                "Relative URL path of the reported content (e.g., '/listing/123', '/service/456')",
              example: "/listing/abc-123-def",
            },
            report_reason: {
              type: "string",
              description: "General reason for the report",
              enum: [
                "inappropriate_content",
                "spam",
                "harassment",
                "fake_listing",
                "scam",
                "copyright_violation",
                "other",
              ],
              example: "inappropriate_content",
            },
            report_details: {
              type: "string",
              description: "Additional details about the report",
              maxLength: 1000,
              example:
                "This listing contains inappropriate language and images",
            },
          },
          required: ["reported_url"],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Content reported successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: {
                type: "string",
                example: "Content reported successfully",
              },
              report_id: {
                type: "string",
                format: "uuid",
                description: "Unique identifier for the report",
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "409": {
      description:
        "Duplicate report. User already has a pending report for this content.",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                example:
                  "You already have a pending report for this content. Please wait for it to be reviewed.",
              },
            },
          },
        },
      },
    },
    "429": Response429Write,
    "500": Response500,
  },
})

export const moderation_get_reports_spec = adminOapi.validPath({
  summary: "Get user's own content reports",
  description:
    "Retrieve a list of content reports submitted by the authenticated user.",
  operationId: "getUserReports",
  tags: ["ModerationReports", "Moderation"],
  responses: {
    "200": {
      description: "User's reports retrieved successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              reports: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    report_id: { type: "string", format: "uuid" },
                    reported_url: { type: "string" },
                    report_reason: { type: "string" },
                    report_details: { type: "string" },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    handled_at: { type: "string", format: "date-time" },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
})

export const moderation_get_admin_reports_spec = adminOapi.validPath({
  summary: "Get all unprocessed reports (Admin only)",
  description:
    "Retrieve all unprocessed content reports with pagination. Only accessible by administrators.",
  operationId: "getAdminReports",
  tags: ["ModerationReports", "Moderation"],
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
      description: "Number of reports per page",
      required: false,
      schema: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
      },
    },
    {
      name: "status",
      in: "query",
      description: "Filter by report status",
      required: false,
      schema: {
        type: "string",
        enum: ["pending", "in_progress", "resolved", "dismissed"],
      },
    },
    {
      name: "reporter_id",
      in: "query",
      description: "Filter by reporter user ID",
      required: false,
      schema: {
        type: "string",
        format: "uuid",
      },
    },
  ],
  responses: {
    "200": {
      description: "Reports retrieved successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              reports: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    report_id: { type: "string", format: "uuid" },
                    reporter: adminOapi.schema("MinimalUser"),
                    reported_url: { type: "string" },
                    report_reason: { type: "string" },
                    report_details: { type: "string" },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    handled_at: { type: "string", format: "date-time" },
                    handled_by: {
                      nullable: true,
                      ...adminOapi.schema("MinimalUser"),
                    },
                    notes: { type: "string" },
                  },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer" },
                  page_size: { type: "integer" },
                  total_reports: { type: "integer" },
                  total_pages: { type: "integer" },
                  has_next: { type: "boolean" },
                  has_prev: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "403": Response403,
    "429": Response429Critical,
    "500": Response500,
  },
})

export const moderation_put_admin_reports_report_id_spec = adminOapi.validPath({
  summary: "Update report status and moderation details (Admin only)",
  description:
    "Update the status of a content report and add moderation notes. Only accessible by administrators.",
  operationId: "updateReportStatus",
  tags: ["ModerationReports", "Moderation"],
  parameters: [
    {
      name: "report_id",
      in: "path",
      required: true,
      description: "ID of the report to update",
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
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "in_progress", "resolved", "dismissed"],
              description: "New status for the report",
            },
            notes: {
              type: "string",
              description: "Moderation notes or action taken",
              maxLength: 2000,
            },
          },
          required: ["status"],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Report updated successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: {
                type: "string",
                example: "Report updated successfully",
              },
              report: {
                type: "object",
                properties: {
                  report_id: { type: "string", format: "uuid" },
                  reporter: adminOapi.schema("MinimalUser"),
                  reported_url: { type: "string" },
                  report_reason: { type: "string" },
                  report_details: { type: "string" },
                  status: { type: "string" },
                  created_at: { type: "string", format: "date-time" },
                  handled_at: { type: "string", format: "date-time" },
                  handled_by: {
                    nullable: true,
                    ...adminOapi.schema("MinimalUser"),
                  },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Critical,
    "500": Response500,
  },
})
