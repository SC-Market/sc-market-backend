/**
 * notify() destination plans for the notification webhooks
 * (services/notify/destinations.ts). Each uses the same resolver and body
 * builder as its legacy sender in api/routes/v1/util/webhooks.ts, so both
 * paths post the same JSON to the same webhooks.
 *
 * Dedupe keys: one post per occurrence. Order Placed, reviews and bids happen
 * once per order, review and bid; a new or counter offer is one per offer
 * (the session's latest offer); assignments and status changes can repeat
 * legitimately, so each call is its own occurrence (as their user events).
 */
import { randomUUID } from "node:crypto"
import type {
  DBMarketBid,
  DBMarketListingComplete,
  DBNotificationWebhook,
  DBOfferSession,
  DBOrder,
  DBReview,
} from "../../clients/database/db-models.js"
import * as offerDb from "../../api/routes/v1/offers/database.js"
import * as webhookUtil from "../../api/routes/v1/util/webhooks.js"
import type { Destination } from "../notify/channels.js"
import type { DestinationEvent, DestinationPlan } from "../notify/destinations.js"

export function webhookDestination(webhook: DBNotificationWebhook): Destination {
  return { channel: "webhook", ref: `webhook:${webhook.webhook_id}`, webhook }
}

function plan(
  event: DestinationEvent<"webhook">,
  entityId: string,
  dedupeKey: string,
  webhooks: DBNotificationWebhook[],
  render: () => Promise<unknown>,
): DestinationPlan {
  return { channel: "webhook", event, entityId, dedupeKey, destinations: webhooks.map(webhookDestination), render }
}

export async function orderCreatedWebhookPlan(order: DBOrder): Promise<DestinationPlan> {
  return plan("order.created", order.order_id, order.order_id, await webhookUtil.orderCreatedWebhooks(order), () =>
    webhookUtil.orderCreatedWebhookBody(order),
  )
}

export async function orderAssignedWebhookPlan(order: DBOrder): Promise<DestinationPlan> {
  return plan(
    "order.assigned",
    order.order_id,
    `${order.order_id}:${order.assigned_id}:${randomUUID()}`,
    await webhookUtil.orderAssignedWebhooks(order),
    () => webhookUtil.orderAssignedWebhookBody(order),
  )
}

export async function orderStatusWebhookPlan(
  order: DBOrder,
  newStatus: string,
  actorId: string,
): Promise<DestinationPlan> {
  return plan(
    "order.status_changed",
    order.order_id,
    `${order.order_id}:${newStatus}:${randomUUID()}`,
    await webhookUtil.orderStatusWebhooks(order, newStatus),
    () => webhookUtil.orderStatusWebhookBody(order, newStatus, actorId),
  )
}

export async function offerWebhookPlan(
  offer: DBOfferSession,
  type: "offer_create" | "counter_offer_create",
): Promise<DestinationPlan> {
  const webhooks = await webhookUtil.offerWebhooks(offer)
  // The offer this occurrence is about (only looked up when someone listens).
  const latest = webhooks.length ? await offerDb.getMostRecentOrderOffer(offer.id) : null
  return plan("offer.received", offer.id, `${offer.id}:${type}:${latest?.id ?? "none"}`, webhooks, () =>
    webhookUtil.offerWebhookBody(offer, type),
  )
}

export async function orderReviewWebhookPlan(order: DBOrder, review: DBReview): Promise<DestinationPlan> {
  return plan("order.review", order.order_id, review.review_id, await webhookUtil.orderReviewWebhooks(order), () =>
    webhookUtil.orderReviewWebhookBody(order, review),
  )
}

export async function bidWebhookPlan(listing: DBMarketListingComplete, bid: DBMarketBid): Promise<DestinationPlan> {
  return plan("market.bid", listing.listing.listing_id, bid.bid_id, await webhookUtil.bidWebhooks(listing), () =>
    webhookUtil.bidWebhookBody(listing, bid),
  )
}

export async function bidWebhookPlanV2(
  listing: { listing_id: string; title: string; shop_id: string },
  bidAmount: number,
  bidderId: string,
  bidId?: string,
): Promise<DestinationPlan> {
  return plan(
    "market.bid",
    listing.listing_id,
    bidId ?? `${listing.listing_id}:${bidderId}:${randomUUID()}`,
    await webhookUtil.bidWebhooksV2(listing, bidderId),
    () => webhookUtil.bidWebhookBodyV2(listing, bidAmount, bidderId),
  )
}
