import { database, getKnex } from "../clients/database/knex-db.js"
import * as profileDb from "../api/routes/v1/profiles/database.js"
import * as marketDb from "../api/routes/v1/market/database.js"
import { createOffer } from "../api/routes/v1/orders/helpers.js"
import {
  DBAuctionDetails,
  DBMarketListing,
} from "../clients/database/db-models.js"
import { pushNotificationService } from "../services/push-notifications/push-notification.service.js"
import fs from "node:fs"
import path from "node:path"
import logger from "../logger/logger.js"

export async function process_auction(auction: DBAuctionDetails) {
  const complete = await marketDb.getMarketListingComplete(auction.listing_id)
  if (complete.listing.status === "archived") {
    return
  }

  const bids = await marketDb.getMarketBids({ listing_id: auction.listing_id })

  if (bids.length) {
    const winning_bid = bids.reduce((a, b) => (a.bid > b.bid ? a : b))
    const winner = await profileDb.getUser({
      user_id: winning_bid.user_bidder_id,
    })

    const quantity = 1
    // TODO: Fix auctions with new offer system
    const _ = await createOffer(
      {
        assigned_id: complete.listing.user_seller_id,
        contractor_id: complete.listing.contractor_seller_id,
        customer_id: winner.user_id,
      },
      {
        actor_id: winner.user_id,
        kind: "Delivery",
        cost: (+winning_bid.bid * quantity).toString(),
        title: `Item Sold: ${complete.details.title} (x${quantity}) to ${winner.username}`,
        description: `Complete the delivery of sold item ${complete.details.title} (x${quantity}) to ${winner.username}\n\n${complete.details.description}`,
      },
      [{ quantity, listing: complete }],
    )
  }

  await marketDb.updateAuctionDetails(
    { listing_id: auction.listing_id },
    { status: "concluded" },
  )
  await marketDb.updateMarketListing(auction.listing_id, { status: "archived" })
}

export async function process_auctions() {
  const auctions = await marketDb.getExpiringAuctions()
  auctions.forEach((a) =>
    setTimeout(
      () => process_auction(a),
      a.end_time.getTime() - new Date().getTime(),
    ),
  )
}

export async function process_expiring_market_listing(
  listing: DBMarketListing,
) {
  logger.info(`Expiring listing ${listing.listing_id}`)
  await marketDb.updateMarketListing(listing.listing_id, { status: "inactive" })
}

export async function process_expiring_market_listings() {
  const listings = await marketDb.getExpiringMarketListings()
  listings.forEach((a) =>
    setTimeout(
      () => process_expiring_market_listing(a),
      a.expiration.getTime() - new Date().getTime(),
    ),
  )
}

export async function rebuild_search_view() {
  await marketDb.rebuildMarket()
}

export async function refresh_badge_view() {
  await marketDb.refreshBadgeView()
}

export async function update_price_history() {
  await marketDb.updatePriceHistpry()
}

export async function clear_uploads_folder() {
  try {
    const uploadsDir = path.join(process.cwd(), "uploads")

    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir)
      for (const file of files) {
        const filePath = path.join(uploadsDir, file)
        try {
          const stat = fs.statSync(filePath)
          if (stat.isFile()) {
            fs.unlinkSync(filePath)
            logger.info(`Cleaned up upload file: ${file}`)
          }
        } catch (error) {
          logger.error(`Failed to delete file ${file}`, { file, error })
        }
      }
      logger.info("Uploads folder cleared on server start")
    }
  } catch (error) {
    logger.error("Failed to clear uploads folder", { error })
  }
}

/**
 * Process a single expired V2 auction.
 * Finds the winning bid, creates an offer for the winner, updates statuses.
 */
