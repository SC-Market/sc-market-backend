/**
 * Throwaway Postgres databases for the real-SQL tests (*.pg.test.ts and the
 * notification characterization suite).
 *
 * PG_TEST_URL is the maintenance database of a DISPOSABLE Postgres server:
 *   CI (service container):  postgres://postgres:postgres@localhost:5432/postgres
 *   local, unix socket only: postgres://postgres@localhost/postgres?host=/tmp/pg
 *     initdb -D /tmp/pg/data -U postgres -A trust
 *     pg_ctl -D /tmp/pg/data -o "-k /tmp/pg -c listen_addresses=''" start
 *
 * Every test file creates its own database on that server (dropping any
 * leftover of the same name first) and drops it afterwards, so files can run
 * in parallel. Never point PG_TEST_URL at a server holding real data.
 * Without PG_TEST_URL the suites that need it are skipped.
 */
import pg from "pg"

export const PG_TEST_URL = process.env.PG_TEST_URL

export interface PgConnection {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/** Connection parts of PG_TEST_URL, for `database` (default: the URL's own). */
export function pgTestConnection(database?: string): PgConnection {
  if (!PG_TEST_URL) throw new Error("PG_TEST_URL is not set")
  const url = new URL(PG_TEST_URL)
  return {
    // ?host=/dir selects a unix socket directory, as in libpq.
    host: url.searchParams.get("host") || url.hostname || "localhost",
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username) || "postgres",
    password: decodeURIComponent(url.password),
    database: database ?? (decodeURIComponent(url.pathname.slice(1)) || "postgres"),
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(pgTestConnection())
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** Creates (or recreates) `name`, optionally as a copy of `template`. */
export async function createTestDatabase(name: string, template?: string): Promise<PgConnection> {
  for (const n of [name, template]) {
    if (n !== undefined && !IDENT.test(n)) throw new Error(`Bad test database name ${n}`)
  }
  await admin(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await client.query(`CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ""}`)
  })
  return pgTestConnection(name)
}

export async function dropTestDatabase(name: string): Promise<void> {
  if (!IDENT.test(name)) throw new Error(`Bad test database name ${name}`)
  await admin((client) => client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`))
}
