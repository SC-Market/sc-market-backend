import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response404 as Response404 } from "../openapi.js"
import {
  Response500 as Response500,
  Response429Notification,
  Response429Read,
  Response429CommonWrite,
  RateLimitHeaders,
} from "../openapi.js"

oapi.schema("Notification", {
  type: "object",
  title: "Notification",
  description:
    "A notification object containing information about a system event",
  properties: {
    read: {
      type: "boolean",
      description: "Whether the notification has been read by the user",
    },
    notification_id: {
      type: "string",
      format: "uuid",
      description: "Unique identifier for the notification",
    },
    action: {
      type: "string",
      description: "The type of action that triggered this notification",
      allOf: [{ $ref: "#/components/schemas/NotificationActionType" }],
    },
    actors: {
      type: "array",
      description:
        "List of users who performed the action that triggered this notification",
      items: {
        type: "object",
        properties: {
          username: { type: "string" },
          avatar: { type: "string" },
        },
      },
    },
    entity_type: {
      type: "string",
      description: "The type of entity this notification relates to",
      allOf: [{ $ref: "#/components/schemas/NotificationEntityType" }],
    },
    entity: {
      type: "object",
      description:
        "The actual entity object this notification relates to (order, offer, etc.)",
    },
    timestamp: {
      type: "string",
      format: "date-time",
      description: "When the notification was created",
    },
  },
  required: [
    "read",
    "notification_id",
    "action",
    "actors",
    "entity_type",
    "entity",
    "timestamp",
  ],
  example: {
    read: false,
    notification_id: "123e4567-e89b-12d3-a456-426614174000",
    action: "order_message",
    actors: [
      { username: "john_doe", avatar: "https://example.com/avatar.jpg" },
    ],
    entity_type: "orders",
    entity: {
      order_id: "456e7890-e89b-12d3-a456-426614174000",
      title: "Sample Order",
    },
    timestamp: "2025-01-22T06:14:41.058Z",
  },
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
      required: [
        "currentPage",
        "pageSize",
        "total",
        "totalPages",
        "hasNextPage",
        "hasPreviousPage",
      ],
    },
    unread_count: {
      type: "integer",
      description:
        "Total number of unread notifications matching the current search criteria",
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

oapi.schema("NotificationActionType", {
  type: "string",
  title: "NotificationActionType",
  description:
    "Available notification action types for filtering and identification",
  enum: [
    // Order notifications
    "order_create",
    "order_assigned",
    "order_status_fulfilled",
    "order_status_in_progress",
    "order_status_not_started",
    "order_status_cancelled",
    "order_comment",
    "order_review",
    "order_review_revision_requested",
    "order_contractor_applied",
    "public_order_create",
    "order_message",
    // Offer notifications
    "offer_create",
    "counter_offer_create",
    "offer_message",
    // Market notifications
    "market_item_bid",
    "market_item_offer",
    "market_bid_accepted",
    "market_bid_declined",
    "market_offer_accepted",
    "market_offer_declined",
    // Contractor notifications
    "contractor_invite",
    // Admin notifications
    "admin_alert",
  ],
  example: "order_message",
})

oapi.schema("NotificationEntityType", {
  type: "string",
  title: "NotificationEntityType",
  description: "Available notification entity types",
  enum: [
    "orders",
    "order_reviews",
    "order_comments",
    "order_applicants",
    "offer_sessions",
    "market_listing",
    "market_bids",
    "market_offers",
    "contractor_invites",
    "admin_alerts",
  ],
  example: "orders",
})

export const notification_patch_notification_id_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: oapi.schema("SuccessResponse"),
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "404": Response404,
    "429": Response429Notification,
    "500": Response500,
  },
})

export const notification_patch_root_spec = oapi.validPath({
  summary: "Bulk update notifications",
  description:
    "Update all notifications for the authenticated user (e.g., mark all as read)",
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
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: oapi.schema("BulkActionResponse"),
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "429": Response429CommonWrite,
    "500": Response500,
  },
})

export const notification_delete_notification_id_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: oapi.schema("SuccessResponse"),
        },
      },
    },
    "401": Response401,
    "404": Response404,
    "429": Response429Notification,
    "500": Response500,
  },
})

export const notification_delete_root_spec = oapi.validPath({
  summary: "Bulk delete notifications",
  description:
    "Delete multiple notifications by their IDs, or delete all notifications if no IDs provided",
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
              description:
                "Array of notification IDs to delete. If omitted or empty, all notifications will be deleted.",
            },
          },
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Notifications deleted successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: oapi.schema("BulkActionResponse"),
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "429": Response429CommonWrite,
    "500": Response500,
  },
})

export const notification_get_page_spec = oapi.validPath({
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
        "Filter notifications by action type. See NotificationActionType schema for available values. Examples: 'order_message', 'offer_message', 'order_create', 'market_item_bid'",
      schema: {
        allOf: [{ $ref: "#/components/schemas/NotificationActionType" }],
      },
    },
    {
      name: "entityId",
      in: "query",
      required: false,
      description:
        "Filter notifications by entity ID (e.g., order ID, market listing ID). The entity type is determined by the action filter.",
      schema: {
        type: "string",
        format: "uuid",
      },
    },
    {
      name: "scope",
      in: "query",
      required: false,
      description:
        "Filter notifications by scope: 'individual' for personal notifications, 'organization' for org notifications, 'all' for all notifications.",
      schema: {
        type: "string",
        enum: ["individual", "organization", "all"],
        default: "all",
      },
    },
    {
      name: "contractorId",
      in: "query",
      required: false,
      description:
        "Filter notifications by specific organization/contractor ID. Only applies when scope is 'organization'.",
      schema: {
        type: "string",
        format: "uuid",
      },
    },
  ],
  responses: {
    "200": {
      description: "Paginated notifications retrieved successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: oapi.schema("PaginatedNotificationsResponse"),
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
})
