import { RequestHandler } from "express"
import { User } from "../api-models.js"
import { pushNotificationService } from "../../../../services/push-notifications/push-notification.service.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"
import { env } from "../../../../config/env.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import type { PushNotificationPreference } from "../../../../services/push-notifications/push-notification.service.types.js"

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
    res
      .status(503)
      .json(
        createErrorResponse(
          ErrorCode.SERVICE_UNAVAILABLE,
          "Push notifications are not configured on this server. Please contact support.",
        ),
      )
    return
  }

  // Validate request body
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Invalid request body. Required fields: endpoint, keys.p256dh, keys.auth",
        ),
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
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to create push subscription",
        ),
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
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to get push subscriptions",
        ),
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
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "subscription_id is required",
        ),
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
      res
        .status(404)
        .json(
          createErrorResponse(ErrorCode.NOT_FOUND, "Subscription not found"),
        )
      return
    }

    if (error instanceof Error && error.message.includes("does not own")) {
      res
        .status(403)
        .json(
          createErrorResponse(
            ErrorCode.FORBIDDEN,
            "You do not own this subscription",
          ),
        )
      return
    }

    logger.error("Failed to delete push subscription:", error)
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to delete push subscription",
        ),
      )
  }
}

/**
 * GET /api/push/preferences
 * Get push notification preferences (grouped by individual and organizations)
 */
export const push_get_preferences: RequestHandler = async (req, res) => {
  const user = req.user as User

  try {
    const { getPushPreferencesGrouped } =
      await import("../../../../services/push-notifications/push-notification.database.js")
    const groupedPreferences = await getPushPreferencesGrouped(user.user_id)

    // Get all notification action types
    const { getAllNotificationActions } =
      await import("../notifications/database.js")
    const allActions = await getAllNotificationActions()
    const actionMap = new Map(
      allActions.map((a) => [parseInt(a.action_type_id, 10), a]),
    )

    // Create a map of existing preferences by action_type_id for individual
    const individualPrefMap = new Map<number, boolean>()
    for (const pref of groupedPreferences.individual) {
      const actionTypeId = parseInt(pref.action_type_id, 10)
      individualPrefMap.set(actionTypeId, pref.enabled)
    }

    // Format individual preferences - include all actions with defaults
    const individualPreferences = allActions.map((action) => {
      const actionTypeId = parseInt(action.action_type_id, 10)
      return {
        action: action.action,
        enabled: individualPrefMap.get(actionTypeId) ?? true, // Default to enabled for push
      }
    })

    // Format organization preferences
    const organizationPreferences = groupedPreferences.organizations.map(
      (org) => {
        // Create a map of existing preferences for this org
        const orgPrefMap = new Map<number, boolean>()
        for (const pref of org.preferences) {
          const actionTypeId = parseInt(pref.action_type_id, 10)
          orgPrefMap.set(actionTypeId, pref.enabled)
        }

        // Include all actions with defaults
        const orgPrefs = allActions.map((action) => {
          const actionTypeId = parseInt(action.action_type_id, 10)
          return {
            action: action.action,
            enabled: orgPrefMap.get(actionTypeId) ?? true, // Default to enabled for push
          }
        })

        return {
          contractor_id: org.contractor_id,
          preferences: orgPrefs,
        }
      },
    )

    res.json(
      createResponse({
        preferences: {
          individual: individualPreferences,
          organizations: organizationPreferences,
        },
      }),
    )
  } catch (error) {
    logger.error("Failed to get push preferences:", error)
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to get push preferences",
        ),
      )
  }
}

/**
 * PATCH /api/push/preferences
 * Update push notification preferences (supports single or batch updates)
 */
