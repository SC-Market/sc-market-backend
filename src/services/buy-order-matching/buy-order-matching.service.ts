import { getKnex } from "../../clients/database/knex-db.js"
import { pushNotificationService } from "../push-notifications/push-notification.service.js"
import { PushNotificationPayload } from "../push-notifications/push-notification.service.types.js"
import logger from "../../logger/logger.js"
import { env } from "../../config/env.js"

interface ListingMatchInfo {
  listing_id: string
  game_item_id: string
  shop_id: string
  price: number
  quality_tier?: number
  quality_value?: number
  title?: string
}

/**
 * Check active buy orders that match a newly created listing.
 * Notifies buyers via push notification when a listing matches their buy order criteria.
 */
export async function checkBuyOrderMatches(listing: ListingMatchInfo): Promise<void> {
  const db = getKnex()

  try {
    // Resolve shop owner user to exclude self-matches
    const shop = await db("shops").where("shop_id", listing.shop_id).first()
    const ownerUserId = shop?.owner_user_id

    let query = db("buy_orders_v2 as bo")
      .join("game_items as gi", "bo.game_item_id", "gi.id")
      .where("bo.status", "active")
      .where("bo.game_item_id", listing.game_item_id)
      // Don't notify the buyer about their own shop's listings
      .where(function () {
        if (ownerUserId) {
          this.whereNot("bo.buyer_id", ownerUserId)
        }
        if (shop?.owner_contractor_id) {
          this.whereNotIn("bo.buyer_id", db("contractor_members").where("contractor_id", shop.owner_contractor_id).select("user_id"))
        }
      })
      // Price within buy order's range
      .where("bo.price_max", ">=", listing.price)
      .where("bo.price_min", "<=", listing.price)
      .select("bo.buy_order_id", "bo.buyer_id", "gi.name as game_item_name")

    // Quality tier matching
    if (listing.quality_tier != null) {
      query = query.where(function () {
        this.whereNull("bo.quality_tier_min")
          .orWhere(function () {
            this.where("bo.quality_tier_min", "<=", listing.quality_tier!)
              .where("bo.quality_tier_max", ">=", listing.quality_tier!)
          })
      })
    } else {
      query = query.whereNull("bo.quality_tier_min")
    }

    // Quality value matching
    if (listing.quality_value != null) {
      query = query.where(function () {
        this.whereNull("bo.quality_value_min")
          .orWhere(function () {
            this.where("bo.quality_value_min", "<=", listing.quality_value!)
              .where("bo.quality_value_max", ">=", listing.quality_value!)
          })
      })
    } else {
      query = query.whereNull("bo.quality_value_min")
    }

    const matches = await query

    if (matches.length === 0) return

    logger.info("Buy order matches found for new listing", {
      listing_id: listing.listing_id,
      game_item_id: listing.game_item_id,
      match_count: matches.length,
    })

    const baseUrl = env.FRONTEND_URL || "https://sc-market.space"

    // Deduplicate by buyer (only one notification per buyer per listing)
    const notifiedBuyers = new Set<string>()

    for (const match of matches) {
      if (notifiedBuyers.has(match.buyer_id)) continue
      notifiedBuyers.add(match.buyer_id)

      const notification: PushNotificationPayload = {
        title: "Buy Order Match",
        body: `A new listing matches your buy order for ${match.game_item_name}`,
        data: {
          url: `${baseUrl}/market/listing/${listing.listing_id}`,
          type: "buy_order_match",
          entityId: match.buy_order_id,
        },
      }

      pushNotificationService
        .sendPushNotification(match.buyer_id, notification, "buy_order_match")
        .catch((err) => {
          logger.error("Failed to send buy order match notification", {
            buyerId: match.buyer_id,
            buyOrderId: match.buy_order_id,
            error: err,
          })
        })
    }
  } catch (error) {
    logger.error("Failed to check buy order matches", {
      listing_id: listing.listing_id,
      error,
    })
  }
}
