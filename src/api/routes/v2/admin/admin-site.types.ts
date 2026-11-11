/**
 * Types for the site-wide admin endpoints (AdminSiteController): activity,
 * users, membership and offer analytics, audit logs, test notifications.
 * Moved from v1 /api/admin (src/api/routes/v1/admin, removed).
 */
import type { MinimalUser } from "../../../../clients/database/db-models.js"
import type { SiteRole } from "../../../util/site-role.js"

/** Distinct active users on one day, week or month. */
export interface AdminActivityPoint {
  /** Start of the period (ISO 8601). */
  date: string
  count: number
}

export interface AdminActivityResponse {
  daily: AdminActivityPoint[]
  weekly: AdminActivityPoint[]
  monthly: AdminActivityPoint[]
}

/** An account row as admins see it in Admin › Users. */
export interface AdminUser {
  user_id: string
  username: string
  display_name: string
  discord_id: string | null
  profile_description: string
  role: SiteRole
  banned: boolean
  avatar: string
  banner: string
  balance: string
  created_at: string
  locale: string
  rsi_confirmed: boolean
  market_order_template: string
}

export type AdminUserSortField =
  | "created_at"
  | "username"
  | "display_name"
  | "role"
  | "banned"
  | "rsi_confirmed"
  | "balance"
  | "locale"

export interface AdminUsersResponse {
  users: AdminUser[]
  pagination: {
    page: number
    page_size: number
    total_users: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}

export interface MembershipAnalyticsPoint {
  /** Start of the period (ISO 8601). */
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
  /** Last 30 days. */
  daily_totals: MembershipAnalyticsPoint[]
  /** Last 12 weeks. */
  weekly_totals: MembershipAnalyticsPoint[]
  /** Last 12 months. */
  monthly_totals: MembershipAnalyticsPoint[]
  summary: MembershipAnalyticsSummary
}

export interface OfferAnalyticsPoint {
  /** YYYY-MM-DD */
  date: string
  total: number
  active: number
  accepted: number
  rejected: number
}

export interface OfferAnalyticsMonthlyPoint extends OfferAnalyticsPoint {
  average_accepted_value: number
}

export interface OfferAnalyticsTopShop {
  name: string
  slug: string
  accepted_offers: number
  total_offers: number
}

export interface OfferAnalyticsTopUser {
  username: string
  accepted_offers: number
  total_offers: number
}

export interface OfferAnalyticsResponse {
  daily_totals: OfferAnalyticsPoint[]
  weekly_totals: OfferAnalyticsPoint[]
  monthly_totals: OfferAnalyticsMonthlyPoint[]
  top_shops: OfferAnalyticsTopShop[]
  top_users: OfferAnalyticsTopUser[]
  summary: {
    total_offers: number
    active_offers: number
    waiting_for_buyer: number
    waiting_for_seller: number
    accepted_offers: number
    rejected_offers: number
    total_value: number
  }
}

export interface AdminAuditLogContractor {
  contractor_id: string
  name: string
  spectrum_id: string
}

export interface AdminAuditLogEntry {
  audit_log_id: string
  action: string
  actor_id: string | null
  actor: MinimalUser | null
  subject_type: string
  subject_id: string
  metadata: Record<string, unknown>
  created_at: string
  contractor: AdminAuditLogContractor | null
}

export interface AdminAuditLogsResponse {
  items: AdminAuditLogEntry[]
  total: number
  page: number
  page_size: number
}

export type AdminTestNotificationType =
  | "order_create"
  | "order_assigned"
  | "order_message"
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

export interface AdminTestNotificationRequest {
  notification_type: AdminTestNotificationType
  /** Username of the account that receives the test notification. */
  target_username: string
  /**
   * Org to scope the notification preferences to. Defaults to the sample
   * order's or offer's org.
   */
  contractor_id?: string | null
}

/** Ids of the sample rows the test notification was built from. */
export interface AdminTestNotificationData {
  order_id?: string
  contractor_id?: string | null
  message_id?: string
  review_id?: string
  status?: string
  offer_id?: string
  listing_id?: string
  bid_id?: string
  invite_id?: string
  alert_id?: string
}

export interface AdminTestNotificationResponse {
  message: string
  data?: AdminTestNotificationData
}
