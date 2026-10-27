import type { Knex } from "knex"

/**
 * SCMDB ingest tokens: drop the plaintext (step 2 of 2).
 *
 * Step 1 (20261027211000_scmdb_token_hash) added token_hash/token_hint,
 * backfilled them and switched the code to hash lookups. It shipped in an
 * earlier deploy, so no running container reads `token` any more. This clears
 * any remaining plaintext, then drops the column and the rollout trigger.
 *
 * Rows still without a hash (none expected: step 1 backfilled them and its
 * trigger hashed later inserts) are hashed first, so no active token is lost.
 * Idempotent; small, cold table; lock_timeout keeps it from queueing.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const hasToken = await knex.schema.hasColumn("scmdb_sync_tokens", "token")
  if (hasToken) {
    await knex.raw(`
      UPDATE scmdb_sync_tokens
         SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'),
             token_hint = right(token, 4)
       WHERE token IS NOT NULL AND token_hash IS NULL
    `)
  }
  await knex.raw(
    `DROP TRIGGER IF EXISTS scmdb_sync_tokens_hash_token ON scmdb_sync_tokens`,
  )
  await knex.raw(`DROP FUNCTION IF EXISTS scmdb_sync_tokens_hash_token()`)
  if (hasToken) {
    await knex.raw(
      `UPDATE scmdb_sync_tokens SET token = NULL WHERE token IS NOT NULL`,
    )
    await knex.raw(`ALTER TABLE scmdb_sync_tokens DROP COLUMN IF EXISTS token`)
  }
  // Every row must be findable by hash from now on.
  await knex.raw(`DELETE FROM scmdb_sync_tokens WHERE token_hash IS NULL`)
  await knex.raw(
    `ALTER TABLE scmdb_sync_tokens ALTER COLUMN token_hash SET NOT NULL`,
  )
}

export async function down(knex: Knex): Promise<void> {
  // The plaintext can't be restored. Bring the (empty, nullable) column back
  // so step 1's down migration can run.
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(
    `ALTER TABLE scmdb_sync_tokens ALTER COLUMN token_hash DROP NOT NULL`,
  )
  await knex.raw(
    `ALTER TABLE scmdb_sync_tokens ADD COLUMN IF NOT EXISTS token VARCHAR(64) UNIQUE`,
  )
}
