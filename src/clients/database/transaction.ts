/**
 * Transaction Utilities
 *
 * Provides standardized transaction handling with automatic timeout and cleanup.
 * Ensures atomic operations and prevents transaction leaks.
 */

import { Knex } from "knex"
import { database } from "./knex-db.js"
import logger from "../../logger/logger.js"

export interface TransactionOptions {
  isolationLevel?:
    | "READ UNCOMMITTED"
    | "READ COMMITTED"
    | "REPEATABLE READ"
    | "SERIALIZABLE"
  timeout?: number // milliseconds
}

/**
 * Execute a function within a database transaction
 * Automatically handles commit/rollback and timeout
 *
 * @param callback Function to execute within transaction
 * @param options Transaction options (isolation level, timeout)
 * @returns Result of callback function
 * @throws Error if transaction fails or times out
 *
 * @example
 * ```typescript
 * await withTransaction(async (trx) => {
 *   await trx("table1").insert(data1)
 *   await trx("table2").insert(data2)
 * })
 * ```
 */
export async function withTransaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const {
    isolationLevel = "READ COMMITTED",
    timeout = 30000, // 30 seconds default
  } = options

  const trx = await database.knex.transaction()

  // Set isolation level if supported and different from default
  if (isolationLevel !== "READ COMMITTED") {
    try {
      await trx.raw(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`)
    } catch (error) {
      logger.warn("Failed to set transaction isolation level", {
        isolationLevel,
        error,
      })
      // Continue with default isolation level
    }
  }

  let timeoutId: NodeJS.Timeout | null = null
  let transactionCompleted = false

  // Set up timeout
  timeoutId = setTimeout(async () => {
    if (!transactionCompleted) {
      try {
        await trx.rollback()
        logger.warn("Transaction timeout - rolled back", { timeout })
      } catch (error) {
        logger.error("Error during transaction timeout rollback", { error })
      }
    }
  }, timeout)

  try {
    const result = await callback(trx)
    transactionCompleted = true

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    await trx.commit()
    return result
  } catch (error) {
    transactionCompleted = true

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    try {
      await trx.rollback()
      logger.error("Transaction error - rolled back", { error })
    } catch (rollbackError) {
      logger.error("Error during transaction rollback", {
        rollbackError,
        originalError: error,
      })
    }

    throw error
  }
}

/**
 * Execute multiple operations in a single transaction
 *
 * @param operations Array of functions to execute in sequence
 * @param options Transaction options
 * @returns Array of results from each operation
 *
 * @example
 * ```typescript
 * const results = await transactionBatch([
 *   (trx) => trx("table1").insert(data1),
 *   (trx) => trx("table2").insert(data2),
 * ])
 * ```
 */
export async function transactionBatch<T>(
  operations: Array<(trx: Knex.Transaction) => Promise<T>>,
  options: TransactionOptions = {},
): Promise<T[]> {
  return withTransaction(async (trx) => {
    const results: T[] = []
    for (const operation of operations) {
      results.push(await operation(trx))
    }
    return results
  }, options)
}
