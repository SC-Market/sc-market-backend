/**
 * PushNotificationService - Web Push Protocol service for sending push notifications
 *
 * This service handles:
 * - Managing push subscriptions (stored in database)
 * - Managing user preferences for push notifications
 * - Sending push notifications via Web Push Protocol
 * - Cleaning up invalid subscriptions
 */

import webpush from "web-push"
import { env } from "../../config/env.js"
import * as pushNotificationDb from "./push-notification.database.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import logger from "../../logger/logger.js"
import {
  PushSubscriptionData,
  PushSubscription,
  PushNotificationPayload,
  PushNotificationPreferences,
} from "./push-notification.service.types.js"

/**
 * Interface for PushNotificationService
 */
export interface PushNotificationService {
  // Subscription management
  createSubscription(
    userId: string,
    subscription: PushSubscriptionData,
  ): Promise<string>
  deleteSubscription(userId: string, subscriptionId: string): Promise<void>
  getUserSubscriptions(userId: string): Promise<PushSubscription[]>

  // Preferences
  getPreferences(userId: string): Promise<PushNotificationPreferences>
  updatePreference(
    userId: string,
    actionType: string,
    enabled: boolean,
  ): Promise<void>

  // Delivery
  sendPushNotification(
    userId: string,
    notification: PushNotificationPayload,
    actionType?: string,
    contractorId?: string | null,
  ): Promise<void>

  // Batch operations
  sendPushNotifications(
    userIds: string[],
    notification: PushNotificationPayload,
    actionType?: string,
  ): Promise<void>

  // Cleanup
  cleanupInvalidSubscriptions(): Promise<void>
}

/**
 * Web Push Protocol implementation of PushNotificationService
 */
class WebPushNotificationService implements PushNotificationService {
  private initialized = false

