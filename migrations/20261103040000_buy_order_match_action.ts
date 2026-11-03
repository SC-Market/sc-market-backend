import type { Knex } from "knex"

/**
 * Buy-order match alerts (services/buy-order-matching, event
 * buy_order.match): the notification action they key their preferences on.
 * Without a row the push service skipped the preference check, so the alert
 * could not be turned off. The in-app row (not sent yet) would point at the
 * buy order (entity buy_orders_v2).
 *
 * Additive and idempotent; notification_actions is small and cold, and
 * lock_timeout keeps this from queueing behind traffic.
 */
const ACTION = "buy_order_match"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(
    `
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           ?, 'buy_orders_v2'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)
  `,
    [ACTION, ACTION],
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const id = `(SELECT action_type_id FROM notification_actions WHERE action = ?)`
  const objects = `(SELECT notification_object_id FROM notification_object WHERE action_type_id IN ${id})`
  await knex.raw(`DELETE FROM notification WHERE notification_object_id IN ${objects}`, [ACTION])
  await knex.raw(`DELETE FROM notification_change WHERE notification_object_id IN ${objects}`, [ACTION])
  await knex.raw(`DELETE FROM notification_object WHERE action_type_id IN ${id}`, [ACTION])
  for (const table of [
    "email_notification_preferences",
    "push_notification_preferences",
    "notification_channel_preferences",
    "notification_channel_org_preferences",
  ]) {
    await knex.raw(`DELETE FROM ${table} WHERE action_type_id IN ${id}`, [ACTION])
  }
  await knex.raw(`DELETE FROM notification_actions WHERE action = ?`, [ACTION])
}
