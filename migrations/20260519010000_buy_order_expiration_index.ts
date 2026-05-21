import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX idx_buy_orders_v2_expires_active
    ON buy_orders_v2(expires_at)
    WHERE status = 'active'
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_buy_orders_v2_expires_active`)
}
