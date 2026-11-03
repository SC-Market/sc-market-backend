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
import { redactToken } from "../../util/redact.js"
import { sendEmailViaSES } from "../../clients/aws/ses.js"
import { preferencesUrl, unsubscribeLinksFor } from "./unsubscribe-token.js"
import { markDefaultsNoticeShown, pendingDefaultsNotice } from "./defaults-notice.js"
import * as userEmailDb from "../../api/routes/v1/email/user-email-database.js"
import * as emailPreferenceDb from "../../api/routes/v1/email/database.js"
import * as emailVerificationDb from "../../api/routes/v1/email/verification-database.js"
import * as unsubscribeDb from "../../api/routes/v1/email/unsubscribe-database.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import logger from "../../logger/logger.js"
import { currentTrace } from "../notify/trace.js"
import { emailQueueService } from "./email-queue.service.js"
import {
  EmailService,
  EmailOptions,
  EmailResult,
  NotificationEmailData,
  UserEmail,
  type EmailPreferenceScope,
} from "./email.service.types.js"
import { renderEmailTemplate } from "./template-engine.js"
import * as payloadFormatters from "./email-payload-formatters.js"
import {
  DBOrder,
  DBMessage,
  DBReview,
  DBOfferSession,
  DBMarketListing,
  DBMarketListingComplete,
  DBMarketBid,
  DBMarketOffer,
  DBContractorInvite,
  DBAdminAlert,
} from "../../clients/database/db-models.js"
import { deliverableRecipients } from "../test-accounts/isolation.js"
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import type { EmailBounceType } from "../../clients/database/db-models.js"
import { recordBounce, recordDelivery, type BounceOutcome } from "./email-feedback.js"

/**
 * NotificationEmailData is an open bag of caller-supplied entities, so its
 * members arrive as `unknown`. Read the `contractor_id` off one of those
 * entities without assuming anything else about its shape.
 */
