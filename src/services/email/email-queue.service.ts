/**
 * EmailQueueService - Service for queuing emails to SQS
 *
 * This service handles queuing email notifications to SQS for async processing.
 * Follows the same pattern as the Discord queue service.
 */

import { sendMessage } from "../../clients/aws/sqs.js"
import { env } from "../../config/env.js"
import { checkEmailSQSConfiguration } from "../../clients/aws/sqs-config.js"
import logger from "../../logger/logger.js"
import { NotificationEmailData } from "./email.service.types.js"

/**
 * Email queue message types
 */
export type EmailQueueMessageType =
  | "notification_email"
  | "verification_email"
  | "digest_email"

/**
 * Base email queue message structure
 */
interface BaseEmailQueueMessage {
  type: EmailQueueMessageType
  payload: any
  metadata: {
    created_at: string
    priority?: "high" | "normal" | "low"
    scheduled_at?: string // ISO timestamp for scheduled sending
  }
}

/**
 * Notification email queue message
 */
interface NotificationEmailQueueMessage extends BaseEmailQueueMessage {
  type: "notification_email"
  payload: {
    userId: string
    notificationType: string
    data: NotificationEmailData
  }
}

/**
 * Verification email queue message
 */
interface VerificationEmailQueueMessage extends BaseEmailQueueMessage {
  type: "verification_email"
  payload: {
    userId: string
    email: string
  }
}

/**
 * Digest email queue message
 */
interface DigestEmailQueueMessage extends BaseEmailQueueMessage {
  type: "digest_email"
  payload: {
    userId: string
    frequency: "daily" | "weekly"
    digestTime?: string // HH:MM format
  }
}

export type EmailQueueMessage =
  | NotificationEmailQueueMessage
  | VerificationEmailQueueMessage
  | DigestEmailQueueMessage

/**
 * EmailQueueService interface
 */
export interface EmailQueueService {
  /**
   * Queue a notification email
   */
  queueNotificationEmail(
    userId: string,
    notificationType: string,
    data: NotificationEmailData,
    priority?: "high" | "normal" | "low",
  ): Promise<void>

  /**
   * Queue a verification email
   */
  queueVerificationEmail(
    userId: string,
    email: string,
    priority?: "high" | "normal" | "low",
  ): Promise<void>

  /**
   * Queue a digest email (for daily/weekly digests)
   */
  queueDigestEmail(
    userId: string,
    frequency: "daily" | "weekly",
    digestTime?: string,
  ): Promise<void>
}

/**
 * SQS-based implementation of EmailQueueService
 */
class SQSEmailQueueService implements EmailQueueService {
  private getQueueUrl(): string | null {
    const queueUrl = env.EMAIL_QUEUE_URL
    if (!queueUrl) {
      return null
    }

    // Validate queue URL format (should include account ID and queue name)
    // Format: https://sqs.{region}.amazonaws.com/{account-id}/{queue-name}
    if (!queueUrl.match(/^https:\/\/sqs\.([^.]+)\.amazonaws\.com\/\d+\/.+$/)) {
      logger.warn(
        "EMAIL_QUEUE_URL is invalid - must be a full SQS queue URL (e.g., https://sqs.us-east-2.amazonaws.com/123456789012/queue-name)",
        { queueUrl },
      )
      return null
    }

    return queueUrl
  }

  /**
   * Queue a notification email
   */
  async queueNotificationEmail(
    userId: string,
    notificationType: string,
    data: NotificationEmailData,
    priority: "high" | "normal" | "low" = "normal",
  ): Promise<void> {
    const queueUrl = this.getQueueUrl()
    if (!queueUrl) {
      logger.debug("EMAIL_QUEUE_URL not configured - skipping email queue", {
        userId,
        notificationType,
      })
      return
    }

    const config = checkEmailSQSConfiguration()
    if (!config.isEmailConfigured) {
      logger.debug("SQS not configured - skipping email queue", {
        userId,
        notificationType,
        missingConfig: config.missingConfig,
      })
      return
    }

    try {
      const message: NotificationEmailQueueMessage = {
        type: "notification_email",
        payload: {
          userId,
          notificationType,
          data,
        },
        metadata: {
          created_at: new Date().toISOString(),
          priority,
        },
      }

      await sendMessage(queueUrl, message)

      logger.debug("Email notification queued successfully", {
        userId,
        notificationType,
        priority,
      })
    } catch (error) {
      logger.error("Failed to queue email notification", {
        error,
        userId,
        notificationType,
      })
      throw error
    }
  }

  /**
   * Queue a verification email
   */
  async queueVerificationEmail(
    userId: string,
    email: string,
    priority: "high" | "normal" | "low" = "high",
  ): Promise<void> {
    const queueUrl = this.getQueueUrl()
    if (!queueUrl) {
      logger.debug(
        "EMAIL_QUEUE_URL not configured - skipping verification email queue",
        {
          userId,
          email,
        },
      )
      return
    }

    const config = checkEmailSQSConfiguration()
    if (!config.isEmailConfigured) {
      logger.debug("SQS not configured - skipping verification email queue", {
        userId,
        email,
        missingConfig: config.missingConfig,
      })
      return
    }

    try {
      const message: VerificationEmailQueueMessage = {
        type: "verification_email",
        payload: {
          userId,
          email,
        },
        metadata: {
          created_at: new Date().toISOString(),
          priority,
        },
      }

      await sendMessage(queueUrl, message)

      logger.debug("Verification email queued successfully", {
        userId,
        email,
      })
    } catch (error) {
      logger.error("Failed to queue verification email", {
        error,
        userId,
        email,
      })
      throw error
    }
  }

  /**
   * Queue a digest email (for daily/weekly digests)
   */
  async queueDigestEmail(
    userId: string,
    frequency: "daily" | "weekly",
    digestTime?: string,
  ): Promise<void> {
    const queueUrl = this.getQueueUrl()
    if (!queueUrl) {
      logger.debug(
        "EMAIL_QUEUE_URL not configured - skipping digest email queue",
        {
          userId,
          frequency,
        },
      )
      return
    }

    const config = checkEmailSQSConfiguration()
    if (!config.isEmailConfigured) {
      logger.debug("SQS not configured - skipping digest email queue", {
        userId,
        frequency,
        missingConfig: config.missingConfig,
      })
      return
    }

    try {
      // Calculate scheduled_at based on frequency and digestTime
      let scheduledAt: string | undefined
      if (digestTime) {
        const [hours, minutes] = digestTime.split(":").map(Number)
        const now = new Date()
        const scheduled = new Date()
        scheduled.setHours(hours, minutes, 0, 0)

        // If the time has passed today, schedule for tomorrow
        if (scheduled < now) {
          scheduled.setDate(scheduled.getDate() + 1)
        }

        scheduledAt = scheduled.toISOString()
      }

      const message: DigestEmailQueueMessage = {
        type: "digest_email",
        payload: {
          userId,
          frequency,
          digestTime,
        },
        metadata: {
          created_at: new Date().toISOString(),
          priority: "low",
          scheduled_at: scheduledAt,
        },
      }

      await sendMessage(queueUrl, message)

      logger.debug("Digest email queued successfully", {
        userId,
        frequency,
        scheduledAt,
      })
    } catch (error) {
      logger.error("Failed to queue digest email", {
        error,
        userId,
        frequency,
      })
      throw error
    }
  }
}

// Export singleton instance
export const emailQueueService: EmailQueueService = new SQSEmailQueueService()
