/**
 * Email management API controllers
 */

import { RequestHandler } from "express"
import { User } from "../api-models.js"
import { emailService } from "../../../../services/email/email.service.js"
import * as userEmailDb from "./user-email-database.js"
import * as emailPreferenceDb from "./database.js"
import * as emailVerificationDb from "./verification-database.js"
import * as notificationDb from "../notifications/database.js"
import * as contractorDb from "../contractors/database.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"
import { env } from "../../../../config/env.js"

/**
 * POST /api/v1/profile/email
 * Add email address with notification preferences
 */
export const addEmail: RequestHandler = async (req, res) => {
  const user = req.user as User
  const { email, notificationTypeIds } = req.body as {
    email?: string
    notificationTypeIds?: number[]
  }

  // Validate request body
  if (!email) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Email address is required",
        ),
      )
    return
  }

  // Validate email format
  if (!emailService.validateEmail(email)) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Invalid email address format",
        ),
      )
    return
  }

  // Check if user already has an email
  const existingUserEmail = await userEmailDb.getPrimaryEmail(user.user_id)
  if (existingUserEmail) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "You already have an email address. Use PATCH to update it.",
        ),
      )
    return
  }

  // Check if email already exists (globally - any user)
  const existingEmail = await userEmailDb.getUserEmailByAddress(email)
  if (existingEmail) {
    res
      .status(409)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "This email address is already in use",
        ),
      )
    return
  }

  let userEmail: Awaited<
    ReturnType<typeof userEmailDb.createUserEmail>
  > | null = null

  try {
    // Create user email (will be primary since it's the first)
    userEmail = await userEmailDb.createUserEmail(user.user_id, email, true)

    // Create email preferences for selected notification types
    let preferencesCreated = 0
    if (notificationTypeIds && notificationTypeIds.length > 0) {
      // Validate that all action type IDs exist
      const allActions = await notificationDb.getAllNotificationActions()
      const validActionIds = allActions.map((a) =>
        parseInt(a.action_type_id, 10),
      )

      const validTypeIds = notificationTypeIds.filter((id) =>
        validActionIds.includes(id),
      )

      if (validTypeIds.length > 0) {
        // Use upsert to handle case where preferences might already exist
        // (e.g., if user previously had an email and deleted it, preferences may still exist)
        const preferencePromises = validTypeIds.map((actionTypeId) =>
          emailPreferenceDb.upsertEmailPreference(
            user.user_id,
            actionTypeId,
            true, // enabled
            "immediate", // frequency
            null, // digest_time
          ),
        )
        await Promise.all(preferencePromises)
        preferencesCreated = validTypeIds.length
      }
    }

    // Send verification email (this can fail, but email is already created)
    // If this fails, we still return success since email was added
    try {
      await emailService.sendVerificationEmail(user.user_id, email)
    } catch (emailError) {
      logger.warn("Failed to send verification email after adding email", {
        error: emailError,
        user_id: user.user_id,
        email,
        email_id: userEmail.email_id,
      })
      // Continue - email was added successfully, verification can be resent
    }

    logger.info("User email added successfully", {
      user_id: user.user_id,
      email_id: userEmail.email_id,
      email: email,
      preferences_created: preferencesCreated,
    })

    res.status(201).json(
      createResponse({
        email_id: userEmail.email_id,
        email: userEmail.email,
        email_verified: userEmail.email_verified,
        preferences_created: preferencesCreated,
        message: "Email address added. Please check your email to verify.",
      }),
    )
  } catch (error: any) {
    // If email was created but something else failed, clean up the email
    if (userEmail?.email_id) {
      try {
        await userEmailDb.deleteUserEmail(userEmail.email_id)
        logger.info("Cleaned up email after failed add", {
          user_id: user.user_id,
          email_id: userEmail.email_id,
          email,
        })
      } catch (cleanupError) {
        logger.error("Failed to clean up email after error", {
          cleanupError,
          user_id: user.user_id,
          email_id: userEmail.email_id,
          email,
          originalError: error,
        })
      }
    }

    // Check if error is a duplicate key violation (shouldn't happen with upsert, but handle gracefully)
    if (error?.code === "23505" || error?.message?.includes("duplicate key")) {
      logger.error("Duplicate key error when adding email preferences", {
        error,
        user_id: user.user_id,
        email,
      })
      res
        .status(409)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Email preferences conflict. Please try again.",
          ),
        )
      return
    }

    logger.error("Failed to add email address", {
      error,
      user_id: user.user_id,
      email,
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to add email address",
        ),
      )
  }
}

