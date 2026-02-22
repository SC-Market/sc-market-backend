/**
 * Admin API Models
 * Type definitions for admin-only endpoints
 */

import { MinimalUser } from "./common.models.js"
import { DBUser } from "../../clients/database/db-models.js"

// ============================================================================
// Activity Analytics
// ============================================================================

export interface ActivityData {
  date: string
  count: number
}

export interface ActivityResponse {
  daily: ActivityData[]
  weekly: ActivityData[]
  monthly: ActivityData[]
}

// ============================================================================
// Order Analytics
// ============================================================================

export interface OrderAnalyticsTimeSeries {
  date: string
  total: number
  in_progress: number
  fulfilled: number
  cancelled: number
  not_started: number
  average_fulfilled_value?: number
}

export interface OrderAnalyticsTopContractor {
  name: string
  fulfilled_orders: number
  total_orders: number
}

export interface OrderAnalyticsTopUser {
  username: string
  fulfilled_orders: number
  total_orders: number
}

export interface OrderAnalyticsSummary {
  total_orders: number
  active_orders: number
  completed_orders: number
  total_value: number
}

export interface OrderAnalyticsResponse {
  daily_totals: OrderAnalyticsTimeSeries[]
  weekly_totals: OrderAnalyticsTimeSeries[]
  monthly_totals: OrderAnalyticsTimeSeries[]
  top_contractors: OrderAnalyticsTopContractor[]
  top_users: OrderAnalyticsTopUser[]
  summary: OrderAnalyticsSummary
}

// ============================================================================
// User Management
// ============================================================================

export interface UsersPaginationInfo {
  page: number
  page_size: number
  total_users: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

export interface UsersResponse {
  users: DBUser[]
  pagination: UsersPaginationInfo
}

// ============================================================================
// Membership Analytics
// ============================================================================

export interface MembershipAnalyticsTimeSeries {
  date: string
  new_members: number
  new_members_rsi_verified: number
  new_members_rsi_unverified: number
  cumulative_members: number
  cumulative_members_rsi_verified: number
  cumulative_members_rsi_unverified: number
}

export interface MembershipAnalyticsSummary {
  total_members: number
  admin_members: number
  regular_members: number
  rsi_confirmed_members: number
  banned_members: number
  new_members_30d: number
  new_members_7d: number
}

export interface MembershipAnalyticsResponse {
  daily_totals: MembershipAnalyticsTimeSeries[]
  weekly_totals: MembershipAnalyticsTimeSeries[]
  monthly_totals: MembershipAnalyticsTimeSeries[]
  summary: MembershipAnalyticsSummary
}

// ============================================================================
// Audit Logs
// ============================================================================

export interface AuditLogEntry {
  audit_log_id: string
  action: string
  actor_id: string | null
  actor: MinimalUser | null
  subject_type: string
  subject_id: string
  metadata: Record<string, unknown>
  created_at: string
  contractor?: {
    contractor_id: string
    name: string
    spectrum_id: string
  } | null
}

export interface AuditLogsResponse {
  items: AuditLogEntry[]
  total: number
  page: number
  page_size: number
}

// ============================================================================
// Account Management
// ============================================================================

export interface UnlinkAccountResponse {
  message: string
  username: string
}

// ============================================================================
// Notification Testing
// ============================================================================

export type NotificationType =
  | "order_create"
  | "order_assigned"
  | "order_message"
  | "order_comment"
  | "order_review"
  | "order_status_fulfilled"
  | "order_status_in_progress"
  | "order_status_not_started"
  | "order_status_cancelled"
  | "offer_create"
  | "counter_offer_create"
  | "offer_message"
  | "market_item_bid"
  | "market_item_offer"
  | "contractor_invite"
  | "admin_alert"
  | "order_review_revision_requested"

export interface TestNotificationRequest {
  notification_type: NotificationType
  target_username: string
  contractor_id?: string | null
}

export interface TestNotificationResponse {
  message: string
  data?: Record<string, unknown>
}
