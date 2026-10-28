import type { Knex } from "knex"

/**
 * Account tombstone conversion: stop retrying permanent failures, and give
 * existing tombstones a NULL discord_id.
 *
 * convertToTombstone used to set discord_id = 0 on every tombstone, so from
 * the second one on it hit accounts_discord_id_unique, and
 * processExpiredDeletions retried those accounts every hour forever. The code
 * now sets NULL. A conversion that still fails with a permanent database error
 * gets a row here and is skipped until the row is deleted.
 *
 * New table, no foreign key: a FK to accounts would lock that hot table.
 * The UPDATE only row-locks the (few) tombstones that still hold the 0.
 * Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS account_tombstone_failures (
      user_id uuid PRIMARY KEY,
      failed_at timestamptz NOT NULL DEFAULT now(),
      error text NOT NULL
    )
  `)
  await knex.raw(
    `UPDATE accounts SET discord_id = NULL WHERE is_tombstone AND discord_id = 0`,
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`DROP TABLE IF EXISTS account_tombstone_failures`)
}