/**
 * PATCH /api/v1/profile/email
 * Update email address (requires re-verification)
 */
export const updateEmail: RequestHandler = async (req, res) => {
  const user = req.user as User
  const { email } = req.body as { email?: string }

  // Validate request body
  if (!email) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Email address is required",
        ),
      )
    return
  }

  // Validate email format
  if (!emailService.validateEmail(email)) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Invalid email address format",
        ),
      )
    return
  }

  // Get current email
  const currentEmail = await userEmailDb.getPrimaryEmail(user.user_id)
  if (!currentEmail) {
    res
      .status(404)
      .json(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          "No email address found. Use POST to add one.",
        ),
      )
    return
  }

  // Check if new email already exists
  const existingEmail = await userEmailDb.getUserEmailByAddress(email)
  if (existingEmail && existingEmail.user_id !== user.user_id) {
    res
      .status(409)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "This email address is already in use",
        ),
      )
    return
  }

  try {
    // If email is the same, just resend verification
    if (currentEmail.email === email) {
      await emailService.sendVerificationEmail(user.user_id, email)
      res.json(
        createResponse({
          message: "Verification email sent",
        }),
      )
      return
    }

    // Update email address (will require re-verification)
    const updatedEmail = await userEmailDb.updateUserEmail(
      currentEmail.email_id,
      {
        email: email,
        email_verified: false,
        verified_at: null,
      },
    )

    if (!updatedEmail) {
      throw new Error("Failed to update email address")
    }

    // Invalidate old verification tokens
    await emailVerificationDb.invalidateEmailTokens(currentEmail.email_id)

    // Send verification email to new address
    await emailService.sendVerificationEmail(user.user_id, email)

    // Optionally send notification to old email if it was verified
    if (currentEmail.email_verified) {
      // TODO: Send "email changed" notification to old email
    }

    logger.info("User email updated successfully", {
      user_id: user.user_id,
      email_id: updatedEmail.email_id,
      old_email: currentEmail.email,
      new_email: email,
    })

    res.json(
      createResponse({
        email_id: updatedEmail.email_id,
        email: updatedEmail.email,
        email_verified: updatedEmail.email_verified,
        message: "Email address updated. Please verify your new email address.",
      }),
    )
  } catch (error) {
    logger.error("Failed to update email address", {
      error,
      user_id: user.user_id,
      email,
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to update email address",
        ),
      )
  }
}

/**
 * DELETE /api/v1/profile/email
 * Remove email address
 */
export const deleteEmail: RequestHandler = async (req, res) => {
  const user = req.user as User

  try {
    const userEmail = await userEmailDb.getPrimaryEmail(user.user_id)
    if (!userEmail) {
      res
        .status(404)
        .json(
          createErrorResponse(ErrorCode.NOT_FOUND, "No email address found"),
        )
      return
    }

    // Delete email (will also delete preferences via CASCADE)
    await userEmailDb.deleteUserEmail(userEmail.email_id)

    logger.info("User email deleted successfully", {
      user_id: user.user_id,
      email_id: userEmail.email_id,
    })

    res.json(
      createResponse({
        message: "Email address removed successfully",
      }),
    )
  } catch (error) {
    logger.error("Failed to delete email address", {
      error,
      user_id: user.user_id,
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to delete email address",
        ),
      )
  }
}

/**
 * POST /api/v1/profile/email/verify
 * Request verification email
 */
