/**
 * Per-user, per-action notification channel preferences, and the single
 * dispatch call that applies them.
 *
 * Storage reuses the existing preference tables where they exist:
 * - push:    push_notification_preferences   (per action type)
 * - email:   email_notification_preferences  (per action type)
 * - site:    notification_channel_preferences (channel = 'site')
 * - discord: notification_channel_preferences (channel = 'discord')
 *
 * Only individual preferences (contractor_id NULL) are read or written here.
 */

import { getKnex } from "../../clients/database/knex-db.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import * as emailPreferenceDb from "../../api/routes/v1/email/database.js"
import * as pushNotificationDb from "../push-notifications/push-notification.database.js"
import logger from "../../logger/logger.js"

export const NOTIFICATION_CHANNELS = ["site", "push", "email", "discord"] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]
export type ChannelPreferences = Record<NotificationChannel, boolean>

/**
 * Value used when the user never set a preference. These follow the existing
 * system: site notifications are always created, push is opt-out
 * (`sendPushNotification` treats a missing row as enabled), email is opt-in
 * (`isEmailEnabled` treats a missing row as disabled), and Discord DMs are
 * opt-out (watchlist alerts always DMed before this setting existed).
 */
export const CHANNEL_DEFAULTS: ChannelPreferences = {
  site: true,
  push: true,
  email: false,
  discord: true,
}

/** Channels without a dedicated table, stored in notification_channel_preferences. */
const GENERIC_TABLE_CHANNELS = ["site", "discord"] as const

async function actionTypeId(action: string): Promise<number> {
  const row = await notificationDb.getNotificationActionByName(action)
  if (!row) throw new Error(`Unknown notification action: ${action}`)
  return Number(row.action_type_id)
}

export async function getChannelPreferences(
  userId: string,
  action: string,
): Promise<ChannelPreferences> {
  const id = await actionTypeId(action)
  const [push, email, rows] = await Promise.all([
    pushNotificationDb.getPushPreference(userId, id, null),
    emailPreferenceDb.getEmailPreference(userId, id, null),
    getKnex()("notification_channel_preferences")
      .where({ user_id: userId, action_type_id: id })
      .select("channel", "enabled") as Promise<Array<{ channel: string; enabled: boolean }>>,
  ])
  const generic = (channel: string): boolean | undefined =>
    rows.find((r) => r.channel === channel)?.enabled

  return {
    site: generic("site") ?? CHANNEL_DEFAULTS.site,
    push: push?.enabled ?? CHANNEL_DEFAULTS.push,
    email: email?.enabled ?? CHANNEL_DEFAULTS.email,
    discord: generic("discord") ?? CHANNEL_DEFAULTS.discord,
  }
}

/**
 * Write an individual (contractor_id NULL) row in a per-action preference
 * table. Update first: the tables' unique constraint treats NULL contractor ids
 * as distinct, so a plain upsert would add a duplicate row on every toggle.
 */
async function writeIndividualPreference(
  table: "push_notification_preferences" | "email_notification_preferences",
  userId: string,
  actionTypeId: number,
  enabled: boolean,
): Promise<void> {
  const db = getKnex()
  const updated = await db(table)
    .where({ user_id: userId, action_type_id: actionTypeId })
    .whereNull("contractor_id")
    .update({ enabled, updated_at: new Date() })
  if (!updated) {
    await db(table).insert({
      user_id: userId,
      action_type_id: actionTypeId,
      contractor_id: null,
      enabled,
    })
  }
}

export async function setChannelPreferences(
  userId: string,
  action: string,
  updates: Partial<ChannelPreferences>,
): Promise<ChannelPreferences> {
  const id = await actionTypeId(action)

  if (updates.push !== undefined) {
    await writeIndividualPreference("push_notification_preferences", userId, id, updates.push)
  }
  if (updates.email !== undefined) {
    await writeIndividualPreference("email_notification_preferences", userId, id, updates.email)
  }
  for (const channel of GENERIC_TABLE_CHANNELS) {
    const enabled = updates[channel]
    if (enabled === undefined) continue
    await getKnex()("notification_channel_preferences")
      .insert({ user_id: userId, action_type_id: id, channel, enabled, updated_at: new Date() })
      .onConflict(["user_id", "action_type_id", "channel"])
      .merge({ enabled, updated_at: new Date() })
  }

  return getChannelPreferences(userId, action)
}

/** One sender per channel; each delivers the same alert over its channel. */
export type ChannelSenders = Record<NotificationChannel, () => Promise<void>>

/**
 * Deliver one notification to one user over every channel they have enabled
 * for `action`. A failing channel is logged and does not stop the others.
 * Returns the channels that delivered.
 */
export async function dispatchNotification(
  userId: string,
  action: string,
  senders: ChannelSenders,
): Promise<NotificationChannel[]> {
  const prefs = await getChannelPreferences(userId, action)
  const delivered: NotificationChannel[] = []

  for (const channel of NOTIFICATION_CHANNELS) {
    if (!prefs[channel]) continue
    try {
      await senders[channel]()
      delivered.push(channel)
    } catch (err) {
      logger.warn("Notification channel failed", {
        user_id: userId,
        action,
        channel,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return delivered
}
