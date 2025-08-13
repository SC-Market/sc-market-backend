import {
  DBOffer,
  DBOfferSession,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  formatListingComplete,
  formatOrderAvailability,
} from "../util/formatting.js"
import { serializeService } from "../services/serializers.js"
import { DBContractOffer } from "../contracts/types.js"

export async function serializeOfferSessionStub(session: DBOfferSession) {
  const mostRecent = await database.getMostRecentOrderOffer(session.id)

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

  const itemCount = await database.getOfferMarketListingCount(mostRecent.id)
  let service_name = null
  if (mostRecent.service_id) {
    const service = await database.getService({
      service_id: mostRecent.service_id,
    })
    service_name = service!.title
  }

  return {
    id: session.id,
    contractor: session.contractor_id
      ? await database.getMinimalContractor({
          contractor_id: session.contractor_id,
        })
      : null,
    assigned_to: session.assigned_id
      ? await database.getMinimalUser({ user_id: session.assigned_id })
      : null,
    customer: await database.getMinimalUser({ user_id: session.customer_id }),
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

export async function serializeOfferSession(session: DBOfferSession) {
  const offers = await database.getOrderOffers({ session_id: session.id })

  const stub = await serializeOfferSessionStub(session)
  const contract_offer = await database
    .knex<DBContractOffer>("public_contract_offers")
    .where({ session_id: session.id })
    .first()

  const contractor = session.contractor_id
    ? await database.getContractor({ contractor_id: session.contractor_id })
    : null
  const assignee = session.assigned_id
    ? await database.getUser({ user_id: session.assigned_id })
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
  }
}

export async function serializeOffer(offer: DBOffer) {
  const listings = await database.getOfferMarketListings(offer.id)
  const market_listings = []
  for (const listing of listings) {
    const complete = await database.getMarketListingComplete(listing.listing_id)
    market_listings.push({
      listing: await formatListingComplete(complete),
      quantity: listing.quantity,
      listing_id: listing.listing_id,
    })
  }

  let service = null
  if (offer.service_id) {
    const service_obj = await database.getService({
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
