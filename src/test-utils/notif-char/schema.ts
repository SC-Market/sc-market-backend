/**
 * Builds the SC Market schema in a throwaway Postgres for the notification
 * characterization suite: the legacy SQL files in config/postgres, then every
 * knex migration, each in its own transaction.
 *
 * The repo's history does not replay cleanly on an empty database (production
 * was patched by hand along the way), so a few shims are applied. They are
 * listed in SCHEMA_SHIMS and EXPECTED_FAILURES so drift is visible: a new
 * migration that fails here fails the suite's global setup.
 */
import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import knexFactory, { type Knex } from "knex"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..")

/** SQL run before the legacy files: objects production has that no file creates. */
const PRE_SQL = `
  DO $$ BEGIN CREATE ROLE scmarket; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE DOMAIN public.url AS text; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  -- item_variants.attributes_hash is computed with pgcrypto's digest().
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
`

/**
 * SQL run after the legacy files and before the migrations.
 * - 20260417100000_market_v2_fresh_schema joins `gi.game_item_id`, a column
 *   game_items never had in the repo's SQL (production's view was fixed in
 *   place; later migrations recreate it with `gi.id`).
 */
const MID_SQL = `
  ALTER TABLE game_items ADD COLUMN IF NOT EXISTS game_item_id uuid GENERATED ALWAYS AS (id) STORED;
`

/**
 * Per-migration shims: SQL to run inside the migration's transaction right
 * before a raw statement that matches `before`.
 */
const SCHEMA_SHIMS: Record<string, { before: RegExp; sql: string }[]> = {
  // The listing_search view reads listing_photos_v2, which the same migration
  // only creates further down.
  "20260417100000_market_v2_fresh_schema.ts": [
    {
      before: /CREATE VIEW listing_search AS/,
      sql: `CREATE TABLE IF NOT EXISTS listing_photos_v2 (
        photo_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        listing_id UUID NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
        resource_id UUID NOT NULL REFERENCES image_resources(resource_id) ON DELETE CASCADE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    },
  ],
}

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

function withShims(trx: Knex.Transaction, shims: { before: RegExp; sql: string }[]): Knex {
  if (!shims.length) return trx
  const raw = trx.raw.bind(trx)
  const pending = [...shims]
  return new Proxy(trx, {
    get(target, prop, receiver) {
      if (prop !== "raw") return Reflect.get(target, prop, receiver)
      return (sql: string, ...rest: unknown[]) => {
        const i = pending.findIndex((s) => typeof sql === "string" && s.before.test(sql))
        if (i < 0) return (raw as (...a: unknown[]) => unknown)(sql, ...rest)
        const [shim] = pending.splice(i, 1)
        return raw(shim.sql).then(() => (raw as (...a: unknown[]) => unknown)(sql, ...rest))
      }
    },
  }) as Knex
}

export async function buildSchema(target: PgTarget): Promise<{ failed: string[] }> {
  psqlCommand(target, PRE_SQL)

  const sqlDir = path.join(ROOT, "config/postgres")
  const sqlFiles = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  for (const f of sqlFiles) psqlFile(target, path.join(sqlDir, f))

  psqlCommand(target, MID_SQL)

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
            await mod.up(withShims(trx, SCHEMA_SHIMS[f] ?? []))
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
