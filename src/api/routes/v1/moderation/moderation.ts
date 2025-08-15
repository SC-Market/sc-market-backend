import express from "express"
import { userAuthorized, adminAuthorized } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { oapi, Response400, Response401, Response403, Response500 } from "../openapi.js"

export const moderationRouter = express.Router()

// Report content endpoint
moderationRouter.post(
  "/report",
  userAuthorized,
  oapi.validPath({
    summary: "Report content for moderation",
    description:
      "Report content that violates community guidelines. Users can report any content by providing the relative URL path and optional details.",
    operationId: "reportContent",
    tags: ["Moderation"],
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
      "429": {
        description: "Too many reports. Rate limit exceeded.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  example: "Too many reports. Please try again later.",
                },
              },
            },
          },
        },
      },
      "500": Response500,
    },
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const { reported_url, report_reason, report_details } = req.body

      // Validate required fields
      if (!reported_url || typeof reported_url !== "string") {
        res.status(400).json(
          createErrorResponse({
            message: "reported_url is required and must be a string",
          }),
        )
        return
      }

      // Validate URL format (should be a relative path)
      if (!reported_url.startsWith("/") || reported_url.length < 2) {
        res.status(400).json(
          createErrorResponse({
            message:
              "reported_url must be a valid relative path starting with /",
          }),
        )
        return
      }

      // Validate report_reason if provided
      const validReasons = [
        "inappropriate_content",
        "spam",
        "harassment",
        "fake_listing",
        "scam",
        "copyright_violation",
        "other",
      ]
      if (report_reason && !validReasons.includes(report_reason)) {
        res
          .status(400)
          .json(
            createErrorResponse({ message: "Invalid report_reason provided" }),
          )
        return
      }

      // Validate report_details length if provided
      if (
        report_details &&
        typeof report_details === "string" &&
        report_details.length > 1000
      ) {
        res.status(400).json(
          createErrorResponse({
            message: "report_details must be 1000 characters or less",
          }),
        )
        return
      }

      // Insert the report into the database
      const [report] = await database.insertContentReport({
        reporter_id: user.user_id,
        reported_url,
        report_reason: report_reason || null,
        report_details: report_details || null,
        status: "pending",
      })

      res.json(
        createResponse({
          result: "Content reported successfully",
          report_id: report.report_id,
        }),
      )
    } catch (error) {
      res.status(409).json(
        createErrorResponse({
          message:
            "You already have a pending report for this content. Please wait for it to be reviewed.",
        }),
      )
      return
    }
  },
)

// Get user's own reports (optional endpoint for users to see their report history)
moderationRouter.get(
  "/reports",
  userAuthorized,
  oapi.validPath({
    summary: "Get user's own content reports",
    description:
      "Retrieve a list of content reports submitted by the authenticated user.",
    operationId: "getUserReports",
    tags: ["Moderation"],
    responses: {
      "200": {
        description: "User's reports retrieved successfully",
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
      "429": {
        description: "Too many requests. Rate limit exceeded.",
      },
      "500": Response500,
    },
  }),
  async (req, res) => {
    try {
      const user = req.user as User

      // Get reports for the authenticated user
      const reports = await database.getContentReports({
        reporter_id: user.user_id,
      })

      res.json(
        createResponse({
          reports: reports.map((report) => ({
            report_id: report.report_id,
            reported_url: report.reported_url,
            report_reason: report.report_reason,
            report_details: report.report_details,
            status: report.status,
            created_at: report.created_at,
            handled_at: report.handled_at,
            notes: report.notes,
          })),
        }),
      )
    } catch (error) {
      console.error("Failed to retrieve user reports:", error)
      res
        .status(500)
        .json(
          createErrorResponse({ message: "Failed to retrieve user reports" }),
        )
    }
  },
)

// Admin endpoint to get all unprocessed reports with pagination
moderationRouter.get(
  "/admin/reports",
  adminAuthorized,
  oapi.validPath({
    summary: "Get all unprocessed reports (Admin only)",
    description:
      "Retrieve all unprocessed content reports with pagination. Only accessible by administrators.",
    operationId: "getAdminReports",
    tags: ["Moderation"],
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
                      reporter_id: { type: "string", format: "uuid" },
                      reported_url: { type: "string" },
                      report_reason: { type: "string" },
                      report_details: { type: "string" },
                      status: { type: "string" },
                      created_at: { type: "string", format: "date-time" },
                      handled_at: { type: "string", format: "date-time" },
                      handled_by: { type: "string", format: "uuid" },
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
      "500": Response500,
    },
  }),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size as string) || 20))
      const status = req.query.status as string
      const reporterId = req.query.reporter_id as string

      // Build where clause for filtering
      const whereClause: any = {}
      if (status) {
        whereClause.status = status
      }
      if (reporterId) {
        whereClause.reporter_id = reporterId
      }

      // Get total count for pagination
      const allReports = await database.getContentReports(whereClause)
      const totalReports = allReports.length

      // Calculate pagination
      const totalPages = Math.ceil(totalReports / pageSize)
      const offset = (page - 1) * pageSize
      const hasNext = page < totalPages
      const hasPrev = page > 1

      // Get paginated reports
      const reports = allReports.slice(offset, offset + pageSize)

      res.json(
        createResponse({
          reports: reports.map((report) => ({
            report_id: report.report_id,
            reporter_id: report.reporter_id,
            reported_url: report.reported_url,
            report_reason: report.report_reason,
            report_details: report.report_details,
            status: report.status,
            created_at: report.created_at,
            handled_at: report.handled_at,
            handled_by: report.handled_by,
            notes: report.notes,
          })),
          pagination: {
            page,
            page_size: pageSize,
            total_reports: totalReports,
            total_pages: totalPages,
            has_next: hasNext,
            has_prev: hasPrev,
          },
        }),
      )
    } catch (error) {
      console.error("Failed to retrieve admin reports:", error)
      res.status(500).json(
        createErrorResponse({ error: "Failed to retrieve admin reports" }),
      )
    }
  },
)