export const requestVerification: RequestHandler = async (req, res) => {
  const user = req.user as User

  try {
    const userEmail = await userEmailDb.getPrimaryEmail(user.user_id)
    if (!userEmail) {
      res
        .status(404)
        .json(
          createErrorResponse(ErrorCode.NOT_FOUND, "No email address found"),
        )
      return
    }

    if (userEmail.email_verified) {
      res.json(
        createResponse({
          message: "Email address is already verified",
        }),
      )
      return
    }

    // Send verification email
    await emailService.sendVerificationEmail(user.user_id, userEmail.email)

    logger.info("Verification email requested", {
      user_id: user.user_id,
      email: userEmail.email,
    })

    res.json(
      createResponse({
        message: "Verification email sent. Please check your inbox.",
      }),
    )
  } catch (error) {
    logger.error("Failed to send verification email", {
      error,
      user_id: user.user_id,
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to send verification email",
        ),
      )
  }
}

/**
 * GET /api/profile/email/verify/:token
 * Verify email address (redirects to frontend)
 * Also supports ?json=true query param to return JSON instead of redirecting
 */
export const verifyEmail: RequestHandler = async (req, res) => {
  const { token } = req.params
  const returnJson = req.query.json === "true"

  if (!token) {
    if (returnJson) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Invalid or expired verification token",
          ),
        )
      return
    }
    const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
    res.redirect(`${frontendUrl}/email/verify?error=invalid_token`)
    return
  }

  try {
    const result = await emailService.verifyEmail(token)

    if (!result) {
      if (returnJson) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Invalid or expired verification token",
            ),
          )
        return
      }
      const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
      res.redirect(`${frontendUrl}/email/verify?error=invalid_token`)
      return
    }

    logger.info("Email verified via token", {
      user_id: result.userId,
      email: result.email,
    })

    if (returnJson) {
      res.json(
        createResponse({
          success: true,
          message: "Email verified successfully",
          userId: result.userId,
          email: result.email,
        }),
      )
      return
    }

    // Redirect to frontend with success
    const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
    res.redirect(`${frontendUrl}/email/verify?success=true`)
  } catch (error) {
    logger.error("Failed to verify email", { error, token })
    if (returnJson) {
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Email verification failed",
          ),
        )
      return
    }
    const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
    res.redirect(`${frontendUrl}/email/verify?error=verification_failed`)
  }
}

/**
 * GET /api/email/notification-types
 * Get all available notification types for email preferences
 */
export const getNotificationTypes: RequestHandler = async (req, res) => {
  try {
    const allActions = await notificationDb.getAllNotificationActions()

    const notificationTypes = allActions.map((action) => ({
      action_type_id: parseInt(action.action_type_id, 10),
      action: action.action,
      entity: action.entity,
      description: null, // Description not available in DBNotificationActions
    }))

    res.json(
      createResponse({
        notificationTypes,
      }),
    )
  } catch (error) {
    logger.error("Failed to get notification types", {
      error,
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to get notification types",
        ),
      )
  }
}

/**
 * GET /api/email/preferences
 * Get email notification preferences (grouped by individual and organizations)
 */
