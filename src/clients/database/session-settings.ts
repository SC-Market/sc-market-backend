import type { Knex } from "knex"

/**
 * Postgres session timeouts for every connection the backend opens.
 *
 * Why: on 2026-10-26 a re-run migration held ACCESS EXCLUSIVE locks on hot
 * tables while the serving container's queries queued behind it with no
 * timeout, so the pool filled up and the site returned 500s. A connection
 * should never wait on a lock or a query for longer than a request can.
 *
 * Kept free of app imports so knexfile.ts (the migration CLI) can use it.
 */

/** App (request-serving) connections: src/clients/database/knex-db.ts. */
export const APP_STATEMENT_TIMEOUT = "15s"
export const APP_LOCK_TIMEOUT = "10s"
export const APP_IDLE_IN_TRANSACTION_TIMEOUT = "30s"

/**
 * Background jobs that legitimately run longer than a request (materialized
 * view refreshes, price history rollups, admin imports). Applied per
 * transaction with `withStatementTimeout`, never to the whole pool.
 */
export const BACKGROUND_STATEMENT_TIMEOUT = "5min"

/**
 * Migration connections: knexfile.ts, used by `npm run migrate:latest` in
 * docker-entrypoint.sh. A migration that can't get its lock within 5s fails,
 * the container exits before serving, and Lightsail keeps the previous image.
 *
 * statement_timeout caps how long one migration statement may hold its locks
 * (an ALTER that rewrites a hot table blocks every query on it). A migration
 * that needs longer, such as a large backfill, raises it for its own
 * transaction: `await knex.raw("SET LOCAL statement_timeout = '10min'")`.
 * See docs/migrations.md.
 */
export const MIGRATION_LOCK_TIMEOUT = "5s"
export const MIGRATION_STATEMENT_TIMEOUT = "60s"

/** Only literal Postgres intervals like `15s`, `5min`, `500ms` or `0`. */
const INTERVAL = /^(0|\d+(ms|s|min|h))$/

function interval(value: string): string {
  if (!INTERVAL.test(value)) {
    throw new Error(`Invalid Postgres timeout: ${value}`)
  }
  return value
}

export interface SessionTimeouts {
  statement_timeout: string
  lock_timeout: string
  idle_in_transaction_session_timeout?: string
}

export const APP_SESSION_TIMEOUTS: SessionTimeouts = {
  statement_timeout: APP_STATEMENT_TIMEOUT,
  lock_timeout: APP_LOCK_TIMEOUT,
  idle_in_transaction_session_timeout: APP_IDLE_IN_TRANSACTION_TIMEOUT,
}

export const MIGRATION_SESSION_TIMEOUTS: SessionTimeouts = {
  statement_timeout: MIGRATION_STATEMENT_TIMEOUT,
  lock_timeout: MIGRATION_LOCK_TIMEOUT,
}

/** The SQL each new pool connection runs in `afterCreate`. */
export function sessionSetupSql(timeouts: SessionTimeouts): string {
  const statements = [
    `SET TIME ZONE 'UTC'`,
    `SET search_path TO "$user", public`,
    `SET statement_timeout = '${interval(timeouts.statement_timeout)}'`,
    `SET lock_timeout = '${interval(timeouts.lock_timeout)}'`,
  ]
  if (timeouts.idle_in_transaction_session_timeout) {
    statements.push(
      `SET idle_in_transaction_session_timeout = '${interval(timeouts.idle_in_transaction_session_timeout)}'`,
    )
  }
  return statements.join("; ") + ";"
}

/** A knex pool `afterCreate` hook that applies `timeouts` to the connection. */
export function afterCreateWithTimeouts(timeouts: SessionTimeouts) {
  const sql = sessionSetupSql(timeouts)
  return (
    conn: { query: (sql: string, cb: (err?: Error) => void) => void },
    done: (err?: Error, conn?: unknown) => void,
  ) => {
    conn.query(sql, (err?: Error) => done(err, conn))
  }
}

/**
 * Run `fn` in a transaction whose statements may run for up to `timeout`
 * instead of the pool's APP_STATEMENT_TIMEOUT. `SET LOCAL` ends with the
 * transaction, so the connection goes back to the pool with its defaults.
 *
 * Not for statements that refuse a transaction block (CREATE INDEX
 * CONCURRENTLY, REINDEX CONCURRENTLY, VACUUM).
 */
export async function withStatementTimeout<T>(
  knex: Knex,
  timeout: string,
  fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  return knex.transaction(async (trx) => {
    await trx.raw(`SET LOCAL statement_timeout = '${interval(timeout)}'`)
    return fn(trx)
  })
}
