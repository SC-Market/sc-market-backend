import type { Knex } from "knex"

/**
 * Public API v1 tokens (/api/public/v1) and per-token usage.
 *
 * public_api_tokens: a new token type, separate from api_tokens. Minted from
 * a preset (explicit scopes, no full/readonly), with an explicit org grant
 * (contractor_ids; empty = personal shops only) and a required expiry. Only
 * the SHA-256 of the token is stored; token_hint is its last 4 characters so
 * the UI can tell tokens apart. These tokens work only on /api/public/v1, and
 * api_tokens only on the old routes.
 *
 * api_token_usage_hourly: request counts per token, per hour and per API
 * surface (v1, v2, public_v1), for legacy and public tokens alike, so the
 * legacy deprecation window can be set from real use. Written in batches by
 * the server (services/public-api/usage-recorder.ts).
 *
 * New, empty tables: no lock on any hot table. Both reference accounts with
 * ON DELETE CASCADE (account deletion also removes them explicitly).
 * Idempotent (IF NOT EXISTS throughout); lock_timeout so the FK's brief lock
 * on accounts/api_tokens never queues behind traffic.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS public_api_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
      description TEXT CHECK (description IS NULL OR length(description) <= 500),
      token_hash TEXT NOT NULL UNIQUE,
      token_hint TEXT NOT NULL,
      preset TEXT NOT NULL,
      scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
      contractor_ids UUID[] NOT NULL DEFAULT '{}',
      expires_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS public_api_tokens_user_id_idx ON public_api_tokens (user_id)`,
  )

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS api_token_usage_hourly (
      id BIGSERIAL PRIMARY KEY,
      hour TIMESTAMPTZ NOT NULL,
      surface TEXT NOT NULL,
      legacy_token_id UUID REFERENCES api_tokens(id) ON DELETE CASCADE,
      public_token_id UUID REFERENCES public_api_tokens(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      requests INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT api_token_usage_hourly_one_token
        CHECK (num_nonnulls(legacy_token_id, public_token_id) = 1)
    )
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS api_token_usage_hourly_legacy_key
      ON api_token_usage_hourly (legacy_token_id, hour, surface)
      WHERE legacy_token_id IS NOT NULL
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS api_token_usage_hourly_public_key
      ON api_token_usage_hourly (public_token_id, hour, surface)
      WHERE public_token_id IS NOT NULL
  `)
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS api_token_usage_hourly_hour_idx ON api_token_usage_hourly (hour)`,
  )
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS api_token_usage_hourly_user_id_idx ON api_token_usage_hourly (user_id)`,
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`DROP TABLE IF EXISTS api_token_usage_hourly`)
  await knex.raw(`DROP TABLE IF EXISTS public_api_tokens`)
}