export const getEmailPreferences: RequestHandler = async (req, res) => {
  const user = req.user as User

  try {
    const groupedPreferences =
      await emailPreferenceDb.getEmailPreferencesGrouped(user.user_id)

    // Get user's email information
    const userEmail = await userEmailDb.getPrimaryEmail(user.user_id)

    // Get all notification actions to include names
    const allActions = await notificationDb.getAllNotificationActions()
    const actionMap = new Map(
      allActions.map((a) => [parseInt(a.action_type_id, 10), a]),
    )

    // Create a map of existing individual preferences by action_type_id
    const individualPrefMap = new Map<
      number,
      {
        preference_id: string
        enabled: boolean
        frequency: "immediate" | "daily" | "weekly"
        digest_time: string | null
        created_at: Date
        updated_at: Date
      }
    >()
    for (const pref of groupedPreferences.individual) {
      individualPrefMap.set(pref.action_type_id, {
        preference_id: pref.preference_id,
        enabled: pref.enabled,
        frequency: pref.frequency,
        digest_time: pref.digest_time,
        created_at: pref.created_at,
        updated_at: pref.updated_at,
      })
    }

    // Format individual preferences - include all actions with defaults
    const individualPreferences = allActions.map((action) => {
      const actionTypeId = parseInt(action.action_type_id, 10)
      const existingPref = individualPrefMap.get(actionTypeId)
      return {
        preference_id: existingPref?.preference_id || "",
        action_type_id: actionTypeId,
        action_name: action.action,
        enabled: existingPref?.enabled ?? false, // Default to disabled for email (opt-in)
        frequency: existingPref?.frequency || "immediate",
        digest_time: existingPref?.digest_time || null,
        created_at: existingPref?.created_at?.toISOString() || "",
        updated_at: existingPref?.updated_at?.toISOString() || "",
      }
    })

    // Format organization preferences
    const organizationPreferences = groupedPreferences.organizations.map(
      (org) => {
        // Create a map of existing preferences for this org
        const orgPrefMap = new Map<
          number,
          {
            preference_id: string
            enabled: boolean
            frequency: "immediate" | "daily" | "weekly"
            digest_time: string | null
            created_at: Date
            updated_at: Date
          }
        >()
        for (const pref of org.preferences) {
          orgPrefMap.set(pref.action_type_id, {
            preference_id: pref.preference_id,
            enabled: pref.enabled,
            frequency: pref.frequency,
            digest_time: pref.digest_time,
            created_at: pref.created_at,
            updated_at: pref.updated_at,
          })
        }

        // Include all actions with defaults
        const orgPrefs = allActions.map((action) => {
          const actionTypeId = parseInt(action.action_type_id, 10)
          const existingPref = orgPrefMap.get(actionTypeId)
          return {
            preference_id: existingPref?.preference_id || "",
            action_type_id: actionTypeId,
            action_name: action.action,
            enabled: existingPref?.enabled ?? false, // Default to disabled for email (opt-in)
            frequency: existingPref?.frequency || "immediate",
            digest_time: existingPref?.digest_time || null,
            created_at: existingPref?.created_at?.toISOString() || "",
            updated_at: existingPref?.updated_at?.toISOString() || "",
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
        email: userEmail
          ? {
              email_id: userEmail.email_id,
              email: userEmail.email,
              email_verified: userEmail.email_verified,
              is_primary: userEmail.is_primary,
            }
          : null,
      }),
    )
  } catch (error) {
    logger.error("Failed to get email preferences", {
      error,
      user_id: user.user_id,
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to get email preferences",
        ),
      )
  }
}

/**
 * PATCH /api/v1/email/preferences
 * Update email notification preferences
 */
export const updateEmailPreferences: RequestHandler = async (req, res) => {
  const user = req.user as User
  const { preferences } = req.body as {
    preferences?: Array<{
      action_type_id: number
      enabled?: boolean
      frequency?: "immediate" | "daily" | "weekly"
      digest_time?: string | null
      contractor_id?: string | null // Optional: null for individual, UUID for org
    }>
  }

  if (!preferences || !Array.isArray(preferences)) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Preferences array is required",
        ),
      )
    return
  }

  try {
    const updatedPreferences = []

    for (const pref of preferences) {
      if (typeof pref.action_type_id !== "number" || pref.action_type_id <= 0) {
        continue // Skip invalid action type IDs
      }

      // Validate action type exists
      const allActions = await notificationDb.getAllNotificationActions()
      const actionExists = allActions.some(
        (a) => parseInt(a.action_type_id, 10) === pref.action_type_id,
      )

      if (!actionExists) {
        logger.warn("Invalid action_type_id in preference update", {
          user_id: user.user_id,
          action_type_id: pref.action_type_id,
        })
        continue
      }

      // Validate contractor_id if provided
      let contractorId: string | null = pref.contractor_id ?? null
      if (contractorId !== null) {
        // Verify user is a member of this contractor
        const isMember = await contractorDb.isUserContractorMember(
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

      // Upsert preference
      const updated = await emailPreferenceDb.upsertEmailPreference(
        user.user_id,
        pref.action_type_id,
        pref.enabled ?? true,
        pref.frequency ?? "immediate",
        pref.digest_time ?? null,
        contractorId,
      )

      updatedPreferences.push(updated)
    }

    logger.info("Email preferences updated", {
      user_id: user.user_id,
      preferences_updated: updatedPreferences.length,
    })

    res.json(
      createResponse({
        preferences: updatedPreferences,
        message: "Preferences updated successfully",
      }),
    )
  } catch (error) {
    logger.error("Failed to update email preferences", {
      error,
      user_id: user.user_id,
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to update email preferences",
        ),
      )
  }
}

/**
 * POST /api/email/unsubscribe/:token
 * Unsubscribe from email notifications via token (no auth required)
 * Also supports ?json=true query param to return JSON instead of redirecting
 */
export const unsubscribe: RequestHandler = async (req, res) => {
  const { token } = req.params
  const returnJson = req.query.json === "true"

  if (!token) {
    if (returnJson) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Unsubscribe token is required",
          ),
        )
      return
    }
    const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
    res.redirect(`${frontendUrl}/email/unsubscribe?error=invalid_token`)
    return
  }

  try {
    // Get unsubscribe token
    const unsubscribeTokenDb = await import("./unsubscribe-database.js")
    const tokenRecord = await unsubscribeTokenDb.getUnsubscribeToken(token)

    if (!tokenRecord) {
      if (returnJson) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Invalid unsubscribe token",
            ),
          )
        return
      }
      const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
      res.redirect(`${frontendUrl}/email/unsubscribe?error=invalid_token`)
      return
    }

    // Check if token was already used
    if (tokenRecord.used_at) {
      if (returnJson) {
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "This unsubscribe link has already been used",
            ),
          )
        return
      }
      const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
      res.redirect(`${frontendUrl}/email/unsubscribe?error=already_used`)
      return
    }

    // Mark token as used
    await unsubscribeTokenDb.markUnsubscribeTokenAsUsed(tokenRecord)

    // Disable all email preferences for this user
    const preferences = await emailPreferenceDb.getEmailPreferences(
      tokenRecord.user_id,
    )

    // Count how many were enabled before disabling
    const enabledCount = preferences.filter((p) => p.enabled).length

    // Disable all preferences (even if already disabled, to ensure consistency)
    const updatePromises = preferences.map((pref) =>
      emailPreferenceDb.updateEmailPreference(pref.preference_id, {
        enabled: false,
      }),
    )
    await Promise.all(updatePromises)

    logger.info("Disabled all email preferences for user", {
      user_id: tokenRecord.user_id,
      email: tokenRecord.email,
      total_preferences: preferences.length,
      previously_enabled_count: enabledCount,
    })

    logger.info("User unsubscribed from email notifications", {
      user_id: tokenRecord.user_id,
      email: tokenRecord.email,
    })

    if (returnJson) {
      res.json(
        createResponse({
          success: true,
          message: "Successfully unsubscribed from email notifications",
          userId: tokenRecord.user_id,
          email: tokenRecord.email,
        }),
      )
      return
    }

    // Redirect to frontend with success
    const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
    res.redirect(`${frontendUrl}/email/unsubscribe?success=true`)
  } catch (error) {
    logger.error("Failed to process unsubscribe", { error, token })
    if (returnJson) {
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to process unsubscribe",
          ),
        )
      return
    }
    const frontendUrl = env.FRONTEND_URL || "https://sc-market.space"
    res.redirect(`${frontendUrl}/email/unsubscribe?error=unsubscribe_failed`)
  }
}
