import {
  process_auctions,
  process_expiring_market_listings,
  rebuild_search_view,
  update_price_history,
} from "./timers.js"
import { fetchAndInsertCommodities } from "./commodities.js"

export function start_tasks() {
  process_auctions()
  setInterval(process_auctions, 5 * 60 * 1000) // 5 minutes

  process_expiring_market_listings()
  setInterval(process_expiring_market_listings, 60 * 60 * 1000) // 1 hour

  rebuild_search_view()
  setInterval(rebuild_search_view, 10 * 60 * 1000) // 5 minutes

  update_price_history()
  setInterval(update_price_history, 6 * 60 * 60 * 1000) // 6 hours, twice as long as needed

  fetchAndInsertCommodities()
  setInterval(fetchAndInsertCommodities, 24 * 60 * 60 * 1000) // 24 hours
}
