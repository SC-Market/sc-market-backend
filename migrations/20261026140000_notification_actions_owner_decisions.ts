import type { Knex } from "knex"

/**
 * Owner decisions on the notification actions that nothing sent (design
 * question 8). Ids are kept, so preference rows and webhook subscriptions that
 * reference a renamed action keep working.
 *
 * - order_contractor_applied -> contract_offer_received (entity offer_sessions):
 *   someone made an offer on your public contract.
 * - market_offer_accepted -> offer_accepted, market_offer_declined ->
 *   offer_rejected (entity offer_sessions): your offer was accepted/rejected.
 * - order_comment: retired (order comments don't exist). Its webhook
 *   subscriptions and preference rows are removed; the action row too unless
 *   old in-app notifications still reference it.
 * - notification_channel_preferences: the channel check also allows
 *   'spectrum', the future Spectrum DM channel slot (not used yet).
 *
 * Idempotent; small tables only; lock_timeout keeps it from queueing.
 */
const RENAMES: [string, string, string][] = [
  ["order_contractor_applied", "contract_offer_received", "offer_sessions"],
  ["market_offer_accepted", "offer_accepted", "offer_sessions"],
  ["market_offer_declined", "offer_rejected", "offer_sessions"],
]

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  for (const [from, to, entity] of RENAMES) {
    await knex.raw(
      `UPDATE notification_actions SET action = ?, entity = ?
       WHERE action = ? AND NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)`,
      [to, entity, from, to],
    )
    await knex.raw(
      `INSERT INTO notification_actions (action_type_id, action, entity)
       SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions), ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)`,
      [to, entity, to],
    )
  }

  const comment = await knex("notification_actions").where({ action: "order_comment" }).first()
  if (comment) {
    const id = comment.action_type_id
    await knex("webhook_actions").where({ action_type_id: id }).delete()
    await knex("push_notification_preferences").where({ action_type_id: id }).delete()
    await knex("email_notification_preferences").where({ action_type_id: id }).delete()
    await knex("notification_channel_preferences").where({ action_type_id: id }).delete()
    const used = await knex("notification_object").where({ action_type_id: id }).first("notification_object_id")
    if (!used) await knex("notification_actions").where({ action_type_id: id }).delete()
  }

  await knex.raw(
    `ALTER TABLE notification_channel_preferences
       DROP CONSTRAINT IF EXISTS notification_channel_preferences_channel_check`,
  )
  await knex.raw(
    `ALTER TABLE notification_channel_preferences
       ADD CONSTRAINT notification_channel_preferences_channel_check
       CHECK (channel IN ('site', 'discord', 'spectrum'))`,
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`DELETE FROM notification_channel_preferences WHERE channel = 'spectrum'`)
  await knex.raw(
    `ALTER TABLE notification_channel_preferences
       DROP CONSTRAINT IF EXISTS notification_channel_preferences_channel_check`,
  )
  await knex.raw(
    `ALTER TABLE notification_channel_preferences
       ADD CONSTRAINT notification_channel_preferences_channel_check CHECK (channel IN ('site', 'discord'))`,
  )
  for (const [from, to] of RENAMES) {
    await knex.raw(
      `UPDATE notification_actions SET action = ? WHERE action = ? AND NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)`,
      [from, to, from],
    )
  }
}
