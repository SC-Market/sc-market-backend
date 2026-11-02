import type { Knex } from "knex"

/**
 * offer_reminders.seller_reminded (services/offer-reminders): for a buyer
 * reminder, whether the seller side got the final nudge first (true) or the
 * buyer was told without one because nobody on the seller side could be
 * reminded (false). NULL for seller reminders.
 *
 * Additive: one nullable column on a new, small table; lock_timeout so it
 * never queues behind traffic. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("ALTER TABLE offer_reminders ADD COLUMN IF NOT EXISTS seller_reminded BOOLEAN NULL")
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("ALTER TABLE offer_reminders DROP COLUMN IF EXISTS seller_reminded")
}
