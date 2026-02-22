/**
 * Orders API Models
 *
 * Type definitions for orders endpoints.
 * These models are used by TSOA to generate OpenAPI specs and validate requests/responses.
 */

import { ApiResponse, MinimalContractor, MinimalUser, PaymentType } from "./common.models.js"

/**
 * Order status enum
 */
export type OrderStatus =
  | "not-started"
  | "in-progress"
  | "fulfilled"
  | "cancelled"

/**
 * Order kind enum
 */
export type OrderKind = "service" | "delivery" | "escort" | "other"

/**
 * Order stub (summary) for list views
 */
export interface OrderStub {
  order_id: string
  contractor: MinimalContractor | null
  assigned_to: MinimalUser | null
  customer: MinimalUser
  status: OrderStatus
  timestamp: string
  service_name: string | null
  cost: string
  title: string
  payment_type: PaymentType
  count: number
}

/**
 * Full order details
 */
export interface Order {
  order_id: string
  kind: OrderKind
  cost: string
  title: string
  description: string
  assigned_to: MinimalUser | null
  customer: MinimalUser
  contractor: MinimalContractor | null
  timestamp: string
  status: OrderStatus
  collateral: string | null
  departure: string | null
  destination: string | null
  service_id: string | null
  rush: boolean
  payment_type: PaymentType
  thread_id: string | null
  offer_session_id: string | null
}

/**
 * Create order request payload
 */
export interface CreateOrderPayload {
  /** Order kind/type */
  kind: OrderKind
  /** Order cost in aUEC */
  cost: string
  /** Order title */
  title: string
  /** Order description */
  description: string
  /** Contractor spectrum ID (optional) */
  contractor?: string | null
  /** Assigned user username (optional) */
  assigned_to?: string | null
  /** Collateral amount (optional) */
  collateral?: number
  /** Service ID (optional) */
  service_id?: string
  /** Payment type */
  payment_type: PaymentType
  /** Rush order flag (optional) */
  rush?: boolean
  /** Departure location (optional) */
  departure?: string | null
  /** Destination location (optional) */
  destination?: string | null
}

/**
 * Update order request payload
 */
export interface UpdateOrderPayload {
  /** New order status (optional) */
  status?: OrderStatus
  /** Assigned user ID (optional, null to unassign) */
  assigned_to?: string | null
  /** Contractor spectrum ID (optional) */
  contractor?: string | null
}

/**
 * Apply to order request payload
 */
export interface ApplyToOrderPayload {
  /** Contractor spectrum ID (optional, for org applications) */
  contractor?: string
  /** Application message (optional) */
  message?: string
}

/**
 * Order search query parameters
 */
export interface OrderSearchQuery {
  /** Filter by customer username */
  customer?: string
  /** Filter by assigned user username */
  assigned?: string
  /** Filter by contractor spectrum ID */
  contractor?: string
  /** Filter by order status */
  status?: OrderStatus | OrderStatus[]
  /** Sort method */
  sort_method?: "timestamp" | "cost" | "title" | "customer_name" | "status"
  /** Sort order */
  sort_order?: "asc" | "desc"
  /** Page number (default: 1) */
  page?: number
  /** Items per page (default: 20, max: 100) */
  limit?: number
}

/**
 * Order search response
 */
export interface OrderSearchResponse extends ApiResponse<{
  items: OrderStub[]
  item_counts: {
    [k: string]: number
  }
}> {}

/**
 * Single order response
 */
export interface OrderResponse extends ApiResponse<Order> {}

/**
 * Create order response
 */
export interface CreateOrderResponse extends ApiResponse<{
  session_id: string
  discord_invite: string | null
}> {}

/**
 * Order metrics response
 */
export interface OrderMetricsResponse extends ApiResponse<{
  total_orders: number
  total_value: number
  active_value: number
  completed_value: number
  status_counts: {
    "not-started": number
    "in-progress": number
    fulfilled: number
    cancelled: number
  }
  recent_activity: {
    orders_last_7_days: number
    orders_last_30_days: number
    value_last_7_days: number
    value_last_30_days: number
  }
  top_customers: Array<{
    username: string
    order_count: number
    total_value: number
  }>
}> {}

/**
 * Contractor order data response
 */
export interface ContractorOrderDataResponse extends ApiResponse<{
  metrics: {
    total_orders: number
    total_value: number
    active_value: number
    completed_value: number
    status_counts: {
      "not-started": number
      "in-progress": number
      fulfilled: number
      cancelled: number
    }
    recent_activity: {
      orders_last_7_days: number
      orders_last_30_days: number
      value_last_7_days: number
      value_last_30_days: number
    }
    top_customers: Array<{
      username: string
      order_count: number
      total_value: number
    }>
    trend_data?: {
      daily_orders: Array<{ date: string; count: number }>
      daily_value: Array<{ date: string; value: number }>
      status_trends: {
        "not-started": Array<{ date: string; count: number }>
        "in-progress": Array<{ date: string; count: number }>
        fulfilled: Array<{ date: string; count: number }>
        cancelled: Array<{ date: string; count: number }>
      }
    }
  }
  recent_orders?: Array<{
    order_id: string
    timestamp: string
    status: string
    cost: number
    title: string
  }>
}> {}

/**
 * User order data response
 */
export interface UserOrderDataResponse extends ApiResponse<{
  orders: OrderStub[]
  total_spent: string
  total_orders: number
}> {}

/**
 * Success response
 */
export interface SuccessResponse extends ApiResponse<{
  result: string
}> {}
