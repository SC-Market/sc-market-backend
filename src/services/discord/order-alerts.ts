/**
 * Posts order/offer alerts to subscribed Discord channels with claim buttons.
 */
import { getKnex } from "../../clients/database/knex-db.js"
import { DBOfferSession, DBOrder, DBOrderAlertSubscription } from "../../clients/database/db-models.js"
import { discordService } from "../../services/discord/discord.service.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as offerDb from "../../api/routes/v1/offers/database.js"
import * as marketDb from "../../api/routes/v1/market/database.js"
import { cdn } from "../../clients/cdn/cdn.js"
import logger from "../../logger/logger.js"

const knex = () => getKnex()

async function getSubscriptions(
  contractorId: string | null,
  userId: string | null,
): Promise<DBOrderAlertSubscription[]> {
  if (contractorId) {
    return knex()<DBOrderAlertSubscription>("order_alert_subscriptions")
      .where({ contractor_id: contractorId })
      .select()
  }
  if (userId) {
    return knex()<DBOrderAlertSubscription>("order_alert_subscriptions")
      .where({ user_id: userId })
      .select()
  }
  return []
}

async function buildMarketListingFields(offerId: string): Promise<{ name: string; value: string; inline: boolean }[]> {
  try {
    const listings = await marketDb.getOfferMarketListings(offerId)
    if (!listings.length) return []

    const items: string[] = []
    for (const listing of listings) {
      const complete = await marketDb.getMarketListingComplete(listing.listing_id)
      const name = (complete as any)?.details?.title || (complete as any)?.details?.item_name || "Item"
      items.push(`${name} ×${listing.quantity}`)
    }

    return [{ name: "Items", value: items.join("\n"), inline: false }]
  } catch {
    return []
  }
}

/**
 * Post alert to subscribed channels when a new offer is received.
 */
export async function postOfferAlert(session: DBOfferSession): Promise<void> {
  const subs = await getSubscriptions(session.contractor_id, session.assigned_id)
  if (!subs.length) return

  try {
    const customer = await profileDb.getUser({ user_id: session.customer_id })
    const lastOffer = await offerDb.getMostRecentOrderOffer(session.id)
    const avatar = await cdn.getFileLinkResource(customer.avatar)
    const itemFields = await buildMarketListingFields(lastOffer.id)

    const message = {
      embeds: [{
        color: 0x10b881,
        author: {
          name: customer.display_name,
          url: `https://sc-market.space/profile/${customer.username}`,
          icon_url: avatar || undefined,
        },
        title: `New Offer: ${lastOffer.title}`,
        url: `https://sc-market.space/offer/${session.id}`,
        description: lastOffer.description?.substring(0, 200) || "",
        fields: [
          { name: "Offer", value: `${(+lastOffer.cost).toLocaleString("en-US")} aUEC`, inline: true },
          { name: "Kind", value: lastOffer.kind, inline: true },
          ...(lastOffer.collateral ? [{ name: "Collateral", value: `${(+lastOffer.collateral).toLocaleString("en-US")} aUEC`, inline: true }] : []),
          ...itemFields,
        ],
        timestamp: new Date().toISOString(),
      }],
      components: [{
        type: 1, // ACTION_ROW
        components: [{
          type: 2, // BUTTON
          style: 1, // PRIMARY
          label: "Claim Offer",
          custom_id: `claim_offer:${session.id}`,
        }],
      }],
    }

    for (const sub of subs) {
      try {
        await discordService.postChannelMessage(sub.channel_id, message)
      } catch (err) {
        logger.error(`Failed to post offer alert to channel ${sub.channel_id}`, { error: err })
      }
    }
  } catch (err) {
    logger.error("Failed to build offer alert", { error: err, sessionId: session.id })
  }
}

/**
 * Post alert to subscribed channels when an order is created with no assignee.
 */
export async function postOrderAlert(order: DBOrder): Promise<void> {
  if (order.assigned_id) return // Already assigned, no need for claim button

  const subs = await getSubscriptions(order.contractor_id, null)
  if (!subs.length) return

  try {
    const customer = await profileDb.getUser({ user_id: order.customer_id })
    const avatar = await cdn.getFileLinkResource(customer.avatar)

    // Get market listing details from V1 or V2
    const orderListings = await knex()("market_listing_orders")
      .where({ order_id: order.order_id })
      .select()
      .catch(() => [] as { listing_id: string; quantity: number }[])

    const itemFields: { name: string; value: string; inline: boolean }[] = []
    if (orderListings.length) {
      const items: string[] = []
      for (const ol of orderListings) {
        try {
          const complete = await marketDb.getMarketListingComplete(ol.listing_id)
          const name = (complete as { details?: { title?: string; item_name?: string } })?.details?.title || (complete as { details?: { item_name?: string } })?.details?.item_name || "Item"
          items.push(`${name} ×${ol.quantity}`)
        } catch { /* skip */ }
      }
      if (items.length) {
        itemFields.push({ name: "Items", value: items.join("\n"), inline: false })
      }
    } else {
      // V2 order items
      const v2Items = await knex()("order_market_items_v2")
        .where({ order_id: order.order_id })
        .select("listing_id", "quantity")
        .catch(() => [] as { listing_id: string; quantity: number }[])
      if (v2Items.length) {
        const items: string[] = []
        for (const oi of v2Items) {
          const listing = await knex()("listings").where({ listing_id: oi.listing_id }).first("title")
          items.push(`${listing?.title || "Item"} ×${oi.quantity}`)
        }
        if (items.length) {
          itemFields.push({ name: "Items", value: items.join("\n"), inline: false })
        }
      }
    }

    const message = {
      embeds: [{
        color: 0x10b881,
        author: {
          name: customer.display_name,
          url: `https://sc-market.space/profile/${customer.username}`,
          icon_url: avatar || undefined,
        },
        title: `New Order: ${order.title}`,
        url: `https://sc-market.space/contract/${order.order_id}`,
        description: order.description?.substring(0, 200) || "",
        fields: [
          { name: "Cost", value: `${(+order.cost).toLocaleString("en-US")} aUEC`, inline: true },
          { name: "Kind", value: order.kind, inline: true },
          ...(order.collateral ? [{ name: "Collateral", value: `${(+order.collateral).toLocaleString("en-US")} aUEC`, inline: true }] : []),
          ...itemFields,
        ],
        timestamp: new Date().toISOString(),
      }],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 1,
          label: "Claim Order",
          custom_id: `claim_order:${order.order_id}`,
        }],
      }],
    }

    for (const sub of subs) {
      try {
        await discordService.postChannelMessage(sub.channel_id, message)
      } catch (err) {
        logger.error(`Failed to post order alert to channel ${sub.channel_id}`, { error: err })
      }
    }
  } catch (err) {
    logger.error("Failed to build order alert", { error: err, orderId: order.order_id })
  }
}