  /**
   * Initialize web-push with VAPID keys
   */
  private initialize(): void {
    if (this.initialized) {
      return
    }

    const publicKey = env.VAPID_PUBLIC_KEY
    const privateKey = env.VAPID_PRIVATE_KEY
    const subject = env.VAPID_SUBJECT || "mailto:admin@example.com"

    if (!publicKey || !privateKey) {
      logger.warn(
        "VAPID keys not configured. Push notifications will not work.",
      )
      this.initialized = false
      return
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey)
      this.initialized = true
      logger.info("Web Push Protocol initialized successfully")
    } catch (error) {
      logger.error("Failed to initialize Web Push Protocol:", error)
      this.initialized = false
    }
  }

  /**
   * Create a push subscription for a user
   */
  async createSubscription(
    userId: string,
    subscription: PushSubscriptionData,
  ): Promise<string> {
    const [result] = await pushNotificationDb.insertPushSubscription({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: subscription.userAgent,
    })

    logger.info(`Push subscription created successfully for user ${userId}`, {
      subscription_id: result.subscription_id,
      endpoint: subscription.endpoint.substring(0, 50) + "...", // Log partial endpoint for debugging
      user_agent: subscription.userAgent || "unknown",
    })

    return result.subscription_id
  }

  /**
   * Delete a push subscription
   */
  async deleteSubscription(
    userId: string,
    subscriptionId: string,
  ): Promise<void> {
    // Verify user owns the subscription
    const subscription =
      await pushNotificationDb.getPushSubscription(subscriptionId)

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`)
    }

    if (subscription.user_id !== userId) {
      throw new Error("User does not own this subscription")
    }

    await pushNotificationDb.deletePushSubscription(subscriptionId)

    logger.info(`Push subscription deleted for user ${userId}`, {
      subscription_id: subscriptionId,
    })
  }

  /**
   * Get all push subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
    return pushNotificationDb.getPushSubscriptions(userId)
  }

  /**
   * Get push notification preferences for a user
   * Returns a map of action type names to enabled/disabled state
   * Defaults to enabled (true) if preference doesn't exist
   */
  async getPreferences(userId: string): Promise<PushNotificationPreferences> {
    const preferences = await pushNotificationDb.getPushPreferences(userId)

    // Get all notification action types
    const allActions = await notificationDb.getAllNotificationActions()

    // Build preferences map, defaulting to enabled
    const preferencesMap: PushNotificationPreferences = {}

    for (const action of allActions) {
      const preference = preferences.find(
        (p) => p.action_type_id === action.action_type_id,
      )
      // Default to enabled if no preference exists
      preferencesMap[action.action] = preference?.enabled ?? true
    }

    return preferencesMap
  }

  /**
   * Update a push notification preference for a user
   */
  async updatePreference(
    userId: string,
    actionType: string,
    enabled: boolean,
  ): Promise<void> {
    // Get action type ID
    const action = await notificationDb.getNotificationActionByName(actionType)

    if (!action) {
      throw new Error(`Invalid action type: ${actionType}`)
    }

    await pushNotificationDb.upsertPushPreference({
      user_id: userId,
      action_type_id: action.action_type_id,
      enabled,
    })

    logger.info(`Push notification preference updated for user ${userId}`, {
      user_id: userId,
      action_type: actionType,
      enabled,
    })
  }

  /**
   * Check if push notifications are properly configured
   */
  private isConfigured(): boolean {
    this.initialize()
    return this.initialized
  }

  /**
   * Send a push notification to a user
   * Respects user preferences - only sends if enabled for the action type
   */
  async sendPushNotification(
    userId: string,
    notification: PushNotificationPayload,
    actionType?: string,
    contractorId?: string | null,
  ): Promise<void> {
    logger.debug(`Attempting to send push notification to user ${userId}`, {
      user_id: userId,
      action_type: actionType,
      notification_title: notification.title,
    })

    // Check if VAPID keys are configured - silently fail if not
    if (!this.isConfigured()) {
      logger.debug(
        `Push notification not sent to user ${userId}: VAPID keys not configured`,
        {
          user_id: userId,
          action_type: actionType,
        },
      )
      return
    }
    if (!this.initialized) {
      logger.debug("Push notifications not initialized, skipping", {
        user_id: userId,
        action_type: actionType,
      })
      return
    }

    // Check user preferences if action type is provided
    if (actionType) {
      // Get action type ID for preference lookup
      const { getNotificationActionByName } =
        await import("../../api/routes/v1/notifications/database.js")
      const action = await getNotificationActionByName(actionType)
      if (action) {
        const { getPushPreference } =
          await import("./push-notification.database.js")
        const preference = await getPushPreference(
          userId,
          action.action_type_id,
          contractorId ?? null,
        )
        // Default to enabled if no preference exists (current behavior)
        const isEnabled = preference?.enabled ?? true
        if (!isEnabled) {
          logger.debug(
            `Push notifications disabled for user ${userId}, action ${actionType}, contractor_id: ${contractorId}`,
            {
              user_id: userId,
              action_type: actionType,
              action_type_id: action.action_type_id,
              contractor_id: contractorId,
              preference_enabled: false,
            },
          )
          return
        }
        logger.debug(
          `Push notification preference check passed for user ${userId}`,
          {
            user_id: userId,
            action_type: actionType,
            action_type_id: action.action_type_id,
            contractor_id: contractorId,
            preference_enabled: true,
          },
        )
      }
    }

    // Get user subscriptions
    const subscriptions = await this.getUserSubscriptions(userId)

    if (subscriptions.length === 0) {
      logger.debug(`No push subscriptions found for user ${userId}`, {
        user_id: userId,
        action_type: actionType,
      })
      return
    }

    logger.debug(
      `Found ${subscriptions.length} subscription(s) for user ${userId}`,
      {
        user_id: userId,
        action_type: actionType,
        subscription_count: subscriptions.length,
      },
    )

    // Send to all subscriptions
    const payload = JSON.stringify(notification)
    logger.debug(
      `Sending push notification to ${subscriptions.length} device(s) for user ${userId}`,
      {
        user_id: userId,
        action_type: actionType,
        subscription_count: subscriptions.length,
        payload_size: payload.length,
      },
    )

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          logger.debug(
            `Sending push notification to subscription ${subscription.subscription_id}`,
            {
              subscription_id: subscription.subscription_id,
              endpoint: subscription.endpoint.substring(0, 50) + "...",
              user_agent: subscription.user_agent,
            },
          )

          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
          )

          logger.debug(
            `Push notification delivered successfully to subscription ${subscription.subscription_id}`,
            {
              subscription_id: subscription.subscription_id,
              user_id: userId,
              action_type: actionType,
              endpoint: subscription.endpoint.substring(0, 50) + "...",
            },
          )
          return {
            subscription_id: subscription.subscription_id,
            success: true,
          }
        } catch (error: unknown) {
          // Handle invalid subscriptions and other error codes
          if (error && typeof error === "object" && "statusCode" in error) {
            const statusCode = error.statusCode as number

            // 410 Gone - subscription expired or invalid
            // 404 Not Found - subscription doesn't exist
            // 403 Forbidden - subscription revoked or unauthorized
            // These all mean the subscription is invalid and should be removed
            if (
              statusCode === 410 ||
              statusCode === 404 ||
              statusCode === 403
            ) {
              logger.debug(
                `Removing invalid push subscription ${subscription.subscription_id} (HTTP ${statusCode})`,
                {
                  subscription_id: subscription.subscription_id,
                  status_code: statusCode,
                  endpoint: subscription.endpoint.substring(0, 50) + "...",
                },
              )
              await pushNotificationDb.deletePushSubscription(
                subscription.subscription_id,
              )
              // Don't throw - we've handled it by removing the subscription
              return {
                subscription_id: subscription.subscription_id,
                success: false,
                error: `Subscription invalid (${statusCode})`,
              }
            }

            // 429 Too Many Requests - rate limited, log but don't remove
            if (statusCode === 429) {
              logger.warn(
                `Push notification rate limited for subscription ${subscription.subscription_id}`,
                {
                  subscription_id: subscription.subscription_id,
                  status_code: statusCode,
                },
              )
              // Don't throw - rate limiting is temporary
              return {
                subscription_id: subscription.subscription_id,
                success: false,
                error: "Rate limited",
              }
            }

            // 413 Payload Too Large - notification too big, log but don't remove
            if (statusCode === 413) {
              logger.warn(
                `Push notification payload too large for subscription ${subscription.subscription_id}`,
                {
                  subscription_id: subscription.subscription_id,
                  status_code: statusCode,
                },
              )
              return {
                subscription_id: subscription.subscription_id,
                success: false,
                error: "Payload too large",
              }
            }

            // Other errors - log and throw
            logger.warn(
              `Unexpected error sending to subscription ${subscription.subscription_id}:`,
              error,
            )
          }
          throw error
        }
      }),
    )

    // Log results - analyze Promise.allSettled results
    const successful = results.filter((r) => {
      if (r.status === "fulfilled") {
        // Check if the returned value indicates success
        const value = r.value as {
          subscription_id: string
          success: boolean
          error?: string
        }
        return value.success === true
      }
      return false
    }).length

    const failed = results.filter((r) => {
      if (r.status === "rejected") {
        return true
      }
      if (r.status === "fulfilled") {
        const value = r.value as {
          subscription_id: string
          success: boolean
          error?: string
        }
        return value.success === false
      }
      return false
    }).length

    // Get detailed failure information
    const failures = results
      .filter((r) => {
        if (r.status === "rejected") {
          return true
        }
        if (r.status === "fulfilled") {
          const value = r.value as {
            subscription_id: string
            success: boolean
            error?: string
          }
          return value.success === false
        }
        return false
      })
      .map((r) => {
        if (r.status === "rejected") {
          return {
            error:
              r.reason instanceof Error
                ? r.reason.message
                : String(r.reason) || "Unknown error",
          }
        }
        const value = r.value as {
          subscription_id: string
          success: boolean
          error?: string
        }
        return {
          subscription_id: value.subscription_id,
          error: value.error || "Unknown error",
        }
      })

    if (successful > 0) {
      logger.info(`Push notification sent successfully to user ${userId}`, {
        user_id: userId,
        action_type: actionType || "unknown",
        successful,
        failed,
        total_subscriptions: subscriptions.length,
        notification_title: notification.title,
      })
    }

    if (failed > 0) {
      logger.warn(`Push notification delivery failed for user ${userId}`, {
        user_id: userId,
        action_type: actionType || "unknown",
        successful,
        failed,
        total_subscriptions: subscriptions.length,
        failures: failures.slice(0, 5), // Log first 5 failures to avoid log spam
        notification_title: notification.title,
      })
    }

    // If all failed, log at warn level
    if (failed > 0 && successful === 0) {
      logger.warn(
        `All push notification deliveries failed for user ${userId}`,
        {
          user_id: userId,
          action_type: actionType || "unknown",
          total_subscriptions: subscriptions.length,
          failures,
        },
      )
    }
  }

  /**
   * Send push notifications to multiple users (batch operation)
   */
  async sendPushNotifications(
    userIds: string[],
    notification: PushNotificationPayload,
    actionType?: string,
  ): Promise<void> {
    // Check if VAPID keys are configured - silently fail if not
    if (!this.isConfigured()) {
      logger.debug("Push notifications not configured, skipping batch send")
      return
    }

    logger.debug(`Sending push notifications to ${userIds.length} users`, {
      user_count: userIds.length,
      action_type: actionType || "unknown",
      notification_title: notification.title,
    })

    // Send to all users in parallel
    const results = await Promise.allSettled(
      userIds.map((userId) =>
        this.sendPushNotification(userId, notification, actionType).catch(
          (error) => {
            logger.error(
              `Failed to send push notification to user ${userId}:`,
              error,
            )
            throw error
          },
        ),
      ),
    )

    const successful = results.filter((r) => r.status === "fulfilled").length
    const failed = results.filter((r) => r.status === "rejected").length

    logger.info(`Batch push notification delivery completed`, {
      total_users: userIds.length,
      successful,
      failed,
      action_type: actionType || "unknown",
      notification_title: notification.title,
    })
  }

  /**
   * Clean up invalid push subscriptions
   * Attempts to send a test notification to each subscription and removes invalid ones
   */
  async cleanupInvalidSubscriptions(): Promise<void> {
    // Check if VAPID keys are configured - silently fail if not
    if (!this.isConfigured()) {
      logger.debug("Push notifications not configured, skipping cleanup")
      return
    }

    logger.debug("Starting push subscription cleanup")

    const allSubscriptions = await pushNotificationDb.getAllPushSubscriptions()
    let removed = 0
    let valid = 0

    for (const subscription of allSubscriptions) {
      try {
        // Send a test notification (silent)
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: "Test",
            body: "Test notification",
            silent: true,
            data: {
              silent: true,
              test: true,
            },
          }),
        )
        valid++
      } catch (error: unknown) {
        // Remove invalid subscriptions
        if (error && typeof error === "object" && "statusCode" in error) {
          const statusCode = error.statusCode as number

          // 410 Gone, 404 Not Found, 403 Forbidden - subscription is invalid
          if (statusCode === 410 || statusCode === 404 || statusCode === 403) {
            await pushNotificationDb.deletePushSubscription(
              subscription.subscription_id,
            )
            removed++
            logger.debug(
              `Removed invalid subscription ${subscription.subscription_id} (status: ${statusCode})`,
            )
          } else if (statusCode === 429) {
            // 429 Too Many Requests - rate limited, skip for now
            logger.debug(
              `Rate limited for subscription ${subscription.subscription_id}, skipping cleanup`,
            )
            valid++ // Count as valid since it's just rate limited
          } else {
            // Other errors - log but don't remove
            logger.warn(
              `Error testing subscription ${subscription.subscription_id} (status: ${statusCode}):`,
              error,
            )
          }
        } else {
          // Non-HTTP errors - log but don't remove
          logger.warn(
            `Error testing subscription ${subscription.subscription_id}:`,
            error,
          )
        }
      }
    }

    logger.info("Push subscription cleanup completed", {
      total: allSubscriptions.length,
      valid,
      removed,
    })
  }
}

// Export service instance
export const pushNotificationService: PushNotificationService =
  new WebPushNotificationService()
