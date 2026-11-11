import { RequestHandler } from "express"
import { User as User } from "../api-models.js"
import * as adminDb from "../admin/database.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"

export const moderation_post_report: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const { reported_url, report_reason, report_details } = req.body

    // Validate required fields
    if (!reported_url || typeof reported_url !== "string") {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "reported_url is required and must be a string",
          ),
        )
      return
    }

    // Validate URL format (should be a relative path)
    if (!reported_url.startsWith("/") || reported_url.length < 2) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "reported_url must be a valid relative path starting with /",
          ),
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
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Invalid report_reason provided",
          ),
        )
      return
    }

    // Validate report_details length if provided
    if (
      report_details &&
      typeof report_details === "string" &&
      report_details.length > 1000
    ) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "report_details must be 1000 characters or less",
          ),
        )
      return
    }

    // Insert the report into the database
    const [report] = await adminDb.insertContentReport({
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
}

export const moderation_get_reports: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User

    // Get reports for the authenticated user
    const reports = await adminDb.getContentReports({
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
    logger.error("Failed to retrieve user reports", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to retrieve user reports",
        ),
      )
  }
}
