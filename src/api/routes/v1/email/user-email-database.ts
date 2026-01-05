/**
 * User email database operations.
 * This module contains all database queries for user_emails table.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import { DBUserEmail } from "../../../../clients/database/db-models.js"

/**
 * Get a Knex query builder instance.
 */
const knex = () => getKnex()

/**
 * Get user's primary email address.
 * @param userId - User ID
 * @returns Primary email or null if not found
 */
export async function getPrimaryEmail(
  userId: string,
): Promise<DBUserEmail | null> {
  const result = await knex()<DBUserEmail>("user_emails")
    .where("user_id", userId)
    .where("is_primary", true)
    .first()

  return result || null
}

/**
 * Get user's email by email_id.
 * @param emailId - Email ID
 * @returns Email record or null if not found
 */
export async function getUserEmailById(
  emailId: string,
): Promise<DBUserEmail | null> {
  const result = await knex()<DBUserEmail>("user_emails")
    .where("email_id", emailId)
    .first()

  return result || null
}

/**
 * Get user's email by email address.
 * @param email - Email address
 * @returns Email record or null if not found
 */
export async function getUserEmailByAddress(
  email: string,
): Promise<DBUserEmail | null> {
  const result = await knex()<DBUserEmail>("user_emails")
    .where("email", email)
    .first()

  return result || null
}

/**
 * Get all emails for a user.
 * @param userId - User ID
 * @returns Array of email records
 */
export async function getUserEmails(userId: string): Promise<DBUserEmail[]> {
  return await knex()<DBUserEmail>("user_emails")
    .where("user_id", userId)
    .orderBy("is_primary", "desc")
    .orderBy("created_at", "desc")
}

/**
 * Create a new user email address.
 * If this is the first email for the user, it will be set as primary.
 * If the user already has a primary email, the new email will not be primary.
 * @param userId - User ID
 * @param email - Email address
 * @param isPrimary - Whether this should be the primary email (defaults to true if user has no emails)
 * @returns Created email record
 */
export async function createUserEmail(
  userId: string,
  email: string,
  isPrimary?: boolean,
): Promise<DBUserEmail> {
  // Check if user already has emails
  const existingEmails = await getUserEmails(userId)
  const hasPrimary = existingEmails.some((e) => e.is_primary)

  // If no primary email exists, this must be primary
  // If isPrimary is explicitly false but user has no emails, we still make it primary
  const shouldBePrimary = isPrimary ?? !hasPrimary

  // If setting as primary and user already has a primary, unset the old primary
  if (shouldBePrimary && hasPrimary) {
    await knex()<DBUserEmail>("user_emails")
      .where("user_id", userId)
      .where("is_primary", true)
      .update({ is_primary: false, updated_at: new Date() })
  }

  // Create new email record
  const [created] = await knex()<DBUserEmail>("user_emails")
    .insert({
      user_id: userId,
      email: email,
      email_verified: false,
      is_primary: shouldBePrimary,
      created_at: new Date(),
      updated_at: new Date(),
      verified_at: null,
    })
    .returning("*")

  return created
}

/**
 * Update user email address.
 * @param emailId - Email ID
 * @param updates - Fields to update
 * @returns Updated email record or null if not found
 */
export async function updateUserEmail(
  emailId: string,
  updates: Partial<
    Pick<DBUserEmail, "email" | "email_verified" | "verified_at">
  >,
): Promise<DBUserEmail | null> {
  const updateData: Partial<DBUserEmail> = {
    ...updates,
    updated_at: new Date(),
  }

  const [updated] = await knex()<DBUserEmail>("user_emails")
    .where("email_id", emailId)
    .update(updateData)
    .returning("*")

  return updated || null
}

/**
 * Set an email as the primary email for a user.
 * This will unset any existing primary email.
 * @param userId - User ID
 * @param emailId - Email ID to set as primary
 * @returns Updated email record or null if not found
 */
export async function setPrimaryEmail(
  userId: string,
  emailId: string,
): Promise<DBUserEmail | null> {
  // Unset existing primary email
  await knex()<DBUserEmail>("user_emails")
    .where("user_id", userId)
    .where("is_primary", true)
    .update({ is_primary: false, updated_at: new Date() })

  // Set new primary email
  const [updated] = await knex()<DBUserEmail>("user_emails")
    .where("email_id", emailId)
    .where("user_id", userId)
    .update({ is_primary: true, updated_at: new Date() })
    .returning("*")

  return updated || null
}

/**
 * Verify an email address.
 * @param emailId - Email ID
 * @returns Updated email record or null if not found
 */
export async function verifyUserEmail(
  emailId: string,
): Promise<DBUserEmail | null> {
  const [updated] = await knex()<DBUserEmail>("user_emails")
    .where("email_id", emailId)
    .update({
      email_verified: true,
      verified_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*")

  return updated || null
}

/**
 * Delete a user email address.
 * If deleting the primary email, the most recent email will become primary (if any exist).
 * @param emailId - Email ID
 * @returns True if deleted, false if not found
 */
export async function deleteUserEmail(emailId: string): Promise<boolean> {
  // Get the email to check if it's primary
  const email = await getUserEmailById(emailId)
  if (!email) {
    return false
  }

  const wasPrimary = email.is_primary
  const userId = email.user_id

  // Delete the email
  const deleted = await knex()<DBUserEmail>("user_emails")
    .where("email_id", emailId)
    .delete()

  // If we deleted the primary email, set the most recent email as primary
  if (wasPrimary && deleted > 0) {
    const remainingEmails = await getUserEmails(userId)
    if (remainingEmails.length > 0) {
      // Set the most recent email as primary
      await setPrimaryEmail(userId, remainingEmails[0].email_id)
    }
  }

  return deleted > 0
}

/**
 * Check if a user has a verified email address.
 * @param userId - User ID
 * @returns True if user has a verified primary email
 */
export async function hasVerifiedEmail(userId: string): Promise<boolean> {
  const email = await getPrimaryEmail(userId)
  return email?.email_verified ?? false
}
