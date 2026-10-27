import crypto from "node:crypto"
import type { Knex } from "knex"

/**
 * SCMDB ingest tokens stop being stored in plaintext (step 1 of 2).
 *
 * scmdb_sync_tokens.token held the secret that authenticates
 * POST /api/v2/integrations/scmdb/ingest/{token}, and GET .../status rebuilt
 * the ingest URL from it on every read. This migration adds
 *   - token_hash: hex SHA-256 of the token, unique (the lookup key), and
 *   - token_hint: its last 4 characters, so the UI can tell tokens apart,
 * and backfills both from the existing plaintext. The code in this deploy
 * looks tokens up by hash and writes only token_hash/token_hint.
 *
 * The plaintext stays for now: while this deploy rolls out, the previous
 * container is still serving and still looks tokens up by `token`. A trigger
 * fills token_hash/token_hint for any token that container inserts. The next
 * migration (20261027212000_scmdb_token_drop_plaintext), shipped in a separate
 * deploy, clears the plaintext and drops the column and the trigger.
 *
 * Idempotent (IF NOT EXISTS, only rows without a hash are backfilled).
 * scmdb_sync_tokens is a small, cold table; lock_timeout keeps it from
 * queueing behind traffic anyway.
 */

/** SQL computing the hex SHA-256 of a text expression, or null for an app-side backfill. */
async function sha256Sql(
  knex: Knex,
): Promise<((expr: string) => string) | null> {
  const { rows } = await knex.raw(
    "SELECT current_setting('server_version_num')::int AS v",
  )
  // sha256(bytea) is built in from PostgreSQL 11.
  if (rows[0].v >= 110000)
    return (e) => `encode(sha256(convert_to(${e}, 'UTF8')), 'hex')`
  const ext = await knex.raw(
    "SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'",
  )
  if (ext.rows.length) return (e) => `encode(digest(${e}, 'sha256'), 'hex')`
  return null
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE scmdb_sync_tokens
      ADD COLUMN IF NOT EXISTS token_hash TEXT,
      ADD COLUMN IF NOT EXISTS token_hint TEXT,
      ALTER COLUMN token DROP NOT NULL
  `)

  const hash = await sha256Sql(knex)
  if (hash) {
    await knex.raw(`
      UPDATE scmdb_sync_tokens
         SET token_hash = ${hash("token")}, token_hint = right(token, 4)
       WHERE token IS NOT NULL AND token_hash IS NULL
    `)
  } else {
    const rows: { id: string; token: string }[] = await knex(
      "scmdb_sync_tokens",
    )
      .whereNotNull("token")
      .whereNull("token_hash")
      .select("id", "token")
    for (const r of rows) {
      await knex("scmdb_sync_tokens")
        .where({ id: r.id })
        .update({
          token_hash: crypto.createHash("sha256").update(r.token).digest("hex"),
          token_hint: r.token.slice(-4),
        })
    }
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scmdb_sync_tokens_token_hash
      ON scmdb_sync_tokens (token_hash)
  `)

  // For tokens the previous container inserts (plaintext only) during rollout.
  if (hash) {
    await knex.raw(`
      CREATE OR REPLACE FUNCTION scmdb_sync_tokens_hash_token() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.token IS NOT NULL THEN
          NEW.token_hash := ${hash("NEW.token")};
          NEW.token_hint := right(NEW.token, 4);
        END IF;
        RETURN NEW;
      END
      $$
    `)
    await knex.raw(
      `DROP TRIGGER IF EXISTS scmdb_sync_tokens_hash_token ON scmdb_sync_tokens`,
    )
    await knex.raw(`
      CREATE TRIGGER scmdb_sync_tokens_hash_token
        BEFORE INSERT OR UPDATE OF token ON scmdb_sync_tokens
        FOR EACH ROW EXECUTE FUNCTION scmdb_sync_tokens_hash_token()
    `)
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(
    `DROP TRIGGER IF EXISTS scmdb_sync_tokens_hash_token ON scmdb_sync_tokens`,
  )
  await knex.raw(`DROP FUNCTION IF EXISTS scmdb_sync_tokens_hash_token()`)
  await knex.raw(`DROP INDEX IF EXISTS idx_scmdb_sync_tokens_token_hash`)
  // Tokens created after step 1 have no plaintext and can't be restored:
  // drop them (their users reconnect) so NOT NULL can come back.
  await knex.raw(`DELETE FROM scmdb_sync_tokens WHERE token IS NULL`)
  await knex.raw(`
    ALTER TABLE scmdb_sync_tokens
      DROP COLUMN IF EXISTS token_hash,
      DROP COLUMN IF EXISTS token_hint,
      ALTER COLUMN token SET NOT NULL
  `)
}