export async function process_auction_v2(auctionListingId: string) {
  const knex = getKnex()

  try {
    const auction = await knex("auction_details_v2").where({ listing_id: auctionListingId }).first()
    if (!auction || auction.status !== "active") return

    const listing = await knex("listings").where({ listing_id: auctionListingId }).first()
    if (!listing || listing.status !== "active") return

    // Get active bids sorted by amount descending
    const bids = await knex("bids_v2")
      .where({ listing_id: auctionListingId, is_active: true })
      .orderBy("amount", "desc")

    if (bids.length > 0) {
      const winningBid = bids[0]
      const winner = await profileDb.getUser({ user_id: winningBid.bidder_id })

      // Check reserve price
      if (auction.reserve_price && parseInt(winningBid.amount) < parseInt(auction.reserve_price)) {
        // Reserve not met
        await knex("auction_details_v2").where({ listing_id: auctionListingId }).update({
          status: "no_bids", concluded_at: new Date(),
        })
        await knex("listings").where({ listing_id: auctionListingId }).update({ status: "expired" })
        logger.info("V2 auction ended — reserve not met", { listing_id: auctionListingId })
        return
      }

      // Get V2 listing item for variant info
      const listingItem = await knex("listing_items").where({ listing_id: auctionListingId }).first()

      // Build V2 variant items for the offer
      const v2VariantItems = listingItem ? [{
        listing_id: auctionListingId,
        variant_id: (await knex("listing_item_lots").where({ item_id: listingItem.item_id, listed: true }).first())?.variant_id,
        quantity: 1,
        price_per_unit: parseInt(winningBid.amount),
      }].filter(i => i.variant_id) : []

      // Create offer for the winner
      await createOffer(
        {
          assigned_id: listing.seller_type === "user" ? listing.seller_id : null,
          contractor_id: listing.seller_type === "contractor" ? listing.seller_id : null,
          customer_id: winner.user_id,
        },
        {
          actor_id: winner.user_id,
          kind: "Delivery",
          cost: winningBid.amount.toString(),
          title: `Auction Won: ${listing.title} by ${winner.username}`,
          description: `Auction for ${listing.title} won by ${winner.username} with bid of ${parseInt(winningBid.amount).toLocaleString()} aUEC`,
        },
        [],
        v2VariantItems.length > 0 ? v2VariantItems : undefined,
      )

      // Update auction as concluded
      await knex("auction_details_v2").where({ listing_id: auctionListingId }).update({
        status: "concluded",
        winner_id: winningBid.bidder_id,
        winning_bid: winningBid.amount,
        concluded_at: new Date(),
      })
      await knex("listings").where({ listing_id: auctionListingId }).update({ status: "sold" })

      logger.info("V2 auction concluded", {
        listing_id: auctionListingId,
        winner: winner.username,
        winning_bid: winningBid.amount,
      })
    } else {
      // No bids
      await knex("auction_details_v2").where({ listing_id: auctionListingId }).update({
        status: "no_bids", concluded_at: new Date(),
      })
      await knex("listings").where({ listing_id: auctionListingId }).update({ status: "expired" })
      logger.info("V2 auction ended — no bids", { listing_id: auctionListingId })
    }
  } catch (error) {
    logger.error("Failed to process V2 auction", { listing_id: auctionListingId, error })
  }
}

/**
 * Poll for expired V2 auctions and schedule processing.
 */
export async function process_auctions_v2() {
  try {
    const knex = getKnex()
    const hasTable = await knex.schema.hasTable("auction_details_v2")
    if (!hasTable) return

    const expiring = await knex("auction_details_v2")
      .where("status", "active")
      .where("end_time", "<=", new Date())

    for (const auction of expiring) {
      const delay = Math.max(0, new Date(auction.end_time).getTime() - Date.now())
      setTimeout(() => process_auction_v2(auction.listing_id), delay)
    }
  } catch (error) {
    logger.error("Failed to poll V2 auctions", { error })
  }
}

/**
 * Clean up invalid push notification subscriptions
 * Removes subscriptions that have been revoked, expired, or are otherwise invalid
 * This runs periodically to keep the subscription database clean
 */
export async function cleanup_push_subscriptions() {
  try {
    await pushNotificationService.cleanupInvalidSubscriptions()
  } catch (error) {
    logger.error("Failed to cleanup push subscriptions", { error })
  }
}
