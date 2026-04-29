import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE listings DROP CONSTRAINT IF EXISTS chk_listings_status`)
  await knex.raw(
    `ALTER TABLE listings ADD CONSTRAINT chk_listings_status CHECK (status IN ('active', 'inactive', 'sold', 'expired', 'cancelled'))`,
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`UPDATE listings SET status = 'cancelled' WHERE status = 'inactive'`)
  await knex.raw(`ALTER TABLE listings DROP CONSTRAINT IF EXISTS chk_listings_status`)
  await knex.raw(
    `ALTER TABLE listings ADD CONSTRAINT chk_listings_status CHECK (status IN ('active', 'sold', 'expired', 'cancelled'))`,
  )
}
