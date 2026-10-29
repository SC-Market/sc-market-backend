import type { Knex } from "knex"

/**
 * One-off cleanup: NULL the legacy accounts.discord_id column where the
 * account has no matching Discord provider link (account_providers is the
 * real link). Removing Discord used to leave the column set, which kept that
 * Discord id "taken" (accounts_discord_id_unique): the next Discord sign-up
 * with it failed after creating the account. unlinkProvider now clears the
 * column itself.
 *
 * Only clears values; nothing is moved to another account. Idempotent (a
 * second run matches no rows). A row UPDATE, no ALTER or index on accounts;
 * lock_timeout keeps it from queueing behind traffic.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    UPDATE accounts a
    SET discord_id = NULL
    WHERE a.discord_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM account_providers p
        WHERE p.user_id = a.user_id
          AND p.provider_type = 'discord'
          AND p.provider_id = a.discord_id::text
      )
  `)
}

export async function down(): Promise<void> {
  // The cleared values were stale; there is nothing to restore.
}
