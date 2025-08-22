import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
  Response500,
} from "../openapi.js"

// Define schemas for notifications API
oapi.schema("Notification", {
  type: "object",
  title: "Notification",
  properties: {
    read: { type: "boolean" },
    notification_id: { type: "string" },
    action: { type: "string" },
    actors: {
      type: "array",
      items: { type: "object" },
    },
    entity_type: { type: "string" },
    entity: { type: "object" },
    timestamp: { type: "string", format: "date-time" },
  },
  required: ["read", "notification_id", "action", "actors", "entity_type", "entity", "timestamp"],
})

oapi.schema("NotificationUpdateBody", {
  type: "object",
  title: "NotificationUpdateBody",
  properties: {
    read: {
      type: "boolean",
      description: "Whether the notification should be marked as read",
    },
  },
  required: ["read"],
})

oapi.schema("NotificationDeleteBody", {
  type: "object",
  title: "NotificationDeleteBody",
  properties: {
    notification_ids: {
      type: "array",
      items: { type: "string" },
      description: "Array of notification IDs to delete",
    },
  },
  required: ["notification_ids"],
})

oapi.schema("PaginatedNotificationsResponse", {
  type: "object",
  title: "PaginatedNotificationsResponse",
  properties: {
    notifications: {
      type: "array",
      items: oapi.schema("Notification"),
    },
    pagination: {
      type: "object",
      properties: {
        currentPage: { type: "integer" },
        pageSize: { type: "integer" },
        total: { type: "integer" },
        totalPages: { type: "integer" },
        hasNextPage: { type: "boolean" },
        hasPreviousPage: { type: "boolean" },
      },
      required: ["currentPage", "pageSize", "total", "totalPages", "hasNextPage", "hasPreviousPage"],
    },
    unread_count: {
      type: "integer",
      description: "Total number of unread notifications matching the current search criteria",
    },
  },
  required: ["notifications", "pagination", "unread_count"],
})

oapi.schema("SuccessResponse", {
  type: "object",
  title: "SuccessResponse",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
  },
  required: ["success", "message"],
})

oapi.schema("DeleteMultipleResponse", {
  type: "object",
  title: "DeleteMultipleResponse",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
    deleted_count: { type: "integer" },
  },
  required: ["success", "message", "deleted_count"],
})

oapi.schema("BulkActionResponse", {
  type: "object",
  title: "BulkActionResponse",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
    affected_count: { type: "integer" },
  },
  required: ["success", "message", "affected_count"],
})

