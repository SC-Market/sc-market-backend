/**
 * Offers V2 Controller
 *
 * Read-only V2 serialization of V1 offer sessions.
 * Offers still live in V1 tables — this controller provides a cleaner
 * response shape with V2 variant data from offer_market_items_v2.
 * No raw user_id or contractor_id exposed — uses usernames and spectrum_ids.
 */

import { Get, Route, Tags, Request, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import {
  OfferSessionV2,
  OfferV2,
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
  @Security("jwt")
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
  @Security("jwt")
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

    // Customer
    const customerRow = await knex("accounts")
      .where({ user_id: session.customer_id })
      .select("username", "display_name", "avatar")
      .first()
    const customer = {
      username: customerRow?.username || "Unknown",
      display_name: customerRow?.display_name,
      avatar: customerRow?.avatar ? await cdn.getFileLinkResource(customerRow.avatar) : null,
    }

    // Assigned user
    let assigned_to: { username: string; display_name?: string; avatar?: string | null } | null = null
    if (session.assigned_id) {
      const row = await knex("accounts")
        .where({ user_id: session.assigned_id })
        .select("username", "display_name", "avatar")
        .first()
      if (row) {
        assigned_to = {
          username: row.username,
          display_name: row.display_name,
          avatar: row.avatar ? await cdn.getFileLinkResource(row.avatar) : null,
        }
      }
    }

    // Contractor
    let contractor: { spectrum_id: string; name: string; avatar?: string | null } | null = null
    if (session.contractor_id) {
      const row = await knex("contractors")
        .where({ contractor_id: session.contractor_id })
        .select("spectrum_id", "name", "avatar")
        .first()
      if (row) {
        contractor = {
          spectrum_id: row.spectrum_id,
          name: row.name,
          avatar: row.avatar ? await cdn.getFileLinkResource(row.avatar) : null,
        }
      }
    }

    // Order ID if accepted
    let order_id: string | undefined
    if (session.status === "closed") {
      const order = await knex("orders").where({ offer_session_id: session.id }).first()
      if (order) order_id = order.order_id
    }

    // Offers (correct table: order_offers)
    const dbOffers = await knex("order_offers").where({ session_id: session.id }).orderBy("timestamp", "asc")
    const offers: OfferV2[] = await Promise.all(dbOffers.map((o: any) => this.serializeOffer(o)))

    // Derive status
    let derivedStatus = session.status
    if (session.status === "closed") {
      derivedStatus = order_id ? "accepted" : "rejected"
    }

    return {
      session_id: session.id,
      status: derivedStatus,
      created_at: session.timestamp?.toISOString?.() || new Date().toISOString(),
      order_id,
      discord_invite: session.discord_invite || null,
      customer,
      assigned_to,
      contractor,
      offers,
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

    // V1 market listings
    const v1Listings = await knex("offer_market_items").where({ offer_id: offer.id }).select("*")

    // V2 variant items
    let v2Items: any[] = []
    try {
      const hasV2Table = await knex.schema.hasTable("offer_market_items_v2")
      if (hasV2Table) {
        v2Items = await knex("offer_market_items_v2").where({ offer_id: offer.id }).select("*")
      }
    } catch { /* ignore */ }

    const marketListings: OfferMarketListingV2[] = await Promise.all(
      v1Listings.map(async (ml: any) => {
        let title = "Unknown"
        let price = 0

        // Try V2 listings table first, fall back to V1
        const v2Listing = await knex("listings").where({ listing_id: ml.listing_id }).first()
        if (v2Listing) {
          title = v2Listing.title
          const li = await knex("listing_items").where({ listing_id: ml.listing_id }).first()
          price = li?.base_price ? parseFloat(li.base_price) : 0
        } else {
          const v1Details = await knex("market_listing_details").where({ listing_id: ml.listing_id }).first()
          if (v1Details) {
            title = v1Details.title
            price = parseFloat(v1Details.price) || 0
          }
        }

        // V2 variant items for this listing
        const listingV2Items = v2Items.filter((i: any) => i.listing_id === ml.listing_id)
        const v2Variants: OfferVariantItem[] = await Promise.all(
          listingV2Items.map(async (vi: any) => {
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

        return { listing_id: ml.listing_id, quantity: ml.quantity, title, price, v2_variants: v2Variants }
      }),
    )

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
      actor_username,
      market_listings: marketListings,
      service,
    }
  }
}
