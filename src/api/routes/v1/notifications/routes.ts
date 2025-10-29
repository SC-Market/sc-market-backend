import express from "express"
import {
  userAuthorized,
  requireNotificationsRead,
  requireNotificationsWrite,
} from "../../../middleware/auth.js"
import {
  notificationRateLimit,
  readRateLimit,
  commonWriteRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import {
  notification_patch_notification_id,
  notification_patch_root,
  notification_delete_notification_id,
  notification_delete_root,
  notification_get_page,
} from "./controller.js"

import {
  notification_patch_notification_id_spec,
  notification_patch_root_spec,
  notification_delete_notification_id_spec,
  notification_delete_root_spec,
  notification_get_page_spec,
} from "./openapi.js"

export const notificationRouter = express.Router()

/*
 * RESTful Notifications API
 *
 * GET    /:page                    - Get paginated notifications (with optional filters)
 * PATCH  /:notification_id         - Update notification read status
 * PATCH  /                         - Mark all notifications as read for the user (bulk update)
 * DELETE /:notification_id         - Delete a specific notification
 * DELETE /                         - Delete multiple notifications or all notifications (bulk delete)
 */

// Update notification read status
// PATCH /notifications/:notification_id
// Body: { "read": boolean }
notificationRouter.patch(
  "/:notification_id",
  userAuthorized,
  notification_patch_notification_id_spec,
  notificationRateLimit,
  notification_patch_notification_id,
)

// Bulk update notifications (mark all as read)
// PATCH /notifications
// Body: { "read": true }
notificationRouter.patch(
  "/",
  userAuthorized,
  notification_patch_root_spec,
  notificationRateLimit,
  notification_patch_root,
)

// Delete a specific notification
// DELETE /notifications/:notification_id
notificationRouter.delete(
  "/:notification_id",
  userAuthorized,
  requireNotificationsWrite,
  notification_delete_notification_id_spec,
  commonWriteRateLimit,
  notification_delete_notification_id,
)

// Delete multiple notifications or all notifications
// DELETE /notifications
// Body: { "notification_ids": string[] } for specific deletions, or empty body {} for delete all
notificationRouter.delete(
  "/",
  userAuthorized,
  requireNotificationsWrite,
  notification_delete_root_spec,
  commonWriteRateLimit,
  notification_delete_root,
)

// Get paginated notifications for user
// GET /:page?pageSize=20&action=order_created&entityId=123
// Returns notifications with pagination metadata
// Optional filters: pageSize, action, entityId
notificationRouter.get(
  "/:page",
  userAuthorized,
  requireNotificationsRead,
  notification_get_page_spec,
  readRateLimit,
  notification_get_page,
)
