/**
 * EmailService - AWS SES service for sending email notifications
 *
 * This service handles:
 * - Sending emails via AWS SES
 * - Email verification
 * - Email template rendering
 * - Email delivery logging
 */

import { env } from "../../config/env.js"
import { sendEmailViaSES } from "../../clients/aws/ses.js"
import * as userEmailDb from "../../api/routes/v1/email/user-email-database.js"
import * as emailPreferenceDb from "../../api/routes/v1/email/database.js"
import * as emailVerificationDb from "../../api/routes/v1/email/verification-database.js"
import * as unsubscribeDb from "../../api/routes/v1/email/unsubscribe-database.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import logger from "../../logger/logger.js"
import { emailQueueService } from "./email-queue.service.js"
import {
  EmailService,
  EmailOptions,
  EmailResult,
  NotificationEmailData,
  UserEmail,
} from "./email.service.types.js"
import { renderEmailTemplate } from "./template-engine.js"
import * as payloadFormatters from "./email-payload-formatters.js"
import {
  DBOrder,
  DBMessage,
  DBOrderComment,
  DBReview,
  DBOfferSession,
  DBMarketListing,
  DBMarketListingComplete,
  DBMarketBid,
  DBMarketOffer,
  DBContractorInvite,
  DBAdminAlert,
} from "../../clients/database/db-models.js"

/**
 * AWS SES implementation of EmailService
 */
