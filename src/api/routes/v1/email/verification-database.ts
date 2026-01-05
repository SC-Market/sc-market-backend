/**
 * Email verification tokens database operations.
 * This module contains all database queries for email_verification_tokens table.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import crypto from "crypto"

/**
 * Get a Knex query builder instance.
 */
const knex = () => getKnex()

/**
 * Email verification token record.
 */
export interface DBEmailVerificationToken {
  token_id: string
  user_id: string
  email_id: string
  email: string
  token: string
  expires_at: Date
  used_at: Date | null
  created_at: Date
}

/**
 * Generate a cryptographically secure verification token.
 * @returns 32-byte random token encoded as hex (64 characters)
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Create a new email verification token.
 * Tokens expire after 24 hours.
 * @param userId - User ID
 * @param emailId - Email ID from user_emails table
 * @param email - Email address (denormalized for quick lookup)
 * @returns Created token record
 */
export async function createVerificationToken(
  userId: string,
  emailId: string,
  email: string,
): Promise<DBEmailVerificationToken> {
  const token = generateVerificationToken()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 24) // 24 hours from now

  const [created] = await knex()<DBEmailVerificationToken>(
    "email_verification_tokens",
  )
    .insert({
      user_id: userId,
      email_id: emailId,
      email: email,
      token: token,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date(),
    })
    .returning("*")

  return created
}

/**
 * Get verification token by token string.
 * @param token - Verification token
 * @returns Token record or null if not found
 */
export async function getVerificationToken(
  token: string,
): Promise<DBEmailVerificationToken | null> {
  const result = await knex()<DBEmailVerificationToken>(
    "email_verification_tokens",
  )
    .where("token", token)
    .first()

  return result || null
}

/**
 * Verify a token and mark it as used.
 * Checks if token exists, is not expired, and hasn't been used.
 * @param token - Verification token
 * @returns Token record with user_id and email_id if valid, null otherwise
 */
export async function verifyToken(
  token: string,
): Promise<{ userId: string; emailId: string; email: string } | null> {
  const tokenRecord = await getVerificationToken(token)

  if (!tokenRecord) {
    return null
  }

  // Check if token is expired
  if (tokenRecord.expires_at < new Date()) {
    return null
  }

  // Check if token has already been used
  if (tokenRecord.used_at !== null) {
    return null
  }

  // Mark token as used
  await knex()<DBEmailVerificationToken>("email_verification_tokens")
    .where("token_id", tokenRecord.token_id)
    .update({ used_at: new Date() })

  return {
    userId: tokenRecord.user_id,
    emailId: tokenRecord.email_id,
    email: tokenRecord.email,
  }
}

/**
 * Get all verification tokens for a user.
 * @param userId - User ID
 * @returns Array of token records
 */
export async function getUserVerificationTokens(
  userId: string,
): Promise<DBEmailVerificationToken[]> {
  return await knex()<DBEmailVerificationToken>("email_verification_tokens")
    .where("user_id", userId)
    .orderBy("created_at", "desc")
}

/**
 * Get active (unused, not expired) verification tokens for a user and email.
 * @param userId - User ID
 * @param emailId - Email ID
 * @returns Array of active token records
 */
export async function getActiveVerificationTokens(
  userId: string,
  emailId: string,
): Promise<DBEmailVerificationToken[]> {
  const now = new Date()

  return await knex()<DBEmailVerificationToken>("email_verification_tokens")
    .where("user_id", userId)
    .where("email_id", emailId)
    .where("expires_at", ">", now)
    .whereNull("used_at")
    .orderBy("created_at", "desc")
}

/**
 * Delete a verification token.
 * @param tokenId - Token ID
 * @returns True if deleted, false if not found
 */
export async function deleteVerificationToken(
  tokenId: string,
): Promise<boolean> {
  const deleted = await knex()<DBEmailVerificationToken>(
    "email_verification_tokens",
  )
    .where("token_id", tokenId)
    .delete()

  return deleted > 0
}

/**
 * Cleanup expired and old used verification tokens.
 * This should be called periodically (e.g., daily cron job).
 * Deletes:
 * - Tokens that have expired
 * - Tokens that were used more than 7 days ago
 * @returns Number of tokens deleted
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const deleted = await knex()<DBEmailVerificationToken>(
    "email_verification_tokens",
  )
    .where("expires_at", "<", now)
    .orWhere(function () {
      this.whereNotNull("used_at").where("used_at", "<", sevenDaysAgo)
    })
    .delete()

  return deleted
}

/**
 * Invalidate all verification tokens for a specific email.
 * Used when user changes their email address.
 * @param emailId - Email ID
 * @returns Number of tokens invalidated
 */
export async function invalidateEmailTokens(emailId: string): Promise<number> {
  // Mark all unused tokens as used (effectively invalidating them)
  const updated = await knex()<DBEmailVerificationToken>(
    "email_verification_tokens",
  )
    .where("email_id", emailId)
    .whereNull("used_at")
    .update({ used_at: new Date() })

  return updated
}
