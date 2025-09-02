import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

export interface SQSConfig {
  isConfigured: boolean
  hasCredentials: boolean
  hasQueueUrls: boolean
  missingConfig: string[]
}

/**
 * Check if SQS is properly configured
 */
export function checkSQSConfiguration(): SQSConfig {
  const missingConfig: string[] = []

  // Check for AWS credentials
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

  // Check for queue URLs
  const hasQueueUrls = !!(env.DISCORD_QUEUE_URL && env.BACKEND_QUEUE_URL)

  if (!env.DISCORD_QUEUE_URL) {
    missingConfig.push("DISCORD_QUEUE_URL")
  }
  if (!env.BACKEND_QUEUE_URL) {
    missingConfig.push("BACKEND_QUEUE_URL")
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
 * Log SQS configuration status
 */
export function logSQSConfigurationStatus(): void {
  const config = checkSQSConfiguration()

  if (config.isConfigured) {
    logger.info(
      "✅ SQS configuration is complete - Discord queue functionality enabled",
    )
  } else {
    logger.warn(
      "⚠️  SQS configuration is incomplete - Discord queue functionality disabled",
    )

    if (!config.hasCredentials) {
      logger.warn(
        "Missing AWS credentials:",
        config.missingConfig
          .filter(
            (key) => key.includes("ACCESS_KEY") || key.includes("ROLE_ARN"),
          )
          .join(", "),
      )
    }

    if (!config.hasQueueUrls) {
      logger.warn(
        "Missing queue URLs:",
        config.missingConfig
          .filter((key) => key.includes("QUEUE_URL"))
          .join(", "),
      )
    }

    logger.info(
      "To enable Discord queue functionality, configure the following environment variables:",
    )
    logger.info("- BACKEND_ACCESS_KEY_ID")
    logger.info("- BACKEND_SECRET_ACCESS_KEY")
    logger.info("- BACKEND_ROLE_ARN")
    logger.info("- DISCORD_QUEUE_URL")
    logger.info("- BACKEND_QUEUE_URL")
  }
}
