import type { Knex } from "knex"
import { env } from "./src/config/env.js"
import {
  afterCreateWithTimeouts,
  MIGRATION_SESSION_TIMEOUTS,
} from "./src/clients/database/session-settings.js"

// Parse database configuration from environment
let dbConfig: {
  [key: string]: string
} = {}

try {
  if (env.DATABASE_PASS) {
    dbConfig = JSON.parse(env.DATABASE_PASS)
  }
} catch (error) {
  console.warn("Failed to parse DATABASE_PASS, using individual env variables")
}

/**
 * Every migration connection gets lock_timeout / statement_timeout from
 * MIGRATION_SESSION_TIMEOUTS (afterCreate below), so a migration that can't
 * take its lock quickly fails and aborts the deploy instead of queueing the
 * site's queries behind it. See docs/migrations.md.
 */
const migrations: Knex.MigratorConfig = {
  directory: "./migrations",
  extension: "ts",
  tableName: "knex_migrations",
  // A row whose file this image doesn't have is a migration from a NEWER
  // image (two deploys racing). Knex would refuse to run ("migration
  // directory is corrupt"); skip the check so an older image still boots.
  // Never delete such rows: that makes the newer image re-run the migration.
  disableMigrationsListValidation: true,
}

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "pg",
    connection: {
      host: dbConfig.host || env.DATABASE_HOST || "localhost",
      user: dbConfig.username || env.DATABASE_USER || "postgres",
      password: dbConfig.password || env.DATABASE_PASS || "",
      database: dbConfig.dbname || env.DATABASE_TARGET || "postgres",
      port:
        (dbConfig.port as unknown as number) ||
        (env.DATABASE_PORT ? +env.DATABASE_PORT : 5431),
      ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 0,
      max: 5,
      afterCreate: afterCreateWithTimeouts(MIGRATION_SESSION_TIMEOUTS),
    },
    migrations,
  },

  production: {
    client: "pg",
    connection: {
      host: dbConfig.host || env.DATABASE_HOST || "localhost",
      user: dbConfig.username || env.DATABASE_USER || "postgres",
      password: dbConfig.password || env.DATABASE_PASS || "",
      database: dbConfig.dbname || env.DATABASE_TARGET || "postgres",
      port:
        (dbConfig.port as unknown as number) ||
        (env.DATABASE_PORT ? +env.DATABASE_PORT : 5431),
      ssl: { rejectUnauthorized: false },
    },
    // Only the migration CLI (docker-entrypoint.sh) uses this config in
    // production; the server builds its own pool in knex-db.ts. Knex holds
    // at most two connections while migrating (the lock and the migration).
    pool: {
      min: 0,
      max: 2,
      afterCreate: afterCreateWithTimeouts(MIGRATION_SESSION_TIMEOUTS),
    },
    migrations,
  },
}

export default config
