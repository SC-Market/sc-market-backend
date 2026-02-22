// src/api/models/moderation.models.ts

import { ApiResponse } from "./common.models.js"

/**
 * Rating information
 */
export interface ModerationRating {
  avg_rating: number
  rating_count: number
}

/**
 * Badge data
 */
export interface ModerationBadgeData {
  [key: string]: any
}

/**
 * Minimal user information for moderation reports
 */
export interface ModerationUser {
  username: string
  avatar: string
  display_name: string
  rating: ModerationRating
  badges?: ModerationBadgeData | null
}

/**
 * Report reason enum
 */
export type ReportReason =
  | "inappropriate_content"
  | "spam"
  | "harassment"
  | "fake_listing"
  | "scam"
  | "copyright_violation"
  | "other"

/**
 * Report status enum
 */
export type ReportStatus = "pending" | "in_progress" | "resolved" | "dismissed"

/**
 * Content report
 */
export interface ContentReport {
  report_id: string
  reported_url: string
  report_reason: ReportReason | null
  report_details: string | null
  status: ReportStatus
  created_at: string
  handled_at: string | null
  notes: string | null
}

/**
 * Content report with user information (admin view)
 */
export interface AdminContentReport extends ContentReport {
  reporter: ModerationUser
  handled_by: ModerationUser | null
}

/**
 * Create report request payload
 */
export interface CreateReportPayload {
  /** Relative URL path of the reported content (e.g., '/listing/123', '/service/456') */
  reported_url: string
  /** General reason for the report */
  report_reason?: ReportReason
  /** Additional details about the report (max 1000 characters) */
  report_details?: string
}

/**
 * Update report request payload
 */
export interface UpdateReportPayload {
  /** New status for the report */
  status: ReportStatus
  /** Moderation notes or action taken (max 2000 characters) */
  notes?: string
}

/**
 * Create report response
 */
export interface CreateReportResponse extends ApiResponse<{
  result: string
  report_id: string
}> {}

/**
 * Get user reports response
 */
export interface GetUserReportsResponse extends ApiResponse<{
  reports: ContentReport[]
}> {}

/**
 * Pagination metadata
 */
export interface PaginationMetadata {
  page: number
  page_size: number
  total_reports: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

/**
 * Get admin reports response
 */
export interface GetAdminReportsResponse extends ApiResponse<{
  reports: AdminContentReport[]
  pagination: PaginationMetadata
}> {}

/**
 * Update report response
 */
export interface UpdateReportResponse extends ApiResponse<{
  result: string
  report: AdminContentReport
}> {}
