import type { Knex } from "knex"

/**
 * Removes the admin:read, admin:write, admin:spectrum and admin:stats token
 * scopes. None of them ever satisfied a route: every admin gate requires the
 * literal `admin` scope, and the only route that named admin:stats (the
 * Prometheus API, now deleted) also required it.
 *
 * - Tokens that also carry other scopes lose just the legacy ones.
 * - Tokens that carry only legacy scopes could do nothing; they are revoked
 *   (their scopes are left as they were, since api_tokens forbids an empty
 *   scope list).
 *
 * Down is a no-op: the scopes have no meaning any more.
 */
const LEGACY_SCOPES = ["admin:read", "admin:write", "admin:spectrum", "admin:stats"]

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("api_tokens"))) return

  await knex.raw(
    `UPDATE api_tokens
        SET revoked_at = NOW()
      WHERE revoked_at IS NULL
        AND scopes <@ ?::text[]`,
    [LEGACY_SCOPES],
  )

  await knex.raw(
    `UPDATE api_tokens
        SET scopes = ARRAY(
              SELECT s FROM unnest(scopes) AS s WHERE NOT (s = ANY(?::text[]))
            ),
            updated_at = NOW()
      WHERE scopes && ?::text[]
        AND NOT (scopes <@ ?::text[])`,
    [LEGACY_SCOPES, LEGACY_SCOPES, LEGACY_SCOPES],
  )
}

export async function down(): Promise<void> {}
