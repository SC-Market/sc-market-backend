/**
 * Email unsubscribe tokens database operations.
 * This module contains all database queries for email_unsubscribe_tokens table.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import crypto from "crypto"

/**
 * Get a Knex query builder instance.
 */
const knex = () => getKnex()

/**
 * Email unsubscribe token record.
 */
export interface DBEmailUnsubscribeToken {
  token_id: string
  user_id: string
  email_id: string
  email: string
  token: string
  used_at: Date | null
  created_at: Date
}

/**
 * Generate a cryptographically secure unsubscribe token.
 * @returns 32-byte random token encoded as hex (64 characters)
 */
export function generateUnsubscribeToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Create a new email unsubscribe token.
 * Tokens don't expire but are single-use.
 * @param userId - User ID
 * @param emailId - Email ID from user_emails table
 * @param email - Email address (denormalized for quick lookup)
 * @returns Created token record
 */
export async function createUnsubscribeToken(
  userId: string,
  emailId: string,
  email: string,
): Promise<DBEmailUnsubscribeToken> {
  const token = generateUnsubscribeToken()

  const [created] = await knex()<DBEmailUnsubscribeToken>(
    "email_unsubscribe_tokens",
  )
    .insert({
      user_id: userId,
      email_id: emailId,
      email: email,
      token: token,
      used_at: null,
      created_at: new Date(),
    })
    .returning("*")

  return created
}

/**
 * Get unsubscribe token by token string.
 * @param token - Unsubscribe token
 * @returns Token record or null if not found
 */
export async function getUnsubscribeToken(
  token: string,
): Promise<DBEmailUnsubscribeToken | null> {
  const result = await knex()<DBEmailUnsubscribeToken>(
    "email_unsubscribe_tokens",
  )
    .where("token", token)
    .first()

  return result || null
}

/**
 * Mark unsubscribe token as used.
 * @param tokenRecord - Token record to mark as used
 * @returns Updated token record
 */
export async function markUnsubscribeTokenAsUsed(
  tokenRecord: DBEmailUnsubscribeToken,
): Promise<DBEmailUnsubscribeToken> {
  await knex()<DBEmailUnsubscribeToken>("email_unsubscribe_tokens")
    .where("token_id", tokenRecord.token_id)
    .update({ used_at: new Date() })

  return {
    ...tokenRecord,
    used_at: new Date(),
  }
}

/**
 * Get all unsubscribe tokens for a user.
 * @param userId - User ID
 * @returns Array of token records
 */
export async function getUserUnsubscribeTokens(
  userId: string,
): Promise<DBEmailUnsubscribeToken[]> {
  return await knex()<DBEmailUnsubscribeToken>("email_unsubscribe_tokens")
    .where("user_id", userId)
    .orderBy("created_at", "desc")
}

/**
 * Get active (unused) unsubscribe tokens for a user and email.
 * @param userId - User ID
 * @param emailId - Email ID
 * @returns Array of active token records
 */
export async function getActiveUnsubscribeTokens(
  userId: string,
  emailId: string,
): Promise<DBEmailUnsubscribeToken[]> {
  return await knex()<DBEmailUnsubscribeToken>("email_unsubscribe_tokens")
    .where("user_id", userId)
    .where("email_id", emailId)
    .whereNull("used_at")
    .orderBy("created_at", "desc")
}

/**
 * Delete an unsubscribe token.
 * @param tokenId - Token ID
 * @returns True if deleted, false if not found
 */
export async function deleteUnsubscribeToken(
  tokenId: string,
): Promise<boolean> {
  const deleted = await knex()<DBEmailUnsubscribeToken>(
    "email_unsubscribe_tokens",
  )
    .where("token_id", tokenId)
    .delete()

  return deleted > 0
}

/**
 * Cleanup old used unsubscribe tokens.
 * This should be called periodically (e.g., daily cron job).
 * Deletes tokens that were used more than 30 days ago.
 * @returns Number of tokens deleted
 */
export async function cleanupOldUnsubscribeTokens(): Promise<number> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const deleted = await knex()<DBEmailUnsubscribeToken>(
    "email_unsubscribe_tokens",
  )
    .whereNotNull("used_at")
    .where("used_at", "<", thirtyDaysAgo)
    .delete()

  return deleted
}
