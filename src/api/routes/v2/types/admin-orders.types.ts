/**
 * Admin › Orders (services/admin-orders): every order on the site and the
 * order stats. Orders involving a test buyer, seller, org or shop
 * (services/test-accounts) are left out unless include_test is set.
 */

export interface AdminOrderRating {
  avg_rating: number
  rating_count: number
  total_rating: number
  streak: number
  total_orders?: number
  response_rate?: number
  total_assignments?: number
}

export interface AdminOrderUser {
  username: string
  display_name: string
  avatar: string
  rating: AdminOrderRating
}

export interface AdminOrderContractor {
  spectrum_id: string
  name: string
  avatar: string
  rating: AdminOrderRating
}

export interface AdminOrderShop {
  name: string
  slug: string
  avatar: string | null
}

export type AdminOrderStatus = "fulfilled" | "in-progress" | "not-started" | "cancelled"

export interface AdminOrderStub {
  order_id: string
  contractor: AdminOrderContractor | null
  assigned_to: AdminOrderUser | null
  customer: AdminOrderUser
  shop: AdminOrderShop | null
  status: AdminOrderStatus
  /** ISO 8601 creation time. */
  timestamp: string
  service_name: string | null
  /** aUEC, as a decimal string. */
  cost: string
  title: string
  kind: string
  payment_type: string
  /** Market items on the order. */
  count: number
  /** The buyer, the assigned seller, the org or the shop is in the test realm. */
  is_test: boolean
}

/** Orders matching the filters (status aside), per status. */
export interface AdminOrderCounts {
  fulfilled: number
  "in-progress": number
  "not-started": number
  cancelled: number
  /** Active orders with no assigned seller. */
  unassigned: number
}

export interface AdminOrdersPage {
  item_counts: AdminOrderCounts
  items: AdminOrderStub[]
}

export type AdminOrderSearchStatus =
  | "fulfilled"
  | "in-progress"
  | "not-started"
  | "cancelled"
  | "active"
  | "past"

export type AdminOrderSortMethod = "title" | "customer_name" | "status" | "timestamp" | "contractor_name"

export interface AdminOrderPeriodTotals {
  /** YYYY-MM-DD, the start of the day, week or month. */
  date: string
  total: number
  in_progress: number
  fulfilled: number
  cancelled: number
  not_started: number
}

export interface AdminOrderMonthTotals extends AdminOrderPeriodTotals {
  average_fulfilled_value: number
}

export interface AdminOrderTopShop {
  name: string
  slug: string
  fulfilled_orders: number
  total_orders: number
}

export interface AdminOrderTopUser {
  username: string
  fulfilled_orders: number
  total_orders: number
}

export interface AdminOrderAnalytics {
  /** The last 30 days. */
  daily_totals: AdminOrderPeriodTotals[]
  /** The last 12 weeks. */
  weekly_totals: AdminOrderPeriodTotals[]
  /** The last 12 months. */
  monthly_totals: AdminOrderMonthTotals[]
  top_shops: AdminOrderTopShop[]
  top_users: AdminOrderTopUser[]
  summary: {
    total_orders: number
    active_orders: number
    completed_orders: number
    /** aUEC of fulfilled orders. */
    total_value: number
  }
}
