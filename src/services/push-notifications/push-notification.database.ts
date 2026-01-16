/**
 * Push notification database operations.
 * This module contains all database queries for push subscriptions and preferences.
 */

import { getKnex } from "../../clients/database/knex-db.js"
import {
  PushSubscription,
  PushNotificationPreference,
} from "./push-notification.service.types.js"

/**
 * Get a Knex query builder instance.
 */
const knex = () => getKnex()

/**
 * Insert a push subscription.
 */
export async function insertPushSubscription(data: {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent?: string | null
}): Promise<PushSubscription[]> {
  return knex()<PushSubscription>("push_subscriptions")
    .insert({
      user_id: data.user_id,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: data.user_agent || null,
    })
    .onConflict(["user_id", "endpoint"])
    .merge({
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: data.user_agent || null,
      updated_at: knex().fn.now(),
    })
    .returning("*")
}

/**
 * Get push subscriptions for a user.
 */
export async function getPushSubscriptions(
  userId: string,
): Promise<PushSubscription[]> {
  return knex()<PushSubscription>("push_subscriptions")
    .where({ user_id: userId })
    .select("*")
    .orderBy("created_at", "desc")
}

/**
 * Get push subscription by ID.
 */
export async function getPushSubscription(
  subscriptionId: string,
): Promise<PushSubscription | null> {
  const result = await knex()<PushSubscription>("push_subscriptions")
    .where({ subscription_id: subscriptionId })
    .first()

  return result || null
}

/**
 * Delete a push subscription.
 */
export async function deletePushSubscription(
  subscriptionId: string,
): Promise<number> {
  return knex()<PushSubscription>("push_subscriptions")
    .where({ subscription_id: subscriptionId })
    .delete()
}

/**
 * Delete push subscriptions for a user.
 */
export async function deletePushSubscriptionsByUser(
  userId: string,
): Promise<number> {
  return knex()<PushSubscription>("push_subscriptions")
    .where({ user_id: userId })
    .delete()
}

/**
 * Delete push subscription by endpoint.
 */
export async function deletePushSubscriptionByEndpoint(
  endpoint: string,
): Promise<number> {
  return knex()<PushSubscription>("push_subscriptions")
    .where({ endpoint })
    .delete()
}

/**
 * Insert or update a push notification preference.
 * Note: action_type_id is stored as INTEGER in database, but Knex returns it as string
 */
export async function upsertPushPreference(data: {
  user_id: string
  action_type_id: string | number // Accept both, convert to string for consistency
  enabled: boolean
  contractor_id?: string | null // Optional contractor ID (null for individual preferences)
}): Promise<PushNotificationPreference[]> {
  return knex()<PushNotificationPreference>("push_notification_preferences")
    .insert({
      user_id: data.user_id,
      action_type_id: String(data.action_type_id), // Convert to string for Knex
      contractor_id: data.contractor_id ?? null,
      enabled: data.enabled,
    })
    .onConflict(["user_id", "action_type_id", "contractor_id"])
    .merge({
      enabled: data.enabled,
      updated_at: knex().fn.now(),
    })
    .returning("*")
}

/**
 * Get push notification preferences for a user.
 */
export async function getPushPreferences(
  userId: string,
): Promise<PushNotificationPreference[]> {
  return knex()<PushNotificationPreference>("push_notification_preferences")
    .where({ user_id: userId })
    .orderBy("contractor_id", "asc")
    .orderBy("action_type_id", "asc")
    .select("*")
}

/**
 * Get push preferences grouped by contractor_id (individual and organizations).
 * @param userId - User ID
 * @returns Object with individual preferences and organization preferences
 */
export async function getPushPreferencesGrouped(userId: string): Promise<{
  individual: PushNotificationPreference[]
  organizations: Array<{
    contractor_id: string
    preferences: PushNotificationPreference[]
  }>
}> {
  const allPreferences = await getPushPreferences(userId)

  const individual = allPreferences.filter((p) => p.contractor_id === null)
  const orgPreferences = allPreferences.filter((p) => p.contractor_id !== null)

  // Group by contractor_id
  const orgMap = new Map<string, PushNotificationPreference[]>()
  for (const pref of orgPreferences) {
    if (pref.contractor_id) {
      if (!orgMap.has(pref.contractor_id)) {
        orgMap.set(pref.contractor_id, [])
      }
      orgMap.get(pref.contractor_id)!.push(pref)
    }
  }

  const organizations = Array.from(orgMap.entries()).map(
    ([contractor_id, preferences]) => ({
      contractor_id,
      preferences,
    }),
  )

  return {
    individual,
    organizations,
  }
}

/**
 * Get push notification preference for a user and action type.
 */
export async function getPushPreference(
  userId: string,
  actionTypeId: string | number, // Accept both, convert to string for query
  contractorId: string | null = null,
): Promise<PushNotificationPreference | null> {
  const query = knex()<PushNotificationPreference>(
    "push_notification_preferences",
  ).where({
    user_id: userId,
    action_type_id: String(actionTypeId), // Convert to string for query
  })

  if (contractorId === null) {
    query.whereNull("contractor_id")
  } else {
    query.where("contractor_id", contractorId)
  }

  const result = await query.first()

  return result || null
}

/**
 * Get push preferences for a specific contractor/organization.
 * @param userId - User ID
 * @param contractorId - Contractor ID
 * @returns Array of preference records for the contractor
 */
export async function getPushPreferencesByContractor(
  userId: string,
  contractorId: string,
): Promise<PushNotificationPreference[]> {
  return knex()<PushNotificationPreference>("push_notification_preferences")
    .where({ user_id: userId, contractor_id: contractorId })
    .orderBy("action_type_id", "asc")
    .select("*")
}

/**
 * Get all push subscriptions (for cleanup operations).
 */
export async function getAllPushSubscriptions(): Promise<PushSubscription[]> {
  return knex()<PushSubscription>("push_subscriptions").select("*")
}
