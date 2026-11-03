/**
 * "Your buy order was filled" (event buy_order.filled): a seller filled one
 * of the buyer's standing buy orders (POST /buy-orders/{id}/fulfill), which
 * created an order for them. The buyer never placed that order themselves,
 * so this is how they learn it exists.
 *
 * To the buyer only, Personal preferences (watchlist category, next to the
 * buy-order matches): bell entry pointing at the order, push, email (opt-in)
 * and Discord DM (off by default), in the buyer's language (email-i18n.ts).
 * The seller is the actor and is never a recipient; their side of the order
 * is notified as any new order is (new-order.ts notifyNewOrder).
 *
 * Call it after the fill's transaction committed. Never throws: a failed
 * notification must not fail the order.
 */
import { env } from "../../config/env.js"
import type { DBOrder } from "../../clients/database/db-models.js"
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import { buyOrderFilledText, emailLocale, type BuyOrderFilledFacts } from "../email/email-i18n.js"
import type { BuyOrderFilledEmailData } from "../email/email-payload-formatters.js"

export const BUY_ORDER_FILLED_ACTION = "buy_order_filled"

export interface BuyOrderFill {
  /** The orders row the fill created (customer_id is the buyer). */
  order: DBOrder
  buyOrderId: string
  /** Who filled it: the seller (the actor, never notified here). */
  sellerId: string
  /** The selling shop's name. */
  sellerName: string
  itemName: string
  quantity: number
  total: number
  /** Units the buy order still wants after this fill (0 = complete). */
  remaining: number
  /** The buyer's accounts.locale. */
  buyerLocale?: string | null
}

export async function notifyBuyOrderFilled(fill: BuyOrderFill): Promise<void> {
  const { order } = fill
  try {
    const baseUrl = env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
    const facts: BuyOrderFilledFacts = {
      seller: fill.sellerName,
      item: fill.itemName,
      quantity: fill.quantity,
      total: Number(fill.total).toLocaleString("en-US"),
      remaining: Math.max(0, fill.remaining),
    }
    const text = buyOrderFilledText(emailLocale(fill.buyerLocale), facts)
    const email: BuyOrderFilledEmailData = { ...facts, order_id: order.order_id }
    await notify("buy_order.filled", [{ userId: order.customer_id, contractorId: null }], {
      entityId: order.order_id,
      actorId: fill.sellerId,
      // One per fill: each fill creates its own order.
      dedupeKey: `${fill.buyOrderId}:${order.order_id}`,
      messages: {
        push: {
          title: text.title,
          body: `${text.body} ${text.status}`,
          icon: `${baseUrl}/android-chrome-192x192.png`,
          badge: `${baseUrl}/android-chrome-192x192.png`,
          data: {
            url: `${baseUrl}/contract/${order.order_id}`,
            type: "order",
            entityId: order.order_id,
            action: BUY_ORDER_FILLED_ACTION,
          },
          tag: `buy-order-filled-${order.order_id}`,
          requireInteraction: false,
        },
        // Rendered by the email queue (formatBuyOrderFilledEmailData).
        email: { data: { buyOrderFill: email } },
      },
    })
  } catch (e) {
    logger.error("Failed to send buy order filled notification", {
      order_id: order.order_id,
      buy_order_id: fill.buyOrderId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
