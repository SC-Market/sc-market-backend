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

    logger.debug(`Created push subscription for user ${userId}`, {
      subscription_id: result.subscription_id,
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
    const subscription = await pushNotificationDb.getPushSubscription(
      subscriptionId,
    )

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`)
    }

    if (subscription.user_id !== userId) {
      throw new Error("User does not own this subscription")
    }

    await pushNotificationDb.deletePushSubscription(subscriptionId)

    logger.debug(`Deleted push subscription ${subscriptionId} for user ${userId}`)
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

    logger.debug(`Updated push preference for user ${userId}`, {
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
  ): Promise<void> {
    // Check if VAPID keys are configured - silently fail if not
    if (!this.isConfigured()) {
      logger.debug(
        `Push notification not sent to user ${userId}: VAPID keys not configured`,
      )
      return
    }
    if (!this.initialized) {
      logger.debug("Push notifications not initialized, skipping")
      return
    }

    // Check user preferences if action type is provided
    if (actionType) {
      const preferences = await this.getPreferences(userId)
      if (preferences[actionType] === false) {
        logger.debug(
          `Push notifications disabled for user ${userId}, action ${actionType}`,
        )
        return
      }
    }

    // Get user subscriptions
    const subscriptions = await this.getUserSubscriptions(userId)

    if (subscriptions.length === 0) {
      logger.debug(`No push subscriptions found for user ${userId}`)
      return
    }

    // Send to all subscriptions
    const payload = JSON.stringify(notification)
    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
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
          return { subscription_id: subscription.subscription_id, success: true }
        } catch (error: unknown) {
          // Handle invalid subscriptions and other error codes
          if (
            error &&
            typeof error === "object" &&
            "statusCode" in error
          ) {
            const statusCode = error.statusCode as number

            // 410 Gone - subscription expired or invalid
            // 404 Not Found - subscription doesn't exist
            // 403 Forbidden - subscription revoked or unauthorized
            // These all mean the subscription is invalid and should be removed
            if (statusCode === 410 || statusCode === 404 || statusCode === 403) {
              logger.debug(
                `Removing invalid subscription ${subscription.subscription_id} (status: ${statusCode})`,
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
                `Rate limited for subscription ${subscription.subscription_id}`,
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
                `Notification payload too large for subscription ${subscription.subscription_id}`,
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

    // Log results
    const successful = results.filter((r) => r.status === "fulfilled").length
    const failed = results.filter((r) => r.status === "rejected").length

    logger.debug(`Sent push notification to user ${userId}`, {
      successful,
      failed,
      total_subscriptions: subscriptions.length,
    })

    if (failed > 0) {
      logger.warn(`Failed to send push notification to ${failed} subscriptions`)
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

    // Send to all users in parallel
    await Promise.allSettled(
      userIds.map((userId) =>
        this.sendPushNotification(userId, notification, actionType).catch(
          (error) => {
            logger.error(
              `Failed to send push notification to user ${userId}:`,
              error,
            )
          },
        ),
      ),
    )
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

    logger.info("Starting push subscription cleanup")

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
          }),
        )
        valid++
      } catch (error: unknown) {
        // Remove invalid subscriptions
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error
        ) {
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
