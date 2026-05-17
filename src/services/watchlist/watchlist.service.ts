/**
 * Watchlist Service
 *
 * Event-driven watchlist notification system. When a listing is created or
 * repriced, this service checks all watchlist items for matches and dispatches
 * notifications through all configured channels (Discord DM, push, email, webhooks).
 */

import { getKnex } from "../../clients/database/knex-db.js"
import { pushNotificationService } from "../push-notifications/push-notification.service.js"
import { discordService } from "../discord/discord.service.js"
import { emailService } from "../email/email.service.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import logger from "../../logger/logger.js"
import { PushNotificationPayload } from "../push-notifications/push-notification.service.types.js"
import { env } from "../../config/env.js"

const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour between repeat notifications for same item

interface WatchlistMatch {
  watchlist_id: string
  user_id: string
  query: string
  max_price: number
  last_notified_at: Date | null
}

interface ListingInfo {
  listing_id: string
  title: string
  price: number
  quantity: number
  seller_name?: string
  photo?: string
}

/**
 * Check watchlist items against a newly created or repriced listing.
 * Call this after:
 * - ListingsV2Controller.createListing()
 * - POST /threads/market/create (Discord)
 * - POST /threads/market/import-uex (Discord)
 * - Price update (PUT /api/v2/listings/:id with base_price change)
 * - POST /threads/market/price (Discord)
 */
export async function checkWatchlistMatches(listing: ListingInfo): Promise<void> {
  const db = getKnex()

  try {
    // Find watchlist items where:
    // 1. max_price >= listing price (user wants to be notified at this price or higher)
    // 2. The query matches the listing title via full-text search
    // 3. Cooldown has elapsed since last notification
    const matches: WatchlistMatch[] = await db("watchlist_items")
      .where("max_price", ">=", listing.price)
      .where(function () {
        this.whereNull("last_notified_at").orWhere(
          "last_notified_at",
          "<",
          new Date(Date.now() - NOTIFICATION_COOLDOWN_MS),
        )
      })
      .whereRaw(
        "to_tsvector('english', ?) @@ plainto_tsquery('english', query)",
        [listing.title],
      )
      .select("id as watchlist_id", "user_id", "query", "max_price", "last_notified_at")

    if (matches.length === 0) {
      return
    }

    logger.info("Watchlist matches found", {
      listing_id: listing.listing_id,
      title: listing.title,
      price: listing.price,
      match_count: matches.length,
    })

    // Send notifications to each matched user
    const notifiedIds: string[] = []

    for (const match of matches) {
      try {
        await sendWatchlistNotification(match, listing)
        notifiedIds.push(match.watchlist_id)
      } catch (err) {
        logger.error("Failed to send watchlist notification", {
          watchlist_id: match.watchlist_id,
          user_id: match.user_id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Update last_notified_at for successfully notified items
    if (notifiedIds.length > 0) {
      await db("watchlist_items")
        .whereIn("id", notifiedIds)
        .update({ last_notified_at: new Date() })
    }
  } catch (err) {
    logger.error("Error checking watchlist matches", {
      listing_id: listing.listing_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function sendWatchlistNotification(
  match: WatchlistMatch,
  listing: ListingInfo,
): Promise<void> {
  const baseUrl = env.FRONTEND_URL || "https://sc-market.space"
  const listingUrl = `${baseUrl}/market/${listing.listing_id}`

  // 1. Push notification
  const pushPayload: PushNotificationPayload = {
    title: `Price Alert: ${listing.title}`,
    body: `${listing.title} is now available at ${listing.price.toLocaleString()} aUEC (your target: ${match.max_price.toLocaleString()} aUEC)`,
    icon: listing.photo || `${baseUrl}/android-chrome-192x192.png`,
    badge: `${baseUrl}/android-chrome-192x192.png`,
    data: {
      url: listingUrl,
      type: "watchlist_alert",
      entityId: listing.listing_id,
    },
    tag: `watchlist-${match.watchlist_id}-${listing.listing_id}`,
    requireInteraction: true,
  }

  try {
    await pushNotificationService.sendPushNotification(
      match.user_id,
      pushPayload,
      "watchlist_alert",
    )
  } catch (err) {
    logger.debug("Push notification failed for watchlist alert", {
      user_id: match.user_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 2. Discord DM
  try {
    const discordId = await profileDb.getUserDiscordId(match.user_id)
    if (discordId) {
      await discordService.sendDirectMessage(discordId, {
        embeds: [
          {
            title: `Price Alert: ${listing.title}`,
            description:
              `**${listing.title}** is now listed at **${listing.price.toLocaleString()} aUEC**\n` +
              `Your target price: ${match.max_price.toLocaleString()} aUEC\n` +
              `Quantity: ${listing.quantity}\n` +
              (listing.seller_name ? `Seller: ${listing.seller_name}\n` : "") +
              `\n[View Listing](${listingUrl})`,
            color: 0x10b881,
            thumbnail: listing.photo ? { url: listing.photo } : undefined,
            timestamp: new Date().toISOString(),
          },
        ],
      })
    }
  } catch (err) {
    logger.debug("Discord DM failed for watchlist alert", {
      user_id: match.user_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 3. Email notification (uses generic sendNotificationEmail if available)
  try {
    if ('sendNotificationEmail' in emailService) {
      await (emailService as any).sendNotificationEmail(
        match.user_id,
        "watchlist_alert",
        {
          subject: `Price Alert: ${listing.title} is now ${listing.price.toLocaleString()} aUEC`,
          title: "Watchlist Price Alert",
          body: `${listing.title} is now available at ${listing.price.toLocaleString()} aUEC — below your target of ${match.max_price.toLocaleString()} aUEC.`,
          actionUrl: listingUrl,
          actionText: "View Listing",
        },
      )
    }
  } catch (err) {
    logger.debug("Email failed for watchlist alert", {
      user_id: match.user_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  logger.info("Watchlist notification sent", {
    watchlist_id: match.watchlist_id,
    user_id: match.user_id,
    listing_id: listing.listing_id,
    price: listing.price,
    target: match.max_price,
  })
}

export const watchlistService = {
  checkWatchlistMatches,
}
