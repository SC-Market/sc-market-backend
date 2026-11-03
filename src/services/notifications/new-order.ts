/**
 * Everything that tells people about a new order, the same for every way an
 * order is created: an accepted offer or cart checkout
 * (orders/helpers.ts runOrderCreatedSideEffects) and Buy now
 * (BuyOrdersV2Controller.createPurchase; owner decision 2026-11-02, it
 * notifies exactly like a normal new order).
 *
 * - notificationService.createOrderNotification: notify() for order.created
 *   (the org's order managers) and order.assigned (the assignee: a personal
 *   shop's owner), following each recipient's Settings -> Notifications and
 *   org mutes (bell, push, email; Discord DM is locked for orders), plus the
 *   "Order Created" / "Order Assigned" webhooks;
 * - postOrderAlert: the Discord alert-channel post with the Claim button, for
 *   an unassigned shop or org order.
 *
 * Call it after the order's transaction committed. Never throws: a failed
 * notification must not fail the order.
 */
import type { DBOrder } from "../../clients/database/db-models.js"
import logger from "../../logger/logger.js"
import { postOrderAlert } from "../discord/order-alerts.js"
import { notificationService } from "./notification.service.js"

export async function notifyNewOrder(order: DBOrder): Promise<void> {
  try {
    await notificationService.createOrderNotification(order)
  } catch (e) {
    logger.error("Failed to send new order notifications", {
      order_id: order.order_id,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  try {
    await postOrderAlert(order)
  } catch (e) {
    logger.error("Failed to post order alert", {
      order_id: order.order_id,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
