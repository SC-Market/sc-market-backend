/**
 * Admin › Moderation: content reports users filed, and their handling.
 * Moved from v1 /api/moderation/admin/reports (same paging and validation).
 * Site admins only (tsoa-auth admin gate + requireAdmin); changing a report
 * needs an MFA step-up. Rate limits are registered in api-router.ts.
 */
import {
  Body,
  Get,
  Path,
  Put,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as adminDb from "../../v1/admin/database.js"
import * as profileDb from "../../v1/profiles/database.js"
import { isUuid } from "../util/short-slug.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"
import type {
  DBContentReport,
  MinimalUser,
} from "../../../../clients/database/db-models.js"

export type ContentReportStatus = DBContentReport["status"]

const REPORT_STATUSES: readonly ContentReportStatus[] = [
  "pending",
  "in_progress",
  "resolved",
  "dismissed",
]

export interface AdminContentReport {
  report_id: string
  reporter: MinimalUser
  reported_url: string
  report_reason: string | null
  report_details: string | null
  status: ContentReportStatus
  created_at: string
  handled_at: string | null
  handled_by: MinimalUser | null
  notes: string | null
}

export interface AdminContentReportsPage {
  reports: AdminContentReport[]
  pagination: {
    page: number
    page_size: number
    total_reports: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}

export interface UpdateContentReportRequest {
  status: ContentReportStatus
  /** @maxLength 2000 */
  notes?: string
}

export interface UpdateContentReportResponse {
  result: string
  report: AdminContentReport
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

async function withUsers(report: DBContentReport): Promise<AdminContentReport> {
  const [reporter, handledBy] = await Promise.all([
    profileDb.getMinimalUser({ user_id: report.reporter_id }),
    report.handled_by
      ? profileDb.getMinimalUser({ user_id: report.handled_by })
      : null,
  ])
  return {
    report_id: report.report_id,
    reporter,
    reported_url: report.reported_url,
    report_reason: report.report_reason ?? null,
    report_details: report.report_details ?? null,
    status: report.status,
    created_at: iso(report.created_at) ?? "",
    handled_at: iso(report.handled_at),
    handled_by: handledBy,
    notes: report.notes ?? null,
  }
}

@Route("admin/moderation/reports")
@Tags("Admin")
export class AdminModerationController extends BaseController {
  /**
   * Content reports, newest first.
   * @summary List content reports
   * @param page 1-based page
   * @param page_size 1–100, default 20
   */
  @Get("")
  @Security("loggedin")
  public async listContentReports(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() status?: ContentReportStatus,
    @Query() reporter_id?: string,
  ): Promise<AdminContentReportsPage> {
    this.request = request
    this.requireAdmin()
    const p = Math.max(1, Math.floor(Number(page)) || 1)
    const size = Math.min(100, Math.max(1, Math.floor(Number(page_size)) || 20))
    const where: Partial<Pick<DBContentReport, "status" | "reporter_id">> = {}
    if (status) where.status = status
    if (reporter_id) {
      if (!isUuid(reporter_id)) {
        this.throwValidationError("reporter_id must be a user id", [
          { field: "reporter_id", message: "Not a user id" },
        ])
      }
      where.reporter_id = reporter_id
    }

    const all = await adminDb.getContentReports(where)
    const totalPages = Math.ceil(all.length / size)
    const reports = await Promise.all(
      all.slice((p - 1) * size, p * size).map(withUsers),
    )
    return {
      reports,
      pagination: {
        page: p,
        page_size: size,
        total_reports: all.length,
        total_pages: totalPages,
        has_next: p < totalPages,
        has_prev: p > 1,
      },
    }
  }

  /**
   * Set a report's status and notes. Any status but pending records the
   * admin and time as its handler. Needs an MFA step-up.
   * @summary Update a content report
   */
  @Put("{report_id}")
  @Security("loggedin")
  public async updateContentReport(
    @Request() request: ExpressRequest,
    @Path() report_id: string,
    @Body() body: UpdateContentReportRequest,
  ): Promise<UpdateContentReportResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const { status, notes } = body
    if (!REPORT_STATUSES.includes(status)) {
      this.throwValidationError("Invalid status provided", [
        { field: "status", message: "Unknown status" },
      ])
    }
    if (notes && notes.length > 2000) {
      this.throwValidationError("notes must be 2000 characters or less", [
        { field: "notes", message: "At most 2000 characters" },
      ])
    }
    if (!isUuid(report_id)) this.throwNotFound("Report", report_id)
    const [existing] = await adminDb.getContentReports({ report_id })
    if (!existing) this.throwNotFound("Report", report_id)

    const handled = status !== "pending"
    const [updated] = await adminDb.updateContentReport(
      { report_id },
      {
        status,
        notes: notes || undefined,
        handled_at: handled ? new Date() : undefined,
        handled_by: handled ? this.getUserId() : undefined,
      },
    )
    await auditLogService.record({
      action: "content_report_updated",
      actorId: this.getUserId(),
      subjectType: "content_report",
      subjectId: report_id,
      metadata: {
        from_status: existing.status,
        to_status: status,
        notes_changed: (notes || null) !== (existing.notes ?? null),
      },
    })
    return {
      result: "Report updated successfully",
      report: await withUsers(updated),
    }
  }
}
