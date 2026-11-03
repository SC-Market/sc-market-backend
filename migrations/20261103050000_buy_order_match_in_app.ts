import type { Knex } from "knex"

/**
 * Buy-order match alerts get a bell entry (owner decision 2026-11-02; event
 * buy_order.match). The in-app row points at the matching listing, as a
 * price alert's does, so the bell can show and link it: the action's entity
 * becomes the V2 `listings` table (it was `buy_orders_v2`, which nothing
 * wrote: the alert had no in-app row until now).
 *
 * Additive in effect (no rows reference the old entity); notification_actions
 * is small and cold, and lock_timeout keeps this from queueing behind traffic.
 */
const ACTION = "buy_order_match"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex("notification_actions").where({ action: ACTION }).update({ entity: "listings" })
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const id = `(SELECT action_type_id FROM notification_actions WHERE action = ?)`
  const objects = `(SELECT notification_object_id FROM notification_object WHERE action_type_id IN ${id})`
  // The bell entries written since point at listings; drop them with the entity.
  await knex.raw(`DELETE FROM notification WHERE notification_object_id IN ${objects}`, [ACTION])
  await knex.raw(`DELETE FROM notification_change WHERE notification_object_id IN ${objects}`, [ACTION])
  await knex.raw(`DELETE FROM notification_object WHERE action_type_id IN ${id}`, [ACTION])
  await knex("notification_actions").where({ action: ACTION }).update({ entity: "buy_orders_v2" })
}