oapi.schema("NotificationBulkUpdateBody", {
  type: "object",
  title: "NotificationBulkUpdateBody",
  properties: {
    read: {
      type: "boolean",
      description: "Whether all notifications should be marked as read",
    },
  },
  required: ["read"],
})

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
  oapi.validPath({
    summary: "Update notification read status",
    description: "Mark a specific notification as read or unread",
    operationId: "updateNotification",
    tags: ["Notifications"],
    parameters: [
      {
        name: "notification_id",
        in: "path",
        required: true,
        description: "ID of the notification to update",
        schema: {
          type: "string",
        },
      },
    ],
         requestBody: {
       required: true,
       content: {
         "application/json": {
           schema: oapi.schema("NotificationUpdateBody"),
         },
       },
     },
    responses: {
             "200": {
         description: "Notification updated successfully",
         content: {
           "application/json": {
             schema: oapi.schema("SuccessResponse"),
           },
         },
       },
      "400": Response400,
      "401": Response401,
      "404": Response404,
      "500": Response500,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const notification_id = req.params.notification_id
    const { read } = req.body as { read: boolean }

    if (typeof read !== "boolean") {
      res
        .status(400)
        .json({ error: "Invalid request body. 'read' field must be a boolean" })
      return
    }

    try {
      const notifications = await database.getNotifications({
        notifier_id: user.user_id,
        notification_id,
      })

      if (!notifications.length) {
        res.status(404).json({ error: "Notification not found" })
        return
      }

      await database.updateNotifications(
        { notifier_id: user.user_id, notification_id },
        { read },
      )

      res.json({ success: true, message: "Notification updated successfully" })
    } catch (error) {
      logger.error("Failed to update notification:", error)
      res.status(500).json({ error: "Failed to update notification" })
    }
  },
)

// Bulk update notifications (mark all as read)
// PATCH /notifications
// Body: { "read": true }
notificationRouter.patch(
  "/",
  userAuthorized,
  oapi.validPath({
    summary: "Bulk update notifications",
    description: "Update all notifications for the authenticated user (e.g., mark all as read)",
    operationId: "bulkUpdateNotifications",
    tags: ["Notifications"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: oapi.schema("NotificationBulkUpdateBody"),
        },
      },
    },
    responses: {
      "200": {
        description: "Notifications updated successfully",
        content: {
          "application/json": {
            schema: oapi.schema("BulkActionResponse"),
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "500": Response500,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const { read } = req.body as { read: boolean }

    if (typeof read !== "boolean") {
      res.status(400).json({ 
        error: "Invalid request body. 'read' field must be a boolean" 
      })
      return
    }

    try {
      // Get all notifications that would be affected by this update
      const targetNotifications = await database.getNotifications({
        notifier_id: user.user_id,
        read: !read, // If marking as read, get unread ones; if marking as unread, get read ones
      })

      // Update all notifications with the opposite read status
      await database.updateNotifications(
        { notifier_id: user.user_id, read: !read },
        { read },
      )

      const affectedCount = targetNotifications.length
      const action = read ? "marked as read" : "marked as unread"

      logger.debug(`Bulk updated notifications: ${action}`, {
        userId: user.user_id,
        affectedCount,
        read,
      })

      res.json({
        success: true,
        message: `Successfully ${action} ${affectedCount} notification(s)`,
        affected_count: affectedCount,
      })
    } catch (error) {
      logger.error("Failed to bulk update notifications:", error)
      res.status(500).json({ error: "Failed to update notifications" })
    }
  },
)

// Delete a specific notification
// DELETE /notifications/:notification_id
notificationRouter.delete(
  "/:notification_id",
  userAuthorized,
  oapi.validPath({
    summary: "Delete a specific notification",
    description: "Remove a single notification by ID",
    operationId: "deleteNotification",
    tags: ["Notifications"],
    parameters: [
      {
        name: "notification_id",
        in: "path",
        required: true,
        description: "ID of the notification to delete",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
             "200": {
         description: "Notification deleted successfully",
         content: {
           "application/json": {
             schema: oapi.schema("SuccessResponse"),
           },
         },
       },
      "401": Response401,
      "404": Response404,
      "500": Response500,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const notification_id = req.params.notification_id

    try {
      const notifications = await database.getNotifications({
        notifier_id: user.user_id,
        notification_id,
      })

      if (!notifications.length) {
        res.status(404).json({ error: "Notification not found" })
        return
      }

      await database.deleteNotifications({
        notifier_id: user.user_id,
        notification_id,
      })

      res.json({ success: true, message: "Notification deleted successfully" })
    } catch (error) {
      logger.error("Failed to delete notification:", error)
      res.status(500).json({ error: "Failed to delete notification" })
    }
  },
)

// Delete multiple notifications or all notifications
// DELETE /notifications
// Body: { "notification_ids": string[] } for specific deletions, or empty body {} for delete all
notificationRouter.delete(
  "/",
  userAuthorized,
  oapi.validPath({
    summary: "Bulk delete notifications",
    description: "Delete multiple notifications by their IDs, or delete all notifications if no IDs provided",
    operationId: "bulkDeleteNotifications",
    tags: ["Notifications"],
    requestBody: {
      required: false,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              notification_ids: {
                type: "array",
                items: { type: "string" },
                description: "Array of notification IDs to delete. If omitted or empty, all notifications will be deleted.",
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Notifications deleted successfully",
        content: {
          "application/json": {
            schema: oapi.schema("BulkActionResponse"),
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "500": Response500,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const { notification_ids } = req.body as { notification_ids?: string[] }

    try {
      let deletedCount = 0

      // If no notification_ids provided or empty array, delete all notifications
      if (!notification_ids || notification_ids.length === 0) {
        // Get all notifications for the user to count them
        const allNotifications = await database.getNotifications({
          notifier_id: user.user_id,
        })

        // Delete all notifications for the user
        await database.deleteNotifications({
          notifier_id: user.user_id,
        })

        deletedCount = allNotifications.length

        logger.debug("Bulk deleted all notifications", {
          userId: user.user_id,
          deletedCount,
        })

        res.json({
          success: true,
          message: `Successfully deleted all ${deletedCount} notification(s)`,
          affected_count: deletedCount,
        })
        return
      }

      // Validate notification_ids array
      if (!Array.isArray(notification_ids)) {
        res.status(400).json({
          error: "Invalid request body. 'notification_ids' must be an array or omitted for delete all",
        })
        return
      }

      // Delete specific notifications
      for (const notification_id of notification_ids) {
        const notifications = await database.getNotifications({
          notifier_id: user.user_id,
          notification_id,
        })

        if (notifications.length > 0) {
          await database.deleteNotifications({
            notifier_id: user.user_id,
            notification_id,
          })
          deletedCount++
        }
      }

      logger.debug("Bulk deleted specific notifications", {
        userId: user.user_id,
        requestedIds: notification_ids.length,
        deletedCount,
      })

      res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} of ${notification_ids.length} requested notification(s)`,
        affected_count: deletedCount,
      })
    } catch (error) {
      logger.error("Failed to bulk delete notifications:", error)
      res.status(500).json({ error: "Failed to delete notifications" })
    }
  },
)

// Get paginated notifications for user
// GET /:page?pageSize=20&action=order_created&entityId=123
// Returns notifications with pagination metadata
// Optional filters: pageSize, action, entityId
notificationRouter.get(
  "/:page",
  userAuthorized,
  oapi.validPath({
    summary: "Get paginated notifications for user",
    description:
      "Retrieve paginated notifications for the authenticated user with pagination metadata and total unread count matching the current filters",
    operationId: "getPaginatedNotifications",
    tags: ["Notifications"],
    parameters: [
      {
        name: "page",
        in: "path",
        required: true,
        description: "Page number (0-based)",
        schema: {
          type: "integer",
          minimum: 0,
        },
      },
      {
        name: "pageSize",
        in: "query",
        required: false,
        description: "Number of notifications per page (1-100, default: 20)",
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
      {
        name: "action",
        in: "query",
        required: false,
        description:
          "Filter notifications by action type (e.g., 'order_created', 'offer_received')",
        schema: {
          type: "string",
        },
      },
      {
        name: "entityId",
        in: "query",
        required: false,
        description:
          "Filter notifications by entity ID (e.g., order ID, market listing ID)",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
             "200": {
         description: "Paginated notifications retrieved successfully",
         content: {
           "application/json": {
             schema: oapi.schema("PaginatedNotificationsResponse"),
           },
         },
       },
      "400": Response400,
      "401": Response401,
      "500": Response500,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const page = +req.params.page
    const pageSize = req.query.pageSize ? +req.query.pageSize : 20
    const actionFilter = req.query.action as string | undefined
    const entityIdFilter = req.query.entityId as string | undefined

    // Validate page parameter
    if (page < 0 || isNaN(page)) {
      res.status(400).json({ error: "Invalid page number" })
      return
    }

    // Validate page size parameter
    if (pageSize < 1 || pageSize > 100 || isNaN(pageSize)) {
      res
        .status(400)
        .json({ error: "Invalid page size. Must be between 1 and 100" })
      return
    }

    try {
      const result = await database.getCompleteNotificationsByUserPaginated(
        user.user_id,
        page,
        pageSize,
        actionFilter,
        entityIdFilter,
      )
      
      // Get unread count with the same filters
      const unreadCount = await database.getUnreadNotificationCount(
        user.user_id,
        actionFilter,
        entityIdFilter,
      )
      
      // Add unread count to the response
      const responseWithUnreadCount = {
        ...result,
        unread_count: unreadCount,
      }
      
      // Log pagination details for debugging
      logger.debug("Notification pagination result", {
        userId: user.user_id,
        page,
        pageSize,
        actionFilter,
        entityIdFilter,
        totalNotifications: result.pagination.total,
        currentPageCount: result.notifications.length,
        unreadCount,
      })
      
      res.json(responseWithUnreadCount)
    } catch (error) {
      logger.error("Failed to fetch paginated notifications:", error)
      res.status(500).json({ error: "Failed to fetch notifications" })
      return
    }
  },
)
