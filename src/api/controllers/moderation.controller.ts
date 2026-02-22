// src/api/controllers/moderation.controller.ts

import {
  Controller,
  Route,
  Get,
  Post,
  Put,
  Body,
  Path,
  Query,
  Security,
  Middlewares,
  Response,
  Request,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import {
  BaseController,
  ValidationErrorClass as BaseValidationError,
  ConflictError as BaseConflictError,
  ForbiddenError as BaseForbiddenError,
  NotFoundError as BaseNotFoundError,
} from "./base.controller.js"
import {
  CreateReportPayload,
  CreateReportResponse,
  GetUserReportsResponse,
  GetAdminReportsResponse,
  UpdateReportPayload,
  UpdateReportResponse,
  ReportStatus,
  ReportReason,
  AdminContentReport,
  ModerationUser,
} from "../models/moderation.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/common.models.js"
import {
  tsoaReadRateLimit,
  tsoaWriteRateLimit,
  tsoaCriticalRateLimit,
} from "../middleware/tsoa-ratelimit.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as adminDb from "../routes/v1/admin/database.js"
import { DBContentReport } from "../../clients/database/db-models.js"

/**
 * Moderation controller for content reporting and moderation
 */
@Route("api/moderation")
export class ModerationController extends BaseController {
  /**
   * Report content for moderation
   * @summary Report content that violates community guidelines
   */
  @Post("report")
  @Security("sessionAuth")
  @Security("bearerAuth", ["moderation:write"])
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Content reported successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Conflict>(409, "Duplicate Report")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async reportContent(
    @Body() payload: CreateReportPayload,
    @Request() request: ExpressRequest,
  ): Promise<CreateReportResponse> {
    try {
      const user = this.getUser(request)

      // Validate URL format (should be a relative path)
      if (
        !payload.reported_url.startsWith("/") ||
        payload.reported_url.length < 2
      ) {
        throw new BaseValidationError(
          "reported_url must be a valid relative path starting with /",
        )
      }

      // Validate report_details length if provided
      if (
        payload.report_details &&
        payload.report_details.length > 1000
      ) {
        throw new BaseValidationError(
          "report_details must be 1000 characters or less",
        )
      }

      // Insert the report into the database
      try {
        const [report] = await adminDb.insertContentReport({
          reporter_id: user.user_id,
          reported_url: payload.reported_url,
          report_reason: payload.report_reason as string | undefined,
          report_details: payload.report_details,
          status: "pending",
        })

        return this.success({
          result: "Content reported successfully",
          report_id: report.report_id,
        })
      } catch (error) {
        // Handle duplicate report error
        throw new BaseConflictError(
          "You already have a pending report for this content. Please wait for it to be reviewed.",
        )
      }
    } catch (error) {
      return this.handleError(error, "reportContent")
    }
  }

  /**
   * Get user's own content reports
   * @summary Retrieve a list of content reports submitted by the authenticated user
   */
  @Get("reports")
  @Security("sessionAuth")
  @Security("bearerAuth", ["moderation:read"])
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getUserReports(
    @Request() request: ExpressRequest,
  ): Promise<GetUserReportsResponse> {
    try {
      const user = this.getUser(request)

      // Get reports for the authenticated user
      const reports = await adminDb.getContentReports({
        reporter_id: user.user_id,
      })

      return this.success({
        reports: reports.map((report) => ({
          report_id: report.report_id,
          reported_url: report.reported_url,
          report_reason: (report.report_reason as ReportReason) || null,
          report_details: report.report_details || null,
          status: report.status,
          created_at: report.created_at.toISOString(),
          handled_at: report.handled_at?.toISOString() || null,
          notes: report.notes || null,
        })),
      })
    } catch (error) {
      return this.handleError(error, "getUserReports")
    }
  }

  /**
   * Get all unprocessed reports (Admin only)
   * @summary Retrieve all unprocessed content reports with pagination
   */
  @Get("admin/reports")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin", "moderation:read"])
  @Middlewares(tsoaCriticalRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getAdminReports(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() status?: ReportStatus,
    @Query() reporter_id?: string,
  ): Promise<GetAdminReportsResponse> {
    try {
      // Ensure user is admin
      if (!this.isAdmin(request)) {
        throw new BaseForbiddenError("Admin access required")
      }

      // Validate and normalize pagination parameters
      const normalizedPage = Math.max(1, page || 1)
      const normalizedPageSize = Math.min(100, Math.max(1, page_size || 20))

      // Build where clause for filtering
      const whereClause: any = {}
      if (status) {
        whereClause.status = status
      }
      if (reporter_id) {
        whereClause.reporter_id = reporter_id
      }

      // Get total count for pagination
      const allReports = await adminDb.getContentReports(whereClause)
      const totalReports = allReports.length

      // Calculate pagination
      const totalPages = Math.ceil(totalReports / normalizedPageSize)
      const offset = (normalizedPage - 1) * normalizedPageSize
      const hasNext = normalizedPage < totalPages
      const hasPrev = normalizedPage > 1

      // Get paginated reports
      const reports = allReports.slice(offset, offset + normalizedPageSize)

      // Fetch user information for reporter and handler
      const reportsWithUsers: AdminContentReport[] = await Promise.all(
        reports.map(async (report) => {
          const reporter = await profileDb.getMinimalUser({
            user_id: report.reporter_id,
          })
          const handledBy = report.handled_by
            ? await profileDb.getMinimalUser({ user_id: report.handled_by })
            : null

          return {
            report_id: report.report_id,
            reporter: {
              username: reporter.username,
              avatar: reporter.avatar,
              display_name: reporter.display_name,
              rating: {
                avg_rating: reporter.rating.avg_rating,
                rating_count: reporter.rating.rating_count,
              },
              badges: reporter.badges,
            },
            reported_url: report.reported_url,
            report_reason: (report.report_reason as ReportReason) || null,
            report_details: report.report_details || null,
            status: report.status,
            created_at: report.created_at.toISOString(),
            handled_at: report.handled_at?.toISOString() || null,
            handled_by: handledBy ? {
              username: handledBy.username,
              avatar: handledBy.avatar,
              display_name: handledBy.display_name,
              rating: {
                avg_rating: handledBy.rating.avg_rating,
                rating_count: handledBy.rating.rating_count,
              },
              badges: handledBy.badges,
            } : null,
            notes: report.notes || null,
          }
        }),
      )

      return this.success({
        reports: reportsWithUsers,
        pagination: {
          page: normalizedPage,
          page_size: normalizedPageSize,
          total_reports: totalReports,
          total_pages: totalPages,
          has_next: hasNext,
          has_prev: hasPrev,
        },
      })
    } catch (error) {
      return this.handleError(error, "getAdminReports")
    }
  }

  /**
   * Update report status and moderation details (Admin only)
   * @summary Update the status of a content report and add moderation notes
   */
  @Put("admin/reports/{report_id}")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin", "moderation:write"])
  @Middlewares(tsoaCriticalRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateReportStatus(
    @Path() report_id: string,
    @Body() payload: UpdateReportPayload,
    @Request() request: ExpressRequest,
  ): Promise<UpdateReportResponse> {
    try {
      const adminUser = this.getUser(request)

      // Ensure user is admin
      if (!this.isAdmin(request)) {
        throw new BaseForbiddenError("Admin access required")
      }

      // Validate notes length if provided
      if (payload.notes && payload.notes.length > 2000) {
        throw new BaseValidationError(
          "notes must be 2000 characters or less",
        )
      }

      // Check if report exists
      const existingReports = await adminDb.getContentReports({
        report_id,
      })
      if (existingReports.length === 0) {
        throw new BaseNotFoundError("Report not found")
      }

      // Prepare update data
      const updateData: Partial<DBContentReport> = {
        status: payload.status,
        notes: payload.notes || undefined,
        handled_at: payload.status === "pending" ? undefined : new Date(),
        handled_by:
          payload.status === "pending" ? undefined : adminUser.user_id,
      }

      // Update the report
      const [updatedReport] = await adminDb.updateContentReport(
        { report_id },
        updateData,
      )

      // Get the updated report with user information
      const reporter = await profileDb.getMinimalUser({
        user_id: updatedReport.reporter_id,
      })
      const handledBy = updatedReport.handled_by
        ? await profileDb.getMinimalUser({ user_id: updatedReport.handled_by })
        : null

      return this.success({
        result: "Report updated successfully",
        report: {
          report_id: updatedReport.report_id,
          reporter: {
            username: reporter.username,
            avatar: reporter.avatar,
            display_name: reporter.display_name,
            rating: {
              avg_rating: reporter.rating.avg_rating,
              rating_count: reporter.rating.rating_count,
            },
            badges: reporter.badges,
          },
          reported_url: updatedReport.reported_url,
          report_reason: (updatedReport.report_reason as ReportReason) || null,
          report_details: updatedReport.report_details || null,
          status: updatedReport.status,
          created_at: updatedReport.created_at.toISOString(),
          handled_at: updatedReport.handled_at?.toISOString() || null,
          handled_by: handledBy ? {
            username: handledBy.username,
            avatar: handledBy.avatar,
            display_name: handledBy.display_name,
            rating: {
              avg_rating: handledBy.rating.avg_rating,
              rating_count: handledBy.rating.rating_count,
            },
            badges: handledBy.badges,
          } : null,
          notes: updatedReport.notes || null,
        },
      })
    } catch (error) {
      return this.handleError(error, "updateReportStatus")
    }
  }
}
