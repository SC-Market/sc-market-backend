/**
 * Watchlist price alerts.
 *
 * When a listing is created, repriced or becomes publicly visible, find the
 * watchlist items it satisfies and alert their owners over the channels each
 * owner enabled for `price_alert` (site notification, push, email, Discord DM).
 *
 * A listing only alerts when it is publicly listed (active, public, same rule
 * as the anonymous market grid) and priced above the "WTB" placeholder price.
 *
 * A watchlist item matches when the listing is at or below its max_price and:
 * - it has a game_item_id: the listing is for exactly that game item;
 * - otherwise: the listing title contains the query as a phrase.
 */

import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { pushNotificationService } from "../push-notifications/push-notification.service.js"
import { discordService } from "../discord/discord.service.js"
import { emailService } from "../email/email.service.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import logger from "../../logger/logger.js"
import { PushNotificationPayload } from "../push-notifications/push-notification.service.types.js"
import { env } from "../../config/env.js"
import { listingPubliclyListed } from "../../api/routes/v2/util/listing-visibility.js"
import { PLACEHOLDER_PRICE_MAX } from "../../api/routes/v2/util/placeholder-price.js"
import { dispatchNotification } from "../notifications/channel-preferences.js"

export const PRICE_ALERT_ACTION = "price_alert"

/** Minimum time between two alerts for the same watchlist item. */
export const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000

/** A listing_search row that may be broadcast to watchers. */
export interface AlertableListing {
  listing_id: string
  title: string
  price: number
  quantity: number
  game_item_id: string | null
  seller_name: string | null
  photo: string | null
}

export interface WatchlistMatch {
  watchlist_id: string
  user_id: string
  query: string
  max_price: number
}

const LS_PUBLIC_COLUMNS = {
  status: "ls.status",
  visibility: "ls.visibility",
  ownerContractorId: "ls.shop_owner_contractor_id",
}

/**
 * Where callback: `ls` (listing_search) rows that are publicly listed and
 * priced as a real offer. Shared by the alert check and the bot's
 * `/watchlist list` "current lowest" price.
 */
export function alertableListingFilter(db: Knex): (this: Knex.QueryBuilder) => void {
  return function () {
    this.where(listingPubliclyListed(db, LS_PUBLIC_COLUMNS)).where(
      "ls.price_min",
      ">",
      PLACEHOLDER_PRICE_MAX,
    )
  }
}

/**
 * The listing's item rows that may alert anyone. Empty for private, unlisted,
 * inactive or placeholder-priced listings. A listing has one row per listed
 * item (bundles have several).
 */
export function alertableListingQuery(db: Knex, listingId: string): Knex.QueryBuilder {
  return db("listing_search as ls")
    .where("ls.listing_id", listingId)
    .where(alertableListingFilter(db))
    .select(
      "ls.listing_id",
      "ls.title",
      "ls.price_min as price",
      "ls.quantity_available as quantity",
      "ls.game_item_id",
      "ls.shop_name as seller_name",
      "ls.photo",
    )
}

/**
 * Where callback on `w` (watchlist_items): the item matches a listing of
 * `gameItemId` titled `title`. Item watches match the exact game item; text
 * watches need the query as a phrase in the title (stemmed, words adjacent and
 * in order), not merely every word somewhere in it.
 */
export function watchMatchesListing(
  gameItemId: string | null,
  title: string,
): (this: Knex.QueryBuilder) => void {
  return function () {
    this.where(function () {
      this.whereNull("w.game_item_id").whereRaw(
        "to_tsvector('english', ?) @@ phraseto_tsquery('english', w.query)",
        [title],
      )
    })
    if (gameItemId) {
      this.orWhere("w.game_item_id", gameItemId)
    }
  }
}

/** Watchlist items an alertable listing row satisfies, outside their cooldown. */
export function matchingWatchesQuery(
  db: Knex,
  listing: AlertableListing,
  now: Date,
): Knex.QueryBuilder {
  return db("watchlist_items as w")
    .where("w.max_price", ">=", listing.price)
    .where(watchMatchesListing(listing.game_item_id, listing.title))
    .where(function () {
      this.whereNull("w.last_notified_at").orWhere(
        "w.last_notified_at",
        "<",
        new Date(now.getTime() - NOTIFICATION_COOLDOWN_MS),
      )
    })
    .select("w.id as watchlist_id", "w.user_id", "w.query", "w.max_price")
}

/**
 * Check watchlist items against a listing that was just created, repriced or
 * made public. Call after the change is committed: eligibility is read from
 * the database. Never throws.
 */
