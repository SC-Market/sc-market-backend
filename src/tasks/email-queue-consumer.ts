/**
 * Email Queue Consumer
 *
 * Processes email messages from SQS queue and sends them via EmailService.
 * Follows the same pattern as the Discord queue consumer.
 */

import { receiveMessage, deleteMessage } from "../clients/aws/sqs.js"
import { env } from "../config/env.js"
import logger from "../logger/logger.js"
import { checkEmailSQSConfiguration } from "../clients/aws/sqs-config.js"
import { emailService } from "../services/email/email.service.js"
import { EmailQueueMessage } from "../services/email/email-queue.service.js"

// Track last warning time to avoid spam
let lastConfigWarning = 0

/**
 * Process email queue messages
 */
export async function processEmailQueue() {
  const config = checkEmailSQSConfiguration()

  if (!config.isEmailConfigured) {
    // Only log this once per minute to avoid spam
    const now = Date.now()
    if (!lastConfigWarning || now - lastConfigWarning > 60000) {
      logger.debug("SQS not configured - Email queue processing disabled", {
        missingConfig: config.missingConfig,
      })
      lastConfigWarning = now
    }
    return
  }

  const queueUrl = env.EMAIL_QUEUE_URL
  if (!queueUrl) {
    // Only log this once per minute to avoid spam
    const now = Date.now()
    if (!lastConfigWarning || now - lastConfigWarning > 60000) {
      logger.debug(
        "EMAIL_QUEUE_URL not configured - Email queue processing disabled",
      )
      lastConfigWarning = now
    }
    return
  }

  // Validate queue URL format (should include account ID and queue name)
  if (!queueUrl.match(/^https:\/\/sqs\.([^.]+)\.amazonaws\.com\/\d+\/.+$/)) {
    const now = Date.now()
    if (!lastConfigWarning || now - lastConfigWarning > 60000) {
      logger.error(
        "EMAIL_QUEUE_URL is invalid - must be a full SQS queue URL (e.g., https://sqs.us-east-2.amazonaws.com/123456789012/queue-name)",
        { queueUrl },
      )
      lastConfigWarning = now
    }
    return
  }

  try {
    logger.debug("Processing email queue...", { queueUrl })

    const response = await receiveMessage(queueUrl, 10)

    if (!response.Messages || response.Messages.length === 0) {
      return
    }

    logger.debug(
      `Processing ${response.Messages.length} messages from email queue`,
    )

    for (const message of response.Messages) {
      try {
        const body = JSON.parse(message.Body!) as EmailQueueMessage
        logger.debug(`Processing email message type: ${body.type}`)

        // Check if message is scheduled for future delivery
        if (body.metadata.scheduled_at) {
          const scheduledTime = new Date(body.metadata.scheduled_at)
          const now = new Date()

          if (scheduledTime > now) {
            logger.debug(
              `Message scheduled for future delivery: ${scheduledTime.toISOString()}`,
            )
            // Don't delete the message - let it be reprocessed later
            // SQS visibility timeout will handle this
            continue
          }
        }

        // Process message based on type
        switch (body.type) {
          case "notification_email":
            await handleNotificationEmail(
              body.payload as {
                userId: string
                notificationType: string
                data: any
              },
            )
            break
          case "verification_email":
            await handleVerificationEmail(
              body.payload as {
                userId: string
                email: string
              },
            )
            break
          case "digest_email":
            await handleDigestEmail(
              body.payload as {
                userId: string
                frequency: "daily" | "weekly"
                digestTime?: string
              },
            )
            break
          default:
            logger.warn("Unknown email message type:", (body as any).type)
        }

        // Delete the message after successful processing
        await deleteMessage(queueUrl, message.ReceiptHandle!)
        logger.debug(
          `Successfully processed and deleted email message: ${message.MessageId}`,
        )
      } catch (error) {
        logger.error("Error processing email queue message:", error)
        // Message will be retried automatically by SQS
        // We don't delete failed messages so they can be retried
      }
    }
  } catch (error) {
    logger.error("Error receiving email queue messages:", error)
  }
}

/**
 * Handle notification email message
 */
async function handleNotificationEmail(payload: {
  userId: string
  notificationType: string
  data: any
}) {
  const { userId, notificationType, data } = payload

  try {
    logger.debug(`Sending notification email to user ${userId}`, {
      notificationType,
    })

    // Skip queue check since we're already processing from the queue
    const sent = await emailService.sendNotificationEmail(
      userId,
      notificationType,
      data,
      true,
    )

    if (sent) {
      logger.info("Notification email sent successfully", {
        userId,
        notificationType,
      })
    } else {
      logger.debug(
        "Notification email skipped (no email, unverified, or disabled)",
        {
          userId,
          notificationType,
        },
      )
    }
  } catch (error) {
    logger.error("Failed to send notification email", {
      error,
      userId,
      notificationType,
    })
    throw error // Re-throw to trigger SQS retry
  }
}

/**
 * Handle verification email message
 */
async function handleVerificationEmail(payload: {
  userId: string
  email: string
}) {
  const { userId, email } = payload

  try {
    logger.debug(`Sending verification email to user ${userId}`, {
      email,
    })

    // Skip queue check since we're already processing from the queue
    await emailService.sendVerificationEmail(userId, email, true)

    logger.info("Verification email sent successfully", {
      userId,
      email,
    })
  } catch (error) {
    logger.error("Failed to send verification email", {
      error,
      userId,
      email,
    })
    throw error // Re-throw to trigger SQS retry
  }
}

/**
 * Handle digest email message
 */
async function handleDigestEmail(payload: {
  userId: string
  frequency: "daily" | "weekly"
  digestTime?: string
}) {
  const { userId, frequency, digestTime } = payload

  try {
    logger.debug(`Processing digest email for user ${userId}`, {
      frequency,
      digestTime,
    })

    // TODO: Implement digest email logic
    // This will need to:
    // 1. Get all unread notifications for the user
    // 2. Group them by type
    // 3. Generate a digest email template
    // 4. Send the digest email
    // 5. Mark notifications as "digested"

    logger.warn("Digest email functionality not yet implemented", {
      userId,
      frequency,
    })

    // For now, just log that we received the message
    // In the future, this will send a digest of all notifications
  } catch (error) {
    logger.error("Failed to process digest email", {
      error,
      userId,
      frequency,
    })
    throw error // Re-throw to trigger SQS retry
  }
}
