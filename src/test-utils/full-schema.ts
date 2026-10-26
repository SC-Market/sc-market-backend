/**
 * Builds the full SC Market schema in a throwaway Postgres (for the
 * notification characterization suite and real-schema *.pg.test.ts files),
 * the way production got it: scripts/ci/pre-legacy.sql
 * (objects production has that no file creates), the legacy SQL files in
 * config/postgres, then knex's migrate.latest over every migration.
 *
 * The same sequence runs in CI as scripts/ci/schema-from-empty.sh. Every
 * migration must apply on an empty database; one that doesn't fails the
 * build.
 */
import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import knexFactory, { type Knex } from "knex"
import type { PgConnection } from "./pg-test-db.js"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..")

function psqlEnv(target: PgConnection) {
  return {
    ...process.env,
    PGHOST: target.host,
    PGPORT: String(target.port),
    PGUSER: target.user,
    PGPASSWORD: target.password,
    PGDATABASE: target.database,
  }
}

function psqlFile(target: PgConnection, file: string, { stopOnError }: { stopOnError: boolean }) {
  execFileSync("psql", ["-q", ...(stopOnError ? ["-v", "ON_ERROR_STOP=1"] : []), "-f", file], {
    env: psqlEnv(target),
    stdio: ["ignore", "ignore", stopOnError ? "pipe" : "ignore"],
  })
}

/**
 * Loads the migrations through vitest's module loader (knex's own loader
 * would import the .ts files natively). Ordering, transactions and
 * `config.transaction` are knex's, as in production.
 */
function migrationSource(dir: string): Knex.MigrationSource<string> {
  return {
    getMigrations: async () => readdirSync(dir).filter((f) => f.endsWith(".ts")).sort(),
    getMigrationName: (file) => file,
    getMigration: (file) => import(pathToFileURL(path.join(dir, file)).href),
  }
}

export async function buildSchema(target: PgConnection): Promise<void> {
  psqlFile(target, path.join(ROOT, "scripts/ci/pre-legacy.sql"), { stopOnError: true })

  // Legacy files are pg_dump output with a few statements that fail on a clean
  // database (materialized views of tables created later); psql carries on, as
  // it did when the files were first applied.
  const sqlDir = path.join(ROOT, "config/postgres")
  const sqlFiles = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  for (const f of sqlFiles) psqlFile(target, path.join(sqlDir, f), { stopOnError: false })

  const db = knexFactory({ client: "pg", connection: target, pool: { min: 0, max: 2 } })
  try {
    await db.migrate.latest({ migrationSource: migrationSource(path.join(ROOT, "migrations")) })
  } finally {
    await db.destroy()
  }
}
