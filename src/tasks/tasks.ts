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

  const safe = (fn: () => Promise<any>, name: string) => {
    fn().catch((err) => logger.error(`Task ${name} failed`, { error: err }))
  }

  // Stagger startup tasks to avoid memory spike (OOM risk on small containers)
  safe(rebuild_search_view, "rebuild_search_view")
  setInterval(() => safe(rebuild_search_view, "rebuild_search_view"), 5 * 60 * 1000)

  setTimeout(() => {
    safe(refresh_badge_view, "refresh_badge_view")
    setInterval(() => safe(refresh_badge_view, "refresh_badge_view"), 4 * 60 * 60 * 1000)
  }, 30_000)

  setTimeout(() => {
    safe(process_auctions, "process_auctions")
    setInterval(() => safe(process_auctions, "process_auctions"), 5 * 60 * 1000)
  }, 10_000)

  setTimeout(() => {
    safe(process_expiring_market_listings, "process_expiring_market_listings")
    setInterval(() => safe(process_expiring_market_listings, "process_expiring_market_listings"), 60 * 60 * 1000)
  }, 15_000)

  setTimeout(() => {
    safe(update_price_history, "update_price_history")
    setInterval(() => safe(update_price_history, "update_price_history"), 6 * 60 * 60 * 1000)
  }, 45_000)

  setTimeout(() => {
    safe(fetchAndInsertCommodities, "fetchAndInsertCommodities")
    setInterval(() => safe(fetchAndInsertCommodities, "fetchAndInsertCommodities"), 24 * 60 * 60 * 1000)
  }, 60_000)

  // Clear uploads folder on server start
  clear_uploads_folder()

  // Process Discord queue every 5 seconds (only if Discord SQS is configured)
  const discordConfig = checkDiscordSQSConfiguration()
  if (discordConfig.isDiscordConfigured) {
    safe(processDiscordQueue, "processDiscordQueue")
    setInterval(() => safe(processDiscordQueue, "processDiscordQueue"), 5 * 1000)
  } else {
    logger.debug(
      "Discord queue processing disabled - Discord SQS not configured",
      { missingConfig: discordConfig.missingConfig },
    )
  }

  // Process Email queue every 5 seconds (only if Email SQS is configured)
  const emailConfig = checkEmailSQSConfiguration()
  if (emailConfig.isEmailConfigured) {
    safe(processEmailQueue, "processEmailQueue")
    setInterval(() => safe(processEmailQueue, "processEmailQueue"), 5 * 1000)
  } else {
    logger.debug("Email queue processing disabled - Email SQS not configured", {
      missingConfig: emailConfig.missingConfig,
    })
  }

  // Clean up invalid push subscriptions daily
  // This removes subscriptions that have been revoked, expired, or are invalid
  safe(cleanup_push_subscriptions, "cleanup_push_subscriptions")
  setInterval(() => safe(cleanup_push_subscriptions, "cleanup_push_subscriptions"), 24 * 60 * 60 * 1000)
}
