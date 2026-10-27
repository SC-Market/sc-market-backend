import type { Knex } from "knex"

/**
 * Retire `market_bid_accepted` and `market_bid_declined` (owner decision).
 * Nothing sends them: auction bids are settled through offers, and the bidder
 * hears the outcome through offer_accepted / offer_rejected.
 *
 * Like order_comment: their webhook subscriptions and preference rows are
 * removed, and the action row too unless old in-app notifications still
 * reference it. Idempotent; small tables only; lock_timeout keeps it from
 * queueing.
 */
const RETIRED = ["market_bid_accepted", "market_bid_declined"]

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  for (const name of RETIRED) {
    const action = await knex("notification_actions").where({ action: name }).first()
    if (!action) continue
    const id = action.action_type_id
    await knex("webhook_actions").where({ action_type_id: id }).delete()
    await knex("push_notification_preferences").where({ action_type_id: id }).delete()
    await knex("email_notification_preferences").where({ action_type_id: id }).delete()
    await knex("notification_channel_preferences").where({ action_type_id: id }).delete()
    const used = await knex("notification_object").where({ action_type_id: id }).first("notification_object_id")
    if (!used) await knex("notification_actions").where({ action_type_id: id }).delete()
  }
}

export async function down(): Promise<void> {
  // Not restored: the deleted preference and webhook rows can't be recovered,
  // and nothing sends these events.
}
