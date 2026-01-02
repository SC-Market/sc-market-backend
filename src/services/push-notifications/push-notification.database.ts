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
}): Promise<PushNotificationPreference[]> {
  return knex()<PushNotificationPreference>("push_notification_preferences")
    .insert({
      user_id: data.user_id,
      action_type_id: String(data.action_type_id), // Convert to string for Knex
      enabled: data.enabled,
    })
    .onConflict(["user_id", "action_type_id"])
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
    .select("*")
}

/**
 * Get push notification preference for a user and action type.
 */
export async function getPushPreference(
  userId: string,
  actionTypeId: string | number, // Accept both, convert to string for query
): Promise<PushNotificationPreference | null> {
  const result = await knex()<PushNotificationPreference>(
    "push_notification_preferences",
  )
    .where({
      user_id: userId,
      action_type_id: String(actionTypeId), // Convert to string for query
    })
    .first()

  return result || null
}

/**
 * Get all push subscriptions (for cleanup operations).
 */
export async function getAllPushSubscriptions(): Promise<PushSubscription[]> {
  return knex()<PushSubscription>("push_subscriptions").select("*")
}
