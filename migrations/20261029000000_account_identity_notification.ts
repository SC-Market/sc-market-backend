import type { Knex } from "knex"

/**
 * Admin identity tool (services/identity-admin): the notification action for
 * "an admin changed your account" (event account.identity_changed). The
 * in-app row points at the audit_logs row of the change (entity audit_logs).
 *
 * The audit trail itself goes to the existing audit_logs table, so there is
 * no new table here. Idempotent; notification_actions is small and cold, and
 * lock_timeout keeps this from queueing behind traffic.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           'account_identity_changed', 'audit_logs'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = 'account_identity_changed')
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    DELETE FROM notification
    WHERE notification_object_id IN (
      SELECT o.notification_object_id FROM notification_object o
      JOIN notification_actions a ON a.action_type_id = o.action_type_id
      WHERE a.action = 'account_identity_changed'
    )
  `)
  await knex.raw(`
    DELETE FROM notification_change
    WHERE notification_object_id IN (
      SELECT o.notification_object_id FROM notification_object o
      JOIN notification_actions a ON a.action_type_id = o.action_type_id
      WHERE a.action = 'account_identity_changed'
    )
  `)
  await knex.raw(`
    DELETE FROM notification_object
    WHERE action_type_id IN (SELECT action_type_id FROM notification_actions WHERE action = 'account_identity_changed')
  `)
  await knex.raw(`DELETE FROM notification_actions WHERE action = 'account_identity_changed'`)
}
