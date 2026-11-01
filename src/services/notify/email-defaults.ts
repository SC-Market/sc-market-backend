/**
 * Email defaults for a newly set email address (owner decision 2026-11-01:
 * "if a user sets an email, email notifications are ON by default for key
 * things").
 *
 * Email stays opt-in in the catalog (a missing email_notification_preferences
 * row = off), so nothing changes for users who already have an email. When a
 * user adds an email without picking notification types (the onboarding page
 * and the settings dialog with nothing ticked), the key events below get a
 * Personal (contractor_id NULL) row with enabled = true. They are sent once
 * the address is verified: the email queue and the DM reminder job only mail
 * a verified primary address.
 *
 * - An existing Personal row for the action (on or off) is the user's choice
 *   and is left alone; only missing rows are written.
 * - Org rows are not written: org-side notifications (an org's orders and
 *   offers to its members) stay opt-in per org.
 * - Security and account notices need no row: the "account" and
 *   "announcements" categories are mandatory (catalog.ts).
 */
import { getKnex } from "../../clients/database/knex-db.js"
import { OFFER_ACTIONS, ORDER_STATUS_ACTIONS } from "./catalog.js"

/** notification_actions.action of each key event (catalog legacyAction). */
export const KEY_EMAIL_ACTIONS: readonly string[] = [
  // order.status_changed: the occurrence reads its own status's row.
  ...ORDER_STATUS_ACTIONS,
  // offer.received: new offer and counter offer.
  ...OFFER_ACTIONS,
  // reminder.unread_messages: order/offer messages unread for 24 hours.
  "dm_reminder",
]

/**
 * Write the key defaults the user has no Personal row for.
 * @returns the actions that were turned on.
 */
export async function applyKeyEmailDefaults(userId: string): Promise<string[]> {
  const db = getKnex()
  const actions: { action_type_id: number | string; action: string }[] =
    await db("notification_actions")
      .whereIn("action", KEY_EMAIL_ACTIONS as string[])
      .select("action_type_id", "action")
  if (!actions.length) return []

  const ids = actions.map((a) => Number(a.action_type_id))
  const existing: { action_type_id: number | string }[] = await db(
    "email_notification_preferences",
  )
    .where("user_id", userId)
    .whereNull("contractor_id")
    .whereIn("action_type_id", ids)
    .select("action_type_id")
  const chosen = new Set(existing.map((r) => Number(r.action_type_id)))

  const missing = actions.filter((a) => !chosen.has(Number(a.action_type_id)))
  if (!missing.length) return []

  const now = new Date()
  await db("email_notification_preferences").insert(
    missing.map((a) => ({
      user_id: userId,
      action_type_id: Number(a.action_type_id),
      contractor_id: null,
      enabled: true,
      frequency: "immediate",
      digest_time: null,
      created_at: now,
      updated_at: now,
    })),
  )
  return missing.map((a) => a.action)
}
