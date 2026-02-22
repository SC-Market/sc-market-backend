/**
 * Notification models for TSOA
 */

import { ApiResponse } from "./common.models.js"

/**
 * Notification object
 */
export interface Notification {
  notification_id: string
  notifier_id: string
  action: string
  entity: string
  entity_id: string
  read: boolean
  created_at: string
  actor_id?: string | null
  actor_username?: string | null
  contractor_id?: string | null
  contractor_name?: string | null
  contractor_spectrum_id?: string | null
}

/**
 * Update notification read status payload
 */
export interface UpdateNotificationPayload {
  read: boolean
}

/**
 * Bulk delete notifications payload
 */
export interface BulkDeleteNotificationsPayload {
  notification_ids?: string[]
}

/**
 * Notification response
 */
export interface NotificationResponse extends ApiResponse<{
  success: boolean
  message: string
}> {}

/**
 * Bulk operation response
 */
export interface BulkOperationResponse extends ApiResponse<{
  success: boolean
  message: string
  affected_count: number
}> {}

/**
 * Paginated notifications response
 */
export interface PaginatedNotificationsResponse extends ApiResponse<{
  notifications: Notification[]
  page: number
  page_size: number
  total_count: number
  total_pages: number
  unread_count: number
}> {}