export async function checkWatchlistMatches(listingId: string): Promise<void> {
  const db = getKnex()

  try {
    const rows: AlertableListing[] = await alertableListingQuery(db, listingId)
    if (rows.length === 0) return

    const now = new Date()
    // One alert per watchlist item, for the cheapest listing row it matches.
    const alerts = new Map<string, { match: WatchlistMatch; listing: AlertableListing }>()
    for (const raw of rows) {
      const listing = { ...raw, price: Number(raw.price), quantity: Number(raw.quantity) }
      const matches: WatchlistMatch[] = await matchingWatchesQuery(db, listing, now)
      for (const match of matches) {
        const prev = alerts.get(match.watchlist_id)
        if (!prev || listing.price < prev.listing.price) {
          alerts.set(match.watchlist_id, { match, listing })
        }
      }
    }
    if (alerts.size === 0) return

    logger.info("Watchlist matches found", {
      listing_id: listingId,
      match_count: alerts.size,
    })

    const notifiedIds: string[] = []
    for (const { match, listing } of alerts.values()) {
      try {
        await sendPriceAlert(match, listing)
        notifiedIds.push(match.watchlist_id)
      } catch (err) {
        logger.error("Failed to send watchlist notification", {
          watchlist_id: match.watchlist_id,
          user_id: match.user_id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (notifiedIds.length > 0) {
      await db("watchlist_items")
        .whereIn("id", notifiedIds)
        .update({ last_notified_at: now })
    }
  } catch (err) {
    logger.error("Error checking watchlist matches", {
      listing_id: listingId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Deliver one price alert over the channels the watcher enabled. */
export async function sendPriceAlert(
  match: WatchlistMatch,
  listing: AlertableListing,
): Promise<void> {
  const baseUrl = env.FRONTEND_URL || "https://sc-market.space"
  const listingUrl = `${baseUrl}/market/${listing.listing_id}`
  const price = listing.price.toLocaleString("en-US")
  const target = match.max_price.toLocaleString("en-US")
  const title = `Price Alert: ${listing.title}`

  const delivered = await dispatchNotification(match.user_id, PRICE_ALERT_ACTION, {
    site: async () => {
      const action = await notificationDb.getNotificationActionByName(PRICE_ALERT_ACTION)
      const [object] = await notificationDb.insertNotificationObjects([
        { action_type_id: action.action_type_id, entity_id: listing.listing_id },
      ])
      await notificationDb.insertNotificationChange([
        { notification_object_id: object.notification_object_id, actor_id: match.user_id },
      ])
      await notificationDb.insertNotifications([
        { notification_object_id: object.notification_object_id, notifier_id: match.user_id },
      ])
    },

    push: async () => {
      const payload: PushNotificationPayload = {
        title,
        body: `${listing.title} is listed at ${price} aUEC (your target: ${target} aUEC)`,
        icon: listing.photo || `${baseUrl}/android-chrome-192x192.png`,
        badge: `${baseUrl}/android-chrome-192x192.png`,
        data: {
          url: listingUrl,
          type: PRICE_ALERT_ACTION,
          entityId: listing.listing_id,
        },
        tag: `price-alert-${match.watchlist_id}-${listing.listing_id}`,
        requireInteraction: true,
      }
      await pushNotificationService.sendPushNotification(match.user_id, payload, PRICE_ALERT_ACTION)
    },

    email: async () => {
      await emailService.sendNotificationEmail(match.user_id, PRICE_ALERT_ACTION, {
        listing: {
          listing_id: listing.listing_id,
          title: listing.title,
          price: listing.price,
          quantity: listing.quantity,
          seller_name: listing.seller_name,
        },
        watch: { query: match.query, max_price: match.max_price },
      })
    },

    discord: async () => {
      const discordId = await profileDb.getUserDiscordId(match.user_id)
      if (!discordId) return
      await discordService.sendDirectMessage(discordId, {
        embeds: [
          {
            title,
            description:
              `**${listing.title}** is listed at **${price} aUEC**\n` +
              `Your target price: ${target} aUEC\n` +
              `Quantity: ${listing.quantity}\n` +
              (listing.seller_name ? `Seller: ${listing.seller_name}\n` : "") +
              `\n[View Listing](${listingUrl})`,
            color: 0x10b881,
            thumbnail: listing.photo ? { url: listing.photo } : undefined,
            timestamp: new Date().toISOString(),
          },
        ],
      })
    },
  })

  logger.info("Watchlist notification sent", {
    watchlist_id: match.watchlist_id,
    user_id: match.user_id,
    listing_id: listing.listing_id,
    price: listing.price,
    target: match.max_price,
    channels: delivered,
  })
}

export const watchlistService = {
  checkWatchlistMatches,
}
