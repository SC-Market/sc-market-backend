// @ts-nocheck
import {
  Controller,
  Route,
  Get,
  Post,
  Patch,
  Delete,
  Path,
  Body,
  Security,
  Middlewares,
  Response,
  Request,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "./base.controller.js"
import {
  PushSubscriptionPayload,
  PushSubscriptionResponse,
  PushSubscriptionsResponse,
  PushPreferencesResponse,
  PushOperationResponse,
  UpdatePushPreferencePayload,
} from "../models/push.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  ServiceUnavailable,
} from "../models/common.models.js"
import { pushNotificationService } from "../../../../services/push-notifications/push-notification.service.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import { env } from "../../../../config/env.js"

/**
 * Push notifications controller for managing push subscriptions and preferences
 */
@Route("api/v1/push")
export class PushController extends BaseController {
  /**
   * Subscribe to push notifications
   * @summary Subscribe to push notifications
   * @param payload Push subscription payload
   */
  @Post("subscribe")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(201, "Created")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ServiceUnavailable>(503, "Service Unavailable")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async subscribe(
    @Body() payload: PushSubscriptionPayload,
    @Request() request?: ExpressRequest
  ): Promise<PushSubscriptionResponse> {
    const userId = this.getUserId(request!)

    // Check if push notifications are configured
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      throw {
        status: 503,
        message: "Push notifications are not configured on this server. Please contact support.",
      }
    }

    // Validate request body
    if (!payload.endpoint || !payload.keys || !payload.keys.p256dh || !payload.keys.auth) {
      throw {
        status: 400,
        message: "Invalid request body. Required fields: endpoint, keys.p256dh, keys.auth",
      }
    }