export const push_update_preference: RequestHandler = async (req, res) => {
  const user = req.user as User
  const body = req.body as
    | {
        action?: string
        enabled?: boolean
        contractor_id?: string | null
      }
    | {
        preferences?: Array<{
          action: string
          enabled: boolean
          contractor_id?: string | null
        }>
      }

  // Check if this is a batch update (has preferences array) or single update
  const isBatchUpdate = Array.isArray((body as any).preferences)
  const preferences = isBatchUpdate
    ? (
        body as {
          preferences?: Array<{
            action: string
            enabled: boolean
            contractor_id?: string | null
          }>
        }
      ).preferences
    : [
        {
          action: (
            body as {
              action?: string
              enabled?: boolean
              contractor_id?: string | null
            }
          ).action!,
          enabled: (
            body as {
              action?: string
              enabled?: boolean
              contractor_id?: string | null
            }
          ).enabled!,
          contractor_id: (
            body as {
              action?: string
              enabled?: boolean
              contractor_id?: string | null
            }
          ).contractor_id,
        },
      ]

  if (!preferences || preferences.length === 0) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          isBatchUpdate
            ? "Preferences array is required and cannot be empty"
            : "Invalid request body. Required fields: action (string), enabled (boolean), or preferences array",
        ),
      )
    return
  }

  // Validate batch request format
  if (isBatchUpdate) {
    for (const pref of preferences) {
      if (!pref.action || typeof pref.enabled !== "boolean") {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Each preference must have action (string) and enabled (boolean)",
            ),
          )
        return
      }
    }
  } else {
    // Single update validation
    if (!preferences[0].action || typeof preferences[0].enabled !== "boolean") {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Invalid request body. Required fields: action (string), enabled (boolean)",
          ),
        )
      return
    }
  }

  try {
    // Validate all action types exist once, outside the loop
    const { getAllNotificationActions } =
      await import("../notifications/database.js")
    const allActions = await getAllNotificationActions()
    const actionMap = new Map(
      allActions.map((a) => [a.action, parseInt(a.action_type_id, 10)]),
    )

    // Get knex instance for transaction
    const knexInstance = getKnex()

    // Wrap all updates in a transaction to ensure atomicity and proper commit order
    const updatedPreferences = await knexInstance.transaction(async (trx) => {
      const results: Array<{
        action: string
        enabled: boolean
        contractor_id: string | null
      }> = []

      const contractorDbModule = await import("../contractors/database.js")

      for (const pref of preferences) {
        // Validate contractor_id if provided
        let contractorId: string | null = pref.contractor_id ?? null
        if (contractorId !== null) {
          // Verify user is a member of this contractor
          const isMember = await contractorDbModule.isUserContractorMember(
            user.user_id,
            contractorId,
          )
          if (!isMember) {
            logger.warn(
              "User attempted to set preference for non-member contractor",
              {
                user_id: user.user_id,
                contractor_id: contractorId,
              },
            )
            continue // Skip this preference
          }
        }

        // Validate action type exists
        const actionTypeId = actionMap.get(pref.action)
        if (!actionTypeId) {
          logger.warn("Invalid action type in preference update", {
            user_id: user.user_id,
            action: pref.action,
          })
          continue // Skip invalid action types
        }

        // Ensure enabled is explicitly a boolean - default to true for push (opt-out)
        const enabled = typeof pref.enabled === "boolean" ? pref.enabled : true

        logger.debug("Updating push preference", {
          user_id: user.user_id,
          action: pref.action,
          action_type_id: actionTypeId,
          enabled,
          contractor_id: contractorId,
        })

        // Upsert preference within transaction
        const [updated] = await trx<PushNotificationPreference>(
          "push_notification_preferences",
        )
          .insert({
            user_id: user.user_id,
            action_type_id: String(actionTypeId),
            contractor_id: contractorId,
            enabled: enabled,
          })
          .onConflict(["user_id", "action_type_id", "contractor_id"])
          .merge({
            enabled: enabled,
            updated_at: new Date(),
          })
          .returning("*")

        if (updated) {
          results.push({
            action: pref.action,
            enabled: enabled,
            contractor_id: contractorId,
          })
        }
      }

      return results
    })

    logger.debug(`User updated push notification preferences`, {
      user_id: user.user_id,
      username: user.username,
      preferences_updated: updatedPreferences.length,
      preferences: updatedPreferences,
    })

    res.json(
      createResponse({
        message: `Successfully updated ${updatedPreferences.length} push notification preference${updatedPreferences.length !== 1 ? "s" : ""}`,
        preferences: updatedPreferences,
      }),
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Invalid action type")
    ) {
      res
        .status(400)
        .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, error.message))
      return
    }

    logger.error("Failed to update push preferences:", error)
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to update push preferences",
        ),
      )
  }
}
