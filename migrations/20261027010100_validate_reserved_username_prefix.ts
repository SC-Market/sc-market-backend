import type { Knex } from "knex"

/**
 * Validates accounts_test_username_prefix (previous migration) outside a
 * transaction: VALIDATE takes SHARE UPDATE EXCLUSIVE, so reads and writes go
 * on while it scans. Skipped (the CHECK still applies to every new or changed
 * row) when an existing row would fail it, so an unexpected legacy name can't
 * fail the deploy; it is logged instead.
 */
export const config = { transaction: false }

export async function up(knex: Knex): Promise<void> {
  const {
    rows: [state],
  } = await knex.raw(`SELECT convalidated FROM pg_constraint WHERE conname = 'accounts_test_username_prefix'`)
  if (!state || state.convalidated) return
  const {
    rows: [{ n }],
  } = await knex.raw(
    `SELECT count(*)::int AS n FROM accounts WHERE is_test IS DISTINCT FROM (left(username, 1) = '~')`,
  )
  if (n > 0) {
    console.warn(`[migrations] accounts_test_username_prefix left NOT VALID: ${n} existing rows don't match`)
    return
  }
  await knex.raw(`ALTER TABLE accounts VALIDATE CONSTRAINT accounts_test_username_prefix`)
}

export async function down(): Promise<void> {
  // Nothing to undo: validation only marks the constraint as checked.
}