    try {
      const subscriptionId = await pushNotificationService.createSubscription(
        userId,
        {
          endpoint: payload.endpoint,
          keys: {
            p256dh: payload.keys.p256dh,
            auth: payload.keys.auth,
          },
          userAgent: payload.userAgent,
        }
      )

      this.logInfo("subscribe", `User subscribed to push notifications`, {
        userId,
        subscriptionId,
        endpoint: payload.endpoint.substring(0, 50) + "...",
        userAgent: payload.userAgent || "unknown",
      })

      return this.success({
        subscription_id: subscriptionId,
        message: "Successfully subscribed to push notifications",
      })
    } catch (error) {
      this.logError("subscribe", error)
      throw {
        status: 500,
        message: "Failed to create push subscription",
      }
    }
  }

  /**
   * Get all push subscriptions for the authenticated user
   * @summary Get push subscriptions
   */
  @Get("subscribe")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getSubscriptions(
    @Request() request?: ExpressRequest
  ): Promise<PushSubscriptionsResponse> {
    const userId = this.getUserId(request!)

    try {
      const subscriptions = await pushNotificationService.getUserSubscriptions(userId)

      this.logInfo("getSubscriptions", `Retrieved ${subscriptions.length} subscriptions`, {
        userId,
        count: subscriptions.length,
      })

      return this.success({
        subscriptions,
      })
    } catch (error) {
      this.logError("getSubscriptions", error)
      throw {
        status: 500,
        message: "Failed to get push subscriptions",
      }
    }
  }

  /**
   * Unsubscribe from push notifications
   * @summary Unsubscribe from push notifications
   * @param subscription_id Subscription ID
   */
  @Delete("subscribe/{subscription_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async unsubscribe(
    @Path() subscription_id: string,
    @Request() request?: ExpressRequest
  ): Promise<PushOperationResponse> {
    const userId = this.getUserId(request!)

    if (!subscription_id) {
      throw {
        status: 400,
        message: "subscription_id is required",
      }
    }

    try {
      await pushNotificationService.deleteSubscription(userId, subscription_id)

      this.logInfo("unsubscribe", `User unsubscribed from push notifications`, {
        userId,
        subscriptionId: subscription_id,
      })

      return this.success({
        message: "Successfully unsubscribed from push notifications",
      })
    } catch (error: any) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw {
          status: 404,
          message: "Subscription not found",
        }
      }

      if (error instanceof Error && error.message.includes("does not own")) {
        throw {
          status: 403,
          message: "You do not own this subscription",
        }
      }

      this.logError("unsubscribe", error)
      throw {
        status: 500,
        message: "Failed to delete push subscription",
      }
    }
  }

  /**
   * Get push notification preferences (grouped by individual and organizations)
   * @summary Get push notification preferences
   */
  @Get("preferences")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getPreferences(
    @Request() request?: ExpressRequest
  ): Promise<PushPreferencesResponse> {
    const userId = this.getUserId(request!)

    try {
      const { getPushPreferencesGrouped } = await import(
        "../../../../services/push-notifications/push-notification.database.js"
      )
      const groupedPreferences = await getPushPreferencesGrouped(userId)

      // Get all notification action types
      const { getAllNotificationActions } = await import("../routes/v1/notifications/database.js")
      const allActions = await getAllNotificationActions()

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
      const organizationPreferences = groupedPreferences.organizations.map((org: any) => {
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
      })

      return this.success({
        preferences: {
          individual: individualPreferences,
          organizations: organizationPreferences,
        },
      })
    } catch (error) {
      this.logError("getPreferences", error)
      throw {
        status: 500,
        message: "Failed to get push preferences",
      }
    }
  }

  /**
   * Update push notification preferences (supports single or batch updates)
   * @summary Update push notification preferences
   * @param payload Update payload (single or batch)
   */
  @Patch("preferences")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updatePreferences(
    @Body() payload: UpdatePushPreferencePayload,
    @Request() request?: ExpressRequest
  ): Promise<PushOperationResponse> {
    const userId = this.getUserId(request!)

    // Check if this is a batch update (has preferences array) or single update
    const isBatchUpdate = Array.isArray(payload.preferences)

    try {
      const { upsertPushPreference } = await import(
        "../../../../services/push-notifications/push-notification.database.js"
      )
      const { getAllNotificationActions } = await import("../routes/v1/notifications/database.js")

      // Get all notification actions to validate action names
      const allActions = await getAllNotificationActions()
      const actionMap = new Map(allActions.map((a) => [a.action, parseInt(a.action_type_id, 10)]))

      if (isBatchUpdate) {
        // Batch update
        if (!payload.preferences || payload.preferences.length === 0) {
          throw {
            status: 400,
            message: "preferences array is required and must not be empty",
          }
        }

        for (const pref of payload.preferences) {
          if (!pref.action || typeof pref.enabled !== "boolean") {
            throw {
              status: 400,
              message: "Each preference must have 'action' (string) and 'enabled' (boolean)",
            }
          }

          const actionTypeId = actionMap.get(pref.action)
          if (!actionTypeId) {
            throw {
              status: 400,
              message: `Invalid action: ${pref.action}`,
            }
          }

          await upsertPushPreference(
            userId,
            actionTypeId,
            pref.enabled,
            pref.contractor_id || null
          )
        }

        this.logInfo("updatePreferences", `Batch updated ${payload.preferences.length} preferences`, {
          userId,
          count: payload.preferences.length,
        })

        return this.success({
          message: `Successfully updated ${payload.preferences.length} preference(s)`,
        })
      } else {
        // Single update
        if (!payload.action || typeof payload.enabled !== "boolean") {
          throw {
            status: 400,
            message: "action (string) and enabled (boolean) are required",
          }
        }

        const actionTypeId = actionMap.get(payload.action)
        if (!actionTypeId) {
          throw {
            status: 400,
            message: `Invalid action: ${payload.action}`,
          }
        }

        await upsertPushPreference(
          userId,
          actionTypeId,
          payload.enabled,
          payload.contractor_id || null
        )

        this.logInfo("updatePreferences", `Updated preference for ${payload.action}`, {
          userId,
          action: payload.action,
          enabled: payload.enabled,
        })

        return this.success({
          message: "Preference updated successfully",
        })
      }
    } catch (error: any) {
      if (error.status) throw error
      this.logError("updatePreferences", error)
      throw {
        status: 500,
        message: "Failed to update push preferences",
      }
    }
  }
}
