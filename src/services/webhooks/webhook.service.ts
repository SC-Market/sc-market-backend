/**
 * WebhookService - Service for sending webhooks to external endpoints
 *
 * This service handles:
 * - Sending webhooks for order events (create, status change, comments)
 * - Sending webhooks for offer events (create, counter-offer)
 * - Sending webhooks for market events (bids)
 * - Error handling and timeout management
 *
 * Every send goes through deliverDestinations (services/notify, Phase 5):
 * the legacy sender in util/webhooks.ts posts, with notify()'s plan compared
 * in shadow mode, unless the route is live (NOTIFY_DESTINATIONS_LIVE), in
 * which case notify() posts (delivery log, idempotency, failure state) and
 * the legacy sender is not called.
 */

import {
  DBMarketBid,
  DBMarketListingComplete,
  DBOfferSession,
  DBOrder,
  DBReview,
} from "../../clients/database/db-models.js"
import * as webhookUtil from "../../api/routes/v1/util/webhooks.js"
import logger from "../../logger/logger.js"
import { deliverDestinations } from "../notify/destination-delivery.js"
import * as plans from "./webhook-plans.js"

/**
 * Interface for WebhookService
 */
export interface WebhookService {
  // Order webhooks
  sendOrderWebhooks(order: DBOrder): Promise<void>
  sendOrderStatusWebhooks(
    order: DBOrder,
    newStatus: string,
    actorId: string,
  ): Promise<void>
  sendOrderAssignedWebhooks(order: DBOrder): Promise<void>
  sendOrderReviewWebhooks(order: DBOrder, review: DBReview): Promise<void>

  // Offer webhooks
  sendOfferWebhooks(
    offer: DBOfferSession,
    type: "offer_create" | "counter_offer_create",
  ): Promise<void>

  // Market webhooks
  sendBidWebhooks(
    listing: DBMarketListingComplete,
    bid: DBMarketBid,
  ): Promise<void>
  sendBidWebhooksV2(
    listing: { listing_id: string; title: string; shop_id: string },
    bidAmount: number,
    bidderId: string,
    /** Identifies the bid (idempotency); without it each call is its own occurrence. */
    bidId?: string,
  ): Promise<void>
}

/**
 * Implementation of WebhookService
 * Delegates to utility functions in api/routes/v1/util/webhooks.ts
 */
class DatabaseWebhookService implements WebhookService {
  async sendOrderWebhooks(order: DBOrder): Promise<void> {
    try {
      await deliverDestinations(
        "webhook:order.created",
        () => plans.orderCreatedWebhookPlan(order),
        () => webhookUtil.sendOrderWebhooks(order),
      )
    } catch (error) {
      logger.error(
        `Failed to send order webhooks for order ${order.order_id}:`,
        {
          error,
        },
      )
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  async sendOrderStatusWebhooks(
    order: DBOrder,
    newStatus: string,
    actorId: string,
  ): Promise<void> {
    try {
      await deliverDestinations(
        "webhook:order.status_changed",
        () => plans.orderStatusWebhookPlan(order, newStatus, actorId),
        () => webhookUtil.sendOrderStatusWebhooks(order, newStatus, actorId),
      )
    } catch (error) {
      logger.error(
        `Failed to send order status webhooks for order ${order.order_id}:`,
        { error },
      )
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  async sendOrderAssignedWebhooks(order: DBOrder): Promise<void> {
    try {
      await deliverDestinations(
        "webhook:order.assigned",
        () => plans.orderAssignedWebhookPlan(order),
        () => webhookUtil.sendOrderAssignedWebhooks(order),
      )
    } catch (error) {
      logger.error(
        `Failed to send order assigned webhooks for order ${order.order_id}:`,
        { error },
      )
    }
  }

  async sendOrderReviewWebhooks(order: DBOrder, review: DBReview): Promise<void> {
    try {
      await deliverDestinations(
        "webhook:order.review",
        () => plans.orderReviewWebhookPlan(order, review),
        () => webhookUtil.sendOrderReviewWebhooks(order, review),
      )
    } catch (error) {
      logger.error(
        `Failed to send order review webhooks for order ${order.order_id}:`,
        { error },
      )
    }
  }

  async sendOfferWebhooks(
    offer: DBOfferSession,
    type: "offer_create" | "counter_offer_create" = "offer_create",
  ): Promise<void> {
    try {
      await deliverDestinations(
        "webhook:offer.received",
        () => plans.offerWebhookPlan(offer, type),
        () => webhookUtil.sendOfferWebhooks(offer, type),
      )
    } catch (error) {
      logger.error(`Failed to send offer webhooks for offer ${offer.id}:`, {
        error,
      })
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  async sendBidWebhooks(
    listing: DBMarketListingComplete,
    bid: DBMarketBid,
  ): Promise<void> {
    try {
      await deliverDestinations(
        "webhook:market.bid",
        () => plans.bidWebhookPlan(listing, bid),
        () => webhookUtil.sendBidWebhooks(listing, bid),
      )
    } catch (error) {
      logger.error(
        `Failed to send bid webhooks for listing ${listing.listing.listing_id}:`,
        { error },
      )
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  async sendBidWebhooksV2(
    listing: { listing_id: string; title: string; shop_id: string },
    bidAmount: number,
    bidderId: string,
    bidId?: string,
  ): Promise<void> {
    try {
      await deliverDestinations(
        "webhook:market.bid",
        () => plans.bidWebhookPlanV2(listing, bidAmount, bidderId, bidId),
        () => webhookUtil.sendBidWebhooksV2(listing, bidAmount, bidderId),
      )
    } catch (error) {
      logger.error(
        `Failed to send V2 bid webhooks for listing ${listing.listing_id}:`,
        { error },
      )
    }
  }
}

// Export singleton instance
export const webhookService: WebhookService = new DatabaseWebhookService()
