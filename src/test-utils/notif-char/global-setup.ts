/**
 * Global setup for the notification characterization suite
 * (vitest.characterization.config.ts).
 *
 * Builds the full SC Market schema into a template database on a throwaway
 * Postgres server and hands the server and template name to each test file.
 *
 * - PG_TEST_URL set (CI's service container, see src/test-utils/pg-test-db.ts):
 *   uses that server. Never point it at a real database: every table is
 *   truncated before each test.
 * - Otherwise starts a cluster that listens on a unix socket only (no TCP) and
 *   deletes it on teardown. PG_BINDIR points at the server binaries.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"
import pg from "pg"
import type { TestProject } from "vitest/node"
import { buildSchema } from "./schema.js"
import { PG_TEST_URL, pgTestConnection, type PgConnection } from "../pg-test-db.js"

const TEMPLATE = "notif_char_template"

function pgBinDir(): string {
  if (process.env.PG_BINDIR) return process.env.PG_BINDIR
  const which = spawnSync("sh", ["-c", "command -v initdb"], { encoding: "utf8" })
  if (which.status === 0 && which.stdout.trim()) return path.dirname(which.stdout.trim())
  const cfg = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" })
  if (cfg.status === 0 && existsSync(path.join(cfg.stdout.trim(), "initdb"))) {
    return cfg.stdout.trim()
  }
  // Debian/Ubuntu (GitHub runners) keep the server binaries off PATH.
  const base = "/usr/lib/postgresql"
  if (existsSync(base)) {
    const versions = readdirSync(base).sort((a, b) => Number(b) - Number(a))
    for (const v of versions) {
      const dir = path.join(base, v, "bin")
      if (existsSync(path.join(dir, "initdb"))) return dir
    }
  }
  throw new Error(
    "Postgres server binaries (initdb, pg_ctl) not found. Install Postgres or set PG_BINDIR / PG_TEST_URL.",
  )
}

export default async function setup(project: TestProject) {
  let server: PgConnection
  let dataRoot: string | null = null
  let pgCtl: string | null = null

  if (PG_TEST_URL) {
    server = pgTestConnection()
  } else {
    const bin = pgBinDir()
    pgCtl = path.join(bin, "pg_ctl")
    // Short path: unix socket paths are limited to ~100 bytes.
    dataRoot = mkdtempSync("/tmp/notif-char-")
    const socketDir = dataRoot
    const dataDir = path.join(dataRoot, "data")
    execFileSync(path.join(bin, "initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-sync"], {
      stdio: "ignore",
    })
    execFileSync(
      pgCtl,
      [
        "-D",
        dataDir,
        "-l",
        path.join(dataRoot, "postgres.log"),
        "-w",
        "-o",
        `-k ${socketDir} -c listen_addresses='' -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=200`,
        "start",
      ],
      { stdio: "ignore" },
    )
    server = { host: socketDir, port: 5432, user: "postgres", password: "", database: "postgres" }
  }

  const admin = new pg.Client(server)
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE} WITH (FORCE)`)
  await admin.query(`CREATE DATABASE ${TEMPLATE}`)
  await admin.end()

  await buildSchema({ ...server, database: TEMPLATE })

  // Tables that are empty in the template hold per-test data; tables with rows
  // are reference data (notification_actions, flags, ...) and are kept.
  const db = new pg.Client({ ...server, database: TEMPLATE })
  await db.connect()
  // The legacy SQL seeds a sample account and org (with roles, a Discord setup
  // and a Discord setup). Tests seed their own people, so drop those first.
  await db.query(
    `TRUNCATE accounts, contractors, discord_channel_setups RESTART IDENTITY CASCADE`,
  )
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )
  const truncate: string[] = []
  for (const { table_name } of rows) {
    const r = await db.query(`SELECT 1 FROM "${table_name}" LIMIT 1`)
    if (r.rowCount === 0) truncate.push(table_name)
  }
  // The per-test TRUNCATE ... CASCADE must not reach reference data through a
  // foreign key. Run it once here and check every reference table kept its rows.
  await db.query(`TRUNCATE ${truncate.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`)
  for (const { table_name } of rows) {
    if (truncate.includes(table_name)) continue
    const r = await db.query(`SELECT 1 FROM "${table_name}" LIMIT 1`)
    if (r.rowCount === 0) {
      throw new Error(`Per-test truncation cascades into reference table ${table_name}`)
    }
  }
  await db.end()

  project.provide("notifChar", { server, template: TEMPLATE, truncate })

  return async () => {
    if (pgCtl && dataRoot) {
      try {
        execFileSync(pgCtl, ["-D", path.join(dataRoot, "data"), "-m", "immediate", "stop"], {
          stdio: "ignore",
        })
      } finally {
        rmSync(dataRoot, { recursive: true, force: true })
      }
    }
  }
}
