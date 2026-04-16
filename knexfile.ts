import type { Knex } from "knex"
import { env } from "./src/config/env.js"

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
      afterCreate: (conn: any, done: (err?: Error) => void) => {
        conn.query(`SET TIME ZONE 'UTC'; SET search_path TO "$user", public;`, done)
      },
    },
    migrations: {
      directory: "./migrations",
      extension: "ts",
      tableName: "knex_migrations",
    },
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
    pool: {
      min: 2,
      max: 10,
      afterCreate: (conn: any, done: (err?: Error) => void) => {
        conn.query(`SET TIME ZONE 'UTC'; SET search_path TO "$user", public;`, done)
      },
    },
    migrations: {
      directory: "./migrations",
      extension: "ts",
      tableName: "knex_migrations",
    },
  },
}

export default config
