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

export const notificationRouter = express.Router()

/*
 * RESTful Notifications API
 *
 * GET    /:page                    - Get paginated notifications (with optional filters)
 * PATCH  /:notification_id         - Update notification read status
 * DELETE /:notification_id         - Delete a specific notification
 * DELETE /                         - Delete multiple notifications
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

// Delete multiple notifications
// DELETE /notifications
// Body: { "notification_ids": string[] }
notificationRouter.delete(
  "",
  userAuthorized,
  oapi.validPath({
    summary: "Delete multiple notifications",
    description: "Remove multiple notifications by their IDs",
    operationId: "deleteMultipleNotifications",
    tags: ["Notifications"],
         requestBody: {
       required: true,
       content: {
         "application/json": {
           schema: oapi.schema("NotificationDeleteBody"),
         },
       },
     },
    responses: {
             "200": {
         description: "Notifications deleted successfully",
         content: {
           "application/json": {
             schema: oapi.schema("DeleteMultipleResponse"),
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
    const { notification_ids } = req.body as { notification_ids: string[] }

    if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
      res
        .status(400)
        .json({
          error:
            "Invalid request body. 'notification_ids' must be a non-empty array",
        })
      return
    }

    try {
      let deletedCount = 0
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

      res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} notification(s)`,
        deleted_count: deletedCount,
      })
    } catch (error) {
      logger.error("Failed to delete notifications:", error)
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
      
      res.json(responseWithUnreadCount)
    } catch (error) {
      logger.error("Failed to fetch paginated notifications:", error)
      res.status(500).json({ error: "Failed to fetch notifications" })
      return
    }
  },
)
