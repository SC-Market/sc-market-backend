import dotenv from "dotenv"

// Load environment variables
dotenv.config()

// Set test environment variables if not already set
process.env.NODE_ENV = process.env.NODE_ENV || "test"

// Use test database URL if provided, otherwise use regular database with _test suffix
if (!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL) {
  const dbUrl = new URL(process.env.DATABASE_URL)
  dbUrl.pathname = dbUrl.pathname.replace(/\/[^/]+$/, "/scmarket_test")
  process.env.TEST_DATABASE_URL = dbUrl.toString()
}
