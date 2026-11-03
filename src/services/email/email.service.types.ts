/**
 * Email service types and interfaces
 */

import type { Knex } from "knex"
import type { EmailBounceType } from "../../clients/database/db-models.js"
import type { BounceOutcome } from "./email-feedback.js"

/**
 * Email sending options
 */
export interface EmailOptions {
  to: string
  subject: string
  html: string
  text: string
  from?: string
  replyTo?: string
  /** Extra headers (RFC 8058 List-Unsubscribe); sent raw when present. */
  headers?: Record<string, string>
  /**
   * Send even if the address is marked undeliverable (bounced or complained).
   * Only the verification email sets it: following its link is how a user
   * clears a bounce (Settings › Email).
   */
  toBouncedAddress?: boolean
}

/**
 * Email sending result
 */
export interface EmailResult {
  messageId?: string
  /** suppressed: not sent, the address is marked undeliverable (email-feedback.ts). */
  status: "sent" | "failed" | "suppressed"
  error?: string
}

/**
 * Email template data structure
 */
export interface EmailTemplateData {
  // User data
  userName: string
  userDisplayName: string
  /** The email's language (i18n EmailLocale); templates and subject use it. */
  locale: string

  // Notification data
  notificationType: string
  notificationTitle: string
  notificationBody: string
  actionUrl: string // Link to relevant page
  /** Hidden preview text shown after the subject in the inbox (base layout). */
  preheader?: string

  // Branding
  siteName: string
  siteUrl: string
  logoUrl?: string

  // Unsubscribe: no link for mandatory categories and transactional email
  unsubscribeUrl?: string
  preferencesUrl: string
  /** One-time notice that the key email defaults were turned on (email_defaults_notices). */
  defaultsNotice?: { unsubscribeUrl: string; preferencesUrl: string }

  // Notification-specific data
  [key: string]: unknown // Order, offer, message data, etc.
}

/**
 * Notification email data (passed to sendNotificationEmail)
 * The notificationType is passed as a separate parameter, not in this data object
 */
export interface NotificationEmailData {
  [key: string]: unknown // Order, offer, message data, etc.
}

/**
 * The exact preference scope to check at send time: an org id, or null for
 * the recipient's Personal preferences. notify() sets it (it resolved the
 * preference under this scope). Without it, the send-time check uses the
 * contractor id passed, else the order's / offer's contractor_id in the data,
 * as the legacy senders expect.
 */
export interface EmailPreferenceScope {
  contractorId: string | null
}

/**
 * Email service interface
 */
export interface EmailService {
  // Email sending
  sendEmail(options: EmailOptions): Promise<EmailResult>
  sendVerificationEmail(
    userId: string,
    email: string,
    skipQueue?: boolean,
  ): Promise<void>
  sendNotificationEmail(
    userId: string,
    notificationType: string,
    data: NotificationEmailData,
    skipQueue?: boolean,
    contractorId?: string | null,
    preferenceScope?: EmailPreferenceScope,
  ): Promise<boolean>

  // Email verification
  generateVerificationToken(userId: string, email: string): Promise<string>
  verifyEmail(token: string): Promise<{ userId: string; email: string } | null>

  // Email management
  validateEmail(email: string): boolean
  getUserEmail(userId: string): Promise<UserEmail | null>
  isEmailVerified(userId: string): Promise<boolean>

  // SES feedback (email-feedback.ts), from the SES feedback webhook
  handleBounce(
    email: string,
    type: EmailBounceType,
    subtype: string | null,
    db?: Knex | Knex.Transaction,
  ): Promise<BounceOutcome>
  handleDelivery(email: string, db?: Knex | Knex.Transaction): Promise<number>
}

/**
 * User email record (simplified from DBUserEmail)
 */
export interface UserEmail {
  email_id: string
  user_id: string
  email: string
  email_verified: boolean
  is_primary: boolean
  /** Undeliverable since (bounce or complaint); null when deliverable. */
  email_bounced_at: Date | null
}
