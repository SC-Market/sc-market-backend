/**
 * Auctions V2 Controller
 *
 * Handles bid placement, bid listing, and auction detail retrieval.
 * Auction timer processing is in src/tasks/timers.ts.
 */

import { Post, Get, Route, Tags, Body, Request, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import logger from "../../../../logger/logger.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import { ListingsV2Controller } from "../listings/ListingsV2Controller.js"
import {
  assertSameRealm,
  hiddenFromRealViewers,
  notTestShop,
} from "../../../../services/test-accounts/isolation.js"
import { listingVisibleTo } from "../util/listing-visibility.js"
import { canModifyListing } from "../util/listing-permissions.js"
import { clampPagination } from "../util/pagination.js"
import { isUuid } from "../util/short-slug.js"
import type { Knex } from "knex"


/**
 * `where` callback over `listings as l` joined with `shops as s`: the listings
 * whose auction the viewer may open. That is the listing-detail rule, built on
 * the shared grid rule (listingVisibleTo: public, the viewer's orgs' private
 * listings, test shops for test accounts only) plus link-only unlisted
 * listings, which the detail page serves to whoever has the link. Site admins
 * also see private listings, as on the detail page.
 */
export function auctionVisibleTo(
  db: Knex,
  viewerUserId: string | undefined,
  viewerIsAdmin: boolean,
): (this: Knex.QueryBuilder) => void {
  const columns = {
    visibility: "l.visibility",
    ownerContractorId: "s.owner_contractor_id",
    shopId: "l.shop_id",
  }
  return function () {
    this.where(listingVisibleTo(db, viewerUserId, columns)).orWhere(function () {
      this.whereIn("l.visibility", viewerIsAdmin ? ["unlisted", "private"] : ["unlisted"])
        .whereRaw(hiddenFromRealViewers(db, notTestShop("l.shop_id"), viewerUserId))
    })
  }
}

/**
 * Row shape of the auction-detail bid query: one active bid, its bidder's
 * account columns, and the bidder's stable number on this auction (1 = the
 * first account that bid). `amount` is a bigint, which the pg driver returns
 * as a string.
 */
interface BidWithBidderRow {
  bid_id: string
  bidder_id: string
  amount: string
  is_active: boolean
  created_at: Date
  bidder_number: string | number
  username: string
  display_name: string
  avatar: string | null
}

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
  /**
   * Who placed the bid. Only the seller side (whoever may manage the listing's
   * shop) sees the real account. Everyone else sees "Bidder N", numbered by
   * first bid on this auction, with no username or avatar; `is_you` marks the
   * viewer's own bid.
   */
  bidder: {
    username: string | null
    display_name: string
    avatar: string | null
    bidder_number: number
    is_you: boolean
  }
  amount: number
  is_active: boolean
  created_at: string
}

interface AuctionDetailResponse {
  listing_id: string
  end_time: string
  min_bid_increment: number
  buyout_price: number | null
  /**
   * The seller's reserve. Only present for the seller side; everyone else
   * gets `has_reserve` and `reserve_met`.
   */
  reserve_price?: number | null
  has_reserve: boolean
  /** Whether the highest bid meets the reserve. null when there is no reserve. */
  reserve_met: boolean | null
  /** Whether the viewer is on the seller side (may manage the listing's shop). */
  is_seller: boolean
  status: string
  current_highest_bid: number | null
  /** Number of active bids (one per bidder), across all pages. */
  total_bids: number
  page: number
  page_size: number
  /** Active bids, highest first, paginated. */
  bids: BidDetail[]
}

