import type { Knex } from "knex"

/**
 * Storefront enquiry replies (services/storefront/enquiry-notify.ts): the
 * notification actions for "your branded storefront enquiry was accepted"
 * and "... was declined", sent to the person who sent it (events
 * storefront.enquiry_accepted / storefront.enquiry_declined). The in-app row
 * points at the enquiry (entity storefront_enquiries).
 *
 * Idempotent; notification_actions is small and cold, and lock_timeout keeps
 * this from queueing behind traffic.
 */
const ACTIONS = ["storefront_enquiry_accepted", "storefront_enquiry_declined"]

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  for (const action of ACTIONS) {
    await knex.raw(
      `
      INSERT INTO notification_actions (action_type_id, action, entity)
      SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
             ?, 'storefront_enquiries'
      WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = ?)
    `,
      [action, action],
    )
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const ids = `(SELECT action_type_id FROM notification_actions WHERE action = ANY(?))`
  const objects = `(SELECT notification_object_id FROM notification_object WHERE action_type_id IN ${ids})`
  await knex.raw(
    `DELETE FROM notification WHERE notification_object_id IN ${objects}`,
    [ACTIONS],
  )
  await knex.raw(
    `DELETE FROM notification_change WHERE notification_object_id IN ${objects}`,
    [ACTIONS],
  )
  await knex.raw(
    `DELETE FROM notification_object WHERE action_type_id IN ${ids}`,
    [ACTIONS],
  )
  for (const table of [
    "email_notification_preferences",
    "push_notification_preferences",
    "notification_channel_preferences",
    "notification_channel_org_preferences",
  ]) {
    await knex.raw(`DELETE FROM ${table} WHERE action_type_id IN ${ids}`, [
      ACTIONS,
    ])
  }
  await knex.raw(`DELETE FROM notification_actions WHERE action = ANY(?)`, [
    ACTIONS,
  ])
}
