/**
 * Auctions V2 Controller
 *
 * Handles bid placement, bid listing, and auction detail retrieval.
 * Auction timer processing is in src/tasks/timers.ts.
 */

import { Post, Get, Route, Tags, Body, Request, Path, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import logger from "../../../../logger/logger.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"

interface PlaceBidRequest {
  amount: number
}

interface PlaceBidResponse {
  bid_id: string
  amount: number
  is_highest: boolean
  current_highest: number
}

interface BidDetail {
  bid_id: string
  bidder: { username: string; display_name: string; avatar: string | null }
  amount: number
  is_active: boolean
  created_at: string
}

interface AuctionDetailResponse {
  listing_id: string
  end_time: string
  min_bid_increment: number
  buyout_price: number | null
  reserve_price: number | null
  status: string
  current_highest_bid: number | null
  total_bids: number
  bids: BidDetail[]
}

@Route("auctions")
@Tags("Auctions V2")
export class AuctionsV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get auction details and bids for a listing
   */
  @Get("{listingId}")
  public async getAuctionDetail(
    @Path() listingId: string,
    @Request() request: ExpressRequest,
  ): Promise<AuctionDetailResponse> {
    this.request = request
    const knex = getKnex()

    const auction = await knex("auction_details_v2").where({ listing_id: listingId }).first()
    if (!auction) throw this.throwNotFound("Auction", listingId)

    const bids = await knex("bids_v2")
      .where({ listing_id: listingId, is_active: true })
      .join("accounts", "bids_v2.bidder_id", "accounts.user_id")
      .select("bids_v2.*", "accounts.username", "accounts.display_name", "accounts.avatar")
      .orderBy("amount", "desc")

    const highest = bids[0]?.amount || null

    return {
      listing_id: listingId,
      end_time: auction.end_time.toISOString(),
      min_bid_increment: parseInt(auction.min_bid_increment),
      buyout_price: auction.buyout_price ? parseInt(auction.buyout_price) : null,
      reserve_price: auction.reserve_price ? parseInt(auction.reserve_price) : null,
      status: auction.status,
      current_highest_bid: highest ? parseInt(String(highest)) : null,
      total_bids: bids.length,
      bids: bids.map((b: any) => ({
        bid_id: b.bid_id,
        bidder: { username: b.username, display_name: b.display_name, avatar: b.avatar },
        amount: parseInt(b.amount),
        is_active: b.is_active,
        created_at: b.created_at.toISOString(),
      })),
    }
  }

  /**
   * Place a bid on an auction listing
   */
  @Post("{listingId}/bids")
  @Security("loggedin")
  public async placeBid(
    @Path() listingId: string,
    @Body() requestBody: PlaceBidRequest,
    @Request() request: ExpressRequest,
  ): Promise<PlaceBidResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    return await withTransaction(async (trx) => {
      // 1. Validate auction exists and is active
      const auction = await trx("auction_details_v2").where({ listing_id: listingId }).first()
      if (!auction) throw this.throwNotFound("Auction", listingId)
      if (auction.status !== "active") {
        throw this.throwValidationError("This auction is no longer active", [
          { field: "listing_id", message: "Auction is not active" },
        ])
      }
      if (new Date(auction.end_time) <= new Date()) {
        throw this.throwValidationError("This auction has ended", [
          { field: "listing_id", message: "Auction has expired" },
        ])
      }

      // 2. Validate bidder is not the seller
      const listing = await trx("listings").where({ listing_id: listingId }).first()
      if (listing.seller_id === userId) {
        throw this.throwValidationError("Cannot bid on your own listing", [
          { field: "bidder", message: "You cannot bid on your own auction" },
        ])
      }

      // 3. Get current highest bid
      const highestBid = await trx("bids_v2")
        .where({ listing_id: listingId, is_active: true })
        .orderBy("amount", "desc")
        .first()

      const currentPrice = highestBid ? parseInt(highestBid.amount) : parseInt(listing.price || "0")
      const minBid = currentPrice + parseInt(auction.min_bid_increment)

      // 4. Validate bid amount
      if (requestBody.amount < minBid) {
        throw this.throwValidationError("Bid too low", [
          { field: "amount", message: `Bid must be at least ${minBid} (current: ${currentPrice} + increment: ${auction.min_bid_increment})` },
        ])
      }

      // 5. Deactivate user's previous bid (one active bid per user per auction)
      await trx("bids_v2")
        .where({ listing_id: listingId, bidder_id: userId, is_active: true })
        .update({ is_active: false })

      // 6. Insert new bid
      const [bid] = await trx("bids_v2").insert({
        listing_id: listingId,
        bidder_id: userId,
        bidder_type: "user",
        amount: requestBody.amount,
        is_active: true,
      }).returning("*")

      logger.info("Bid placed", { listing_id: listingId, bidder_id: userId, amount: requestBody.amount })

      return {
        bid_id: bid.bid_id,
        amount: parseInt(bid.amount),
        is_highest: true,
        current_highest: parseInt(bid.amount),
      }
    })
  }
}
