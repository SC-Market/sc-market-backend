import { getKnex } from "../../clients/database/knex-db.js"
import { emailService } from "../email/email.service.js"
import { renderEmailTemplate } from "../email/template-engine.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

const DM_REMINDER_ACTION_TYPE_ID = 82
const UNREAD_THRESHOLD_HOURS = 24

interface UnreadDMUser {
  user_id: string
  username: string
  display_name: string
  email: string
  unread_count: number
}

/**
 * Process daily DM reminders for users who have unread messages older than 24h.
 * Respects email_notification_preferences for action_type_id 82 (dm_reminder).
 */
export async function processDmReminders(): Promise<void> {
  const knex = getKnex()

  const usersWithUnread: UnreadDMUser[] = await knex
    .select(
      "a.user_id",
      "a.username",
      "a.display_name",
      "ue.email",
      knex.raw("COUNT(n.notification_id) as unread_count"),
    )
    .from("notification as n")
    .join(
      "notification_object as no",
      "n.notification_object_id",
      "no.notification_object_id",
    )
    .join("notification_actions as na", "no.action_type_id", "na.action_type_id")
    .join("accounts as a", "n.notifier_id", "a.user_id")
    .join("user_emails as ue", function () {
      this.on("ue.user_id", "=", "a.user_id")
        .andOn("ue.email_verified", "=", knex.raw("true"))
        .andOn("ue.is_primary", "=", knex.raw("true"))
    })
    .join("email_notification_preferences as enp", function () {
      this.on("enp.user_id", "=", "a.user_id")
        .andOn(
          "enp.action_type_id",
          "=",
          knex.raw("?", [DM_REMINDER_ACTION_TYPE_ID]),
        )
        .andOn("enp.enabled", "=", knex.raw("true"))
    })
    .where("n.read", false)
    .whereIn("na.action", ["order_message", "offer_message"])
    .where(
      "no.timestamp",
      "<",
      knex.raw(`NOW() - INTERVAL '${UNREAD_THRESHOLD_HOURS} hours'`),
    )
    .whereNull("a.deleted_at")
    .where("a.is_tombstone", false)
    .groupBy("a.user_id", "a.username", "a.display_name", "ue.email")

  if (usersWithUnread.length === 0) {
    logger.debug("DM reminder: no users with unread messages past threshold")
    return
  }

  logger.info(`DM reminder: sending to ${usersWithUnread.length} users`)

  const baseUrl = env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"

  for (const user of usersWithUnread) {
    try {
      const templateData = {
        userName: user.username,
        userDisplayName: user.display_name || user.username,
        locale: "en",
        notificationType: "dm_reminder",
        notificationTitle: "You have unread messages",
        notificationBody: `You have ${user.unread_count} unread message${user.unread_count > 1 ? "s" : ""} waiting for you on SC Market.`,
        actionUrl: `${baseUrl}/messaging`,
        siteName: "SC Market",
        siteUrl: baseUrl,
        logoUrl: `${baseUrl}/scmarket-logo.png`,
        unsubscribeUrl: `${baseUrl}/settings?tab=email`,
        preferencesUrl: `${baseUrl}/settings?tab=email`,
        unreadCount: user.unread_count,
      }

      const html = await renderEmailTemplate(
        "notifications/dm-reminder",
        templateData,
        "html",
      )
      const text = await renderEmailTemplate(
        "notifications/dm-reminder",
        templateData,
        "txt",
      )

      await emailService.sendEmail({
        to: user.email,
        subject: `You have ${user.unread_count} unread message${user.unread_count > 1 ? "s" : ""} on SC Market`,
        html,
        text,
      })
    } catch (error) {
      logger.error("DM reminder: failed to send email", {
        userId: user.user_id,
        error,
      })
    }
  }
}
