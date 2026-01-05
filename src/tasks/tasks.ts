import {
  process_auctions,
  process_expiring_market_listings,
  rebuild_search_view,
  refresh_badge_view,
  update_price_history,
  clear_uploads_folder,
  cleanup_push_subscriptions,
} from "./timers.js"
import { fetchAndInsertCommodities } from "./commodities.js"
import { processDiscordQueue } from "./discord-queue-consumer.js"
import { processEmailQueue } from "./email-queue-consumer.js"
import {
  logSQSConfigurationStatus,
  checkDiscordSQSConfiguration,
  checkEmailSQSConfiguration,
} from "../clients/aws/sqs-config.js"
import { env } from "../config/env.js"
import logger from "../logger/logger.js"

export function start_tasks() {
  // Log SQS configuration status
  logSQSConfigurationStatus()

  process_auctions()
  setInterval(process_auctions, 5 * 60 * 1000) // 5 minutes

  process_expiring_market_listings()
  setInterval(process_expiring_market_listings, 60 * 60 * 1000) // 1 hour

  rebuild_search_view()
  setInterval(rebuild_search_view, 5 * 60 * 1000) // 5 minutes

  refresh_badge_view()
  setInterval(refresh_badge_view, 4 * 60 * 60 * 1000) // 4 hours (reduced frequency for better optimization)

  update_price_history()
  setInterval(update_price_history, 6 * 60 * 60 * 1000) // 6 hours, twice as long as needed

  fetchAndInsertCommodities()
  setInterval(fetchAndInsertCommodities, 24 * 60 * 60 * 1000) // 24 hours

  // Clear uploads folder on server start
  clear_uploads_folder()

  // Process Discord queue every 5 seconds (only if Discord SQS is configured)
  const discordConfig = checkDiscordSQSConfiguration()
  if (discordConfig.isDiscordConfigured) {
    processDiscordQueue()
    setInterval(processDiscordQueue, 5 * 1000) // 5 seconds
  } else {
    logger.debug(
      "Discord queue processing disabled - Discord SQS not configured",
      { missingConfig: discordConfig.missingConfig },
    )
  }

  // Process Email queue every 5 seconds (only if Email SQS is configured)
  const emailConfig = checkEmailSQSConfiguration()
  if (emailConfig.isEmailConfigured) {
    processEmailQueue()
    setInterval(processEmailQueue, 5 * 1000) // 5 seconds
  } else {
    logger.debug("Email queue processing disabled - Email SQS not configured", {
      missingConfig: emailConfig.missingConfig,
    })
  }

  // Clean up invalid push subscriptions daily
  // This removes subscriptions that have been revoked, expired, or are invalid
  cleanup_push_subscriptions()
  setInterval(cleanup_push_subscriptions, 24 * 60 * 60 * 1000) // 24 hours
}
