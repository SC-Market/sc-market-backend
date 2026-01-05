import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

export interface SQSConfig {
  isConfigured: boolean
  hasCredentials: boolean
  hasQueueUrls: boolean
  missingConfig: string[]
}

export interface DiscordSQSConfig {
  isDiscordConfigured: boolean
  hasCredentials: boolean
  hasDiscordQueueUrl: boolean
  missingConfig: string[]
}

export interface EmailSQSConfig {
  isEmailConfigured: boolean
  hasCredentials: boolean
  hasEmailQueueUrl: boolean
  missingConfig: string[]
}

/**
 * Check if AWS credentials are configured
 */
function checkAWSCredentials(): {
  hasCredentials: boolean
  missingConfig: string[]
} {
  const missingConfig: string[] = []
  const hasCredentials = !!(
    env.BACKEND_ACCESS_KEY_ID &&
    env.BACKEND_SECRET_ACCESS_KEY &&
    env.BACKEND_ROLE_ARN
  )

  if (!env.BACKEND_ACCESS_KEY_ID) {
    missingConfig.push("BACKEND_ACCESS_KEY_ID")
  }
  if (!env.BACKEND_SECRET_ACCESS_KEY) {
    missingConfig.push("BACKEND_SECRET_ACCESS_KEY")
  }
  if (!env.BACKEND_ROLE_ARN) {
    missingConfig.push("BACKEND_ROLE_ARN")
  }

  return { hasCredentials, missingConfig }
}

/**
 * Check if Discord SQS queue is properly configured
 */
export function checkDiscordSQSConfiguration(): DiscordSQSConfig {
  const missingConfig: string[] = []
  const { hasCredentials, missingConfig: credMissing } = checkAWSCredentials()
  missingConfig.push(...credMissing)

  // Check for Discord queue URL
  const hasDiscordQueueUrl = !!env.DISCORD_QUEUE_URL
  if (!env.DISCORD_QUEUE_URL) {
    missingConfig.push("DISCORD_QUEUE_URL")
  }

  const isDiscordConfigured = hasCredentials && hasDiscordQueueUrl

  return {
    isDiscordConfigured,
    hasCredentials,
    hasDiscordQueueUrl,
    missingConfig,
  }
}

/**
 * Check if Email SQS queue is properly configured
 */
export function checkEmailSQSConfiguration(): EmailSQSConfig {
  const missingConfig: string[] = []
  const { hasCredentials, missingConfig: credMissing } = checkAWSCredentials()
  missingConfig.push(...credMissing)

  // Check for Email queue URL
  const hasEmailQueueUrl = !!env.EMAIL_QUEUE_URL
  if (!env.EMAIL_QUEUE_URL) {
    missingConfig.push("EMAIL_QUEUE_URL")
  }

  const isEmailConfigured = hasCredentials && hasEmailQueueUrl

  return {
    isEmailConfigured,
    hasCredentials,
    hasEmailQueueUrl,
    missingConfig,
  }
}

/**
 * Check if SQS is properly configured (legacy function for backward compatibility)
 * Checks for Discord configuration
 */
export function checkSQSConfiguration(): SQSConfig {
  const missingConfig: string[] = []
  const { hasCredentials, missingConfig: credMissing } = checkAWSCredentials()
  missingConfig.push(...credMissing)

  // Check for queue URLs (Discord-specific)
  const hasQueueUrls = !!env.DISCORD_QUEUE_URL

  if (!env.DISCORD_QUEUE_URL) {
    missingConfig.push("DISCORD_QUEUE_URL")
  }

  const isConfigured = hasCredentials && hasQueueUrls

  return {
    isConfigured,
    hasCredentials,
    hasQueueUrls,
    missingConfig,
  }
}

/**
 * Log SQS configuration status for both Discord and Email
 */
export function logSQSConfigurationStatus(): void {
  const discordConfig = checkDiscordSQSConfiguration()
  const emailConfig = checkEmailSQSConfiguration()

  if (discordConfig.isDiscordConfigured) {
    logger.info(
      "✅ Discord SQS configuration is complete - Discord queue functionality enabled",
    )
  } else {
    logger.warn(
      "⚠️  Discord SQS configuration is incomplete - Discord queue functionality disabled",
    )
    if (discordConfig.missingConfig.length > 0) {
      logger.warn(
        "Missing Discord configuration:",
        discordConfig.missingConfig.join(", "),
      )
    }
  }

  if (emailConfig.isEmailConfigured) {
    logger.info(
      "✅ Email SQS configuration is complete - Email queue functionality enabled",
    )
  } else {
    logger.debug(
      "⚠️  Email SQS configuration is incomplete - Email queue functionality disabled",
    )
    if (emailConfig.missingConfig.length > 0) {
      logger.debug(
        "Missing Email configuration:",
        emailConfig.missingConfig.join(", "),
      )
    }
  }

  if (!discordConfig.isDiscordConfigured && !emailConfig.isEmailConfigured) {
    logger.info(
      "To enable queue functionality, configure the following environment variables:",
    )
    logger.info("- BACKEND_ACCESS_KEY_ID")
    logger.info("- BACKEND_SECRET_ACCESS_KEY")
    logger.info("- BACKEND_ROLE_ARN")
    logger.info("- DISCORD_QUEUE_URL (for Discord)")
    logger.info("- EMAIL_QUEUE_URL (for Email)")
  }
}
