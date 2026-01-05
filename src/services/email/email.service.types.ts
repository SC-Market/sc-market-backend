/**
 * Email service types and interfaces
 */

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
}

/**
 * Email sending result
 */
export interface EmailResult {
  messageId?: string
  status: "sent" | "failed"
  error?: string
}

/**
 * Email template data structure
 */
export interface EmailTemplateData {
  // User data
  userName: string
  userDisplayName: string
  locale: string

  // Notification data
  notificationType: string
  notificationTitle: string
  notificationBody: string
  actionUrl: string // Link to relevant page

  // Branding
  siteName: string
  siteUrl: string
  logoUrl?: string

  // Unsubscribe
  unsubscribeUrl: string
  preferencesUrl: string

  // Notification-specific data
  [key: string]: any // Order, offer, message data, etc.
}

/**
 * Notification email data (passed to sendNotificationEmail)
 * The notificationType is passed as a separate parameter, not in this data object
 */
export interface NotificationEmailData {
  [key: string]: any // Order, offer, message data, etc.
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
  ): Promise<boolean>

  // Email verification
  generateVerificationToken(userId: string, email: string): Promise<string>
  verifyEmail(token: string): Promise<{ userId: string; email: string } | null>

  // Email management
  validateEmail(email: string): boolean
  getUserEmail(userId: string): Promise<UserEmail | null>
  isEmailVerified(userId: string): Promise<boolean>

  // Bounce handling
  markEmailAsInvalid(userId: string, reason: string): Promise<void>
  handleBounce(email: string, reason: string): Promise<void>
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
}
