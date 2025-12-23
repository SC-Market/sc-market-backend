import Knex, { Knex as KnexClass } from "knex"
import { KnexDatabase } from "../clients/database/knex-db.js"
import { env } from "../config/env.js"

let testKnex: KnexClass | null = null
let testDatabase: KnexDatabase | null = null
let testTransaction: KnexClass.Transaction | null = null

/**
 * Get the test database connection
 */
export function getTestDatabase(): KnexDatabase {
  if (!testDatabase) {
    const dbConfig: { [key: string]: string } = JSON.parse(
      env.DATABASE_PASS || "{}",
    )

    // Use test database if TEST_DATABASE_URL is set, otherwise use regular config
    const testDbName = process.env.TEST_DATABASE_NAME || "scmarket_test"

    const knexConfig: KnexClass.Config = {
      client: "pg",
      connection: {
        host: dbConfig.host || env.DATABASE_HOST || "localhost",
        user: dbConfig.username || env.DATABASE_USER || "postgres",
        password: dbConfig.password || env.DATABASE_PASS || "",
        database: testDbName,
        port:
          (dbConfig.port as unknown as number) ||
          (env.DATABASE_PORT ? +env.DATABASE_PORT : 5432),
      },
      pool: {
        min: 0,
        max: 5,
      },
    }

    testDatabase = new KnexDatabase(knexConfig)
    testKnex = testDatabase.knex
  }

  return testDatabase
}

/**
 * Get the test Knex instance
 */
export function getTestKnex(): KnexClass {
  if (!testKnex) {
    getTestDatabase()
  }
  return testKnex!
}

/**
 * Set up test database (run migrations, etc.)
 * This should be called once before all tests
 */
export async function setupTestDb(): Promise<void> {
  const knex = getTestKnex()

  // Check if database exists, create if it doesn't
  // Note: This requires connecting to the default postgres database first
  // For now, we'll assume the test database already exists

  // Run migrations if needed
  // You may want to run migrations here or in a separate script
}

/**
 * Tear down test database (clean up, etc.)
 * This should be called once after all tests
 */
export async function teardownTestDb(): Promise<void> {
  if (testTransaction) {
    await testTransaction.rollback()
    testTransaction = null
  }

  if (testKnex) {
    await testKnex.destroy()
    testKnex = null
  }

  testDatabase = null
}

/**
 * Begin a test transaction
 * Use this for test isolation - all changes will be rolled back
 */
export async function beginTransaction(): Promise<KnexClass.Transaction> {
  const knex = getTestKnex()
  testTransaction = await knex.transaction()
  return testTransaction
}

/**
 * Rollback the current test transaction
 */
export async function rollbackTransaction(): Promise<void> {
  if (testTransaction) {
    await testTransaction.rollback()
    testTransaction = null
  }
}

/**
 * Truncate specific tables (useful for cleaning up test data)
 */
export async function truncateTables(tables: string[]): Promise<void> {
  const knex = getTestKnex()
  const transaction = testTransaction || knex

  // Disable foreign key checks temporarily
  await transaction.raw("SET session_replication_role = 'replica'")

  for (const table of tables) {
    await transaction(table).truncate()
  }

  // Re-enable foreign key checks
  await transaction.raw("SET session_replication_role = 'origin'")
}

/**
 * Reset the entire test database
 * WARNING: This will delete all data in the test database
 */
export async function resetDatabase(): Promise<void> {
  const knex = getTestKnex()

  // Get all table names
  const tables = await knex
    .raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    .then((result) => result.rows.map((row: any) => row.tablename))

  // Truncate all tables
  await truncateTables(tables)
}

/**
 * Get the current test transaction (if any)
 */
export function getTestTransaction(): KnexClass.Transaction | null {
  return testTransaction
}
