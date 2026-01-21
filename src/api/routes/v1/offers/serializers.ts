import {
  DBOffer,
  DBOfferSession,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as offerDb from "./database.js"
import * as marketDb from "../market/database.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"
import * as serviceDb from "../services/database.js"
import {
  formatListingComplete,
  formatOrderAvailability,
} from "../util/formatting.js"
import { serializeService } from "../services/serializers.js"
import { DBContractOffer } from "../contracts/types.js"
import { cdn } from "../../../../clients/cdn/cdn.js"

export async function serializeOfferSessionStub(session: DBOfferSession) {
  const mostRecent = await offerDb.getMostRecentOrderOffer(session.id)

  let status
  if (session.status === "active") {
    if (mostRecent.actor_id === session.customer_id) {
      status = "Waiting for Seller"
    } else {
      status = "Waiting for Customer"
    }
  } else {
    if (mostRecent.status === "rejected") {
      status = "Rejected"
    } else if (mostRecent.status === "accepted") {
      status = "Accepted"
    } else {
      status = "Counter Offered"
    }
  }

  const itemCount = await marketDb.getOfferMarketListingCount(mostRecent.id)
  let service_name = null
  if (mostRecent.service_id) {
    const service = await serviceDb.getService({
      service_id: mostRecent.service_id,
    })
    service_name = service!.title
  }

  return {
    id: session.id,
    contractor: session.contractor_id
      ? await contractorDb.getMinimalContractor({
          contractor_id: session.contractor_id,
        })
      : null,
    assigned_to: session.assigned_id
      ? await profileDb.getMinimalUser({ user_id: session.assigned_id })
      : null,
    customer: await profileDb.getMinimalUser({ user_id: session.customer_id }),
    status: status,
    timestamp: +mostRecent.timestamp,
    most_recent_offer: {
      cost: +mostRecent.cost,
      title: mostRecent.title,
      payment_type: mostRecent.payment_type,
      count: +itemCount.sum,
      service_name,
    },
  }
}

// Type for the optimized query result
interface OptimizedOfferSessionRow {
  // Offer session fields
  id: string
  customer_id: string
  assigned_id: string | null
  contractor_id: string | null
  status: string
  timestamp: Date

  // Most recent offer fields
  most_recent_offer_id: string
  most_recent_cost: number
  most_recent_title: string
  most_recent_payment_type: string
  most_recent_timestamp: Date
  most_recent_actor_id: string
  most_recent_status: string
  most_recent_service_id: string | null

  // Item count
  item_count: number

  // Service fields
  service_title: string | null

  // Customer account fields
  customer_username: string
  customer_avatar: string
  customer_display_name: string

  // Assigned account fields
  assigned_username: string | null
  assigned_avatar: string | null
  assigned_display_name: string | null

  // Contractor fields
  contractor_spectrum_id: string | null
  contractor_name: string | null
  contractor_avatar: string | null
}

// Optimized serializer for pre-joined data
export async function serializeOfferSessionStubOptimized(
  row: OptimizedOfferSessionRow,
) {
  let status
  if (row.status === "active") {
    if (row.most_recent_actor_id === row.customer_id) {
      status = "Waiting for Seller"
    } else {
      status = "Waiting for Customer"
    }
  } else {
    if (row.most_recent_status === "rejected") {
      status = "Rejected"
    } else if (row.most_recent_status === "accepted") {
      status = "Accepted"
    } else {
      status = "Counter Offered"
    }
  }

  // Process avatars through CDN service
  const customerAvatar = await cdn.getFileLinkResource(row.customer_avatar)
  const assignedAvatar = row.assigned_avatar
    ? await cdn.getFileLinkResource(row.assigned_avatar)
    : null
  const contractorAvatar = row.contractor_avatar
    ? await cdn.getFileLinkResource(row.contractor_avatar)
    : null

  return {
    id: row.id,
    contractor: row.contractor_id
      ? {
          spectrum_id: row.contractor_spectrum_id,
          name: row.contractor_name,
          avatar: contractorAvatar!,
        }
      : null,
    assigned_to: row.assigned_id
      ? {
          username: row.assigned_username,
          avatar: assignedAvatar!,
          display_name: row.assigned_display_name,
        }
      : null,
    customer: {
      username: row.customer_username,
      avatar: customerAvatar!,
      display_name: row.customer_display_name,
    },
    status: status,
    timestamp: +row.most_recent_timestamp,
    most_recent_offer: {
      cost: +row.most_recent_cost,
      title: row.most_recent_title,
      payment_type: row.most_recent_payment_type,
      count: +row.item_count,
      service_name: row.service_title,
    },
  }
}

export async function serializeOfferSession(session: DBOfferSession) {
  const offers = await offerDb.getOrderOffers({ session_id: session.id })

  const stub = await serializeOfferSessionStub(session)
  const contract_offer = await database
    .knex<DBContractOffer>("public_contract_offers")
    .where({ session_id: session.id })
    .first()

  const contractor = session.contractor_id
    ? await contractorDb.getContractor({ contractor_id: session.contractor_id })
    : null
  const assignee = session.assigned_id
    ? await profileDb.getUser({ user_id: session.assigned_id })
    : null

  // Check if there's an order associated with this offer session (when status is "Accepted")
  let order_id = undefined
  if (stub.status === "Accepted") {
    const order = await database
      .knex("orders")
      .where({ offer_session_id: session.id })
      .first()
    if (order) {
      order_id = order.order_id
    }
  }

  return {
    ...stub,
    contract_id: contract_offer?.contract_id || undefined,
    order_id,
    offers: await Promise.all(offers.map(serializeOffer)),
    availability: await formatOrderAvailability(session),
    discord_thread_id: session.thread_id,
    discord_server_id:
      contractor?.official_server_id || assignee?.official_server_id || null,
    discord_invite: session.discord_invite || null,
  }
}

export async function serializeOffer(offer: DBOffer) {
  const listings = await marketDb.getOfferMarketListings(offer.id)
  const market_listings = []
  for (const listing of listings) {
    const complete = await marketDb.getMarketListingComplete(listing.listing_id)
    market_listings.push({
      listing: await formatListingComplete(complete),
      quantity: listing.quantity,
      listing_id: listing.listing_id,
    })
  }

  let service = null
  if (offer.service_id) {
    const service_obj = await serviceDb.getService({
      service_id: offer.service_id,
    })
    service = await serializeService(service_obj!)
  }

  return {
    ...offer,
    market_listings,
    service,
  }
}
