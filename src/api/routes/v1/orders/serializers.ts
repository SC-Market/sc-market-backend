import {
  DBContractor,
  DBOrder,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  formatListingComplete,
  formatOrderAvailability,
  formatReview,
} from "../util/formatting.js"

export async function serializeAssignedOrder(
  order: DBOrder,
  contractors: DBContractor[],
) {
  return {
    order_id: order.order_id,
    kind: order.kind,
    status: order.status,
    description: order.description,
    contractor: contractors.find((c) => c.contractor_id === order.contractor_id)
      ?.spectrum_id,
    cost: +order.cost,
    title: order.title,
    assigned_to: order.assigned_id
      ? (await database.getUser({ user_id: order.assigned_id }))?.username
      : null,
    customer: (await database.getUser({ user_id: order.customer_id })).username,
    timestamp: +order.timestamp,
  }
}

export async function serializePublicOrder(order: DBOrder) {
  return {
    order_id: order.order_id,
    kind: order.kind,
    description: order.description,
    contractor: null,
    cost: +order.cost,
    title: order.title,
    payment_type: order.payment_type,
    assigned_to: null,
    customer: (await database.getUser({ user_id: order.customer_id })).username,
    timestamp: +order.timestamp,
  }
}

export async function serializeOrderDetails(
  order: DBOrder,
  contractor: string | null | undefined = undefined,
  comments = false,
  applicants = false,
  review = false,
) {
  const listings = await database.getMarketListingOrders({
    order_id: order.order_id,
  })

  const market_listings = []
  for (const listing of listings) {
    const complete = await database.getMarketListingComplete(listing.listing_id)
    market_listings.push({
      listing: await formatListingComplete(complete),
      quantity: listing.quantity,
      listing_id: listing.listing_id,
    })
  }

  const assigned_to = order.assigned_id
    ? await database.getUser({ user_id: order.assigned_id })
    : null

  return {
    order_id: order.order_id,
    status: order.status,
    kind: order.kind,
    description: order.description,
    contractor:
      contractor ||
      (order.contractor_id &&
        (await database.getContractor({ contractor_id: order.contractor_id }))
          .spectrum_id),
    cost: +order.cost,
    title: order.title,
    assigned_to: assigned_to?.username,
    customer: (await database.getUser({ user_id: order.customer_id })).username,
    timestamp: +order.timestamp,
    // comments: !comments ? [] : await fetchOrderComments(order.order_id), // TODO: Get order comments, but not for public orders / orders w/o perms
    applicants: !applicants
      ? []
      : await database.getOrderApplicantsPublicIds({
          order_id: order.order_id,
        }),
    market_listings: market_listings,
    customer_review: review ? await formatReview(order, "customer") : undefined,
    contractor_review: review
      ? await formatReview(order, "contractor")
      : undefined,
    availability: comments ? await formatOrderAvailability(order) : null,
    collateral: order.collateral,
    departure: order.departure,
    destination: order.destination,
    payment_type: order.payment_type,
    rush: order.rush,
    offer_session_id: order.offer_session_id,
    discord_thread_id: order.thread_id,
    discord_server_id: assigned_to?.official_server_id,
  }
}