class SESEmailService implements EmailService {
  /**
   * Validate email address format
   */
  validateEmail(email: string): boolean {
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Get user's primary email address
   */
  async getUserEmail(userId: string): Promise<UserEmail | null> {
    const email = await userEmailDb.getPrimaryEmail(userId)
    if (!email) {
      return null
    }

    return {
      email_id: email.email_id,
      user_id: email.user_id,
      email: email.email,
      email_verified: email.email_verified,
      is_primary: email.is_primary,
    }
  }

  /**
   * Check if user has a verified email address
   */
  async isEmailVerified(userId: string): Promise<boolean> {
    return await userEmailDb.hasVerifiedEmail(userId)
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      // Validate email address
      if (!this.validateEmail(options.to)) {
        throw new Error(`Invalid email address: ${options.to}`)
      }

      // Check if SES is configured
      if (!env.EMAIL_FROM_ADDRESS) {
        logger.warn("EMAIL_FROM_ADDRESS not configured, skipping email send", {
          to: options.to,
        })
        return {
          status: "failed",
          error: "Email service not configured",
        }
      }

      // Send via AWS SES
      const messageId = await sendEmailViaSES(
        options.to,
        options.subject,
        options.html,
        options.text,
        options.from,
        options.replyTo,
      )

      logger.info("Email sent successfully", {
        to: options.to,
        subject: options.subject,
        messageId,
      })

      return {
        messageId,
        status: "sent",
      }
    } catch (error) {
      logger.error("Failed to send email", {
        error,
        to: options.to,
        subject: options.subject,
      })

      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Send verification email
   * If EMAIL_QUEUE_URL is configured, queues the email; otherwise sends directly
   * @param skipQueue - If true, skip queueing and send directly (used by queue consumer)
   */
  async sendVerificationEmail(
    userId: string,
    email: string,
    skipQueue: boolean = false,
  ): Promise<void> {
    // If queue is enabled and not skipping queue, queue the email instead of sending directly
    if (this.isQueueEnabled() && !skipQueue) {
      try {
        await emailQueueService.queueVerificationEmail(userId, email, "high")
        logger.debug("Verification email queued", {
          userId,
          email,
        })
        return
      } catch (error) {
        logger.error(
          "Failed to queue verification email, falling back to direct send",
          {
            error,
            userId,
            email,
          },
        )
        // Fall through to direct send on queue failure
      }
    }

    // Direct send (or fallback from queue failure)
    try {
      // Get user email record
      const userEmail = await userEmailDb.getUserEmailByAddress(email)
      if (!userEmail || userEmail.user_id !== userId) {
        throw new Error("Email not found for user")
      }

      // Create verification token
      const tokenRecord = await emailVerificationDb.createVerificationToken(
        userId,
        userEmail.email_id,
        email,
      )

      // Get user profile for template data
      const userProfile = await profileDb.getUser({ user_id: userId })
      if (!userProfile) {
        throw new Error("User not found")
      }

      // Get base URL for verification link
      const baseUrl =
        env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
      const verificationUrl = `${baseUrl}/email/verify/${tokenRecord.token}`

      // Render verification email template
      const templateData = {
        userName: userProfile.username,
        userDisplayName: userProfile.display_name,
        locale: userProfile.locale || "en",
        notificationType: "email_verification",
        notificationTitle: "Verify Your Email Address",
        notificationBody:
          "Please click the link below to verify your email address.",
        actionUrl: verificationUrl,
        siteName: "SC Market",
        siteUrl: baseUrl,
        logoUrl: `${baseUrl}/scmarket-logo.png`,
        verificationUrl: verificationUrl,
        unsubscribeUrl: `${baseUrl}/settings?tab=email`, // Verification emails don't need unsubscribe tokens
        preferencesUrl: `${baseUrl}/settings?tab=email`,
      }

      const html = await renderEmailTemplate(
        "verification",
        templateData,
        "html",
      )
      const text = await renderEmailTemplate(
        "verification",
        templateData,
        "txt",
      )

      // Send email
      await this.sendEmail({
        to: email,
        subject: "Verify Your Email Address - SC Market",
        html,
        text,
      })

      logger.info("Verification email sent", {
        userId,
        email,
        tokenId: tokenRecord.token_id,
      })
    } catch (error) {
      logger.error("Failed to send verification email", {
        error,
        userId,
        email,
      })
      throw error
    }
  }

  /**
   * Generate verification token (for API use)
   */
  async generateVerificationToken(
    userId: string,
    email: string,
  ): Promise<string> {
    const userEmail = await userEmailDb.getUserEmailByAddress(email)
    if (!userEmail || userEmail.user_id !== userId) {
      throw new Error("Email not found for user")
    }

    const tokenRecord = await emailVerificationDb.createVerificationToken(
      userId,
      userEmail.email_id,
      email,
    )

    return tokenRecord.token
  }

  /**
   * Verify email address using token
   */
  async verifyEmail(
    token: string,
  ): Promise<{ userId: string; email: string } | null> {
    try {
      const result = await emailVerificationDb.verifyToken(token)
      if (!result) {
        return null
      }

      // Mark email as verified
      await userEmailDb.verifyUserEmail(result.emailId)

      logger.info("Email verified successfully", {
        userId: result.userId,
        email: result.email,
      })

      return {
        userId: result.userId,
        email: result.email,
      }
    } catch (error) {
      logger.error("Failed to verify email", { error, token })
      return null
    }
  }

  /**
   * Check if email queue is enabled
   */
  private isQueueEnabled(): boolean {
    return !!env.EMAIL_QUEUE_URL
  }

  /**
   * Send notification email
   * Checks user preferences and email verification status before sending
   * If EMAIL_QUEUE_URL is configured, queues the email; otherwise sends directly
   * @param skipQueue - If true, skip queueing and send directly (used by queue consumer)
   */
  async sendNotificationEmail(
    userId: string,
    notificationType: string,
    data: NotificationEmailData,
    skipQueue: boolean = false,
  ): Promise<boolean> {
    // If queue is enabled and not skipping queue, queue the email instead of sending directly
    if (this.isQueueEnabled() && !skipQueue) {
      try {
        await emailQueueService.queueNotificationEmail(
          userId,
          notificationType,
          data,
          "normal",
        )
        logger.debug("Notification email queued", {
          userId,
          notificationType,
        })
        return true // Return true because email was queued successfully
      } catch (error) {
        logger.error(
          "Failed to queue notification email, falling back to direct send",
          {
            error,
            userId,
            notificationType,
          },
        )
        // Fall through to direct send on queue failure
      }
    }

    // Direct send (or fallback from queue failure)
    try {
      // Get user's email
      const userEmail = await this.getUserEmail(userId)
      if (!userEmail) {
        logger.debug(
          `No email found for user ${userId}, skipping email notification`,
        )
        return false
      }

      // Check if email is verified
      if (!userEmail.email_verified) {
        logger.debug(
          `Email not verified for user ${userId}, skipping email notification`,
        )
        return false
      }

      // Get notification action to check preferences
      let actionTypeId: number | null = null
      try {
        const action =
          await notificationDb.getNotificationActionByName(notificationType)
        actionTypeId = parseInt(action.action_type_id, 10)
      } catch (error) {
        logger.warn(
          `Notification action not found: ${notificationType}, skipping preference check`,
        )
      }

      // Check email preferences if action type is known
      if (actionTypeId !== null) {
        const isEnabled = await emailPreferenceDb.isEmailEnabled(
          userId,
          actionTypeId,
        )
        if (!isEnabled) {
          logger.debug(
            `Email notifications disabled for user ${userId}, type ${notificationType}`,
          )
          return false
        }
      }

      // Format email template data based on notification type
      let templateData
      switch (notificationType) {
        case "order_create":
        case "order_assigned":
        case "order_status_fulfilled":
        case "order_status_in_progress":
        case "order_status_not_started":
        case "order_status_cancelled":
          templateData =
            await payloadFormatters.formatOrderNotificationEmailData(
              data.order as DBOrder,
              notificationType,
              userId,
            )
          break

        case "order_message":
          templateData = await payloadFormatters.formatOrderMessageEmailData(
            data.order as DBOrder,
            data.message as DBMessage,
            userId,
          )
          break

        case "order_comment":
          templateData = await payloadFormatters.formatOrderCommentEmailData(
            data.comment as DBOrderComment,
            data.order as DBOrder,
            userId,
          )
          break

        case "order_review":
          templateData = await payloadFormatters.formatOrderReviewEmailData(
            data.review as DBReview,
            userId,
          )
          break

        case "offer_create":
        case "counter_offer_create":
          if (!data.offer) {
            logger.warn(
              `Missing offer data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData =
            await payloadFormatters.formatOfferNotificationEmailData(
              data.offer as DBOfferSession,
              notificationType as "offer_create" | "counter_offer_create",
              userId,
            )
          break

        case "offer_message":
          if (!data.offer || !data.message) {
            logger.warn(
              `Missing offer or message data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatOfferMessageEmailData(
            data.offer as DBOfferSession,
            data.message as DBMessage,
            userId,
          )
          break

        case "market_item_bid":
          if (!data.listing || !data.bid) {
            logger.warn(
              `Missing listing or bid data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatMarketBidEmailData(
            data.listing as DBMarketListingComplete,
            data.bid as DBMarketBid,
            userId,
          )
          break

        case "market_item_offer":
          if (!data.listing || !data.offer) {
            logger.warn(
              `Missing listing or offer data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatMarketOfferEmailData(
            data.listing as DBMarketListing,
            data.offer as DBMarketOffer,
            userId,
          )
          break

        case "contractor_invite":
          if (!data.invite) {
            logger.warn(
              `Missing invite data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData =
            await payloadFormatters.formatContractorInviteEmailData(
              data.invite as DBContractorInvite,
              userId,
            )
          break

        case "admin_alert":
          if (!data.alert) {
            logger.warn(
              `Missing alert data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatAdminAlertEmailData(
            data.alert as DBAdminAlert,
            userId,
          )
          break

        case "public_order_create":
          // Same as order_create
          templateData =
            await payloadFormatters.formatOrderNotificationEmailData(
              data.order as DBOrder,
              "order_create",
              userId,
            )
          break

        case "order_contractor_applied":
          // Same as order_create (entity is the order)
          templateData =
            await payloadFormatters.formatOrderNotificationEmailData(
              data.order as DBOrder,
              "order_create",
              userId,
            )
          break

        case "market_bid_accepted":
        case "market_bid_declined":
          if (!data.listing || !data.bid) {
            logger.warn(
              `Missing listing or bid data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatMarketBidEmailData(
            data.listing as DBMarketListingComplete,
            data.bid as DBMarketBid,
            userId,
          )
          break

        case "market_offer_accepted":
        case "market_offer_declined":
          if (!data.listing || !data.offer) {
            logger.warn(
              `Missing listing or offer data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatMarketOfferEmailData(
            data.listing as DBMarketListing,
            data.offer as DBMarketOffer,
            userId,
          )
          break

        case "order_review_revision_requested":
          if (!data.review) {
            logger.warn(
              `Missing review data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatOrderReviewEmailData(
            data.review as DBReview,
            userId,
          )
          break

        case "order_comment":
          // Obsolete but handle gracefully
          logger.debug(
            `order_comment notification type is obsolete, skipping email`,
            { userId, notificationType },
          )
          return false

        default:
          logger.warn(
            `Unknown notification type for email: ${notificationType}`,
            { userId, notificationType },
          )
          return false
      }

      // Render email templates
      const html = await renderEmailTemplate(
        notificationType,
        templateData,
        "html",
      )
      const text = await renderEmailTemplate(
        notificationType,
        templateData,
        "txt",
      )

      // Send email
      const result = await this.sendEmail({
        to: userEmail.email,
        subject: templateData.notificationTitle,
        html,
        text,
      })

      if (result.status === "failed") {
        logger.error("Failed to send notification email", {
          userId,
          email: userEmail.email,
          notificationType,
          error: result.error,
        })
        return false
      } else {
        logger.info("Notification email sent successfully", {
          userId,
          email: userEmail.email,
          notificationType,
          messageId: result.messageId,
        })
        return true
      }
    } catch (error) {
      // Log but don't throw - email failures shouldn't break notification creation
      logger.error("Error sending notification email", {
        error,
        userId,
        notificationType,
      })
      return false
    }
  }

  /**
   * Mark email as invalid (e.g., after bounce)
   */
  async markEmailAsInvalid(userId: string, reason: string): Promise<void> {
    try {
      const userEmail = await this.getUserEmail(userId)
      if (!userEmail) {
        return
      }

      // Update email to mark as invalid (we could add an invalid flag to the table)
      // For now, we'll just log it
      logger.warn("Email marked as invalid", {
        userId,
        email: userEmail.email,
        reason,
      })

      // TODO: Add invalid flag to user_emails table or handle bounces differently
    } catch (error) {
      logger.error("Failed to mark email as invalid", {
        error,
        userId,
        reason,
      })
    }
  }

  /**
   * Handle email bounce
   */
  async handleBounce(email: string, reason: string): Promise<void> {
    try {
      const userEmail = await userEmailDb.getUserEmailByAddress(email)
      if (!userEmail) {
        logger.warn("Bounce received for unknown email", { email, reason })
        return
      }

      await this.markEmailAsInvalid(userEmail.user_id, `Bounce: ${reason}`)

      logger.warn("Email bounce handled", {
        userId: userEmail.user_id,
        email,
        reason,
      })
    } catch (error) {
      logger.error("Failed to handle email bounce", {
        error,
        email,
        reason,
      })
    }
  }
}

// Export singleton instance
export const emailService: EmailService = new SESEmailService()