function readContractorId(entity: unknown): string | undefined {
  if (typeof entity !== "object" || entity === null) return undefined
  const { contractor_id } = entity as { contractor_id?: unknown }
  return typeof contractor_id === "string" ? contractor_id : undefined
}

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
      email_bounced_at: email.email_bounced_at,
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

      // Undeliverable addresses (hard bounce, complaint, soft bounces in a
      // row; email-feedback.ts) get nothing until the user re-verifies.
      if (!options.toBouncedAddress && (await userEmailDb.isAddressUndeliverable(options.to))) {
        logger.info("Email not sent: address is marked undeliverable", {
          subject: options.subject,
        })
        return { status: "suppressed", error: "Address is marked undeliverable" }
      }

      // Send via AWS SES
      const messageId = await sendEmailViaSES(
        options.to,
        options.subject,
        options.html,
        options.text,
        options.from,
        options.replyTo,
        options.headers,
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
        // Transactional: no unsubscribe link (nothing to unsubscribe from).
        preferencesUrl: preferencesUrl(),
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
        // Re-verifying is how a bounced address is cleared.
        toBouncedAddress: true,
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
      logger.error("Failed to verify email", { error, token: redactToken(token) })
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
   * @param contractorId - Optional contractor ID if notification is for an organization
   */
  async sendNotificationEmail(
    userId: string,
    notificationType: string,
    data: NotificationEmailData,
    skipQueue: boolean = false,
    contractorId?: string | null,
    preferenceScope?: EmailPreferenceScope,
  ): Promise<boolean> {
    // Shadow-mode parity (services/notify/shadow.ts). The queue consumer
    // checks preferences with the contractor id found in the data.
    currentTrace()?.email.push({
      userId,
      action: notificationType,
      contractorId: readContractorId(data.order) ?? readContractorId(data.offer) ?? null,
    })

    // A test account's actions never reach a real user (services/test-accounts).
    if ((await deliverableRecipients([userId])).length === 0) return false

    // If queue is enabled and not skipping queue, queue the email instead of sending directly
    if (this.isQueueEnabled() && !skipQueue) {
      try {
        await emailQueueService.queueNotificationEmail(
          userId,
          notificationType,
          data,
          "normal",
          preferenceScope,
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

      if (userEmail.email_bounced_at) {
        logger.debug(
          `Email undeliverable (bounced) for user ${userId}, skipping email notification`,
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

      // The preference scope of this email: notify() passes the exact one
      // (Personal included); legacy senders pass a contractor id or leave it
      // to the order's / offer's contractor_id in the data. The check below
      // and the unsubscribe link use it.
      let contractorIdToCheck: string | null = preferenceScope
        ? preferenceScope.contractorId
        : (contractorId ?? null)
      if (!preferenceScope && contractorIdToCheck === null) {
        const orderContractorId = readContractorId(data.order)
        const offerContractorId = readContractorId(data.offer)
        if (orderContractorId) {
          contractorIdToCheck = orderContractorId
        } else if (offerContractorId) {
          contractorIdToCheck = offerContractorId
        }
      }

      // Check email preferences if action type is known
      if (actionTypeId !== null) {
        // Defaults and mandatory events come from the notify() catalog:
        // invites email by default (owner decision), admin alerts always.
        const { emailDefaultFor } = await import("../notify/catalog.js")
        const policy = emailDefaultFor(notificationType)
        let isEnabled: boolean
        if (policy.mandatory) {
          isEnabled = true
        } else if (policy.defaultOn) {
          const pref = await emailPreferenceDb.getEmailPreference(userId, actionTypeId, contractorIdToCheck)
          const { isOrgMuted } = await import("../notify/preferences.js")
          isEnabled = (pref?.enabled ?? true) && !(await isOrgMuted(userId, contractorIdToCheck))
        } else {
          isEnabled = await emailPreferenceDb.isEmailEnabled(userId, actionTypeId, contractorIdToCheck)
        }
        if (!isEnabled) {
          logger.debug(
            `Email notifications disabled for user ${userId}, type ${notificationType}, contractor_id: ${contractorIdToCheck}`,
            {
              user_id: userId,
              notification_type: notificationType,
              action_type_id: actionTypeId,
              contractor_id: contractorIdToCheck,
            },
          )
          return false
        }
        logger.debug(
          `Email notification preference check passed for user ${userId}`,
          {
            user_id: userId,
            notification_type: notificationType,
            action_type_id: actionTypeId,
            contractor_id: contractorIdToCheck,
            preference_enabled: true,
          },
        )
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

        case "contract_offer_received":
        case "offer_accepted":
        case "offer_rejected":
          if (!data.offer) {
            logger.warn(
              `Missing offer data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = {
            ...(await payloadFormatters.formatOfferNotificationEmailData(
              data.offer as DBOfferSession,
              "offer_create",
              userId,
            )),
            notificationType,
            notificationTitle:
              notificationType === "contract_offer_received"
                ? "New Offer on Your Contract"
                : notificationType === "offer_accepted"
                  ? "Offer Accepted"
                  : "Offer Rejected",
          }
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

        case "price_alert":
          if (!data.listing || !data.watch) {
            logger.warn(
              `Missing listing or watch data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatPriceAlertEmailData(
            data.listing as payloadFormatters.PriceAlertEmailListing,
            data.watch as payloadFormatters.PriceAlertEmailWatch,
            userId,
          )
          break

        case "offer_pending_reminder":
        case "offer_pending_final_reminder":
        case "offer_waiting_buyer":
          if (!data.offerReminder) {
            logger.warn(
              `Missing offer reminder data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatOfferReminderEmailData(
            data.offerReminder as payloadFormatters.OfferReminderEmailData,
            notificationType,
            userId,
          )
          break

        case "storefront_enquiry_accepted":
        case "storefront_enquiry_declined":
          if (!data.enquiry) {
            logger.warn(
              `Missing enquiry data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatStorefrontEnquiryDecisionEmailData(
            data.enquiry as payloadFormatters.StorefrontEnquiryEmailData,
            notificationType,
            userId,
          )
          break

        case "account_identity_changed":
          if (!data.identity) {
            logger.warn(
              `Missing identity data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatIdentityChangedEmailData(
            data.identity as payloadFormatters.IdentityChangedEmailData,
            userId,
          )
          break

        case "buy_order_filled":
          if (!data.buyOrderFill) {
            logger.warn(
              `Missing buy order fill data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatBuyOrderFilledEmailData(
            data.buyOrderFill as payloadFormatters.BuyOrderFilledEmailData,
            userId,
          )
          break

        case "dm_reminder":
          if (!data.reminder) {
            logger.warn(
              `Missing reminder data for email notification: ${notificationType}`,
              { userId, notificationType },
            )
            return false
          }
          templateData = await payloadFormatters.formatUnreadReminderEmailData(
            data.reminder as payloadFormatters.UnreadReminderEmailData,
            userId,
          )
          break

        default:
          logger.warn(
            `Unknown notification type for email: ${notificationType}`,
            { userId, notificationType },
          )
          return false
      }

      // One-click unsubscribe for this email's category and scope (no link
      // for mandatory categories), and the one-time defaults notice.
      const links = unsubscribeLinksFor(userId, notificationType, contractorIdToCheck)
      templateData = {
        ...templateData,
        unsubscribeUrl: links.unsubscribeUrl,
        preferencesUrl: links.preferencesUrl,
      }
      const notice = await pendingDefaultsNotice(userId)
      if (notice) templateData.defaultsNotice = notice

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
        headers: links.headers,
      })
      if (notice && result.status === "sent") await markDefaultsNoticeShown(userId)

      if (result.status !== "sent") {
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
   * A bounce or complaint SES reported for an address (SES feedback webhook,
   * email-feedback.ts): hard bounces and complaints mark it undeliverable,
   * soft bounces count toward SOFT_BOUNCE_LIMIT.
   */
  async handleBounce(
    email: string,
    type: EmailBounceType,
    subtype: string | null,
    db: Knex | Knex.Transaction = getKnex(),
  ): Promise<BounceOutcome> {
    const outcome = await recordBounce(db, email, type, subtype)
    if (outcome.matched === 0) {
      logger.info("SES feedback for an address that is no user's", { type, subtype })
    } else {
      logger.warn("Email bounce recorded", { type, subtype, ...outcome })
    }
    return outcome
  }

  /** A delivery SES reported for an address (SES feedback webhook). Returns rows matched. */
  async handleDelivery(
    email: string,
    db: Knex | Knex.Transaction = getKnex(),
  ): Promise<number> {
    return recordDelivery(db, email)
  }
}

// Export singleton instance
export const emailService: EmailService = new SESEmailService()
