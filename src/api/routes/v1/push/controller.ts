import { RequestHandler } from "express"
import { User } from "../api-models.js"
import { pushNotificationService } from "../../../../services/push-notifications/push-notification.service.js"
import {
  createErrorResponse,
  createResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"
import { env } from "../../../../config/env.js"

/**
 * POST /api/push/subscribe
 * Subscribe to push notifications
 */
export const push_subscribe: RequestHandler = async (req, res) => {
  const user = req.user as User
  const { endpoint, keys, userAgent } = req.body as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
    userAgent?: string
  }

  // Check if push notifications are configured
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    res.status(503).json(
      createErrorResponse(
        ErrorCode.SERVICE_UNAVAILABLE,
        "Push notifications are not configured on this server. Please contact support."
      )
    )
    return
  }

  // Validate request body
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    res.status(400).json(
      createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Invalid request body. Required fields: endpoint, keys.p256dh, keys.auth"
      )
    )
    return
  }

  try {
    const subscriptionId = await pushNotificationService.createSubscription(
      user.user_id,
      {
        endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        userAgent,
      },
    )

    logger.info(`User successfully subscribed to push notifications`, {
      user_id: user.user_id,
      username: user.username,
      subscription_id: subscriptionId,
      endpoint: endpoint.substring(0, 50) + "...", // Log partial endpoint
      user_agent: userAgent || "unknown",
    })

    res.status(201).json(
      createResponse({
        subscription_id: subscriptionId,
        message: "Successfully subscribed to push notifications",
      }),
    )
  } catch (error) {
    logger.error("Failed to create push subscription:", error)
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to create push subscription"
      )
    )
  }
}

/**
 * GET /api/push/subscribe
 * Get all push subscriptions for the authenticated user
 */
export const push_get_subscriptions: RequestHandler = async (req, res) => {
  const user = req.user as User

  try {
    const subscriptions = await pushNotificationService.getUserSubscriptions(
      user.user_id,
    )

    logger.debug(`User retrieved push subscriptions`, {
      user_id: user.user_id,
      username: user.username,
      subscription_count: subscriptions.length,
    })

    res.json(
      createResponse({
        subscriptions,
      }),
    )
  } catch (error) {
    logger.error("Failed to get push subscriptions:", error)
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to get push subscriptions"
      )
    )
  }
}

/**
 * DELETE /api/push/subscribe/:subscription_id
 * Unsubscribe from push notifications
 */
export const push_unsubscribe: RequestHandler = async (req, res) => {
  const user = req.user as User
  const { subscription_id } = req.params

  if (!subscription_id) {
    res.status(400).json(
      createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "subscription_id is required"
      )
    )
    return
  }

  try {
    await pushNotificationService.deleteSubscription(
      user.user_id,
      subscription_id,
    )

    logger.info(`User unsubscribed from push notifications`, {
      user_id: user.user_id,
      username: user.username,
      subscription_id,
    })

    res.json(
      createResponse({
        message: "Successfully unsubscribed from push notifications",
      }),
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          "Subscription not found"
        )
      )
      return
    }

    if (error instanceof Error && error.message.includes("does not own")) {
      res.status(403).json(
        createErrorResponse(
          ErrorCode.FORBIDDEN,
          "You do not own this subscription"
        )
      )
      return
    }

    logger.error("Failed to delete push subscription:", error)
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to delete push subscription"
      )
    )
  }
}

/**
 * GET /api/push/preferences
 * Get push notification preferences
 */
export const push_get_preferences: RequestHandler = async (req, res) => {
  const user = req.user as User

  try {
    const preferences = await pushNotificationService.getPreferences(
      user.user_id,
    )

    // Convert to array format for easier frontend consumption
    const preferencesArray = Object.entries(preferences).map(
      ([action, enabled]) => ({
        action,
        enabled,
      }),
    )

    res.json(
      createResponse({
        preferences: preferencesArray,
      }),
    )
  } catch (error) {
    logger.error("Failed to get push preferences:", error)
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to get push preferences"
      )
    )
  }
}

/**
 * PATCH /api/push/preferences
 * Update push notification preferences
 */
export const push_update_preference: RequestHandler = async (req, res) => {
  const user = req.user as User
  const { action, enabled } = req.body as {
    action?: string
    enabled?: boolean
  }

  // Validate request body
  if (!action || typeof enabled !== "boolean") {
    res.status(400).json(
      createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Invalid request body. Required fields: action (string), enabled (boolean)"
      )
    )
    return
  }

  try {
    await pushNotificationService.updatePreference(
      user.user_id,
      action,
      enabled,
    )

    logger.info(`User updated push notification preference`, {
      user_id: user.user_id,
      username: user.username,
      action,
      enabled,
    })

    res.json(
      createResponse({
        message: "Successfully updated push notification preference",
      }),
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Invalid action type")
    ) {
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          error.message
        )
      )
      return
    }

    logger.error("Failed to update push preference:", error)
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to update push preference"
      )
    )
  }
}
