import {
  DBContractor,
  DBOrder,
} from "../../../../clients/database/db-models.js"
import * as orderDb from "./database.js"
import * as marketDb from "../market/database.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"
import * as offerDb from "../offers/database.js"
import {
  formatListingComplete,
  formatOrderAvailability,
  formatReview,
} from "../util/formatting.js"
import { OrderLifecycleService } from "../../../../services/allocation/order-lifecycle.service.js"

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
      ? (await profileDb.getUser({ user_id: order.assigned_id }))?.username
      : null,
    customer: (await profileDb.getUser({ user_id: order.customer_id }))
      .username,
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
    customer: (await profileDb.getUser({ user_id: order.customer_id }))
      .username,
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
  const listings = await marketDb.getMarketListingOrders({
    order_id: order.order_id,
  })

  const market_listings = []
  for (const listing of listings) {
    const complete = await marketDb.getMarketListingComplete(listing.listing_id)
    market_listings.push({
      listing: await formatListingComplete(complete),
      quantity: listing.quantity,
      listing_id: listing.listing_id,
    })
  }

  const assigned_to_minimal = order.assigned_id
    ? await profileDb.getMinimalUser({ user_id: order.assigned_id })
    : null

  const customer = await profileDb.getMinimalUser({
    user_id: order.customer_id,
  })

  // Get full assigned user data for discord_server_id (only if needed)
  const assigned_to_full = order.assigned_id
    ? await profileDb.getUser({ user_id: order.assigned_id })
    : null

  // Get discord_invite from offer_session if available
  let discord_invite: string | null = null
  if (order.offer_session_id) {
    const offerSessions = await offerDb.getOfferSessions({
      id: order.offer_session_id,
    })
    if (offerSessions.length > 0) {
      discord_invite = offerSessions[0].discord_invite || null
    }
  }

  // Get allocation summary for the order
  // Requirements: 5.3, 7.1, 13.1
  let allocation_summary = null
  try {
    const lifecycleService = new OrderLifecycleService()
    const summary = await lifecycleService.getAllocationSummary(order.order_id)

    // Calculate totals and check for partial allocations
    const total_allocated = summary.reduce(
      (sum, s) => sum + s.total_quantity,
      0,
    )
    const total_requested = market_listings.reduce(
      (sum, ml) => sum + ml.quantity,
      0,
    )
    const has_partial_allocations = total_allocated < total_requested

    allocation_summary = {
      by_listing: summary.map((s) => ({
        listing_id: s.listing_id,
        total_quantity: s.total_quantity,
        allocation_count: s.allocations.length,
        status: s.status,
      })),
      total_allocated,
      total_requested,
      has_partial_allocations,
    }
  } catch {
    // If allocation summary fails, don't break the entire response
    // This maintains backward compatibility with orders created before allocation system
    allocation_summary = null
  }

  return {
    order_id: order.order_id,
    status: order.status,
    kind: order.kind,
    description: order.description,
    contractor:
      contractor ||
      (order.contractor_id &&
        (
          await contractorDb.getContractor({
            contractor_id: order.contractor_id,
          })
        ).spectrum_id),
    cost: +order.cost,
    title: order.title,
    assigned_to: assigned_to_minimal?.username,
    assigned_to_minimal: assigned_to_minimal,
    customer: customer.username,
    customer_minimal: customer,
    timestamp: +order.timestamp,
    // comments: !comments ? [] : await fetchOrderComments(order.order_id), // TODO: Get order comments, but not for public orders / orders w/o perms
    applicants: !applicants
      ? []
      : await orderDb.getOrderApplicantsPublicIds({
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
    discord_server_id: assigned_to_full?.official_server_id,
    discord_invite: discord_invite,
    allocation_summary: allocation_summary,
  }
}
