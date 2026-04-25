/**
 * Offers V2 Controller
 *
 * Read-only V2 serialization of V1 offer sessions.
 * Offers still live in V1 tables — this controller provides a cleaner
 * response shape with V2 variant data from offer_market_items_v2.
 */

import { Get, Route, Tags, Request, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../../v1/profiles/database.js"
import * as contractorDb from "../../v1/contractors/database.js"
import { formatOrderAvailability } from "../../v1/util/formatting.js"
import {
  OfferSessionV2,
  OfferV2,
  OfferMarketListingV1,
  OfferMarketListingV2,
  OfferVariantItem,
  GetOfferSessionV2Response,
  SearchOffersV2Response,
} from "../types/offers.types.js"
import logger from "../../../../logger/logger.js"

@Route("offers")
@Tags("Offers V2")
export class OffersV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get offer session with V2 variant-enriched market listings
   */
  @Get("{sessionId}")
  @Security("loggedin")
  public async getOfferSession(
    @Path() sessionId: string,
    @Request() request: ExpressRequest,
  ): Promise<GetOfferSessionV2Response> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const session = await knex("offer_sessions").where({ id: sessionId }).first()
    if (!session) throw this.throwNotFound("Offer session", sessionId)

    // Auth: must be customer, assigned, or contractor member
    if (session.customer_id !== userId && session.assigned_id !== userId) {
      if (session.contractor_id) {
        const member = await knex("contractor_members")
          .where({ contractor_id: session.contractor_id, user_id: userId })
          .first()
        if (!member) throw this.throwForbidden("Not authorized to view this offer")
      } else {
        throw this.throwForbidden("Not authorized to view this offer")
      }
    }

    return this.serializeSession(session)
  }

  /**
   * Search offers for the current user
   */
  @Get("search")
  @Security("loggedin")
  public async searchOffers(
    @Request() request: ExpressRequest,
    @Query() role?: "customer" | "seller",
    @Query() status?: "active" | "closed",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<SearchOffersV2Response> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()
    const p = Math.max(1, page || 1)
    const ps = Math.min(100, Math.max(1, page_size || 20))

    let query = knex("offer_sessions")

    if (role === "customer") {
      query = query.where("customer_id", userId)
    } else if (role === "seller") {
      query = query.where((qb) => {
        qb.where("assigned_id", userId).orWhereIn(
          "contractor_id",
          knex("contractor_members").where("user_id", userId).select("contractor_id"),
        )
      })
    } else {
      query = query.where((qb) => {
        qb.where("customer_id", userId)
          .orWhere("assigned_id", userId)
          .orWhereIn(
            "contractor_id",
            knex("contractor_members").where("user_id", userId).select("contractor_id"),
          )
      })
    }

    if (status) query = query.where("status", status)

    const [{ count }] = await query.clone().clearSelect().clearOrder().count("* as count")
    const total = parseInt(String(count), 10)

    const sessions = await query.orderBy("timestamp", "desc").limit(ps).offset((p - 1) * ps)

    const offers = await Promise.all(sessions.map((s: any) => this.serializeSession(s)))

    return { offers, total, page: p, page_size: ps }
  }

  private async serializeSession(session: any): Promise<OfferSessionV2> {
    const knex = getKnex()

    // Use V1 helpers for full user data (ratings, badges, presence)
    const customer = await profileDb.getMinimalUser({ user_id: session.customer_id })
    const assigned_to = session.assigned_id
      ? await profileDb.getMinimalUser({ user_id: session.assigned_id })
      : null
    const contractor = session.contractor_id
      ? await contractorDb.getMinimalContractor({ contractor_id: session.contractor_id })
      : null

    // Order ID if accepted
    let order_id: string | undefined
    if (session.status === "closed") {
      const order = await knex("orders").where({ offer_session_id: session.id }).first()
      if (order) order_id = order.order_id
    }

    // Contract ID if linked
    const contractOffer = await knex("public_contract_offers").where({ session_id: session.id }).select("contract_id").first()
    const contract_id = contractOffer?.contract_id || null

    // Offers
    const dbOffers = await knex("order_offers").where({ session_id: session.id }).orderBy("timestamp", "desc")
    const offers: OfferV2[] = await Promise.all(dbOffers.map((o: any) => this.serializeOffer(o)))

    // Derive status
    const mostRecent = dbOffers[0]
    let derivedStatus = session.status
    if (session.status === "active") {
      derivedStatus = mostRecent?.actor_id === session.customer_id
        ? "Waiting for Seller"
        : "Waiting for Customer"
    } else if (mostRecent?.status === "rejected") {
      derivedStatus = "Rejected"
    } else if (mostRecent?.status === "accepted") {
      derivedStatus = "Accepted"
    } else {
      derivedStatus = "Counter Offered"
    }

    // Availability
    const availability = await formatOrderAvailability(session)

    // Discord
    const assignee = session.assigned_id
      ? await knex("accounts").where({ user_id: session.assigned_id }).select("official_server_id").first()
      : null
    const contractorRow = session.contractor_id
      ? await knex("contractors").where({ contractor_id: session.contractor_id }).select("official_server_id").first()
      : null

    return {
      session_id: session.id,
      status: derivedStatus,
      created_at: session.timestamp ? new Date(+session.timestamp).toISOString() : new Date().toISOString(),
      order_id,
      contract_id,
      discord_thread_id: session.thread_id || null,
      discord_server_id: contractorRow?.official_server_id || assignee?.official_server_id || null,
      discord_invite: session.discord_invite || null,
      customer,
      assigned_to,
      contractor,
      offers,
      availability,
    }
  }

  private async serializeOffer(offer: any): Promise<OfferV2> {
    const knex = getKnex()

    // Resolve actor_id to username
    let actor_username = "Unknown"
    if (offer.actor_id) {
      const actor = await knex("accounts").where({ user_id: offer.actor_id }).select("username").first()
      if (actor) actor_username = actor.username
    }

    // V1 market listings — kept as their own type
    const v1Rows = await knex("offer_market_items").where({ offer_id: offer.id }).select("*")
    const market_listings: OfferMarketListingV1[] = await Promise.all(
      v1Rows.map(async (row: any) => {
        let title = "Unknown"
        let price = 0
        const v1 = await knex("market_unique_listings")
          .join("market_listing_details", "market_unique_listings.details_id", "market_listing_details.details_id")
          .join("market_listings", "market_unique_listings.listing_id", "market_listings.listing_id")
          .where("market_unique_listings.listing_id", row.listing_id)
          .first("market_listing_details.title", "market_listings.price")
        if (v1) { title = v1.title; price = parseFloat(v1.price) || 0 }
        return { listing_id: row.listing_id, quantity: row.quantity, title, price }
      }),
    )

    // V2 variant items — kept as their own type
    let v2Items: any[] = []
    try {
      v2Items = await knex("offer_market_items_v2").where({ offer_id: offer.id }).select("*")
    } catch (err: any) {
      logger.error("Failed to fetch offer_market_items_v2", { offer_id: offer.id, error: err.message })
    }

    const market_listings_v2: OfferMarketListingV2[] = []
    if (v2Items.length > 0) {
      // Group V2 items by listing
      const grouped = new Map<string, typeof v2Items>()
      for (const vi of v2Items) {
        if (!grouped.has(vi.listing_id)) grouped.set(vi.listing_id, [])
        grouped.get(vi.listing_id)!.push(vi)
      }

      for (const [listing_id, items] of grouped) {
        let title = "Unknown"
        let price = 0
        const v2Listing = await knex("listings").where({ listing_id }).first()
        if (v2Listing) {
          title = v2Listing.title
          const li = await knex("listing_items").where({ listing_id }).first()
          price = li?.base_price ? parseFloat(li.base_price) : 0
        }

        const photoRow = await knex("listing_photos_v2 as lp")
          .join("image_resources as ir", "lp.resource_id", "ir.resource_id")
          .where("lp.listing_id", listing_id)
          .orderBy("lp.display_order", "asc")
          .select(knex.raw("COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) as url"))
          .first()

        const totalQty = items.reduce((s: number, i: any) => s + i.quantity, 0)
        const v2Variants: OfferVariantItem[] = await Promise.all(
          items.map(async (vi: any) => {
            const variant = await knex("item_variants").where({ variant_id: vi.variant_id }).first()
            return {
              variant_id: vi.variant_id,
              quantity: vi.quantity,
              price_per_unit: parseFloat(vi.price_per_unit) || 0,
              attributes: variant?.attributes || {},
              display_name: variant?.display_name || "Standard",
              short_name: variant?.short_name || "STD",
            }
          }),
        )

        market_listings_v2.push({ listing_id, quantity: totalQty, title, price, photo: photoRow?.url || undefined, v2_variants: v2Variants })
      }
    }

    // Service
    let service: { service_id: string; title: string } | null = null
    if (offer.service_id) {
      const svc = await knex("services").where({ service_id: offer.service_id }).first()
      if (svc) service = { service_id: svc.service_id, title: svc.title }
    }

    return {
      offer_id: offer.id,
      kind: offer.kind,
      cost: parseFloat(offer.cost) || 0,
      title: offer.title || "",
      description: offer.description || "",
      payment_type: offer.payment_type || "",
      status: offer.status || "pending",
      created_at: offer.timestamp?.toISOString?.() || new Date().toISOString(),
      collateral: parseFloat(offer.collateral) || 0,
      actor_username,
      market_listings,
      market_listings_v2,
      service,
    }
  }
}
