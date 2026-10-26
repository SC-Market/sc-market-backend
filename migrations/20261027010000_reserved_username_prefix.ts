import type { Knex } from "knex"

/**
 * Reserved "~" username prefix for test accounts (src/services/test-accounts).
 * Real usernames come from RSI and Discord handles, which never contain "~",
 * so a "~" name can't collide with or be taken by a real user.
 *
 * - Renames existing test accounts to "~" + their name (is_test rows only;
 *   their TOTP secrets don't change).
 * - CHECK accounts_test_username_prefix: is_test exactly when the username
 *   starts with "~". Added NOT VALID (no table scan under the lock); the next
 *   migration validates it outside this transaction.
 *
 * One hot table (accounts), lock_timeout 5s, idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`SET LOCAL lock_timeout = '5s'`)
  await knex.raw(`
    UPDATE accounts SET username = '~' || username
    WHERE is_test AND left(username, 1) <> '~'
  `)
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_test_username_prefix') THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_test_username_prefix
          CHECK (is_test = (left(username, 1) = '~')) NOT VALID;
      END IF;
    END $$;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`SET LOCAL lock_timeout = '5s'`)
  await knex.raw(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_test_username_prefix`)
  await knex.raw(`
    UPDATE accounts SET username = substr(username, 2)
    WHERE is_test AND left(username, 1) = '~'
  `)
}
