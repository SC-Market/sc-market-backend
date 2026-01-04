/**
 * WebhookService - Service for sending webhooks to external endpoints
 *
 * This service handles:
 * - Sending webhooks for order events (create, status change, comments)
 * - Sending webhooks for offer events (create, counter-offer)
 * - Sending webhooks for market events (bids)
 * - Error handling and timeout management
 */

import {
  DBMarketBid,
  DBMarketListingComplete,
  DBOfferSession,
  DBOrder,
  DBOrderComment,
} from "../../clients/database/db-models.js"
import * as webhookUtil from "../../api/routes/v1/util/webhooks.js"
import logger from "../../logger/logger.js"

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
  sendOrderCommentWebhooks(
    order: DBOrder,
    comment: DBOrderComment,
  ): Promise<void>

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
}

/**
 * Implementation of WebhookService
 * Delegates to utility functions in api/routes/v1/util/webhooks.ts
 */
class DatabaseWebhookService implements WebhookService {
  async sendOrderWebhooks(order: DBOrder): Promise<void> {
    try {
      await webhookUtil.sendOrderWebhooks(order)
    } catch (error) {
      logger.error(`Failed to send order webhooks for order ${order.order_id}:`, {
        error,
      })
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  async sendOrderStatusWebhooks(
    order: DBOrder,
    newStatus: string,
    actorId: string,
  ): Promise<void> {
    try {
      await webhookUtil.sendOrderStatusWebhooks(order, newStatus, actorId)
    } catch (error) {
      logger.error(
        `Failed to send order status webhooks for order ${order.order_id}:`,
        { error },
      )
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  async sendOrderCommentWebhooks(
    order: DBOrder,
    comment: DBOrderComment,
  ): Promise<void> {
    try {
      await webhookUtil.sendOrderCommentWebhooks(order, comment)
    } catch (error) {
      logger.error(
        `Failed to send order comment webhooks for order ${order.order_id}:`,
        { error },
      )
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  async sendOfferWebhooks(
    offer: DBOfferSession,
    type: "offer_create" | "counter_offer_create" = "offer_create",
  ): Promise<void> {
    try {
      await webhookUtil.sendOfferWebhooks(offer, type)
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
      await webhookUtil.sendBidWebhooks(listing, bid)
    } catch (error) {
      logger.error(
        `Failed to send bid webhooks for listing ${listing.listing.listing_id}:`,
        { error },
      )
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }
}

// Export singleton instance
export const webhookService: WebhookService = new DatabaseWebhookService()
