import type { Knex } from "knex"

/**
 * The invite to an order's or offer's Discord server, DM'd when the bot can't
 * add someone to the thread (event order.thread_invite,
 * services/discord/thread-invite.ts). Sent through notify() now, so it needs
 * a notification action for its Settings -> Notifications row (Discord DM, on
 * by default). Discord DM only: nothing writes an in-app row; the entity is
 * nominal (orders; an offer's invite points at its session).
 *
 * Additive and idempotent; notification_actions is small and cold, and
 * lock_timeout keeps this from queueing behind traffic.
 */
const ACTION = "discord_thread_invite"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(
    `
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           ?, 'orders'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)
  `,
    [ACTION, ACTION],
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const id = `(SELECT action_type_id FROM notification_actions WHERE action = ?)`
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