@Route("auctions")
@Tags("Auctions V2")
export class AuctionsV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get auction details and bids for a listing.
   *
   * The auction is visible exactly when its listing is: public listings to
   * everyone, unlisted ones to whoever has the link, private ones to members
   * of the owning org, and test shops' listings to test accounts only. Others
   * get a 404.
   *
   * @param page 1-based page of bids (default 1)
   * @param page_size Bids per page (default 20, max 100)
   */
  @Get("{listingId}")
  public async getAuctionDetail(
    @Path() listingId: string,
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<AuctionDetailResponse> {
    this.request = request
    // Viewer-dependent (seller side, "you", private listings): never cache.
    this.setHeader("Cache-Control", "private, no-store")
    const pagination = clampPagination(page, page_size, { defaultPageSize: 20 })
    if (!isUuid(listingId)) this.throwNotFound("Auction", listingId)
    const knex = getKnex()
    const viewerId = this.tryGetUserId()

    const listing = await knex("listings as l")
      .join("shops as s", "l.shop_id", "s.shop_id")
      .where("l.listing_id", listingId)
      .where(auctionVisibleTo(knex, viewerId, this.isAdmin()))
      .first<{ shop_id: string } | undefined>("l.shop_id")
    if (!listing) this.throwNotFound("Auction", listingId)

    const auction = await knex("auction_details_v2").where({ listing_id: listingId }).first()
    if (!auction) this.throwNotFound("Auction", listingId)

    const isSeller = viewerId ? await canModifyListing(listing, viewerId) : false

    const summary = await knex("bids_v2")
      .where({ listing_id: listingId, is_active: true })
      .first<{ total: string | number; highest: string | null }>(
        knex.raw("count(*) as total"),
        knex.raw("max(amount) as highest"),
      )
    const total = Number(summary?.total ?? 0)
    const highest = summary?.highest != null ? parseInt(String(summary.highest)) : null

    // Stable per-auction bidder numbers: the order in which accounts first bid.
    const bidderNumbers = knex("bids_v2")
      .where({ listing_id: listingId })
      .groupBy("bidder_id")
      .select(
        "bidder_id",
        knex.raw("row_number() over (order by min(created_at), bidder_id) as bidder_number"),
      )
    const bids = await knex
      .with("bidder_numbers", bidderNumbers)
      .from("bids_v2 as b")
      .join("bidder_numbers as bn", "bn.bidder_id", "b.bidder_id")
      .join("accounts as a", "a.user_id", "b.bidder_id")
      .where({ "b.listing_id": listingId, "b.is_active": true })
      .orderBy([
        { column: "b.amount", order: "desc" },
        { column: "b.created_at", order: "asc" },
        { column: "b.bid_id", order: "asc" },
      ])
      .limit(pagination.page_size)
      .offset(pagination.offset)
      .select<BidWithBidderRow[]>(
        "b.bid_id",
        "b.bidder_id",
        "b.amount",
        "b.is_active",
        "b.created_at",
        "bn.bidder_number",
        "a.username",
        "a.display_name",
        "a.avatar",
      )

    const reserve =
      auction.reserve_price != null ? parseInt(String(auction.reserve_price)) : null

    return {
      listing_id: listingId,
      end_time: new Date(auction.end_time).toISOString(),
      min_bid_increment: parseInt(auction.min_bid_increment),
      buyout_price: auction.buyout_price ? parseInt(auction.buyout_price) : null,
      ...(isSeller ? { reserve_price: reserve } : {}),
      has_reserve: reserve !== null,
      reserve_met: reserve === null ? null : highest !== null && highest >= reserve,
      is_seller: isSeller,
      status: auction.status,
      current_highest_bid: highest,
      total_bids: total,
      page: pagination.page,
      page_size: pagination.page_size,
      bids: await Promise.all(
        bids.map(async (b) => {
          const bidderNumber = Number(b.bidder_number)
          const isYou = viewerId !== undefined && b.bidder_id === viewerId
          return {
            bid_id: b.bid_id,
            bidder: isSeller
              ? {
                  username: b.username,
                  display_name: b.display_name,
                  avatar: b.avatar ? await cdn.getFileLinkResource(b.avatar) : null,
                  bidder_number: bidderNumber,
                  is_you: isYou,
                }
              : {
                  username: null,
                  display_name: `Bidder ${bidderNumber}`,
                  avatar: null,
                  bidder_number: bidderNumber,
                  is_you: isYou,
                },
            amount: parseInt(b.amount),
            is_active: b.is_active,
            created_at: new Date(b.created_at).toISOString(),
          }
        }),
      ),
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

    const result = await withTransaction(async (trx) => {
      // 1. Validate auction exists and is active
      if (!isUuid(listingId)) this.throwNotFound("Auction", listingId)
      // Only on auctions the bidder may see (same rule as the detail).
      const visible = await trx("listings as l")
        .join("shops as s", "l.shop_id", "s.shop_id")
        .where("l.listing_id", listingId)
        .where(auctionVisibleTo(knex, userId, this.isAdmin()))
        .first("l.listing_id")
      if (!visible) this.throwNotFound("Auction", listingId)
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

      // 2. Validate bidder is not the seller (check shop ownership)
      const listing = await trx("listings").where({ listing_id: listingId }).first()
      // Test accounts bid only on test shops' auctions, real ones on real ones.
      await assertSameRealm({ users: [userId], shops: [listing?.shop_id] }, trx)
      if (await canModifyListing({ shop_id: listing.shop_id }, userId)) {
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

    // Send notifications after transaction commits
    try {
      const listingsController = new ListingsV2Controller()
      const listingDetail = await listingsController.getListingDetail(listingId)
      await notificationService.createMarketBidNotificationV2(
        listingDetail,
        requestBody.amount,
        userId,
        result.bid_id,
      )
    } catch (e) {
      logger.error("Failed to send bid notification", { listing_id: listingId, error: e })
    }

    return result
  }
}
