import { oapi } from "../openapi.js"
import {
  Response400,
  Response401,
  Response404,
  Response500,
  Response429CommonWrite,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"

// Schemas
oapi.schema("PushSubscriptionData", {
  type: "object",
  title: "PushSubscriptionData",
  description: "Push subscription data from the browser",
  properties: {
    endpoint: {
      type: "string",
      description: "Push service endpoint URL",
    },
    keys: {
      type: "object",
      description: "Encryption keys for push notifications",
      properties: {
        p256dh: {
          type: "string",
          description: "P-256 ECDH public key (base64 encoded)",
        },
        auth: {
          type: "string",
          description: "Authentication secret (base64 encoded)",
        },
      },
      required: ["p256dh", "auth"],
    },
    userAgent: {
      type: "string",
      description: "User agent string (optional)",
    },
  },
  required: ["endpoint", "keys"],
})

oapi.schema("PushSubscriptionResponse", {
  type: "object",
  title: "PushSubscriptionResponse",
  properties: {
    subscription_id: {
      type: "string",
      format: "uuid",
      description: "Unique identifier for the subscription",
    },
    message: {
      type: "string",
      description: "Success message",
    },
  },
  required: ["subscription_id", "message"],
})

oapi.schema("PushPreference", {
  type: "object",
  title: "PushPreference",
  description: "Push notification preference for a specific action type",
  properties: {
    action: {
      type: "string",
      description:
        "Notification action type (e.g., 'order_create', 'order_message')",
    },
    enabled: {
      type: "boolean",
      description:
        "Whether push notifications are enabled for this action type",
    },
  },
  required: ["action", "enabled"],
})

oapi.schema("PushPreferencesResponse", {
  type: "object",
  title: "PushPreferencesResponse",
  properties: {
    preferences: {
      type: "array",
      description: "Array of push notification preferences",
      items: {
        $ref: "#/components/schemas/PushPreference",
      },
    },
  },
  required: ["preferences"],
})

oapi.schema("PushPreferenceUpdateBody", {
  type: "object",
  title: "PushPreferenceUpdateBody",
  properties: {
    action: {
      type: "string",
      description: "Notification action type to update",
    },
    enabled: {
      type: "boolean",
      description:
        "Whether to enable or disable push notifications for this action",
    },
  },
  required: ["action", "enabled"],
})

// POST /push/subscribe
export const push_subscribe_spec = oapi.validPath({
  summary: "Subscribe to push notifications",
  description:
    "Register a push subscription for the authenticated user. The subscription allows the server to send push notifications to the user's device.",
  operationId: "subscribePush",
  tags: ["Push Notifications"],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: oapi.schema("PushSubscriptionData"),
      },
    },
  },
  responses: {
    "201": {
      description: "Successfully subscribed to push notifications",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: oapi.schema("PushSubscriptionResponse"),
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "429": Response429CommonWrite,
    "500": Response500,
  },
})

// GET /push/subscribe
export const push_get_subscriptions_spec = oapi.validPath({
  summary: "Get push subscriptions",
  description:
    "Get all push subscriptions for the authenticated user. Returns a list of all active push subscriptions associated with the user's account.",
  operationId: "getPushSubscriptions",
  tags: ["Push Notifications"],
  responses: {
    "200": {
      description: "Successfully retrieved push subscriptions",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              subscriptions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    subscription_id: {
                      type: "string",
                      format: "uuid",
                      description: "Unique identifier for the subscription",
                    },
                    user_id: {
                      type: "string",
                      format: "uuid",
                      description: "User ID that owns this subscription",
                    },
                    endpoint: {
                      type: "string",
                      description: "Push service endpoint URL",
                    },
                    p256dh: {
                      type: "string",
                      description: "P-256 ECDH public key (base64 encoded)",
                    },
                    auth: {
                      type: "string",
                      description: "Authentication secret (base64 encoded)",
                    },
                    user_agent: {
                      type: "string",
                      nullable: true,
                      description:
                        "User agent string when subscription was created",
                    },
                    created_at: {
                      type: "string",
                      format: "date-time",
                      description: "When the subscription was created",
                    },
                    updated_at: {
                      type: "string",
                      format: "date-time",
                      description: "When the subscription was last updated",
                    },
                  },
                  required: [
                    "subscription_id",
                    "user_id",
                    "endpoint",
                    "p256dh",
                    "auth",
                    "created_at",
                    "updated_at",
                  ],
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
})

// DELETE /push/subscribe/:subscription_id
export const push_unsubscribe_spec = oapi.validPath({
  summary: "Unsubscribe from push notifications",
  description:
    "Remove a push subscription for the authenticated user. The user must own the subscription.",
  operationId: "unsubscribePush",
  tags: ["Push Notifications"],
  parameters: [
    {
      name: "subscription_id",
      in: "path",
      required: true,
      description: "Unique identifier for the subscription",
      schema: {
        type: "string",
        format: "uuid",
      },
    },
  ],
  responses: {
    "200": {
      description: "Successfully unsubscribed from push notifications",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                example: "Successfully unsubscribed from push notifications",
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": {
      description: "User does not own this subscription",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: {
                type: "string",
                example: "You do not own this subscription",
              },
            },
          },
        },
      },
    },
    "404": Response404,
    "429": Response429CommonWrite,
    "500": Response500,
  },
})

// GET /push/preferences
export const push_get_preferences_spec = oapi.validPath({
  summary: "Get push notification preferences",
  description:
    "Get all push notification preferences for the authenticated user. Returns preferences for all notification action types, defaulting to enabled if not explicitly set.",
  operationId: "getPushPreferences",
  tags: ["Push Notifications"],
  responses: {
    "200": {
      description: "Successfully retrieved push notification preferences",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: oapi.schema("PushPreferencesResponse"),
        },
      },
    },
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
})

// PATCH /push/preferences
export const push_update_preference_spec = oapi.validPath({
  summary: "Update push notification preference",
  description:
    "Update a push notification preference for a specific action type. This allows users to enable or disable push notifications for specific notification types.",
  operationId: "updatePushPreference",
  tags: ["Push Notifications"],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: oapi.schema("PushPreferenceUpdateBody"),
      },
    },
  },
  responses: {
    "200": {
      description: "Successfully updated push notification preference",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                example: "Successfully updated push notification preference",
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "429": Response429CommonWrite,
    "500": Response500,
  },
})
