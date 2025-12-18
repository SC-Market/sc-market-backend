import {
  process_auctions,
  process_expiring_market_listings,
  rebuild_search_view,
  refresh_badge_view,
  update_price_history,
  clear_uploads_folder,
} from "./timers.js"
import { fetchAndInsertCommodities } from "./commodities.js"
import { processDiscordQueue } from "./discord-queue-consumer.js"
import {
  logSQSConfigurationStatus,
  checkSQSConfiguration,
} from "../clients/aws/sqs-config.js"

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
  setInterval(refresh_badge_view, 5 * 60 * 1000) // 5 minutes

  update_price_history()
  setInterval(update_price_history, 6 * 60 * 60 * 1000) // 6 hours, twice as long as needed

  fetchAndInsertCommodities()
  setInterval(fetchAndInsertCommodities, 24 * 60 * 60 * 1000) // 24 hours

  // Clear uploads folder on server start
  clear_uploads_folder()

  // Process Discord queue every 5 seconds (only if SQS is configured)
  const sqsConfig = checkSQSConfiguration()
  if (sqsConfig.isConfigured) {
    processDiscordQueue()
    setInterval(processDiscordQueue, 5 * 1000) // 5 seconds
  } else {
    console.log("⚠️  Discord queue processing disabled - SQS not configured")
  }
}
