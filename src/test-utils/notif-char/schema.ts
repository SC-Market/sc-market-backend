/**
 * Builds the SC Market schema in a throwaway Postgres for the notification
 * characterization suite: the legacy SQL files in config/postgres, then every
 * knex migration, each in its own transaction.
 *
 * Production has objects no file creates (PRE_SQL). Every migration must apply
 * on an empty database: one that fails here fails the suite's global setup
 * unless it is listed in EXPECTED_FAILURES.
 */
import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import knexFactory from "knex"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..")

/** SQL run before the legacy files: objects production has that no file creates. */
const PRE_SQL = `
  DO $$ BEGIN CREATE ROLE scmarket; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE DOMAIN public.url AS text; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  -- item_variants.attributes_hash is computed with pgcrypto's digest().
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
`

/** Migrations known not to apply on an empty database. Keep this empty if possible. */
export const EXPECTED_FAILURES = new Set<string>([])

export interface PgTarget {
  socketDir: string
  database: string
  user?: string
}

function psqlFile(target: PgTarget, file: string) {
  // Legacy files are pg_dump output with a few statements that fail on a clean
  // database (materialized views of tables created later); psql carries on, as
  // it did when the files were first applied.
  execFileSync(
    "psql",
    ["-h", target.socketDir, "-U", target.user ?? "postgres", "-d", target.database, "-q", "-f", file],
    { stdio: ["ignore", "ignore", "ignore"] },
  )
}

function psqlCommand(target: PgTarget, sql: string) {
  execFileSync(
    "psql",
    ["-h", target.socketDir, "-U", target.user ?? "postgres", "-d", target.database, "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: ["ignore", "ignore", "pipe"] },
  )
}

export async function buildSchema(target: PgTarget): Promise<{ failed: string[] }> {
  psqlCommand(target, PRE_SQL)

  const sqlDir = path.join(ROOT, "config/postgres")
  const sqlFiles = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  for (const f of sqlFiles) psqlFile(target, path.join(sqlDir, f))

  const db = knexFactory({
    client: "pg",
    connection: { host: target.socketDir, user: target.user ?? "postgres", database: target.database },
    pool: { min: 0, max: 2 },
  })
  const failed: string[] = []
  try {
    const migDir = path.join(ROOT, "migrations")
    // knex orders migrations by file name.
    const files = readdirSync(migDir).filter((f) => f.endsWith(".ts")).sort()
    for (const f of files) {
      const mod = await import(pathToFileURL(path.join(migDir, f)).href)
      try {
        if (mod.config?.transaction === false) {
          await mod.up(db)
        } else {
          await db.transaction(async (trx) => {
            await mod.up(trx)
          })
        }
        await db.raw(
          "CREATE TABLE IF NOT EXISTS knex_migrations (id serial primary key, name varchar(255), batch int, migration_time timestamptz)",
        )
        await db("knex_migrations").insert({ name: f, batch: 1, migration_time: new Date() })
      } catch (e) {
        failed.push(`${f}: ${String((e as Error).message).split("\n").pop()}`)
      }
    }
  } finally {
    await db.destroy()
  }
  return { failed }
}
