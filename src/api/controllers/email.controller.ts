import {
  Controller,
  Route,
  Get,
  Post,
  Patch,
  Path,
  Query,
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
  NotificationTypesResponse,
  EmailPreferencesResponse,
  EmailOperationResponse,
  UpdateEmailPreferencePayload,
} from "../models/email.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
} from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
// @ts-expect-error - Module exists but not yet compiled
import { env } from "../../../config/env.js"

/**
 * Email controller for managing email preferences and notifications
 */
@Route("api/v1/email")
export class EmailController extends BaseController {
  /**
   * Get all available notification types for email preferences
   * @summary Get notification types
   */
  @Get("notification-types")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getNotificationTypes(
    @Request() request?: ExpressRequest
  ): Promise<NotificationTypesResponse> {
    try {
      const { getAllNotificationActions } = await import("../routes/v1/notifications/database.js")
      const allActions = await getAllNotificationActions()

      const notificationTypes = allActions.map((action) => ({
        action_type_id: parseInt(action.action_type_id, 10),
        action: action.action,
        entity: action.entity,
        description: null, // Description not available in DBNotificationActions
      }))

      return this.success({
        notificationTypes,
      })
    } catch (error) {
      this.logError("getNotificationTypes", error)
      throw {
        status: 500,
        message: "Failed to get notification types",
      }
    }
  }

