import type { Knex } from "knex"

/**
 * Retire the `public_order_create` notification action ("Public Order
 * Created" webhook feed). Public orders were replaced by Public Contracts and
 * every order now comes from an offer session with a shop or an assignee, so
 * the feed can no longer fire.
 *
 * Deleting the action row cascades to its webhook subscriptions
 * (webhook_actions) and preference rows. Kept if any in-app notification
 * references it (none is ever created for it). Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const action = await knex("notification_actions").where({ action: "public_order_create" }).first()
  if (!action) return
  const id = action.action_type_id
  await knex("webhook_actions").where({ action_type_id: id }).delete()
  const used = await knex("notification_object").where({ action_type_id: id }).first("notification_object_id")
  if (!used) {
    await knex("notification_actions").where({ action_type_id: id }).delete()
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    INSERT INTO notification_actions (action_type_id, action, entity)
    VALUES (17, 'public_order_create', 'order')
    ON CONFLICT DO NOTHING
  `)
}
