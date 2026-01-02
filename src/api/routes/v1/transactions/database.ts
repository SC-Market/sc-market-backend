/**
 * Transaction-related database operations.
 * This module contains all database queries specific to transactions.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import { DBTransaction } from "../../../../clients/database/db-models.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get a transaction by where clause.
 * @throws Error if transaction not found
 */
export async function getTransaction(where: any): Promise<DBTransaction> {
  const transaction = await knex()<DBTransaction>("transactions")
    .where(where)
    .first()

  if (!transaction) {
    throw new Error("Invalid transaction!")
  }

  return transaction
}

/**
 * Get transactions by where clause.
 */
export async function getTransactions(where: any): Promise<DBTransaction[]> {
  return knex()<DBTransaction>("transactions").where(where).select()
}

/**
 * Get user transactions (both sent and received).
 */
export async function getUserTransactions(
  user_id: string,
): Promise<DBTransaction[]> {
  return knex()<DBTransaction>("transactions")
    .where({ user_sender_id: user_id })
    .or.where({ user_recipient_id: user_id })
    .select()
}

/**
 * Get contractor transactions (both sent and received).
 */
export async function getContractorTransactions(
  contractor_id: string,
): Promise<DBTransaction[]> {
  return knex()<DBTransaction>("transactions")
    .where({ contractor_sender_id: contractor_id })
    .or.where({ contractor_recipient_id: contractor_id })
    .select()
}

/**
 * Create a new transaction.
 */
export async function createTransaction(data: any, trx?: any): Promise<void> {
  if (trx) {
    await trx("transactions").insert(data)
  } else {
    await knex()<DBTransaction>("transactions").insert(data)
  }
}
