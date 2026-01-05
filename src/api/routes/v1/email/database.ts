/**
 * Email notification preferences database operations.
 * This module contains all database queries for email_notification_preferences table.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"

/**
 * Get a Knex query builder instance.
 */
const knex = () => getKnex()

/**
 * Email notification preference record.
 */
export interface DBEmailNotificationPreference {
  preference_id: string
  user_id: string
  action_type_id: number
  enabled: boolean
  frequency: "immediate" | "daily" | "weekly"
  digest_time: string | null // TIME format (HH:MM:SS)
  created_at: Date
  updated_at: Date
}

/**
 * Get all email notification preferences for a user.
 * @param userId - User ID
 * @returns Array of preference records
 */
export async function getEmailPreferences(
  userId: string,
): Promise<DBEmailNotificationPreference[]> {
  return await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .where("user_id", userId)
    .orderBy("action_type_id", "asc")
}

/**
 * Get email preference for a specific user and notification type.
 * @param userId - User ID
 * @param actionTypeId - Notification action type ID
 * @returns Preference record or null if not found
 */
export async function getEmailPreference(
  userId: string,
  actionTypeId: number,
): Promise<DBEmailNotificationPreference | null> {
  const result = await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .where("user_id", userId)
    .where("action_type_id", actionTypeId)
    .first()

  return result || null
}

/**
 * Check if email notifications are enabled for a specific notification type.
 * @param userId - User ID
 * @param actionTypeId - Notification action type ID
 * @returns True if enabled, false if disabled or preference doesn't exist
 */
export async function isEmailEnabled(
  userId: string,
  actionTypeId: number,
): Promise<boolean> {
  const preference = await getEmailPreference(userId, actionTypeId)
  return preference?.enabled ?? false
}

/**
 * Create or update email notification preference.
 * @param userId - User ID
 * @param actionTypeId - Notification action type ID
 * @param enabled - Whether email notifications are enabled
 * @param frequency - Email frequency (default: 'immediate')
 * @param digestTime - Time for daily/weekly digests (optional)
 * @returns Created or updated preference record
 */
export async function upsertEmailPreference(
  userId: string,
  actionTypeId: number,
  enabled: boolean,
  frequency: "immediate" | "daily" | "weekly" = "immediate",
  digestTime: string | null = null,
): Promise<DBEmailNotificationPreference> {
  const [preference] = await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .insert({
      user_id: userId,
      action_type_id: actionTypeId,
      enabled: enabled,
      frequency: frequency,
      digest_time: digestTime,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflict(["user_id", "action_type_id"])
    .merge({
      enabled: enabled,
      frequency: frequency,
      digest_time: digestTime,
      updated_at: new Date(),
    })
    .returning("*")

  return preference
}

/**
 * Create multiple email notification preferences at once.
 * Used when user adds email and selects which types to enable.
 * @param userId - User ID
 * @param preferences - Array of preferences to create
 * @returns Array of created preference records
 */
export async function createEmailPreferences(
  userId: string,
  preferences: Array<{
    action_type_id: number
    enabled: boolean
    frequency?: "immediate" | "daily" | "weekly"
    digest_time?: string | null
  }>,
): Promise<DBEmailNotificationPreference[]> {
  if (preferences.length === 0) {
    return []
  }

  const insertData = preferences.map((pref) => ({
    user_id: userId,
    action_type_id: pref.action_type_id,
    enabled: pref.enabled,
    frequency: pref.frequency ?? "immediate",
    digest_time: pref.digest_time ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  }))

  return await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .insert(insertData)
    .returning("*")
}

/**
 * Update email notification preference.
 * @param preferenceId - Preference ID
 * @param updates - Fields to update
 * @returns Updated preference record or null if not found
 */
export async function updateEmailPreference(
  preferenceId: string,
  updates: Partial<
    Pick<DBEmailNotificationPreference, "enabled" | "frequency" | "digest_time">
  >,
): Promise<DBEmailNotificationPreference | null> {
  const updateData = {
    ...updates,
    updated_at: new Date(),
  }

  const [updated] = await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .where("preference_id", preferenceId)
    .update(updateData)
    .returning("*")

  return updated || null
}

/**
 * Delete email notification preference.
 * @param preferenceId - Preference ID
 * @returns True if deleted, false if not found
 */
export async function deleteEmailPreference(
  preferenceId: string,
): Promise<boolean> {
  const deleted = await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .where("preference_id", preferenceId)
    .delete()

  return deleted > 0
}

/**
 * Delete all email notification preferences for a user.
 * Used when user removes their email address.
 * @param userId - User ID
 * @returns Number of preferences deleted
 */
export async function deleteAllEmailPreferences(
  userId: string,
): Promise<number> {
  const deleted = await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .where("user_id", userId)
    .delete()

  return deleted
}

/**
 * Get all notification types that have email preferences enabled for a user.
 * @param userId - User ID
 * @returns Array of action type IDs that are enabled
 */
export async function getEnabledEmailNotificationTypes(
  userId: string,
): Promise<number[]> {
  const preferences = await knex()<DBEmailNotificationPreference>(
    "email_notification_preferences",
  )
    .where("user_id", userId)
    .where("enabled", true)
    .select("action_type_id")

  return preferences.map((p) => p.action_type_id)
}
