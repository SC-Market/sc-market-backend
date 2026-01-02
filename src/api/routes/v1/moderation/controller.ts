import { RequestHandler } from "express"
import * as profileDb from "../profiles/database.js"
import { User as User } from "../api-models.js"
import { database as database } from "../../../../clients/database/knex-db.js"
import * as adminDb from "../admin/database.js"
import { DBContentReport as DBContentReport } from "../../../../clients/database/db-models.js"
import {
  createErrorResponse,
  createResponse,
  createNotFoundErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"

export const moderation_post_report: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const { reported_url, report_reason, report_details } = req.body

    // Validate required fields
    if (!reported_url || typeof reported_url !== "string") {
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "reported_url is required and must be a string"
        ),
      )
      return
    }

    // Validate URL format (should be a relative path)
    if (!reported_url.startsWith("/") || reported_url.length < 2) {
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "reported_url must be a valid relative path starting with /"
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
            "Invalid report_reason provided"
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
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "report_details must be 1000 characters or less"
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
          "Failed to retrieve user reports"
        )
      )
  }
}

export const moderation_get_admin_reports: RequestHandler = async (
  req,
  res,
) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.page_size as string) || 20),
    )
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
    const allReports = await adminDb.getContentReports(whereClause)
    const totalReports = allReports.length

    // Calculate pagination
    const totalPages = Math.ceil(totalReports / pageSize)
    const offset = (page - 1) * pageSize
    const hasNext = page < totalPages
    const hasPrev = page > 1

    // Get paginated reports
    const reports = allReports.slice(offset, offset + pageSize)

    // Fetch user information for reporter and handler
    const reportsWithUsers = await Promise.all(
      reports.map(async (report) => {
        const reporter = await profileDb.getMinimalUser({
          user_id: report.reporter_id,
        })
        const handledBy = report.handled_by
          ? await profileDb.getMinimalUser({ user_id: report.handled_by })
          : null

        return {
          report_id: report.report_id,
          reporter,
          reported_url: report.reported_url,
          report_reason: report.report_reason,
          report_details: report.report_details,
          status: report.status,
          created_at: report.created_at,
          handled_at: report.handled_at,
          handled_by: handledBy,
          notes: report.notes,
        }
      }),
    )

    res.json(
      createResponse({
        reports: reportsWithUsers,
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
    logger.error("Failed to retrieve admin reports", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to retrieve admin reports"
        )
      )
  }
}

export const moderation_put_admin_reports_report_id: RequestHandler = async (
  req,
  res,
) => {
  try {
    const adminUser = req.user as User
    const reportId = req.params.report_id
    const { status, notes } = req.body

    // Validate required fields
    if (!status || typeof status !== "string") {
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "status is required and must be a string"
        ),
      )
      return
    }

    // Validate status enum
    const validStatuses = ["pending", "in_progress", "resolved", "dismissed"]
    if (!validStatuses.includes(status)) {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid status provided")
        )
      return
    }

    // Validate notes length if provided
    if (notes && typeof notes === "string" && notes.length > 2000) {
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "notes must be 2000 characters or less"
        ),
      )
      return
    }

    // Check if report exists
    const existingReports = await adminDb.getContentReports({
      report_id: reportId,
    })
    if (existingReports.length === 0) {
      res.status(404).json(createNotFoundErrorResponse("Report not found"))
      return
    }

    const existingReport = existingReports[0]

    // Prepare update data
    const updateData: Partial<DBContentReport> = {
      status: status as "pending" | "in_progress" | "resolved" | "dismissed",
      notes: notes || undefined,
      handled_at: status === "pending" ? undefined : new Date(),
      handled_by: status === "pending" ? undefined : adminUser.user_id,
    }

    // Update the report
    const [updatedReport] = await adminDb.updateContentReport(
      { report_id: reportId },
      updateData,
    )

    // Get the updated report with user information
    const reporter = await profileDb.getMinimalUser({
      user_id: updatedReport.reporter_id,
    })
    const handledBy = updatedReport.handled_by
      ? await profileDb.getMinimalUser({ user_id: updatedReport.handled_by })
      : null

    res.json(
      createResponse({
        result: "Report updated successfully",
        report: {
          report_id: updatedReport.report_id,
          reporter,
          reported_url: updatedReport.reported_url,
          report_reason: updatedReport.report_reason,
          report_details: updatedReport.report_details,
          status: updatedReport.status,
          created_at: updatedReport.created_at,
          handled_at: updatedReport.handled_at,
          handled_by: handledBy,
          notes: updatedReport.notes,
        },
      }),
    )
  } catch (error) {
    logger.error("Failed to update report", { error })
    res
      .status(500)
      .json(
        createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to update report")
      )
  }
}