  /**
   * Get email notification preferences (grouped by individual and organizations)
   * @summary Get email notification preferences
   */
  @Get("preferences")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getEmailPreferences(
    @Request() request?: ExpressRequest
  ): Promise<EmailPreferencesResponse> {
    const userId = this.getUserId(request!)

    try {
      const { getPrimaryEmail } = await import("../routes/v1/email/user-email-database.js")
      const { getEmailPreferencesGrouped } = await import("../routes/v1/email/database.js")
      const { getAllNotificationActions } = await import("../routes/v1/notifications/database.js")

      const userEmail = await getPrimaryEmail(userId)

      // Get all notification actions to include names
      const allActions = await getAllNotificationActions()

      const groupedPreferences = await getEmailPreferencesGrouped(userId)

      // Create a map of existing preferences by action_type_id for individual
      const individualPrefMap = new Map<number, boolean>()
      for (const pref of groupedPreferences.individual) {
        const actionTypeId = parseInt(String(pref.action_type_id), 10)
        individualPrefMap.set(actionTypeId, pref.enabled)
      }

      // Format individual preferences - include all actions with defaults
      const individualPreferences = allActions.map((action) => {
        const actionTypeId = parseInt(String(action.action_type_id), 10)
        return {
          action: action.action,
          enabled: individualPrefMap.get(actionTypeId) ?? false, // Default to disabled for email
        }
      })

      // Format organization preferences
      const organizationPreferences = groupedPreferences.organizations.map((org) => {
        // Create a map of existing preferences for this org
        const orgPrefMap = new Map<number, boolean>()
        for (const pref of org.preferences) {
          const actionTypeId = parseInt(String(pref.action_type_id), 10)
          orgPrefMap.set(actionTypeId, pref.enabled)
        }

        // Include all actions with defaults
        const orgPrefs = allActions.map((action) => {
          const actionTypeId = parseInt(action.action_type_id, 10)
          return {
            action: action.action,
            enabled: orgPrefMap.get(actionTypeId) ?? false, // Default to disabled for email
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
        email: userEmail
          ? {
              email_id: userEmail.email_id,
              email: userEmail.email,
              email_verified: userEmail.email_verified,
              is_primary: userEmail.is_primary,
            }
          : null,
      })
    } catch (error) {
      this.logError("getEmailPreferences", error)
      throw {
        status: 500,
        message: "Failed to get email preferences",
      }
    }
  }

  /**
   * Update email notification preferences (supports single or batch updates)
   * @summary Update email notification preferences
   * @param payload Update payload (single or batch)
   */
  @Patch("preferences")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateEmailPreferences(
    @Body() payload: UpdateEmailPreferencePayload,
    @Request() request?: ExpressRequest
  ): Promise<EmailOperationResponse> {
    const userId = this.getUserId(request!)

    // Check if this is a batch update (has preferences array) or single update
    const isBatchUpdate = Array.isArray(payload.preferences)

    try {
      const { upsertEmailPreference } = await import("../routes/v1/email/database.js")
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

          await upsertEmailPreference(
            userId,
            actionTypeId,
            pref.enabled,
            (pref.contractor_id || undefined) as "daily" | "immediate" | "weekly" | undefined
          )
        }

        this.logInfo("updateEmailPreferences", `Batch updated ${payload.preferences.length} preferences`, {
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

        await upsertEmailPreference(
          userId,
          actionTypeId,
          payload.enabled,
          (payload.contractor_id || undefined) as "daily" | "immediate" | "weekly" | undefined
        )

        this.logInfo("updateEmailPreferences", `Updated preference for ${payload.action}`, {
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
      this.logError("updateEmailPreferences", error)
      throw {
        status: 500,
        message: "Failed to update email preferences",
      }
    }
  }

  /**
   * Unsubscribe from email notifications via token (no auth required)
   * @summary Unsubscribe from email notifications
   * @param token Unsubscribe token
   * @param json Return JSON instead of redirecting
   */
  @Post("unsubscribe/{token}")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async unsubscribe(
    @Path() token: string,
    @Query() json?: boolean,
    @Request() request?: ExpressRequest
  ): Promise<EmailOperationResponse | void> {
    const returnJson = json === true

    if (!token) {
      if (returnJson) {
        throw {
          status: 400,
          message: "Unsubscribe token is required",
        }
      }
      const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
      // For TSOA, we need to handle redirects differently
      // This will be handled by the error handler middleware
      throw {
        status: 302,
        redirect: `${frontendUrl}/email/unsubscribe?error=invalid_token`,
      }
    }

    try {
      // Get unsubscribe token
      const unsubscribeTokenDb = await import("../routes/v1/email/unsubscribe-database.js")
      const tokenRecord = await unsubscribeTokenDb.getUnsubscribeToken(token)

      if (!tokenRecord) {
        if (returnJson) {
          throw {
            status: 400,
            message: "Invalid unsubscribe token",
          }
        }
        const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
        throw {
          status: 302,
          redirect: `${frontendUrl}/email/unsubscribe?error=invalid_token`,
        }
      }

      // Check if token was already used
      if (tokenRecord.used_at) {
        if (returnJson) {
          throw {
            status: 400,
            message: "This unsubscribe link has already been used",
          }
        }
        const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
        throw {
          status: 302,
          redirect: `${frontendUrl}/email/unsubscribe?error=already_used`,
        }
      }

      // Mark token as used
      await unsubscribeTokenDb.markUnsubscribeTokenAsUsed(tokenRecord)

      // Disable all email preferences for this user
      const emailPreferenceDb = await import("../routes/v1/email/database.js")
      const preferences = await emailPreferenceDb.getEmailPreferences(tokenRecord.user_id)

      // Count how many were enabled before disabling
      const enabledCount = preferences.filter((p) => p.enabled).length

      // Disable all preferences (even if already disabled, to ensure consistency)
      const updatePromises = preferences.map((pref) =>
        emailPreferenceDb.updateEmailPreference(pref.preference_id, {
          enabled: false,
        })
      )
      await Promise.all(updatePromises)

      this.logInfo("unsubscribe", `Disabled all email preferences for user`, {
        userId: tokenRecord.user_id,
        email: tokenRecord.email,
        totalPreferences: preferences.length,
        previouslyEnabledCount: enabledCount,
      })

      if (returnJson) {
        return this.success({
          message: "Successfully unsubscribed from email notifications",
        })
      }

      // Redirect to frontend with success
      const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
      throw {
        status: 302,
        redirect: `${frontendUrl}/email/unsubscribe?success=true`,
      }
    } catch (error: any) {
      if (error.status) throw error
      this.logError("unsubscribe", error, { token })
      if (returnJson) {
        throw {
          status: 500,
          message: "Failed to process unsubscribe",
        }
      }
      const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
      throw {
        status: 302,
        redirect: `${frontendUrl}/email/unsubscribe?error=unsubscribe_failed`,
      }
    }
  }
}
