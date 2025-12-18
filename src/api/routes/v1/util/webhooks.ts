import {
  DBMarketBid,
  DBMarketListingComplete,
  DBNotificationWebhook,
  DBOfferSession,
  DBOrder,
  DBOrderComment,
  DBUser,
} from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { sendDM } from "./discord.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import logger from "../../../../logger/logger.js"
import { formatMarketUrl } from "./urls.js"
import { env } from "../../../../config/env.js"

/**
 * Get the SC Market logo URL based on environment
 * Uses red-shifted DEV logo in development mode, production logo otherwise
 */
function getLogoUrl(): string {
  const isDev = env.NODE_ENV === "development" || env.NODE_ENV === "dev"
  const logoFilename = isDev
    ? "BG0TEXT1SHADOW1_DEV.png"
    : "BG0TEXT1SHADOW1.png"
  return `https://raw.githubusercontent.com/SC-Market/sc-market-frontend/refs/heads/main/src/assets/${logoFilename}`
}

export async function createNotificationWebhook(
  name: string,
  webhook_url: string,
  actions: string[],
  contractor_id?: string,
  user_id?: string,
) {
  let webhooks
  if (contractor_id && !user_id) {
    webhooks = await database.createNotificationWebhook({
      webhook_url,
      name,
      contractor_id,
    })
  } else if (user_id && !contractor_id) {
    webhooks = await database.createNotificationWebhook({
      webhook_url,
      name,
      user_id,
    })
  } else {
    throw Error("Must specify either contractor or user")
  }

  const webhook = webhooks[0]
  const actions_set = new Set(actions)
  if (actions_set.has("order_status_change")) {
    actions_set.delete("order_status_change")
    actions_set.add("order_status_fulfilled")
    actions_set.add("order_status_in_progress")
    actions_set.add("order_status_not_started")
    actions_set.add("order_status_cancelled")
  }

  for (const action of actions_set) {
    const action_obj = await database.getNotificationActionByName(action)
    if (!action_obj) {
      throw Error("Invalid object")
    }

    await database.insertWebhookAction({
      webhook_id: webhook.webhook_id,
      action_type_id: action_obj.action_type_id,
    })
  }

  return webhook
}

export async function sendOrderWebhooks(order: DBOrder) {
  let webhooks
  if (order.contractor_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      { contractor_id: order.contractor_id },
      "order_create",
    )
  } else if (order.assigned_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      { user_id: order.assigned_id },
      "order_create",
    )
  } else {
    webhooks = await database.getNotificationWebhooksByAction(
      {},
      "public_order_create",
    )
  }

  await sendOrderDM(order)

  for (const webhook of webhooks) {
    try {
      await sendOrderWebhook(order, webhook)
    } catch (e) {
      logger.error(`Failed to send order webhook ${e}`)
    }
  }
}

export async function sendOfferWebhooks(
  offer: DBOfferSession,
  type: "offer_create" | "counter_offer_create" = "offer_create",
) {
  logger.debug("Sending offer webhooks!")
  let webhooks
  if (offer.contractor_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      { contractor_id: offer.contractor_id },
      "order_create",
    )
  } else if (offer.assigned_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      { user_id: offer.assigned_id },
      "order_create",
    )
  } else {
    webhooks = [] as DBNotificationWebhook[]
  }

  for (const webhook of webhooks) {
    await sendOfferWebhook(offer, webhook, type)
  }
}

export async function generateNewOfferMessage(
  session: DBOfferSession,
  customer: User,
  assigned: User | null,
) {
  const lastOffer = await database.getMostRecentOrderOffer(session.id)

  // Get Discord IDs from provider system
  const customerDiscordId = await database.getUserDiscordId(customer.user_id)
  const assignedDiscordId = assigned
    ? await database.getUserDiscordId(assigned.user_id)
    : null

  return {
    // author: {
    //     username: 'SC Market - Order Placed',
    //     avatar_url: 'https://raw.githubusercontent.com/SC-Market/sc-market-frontend/refs/heads/main/src/assets/BG0TEXT1SHADOW1.png',
    // },
    // the username to be displayed
    // the avatar to be displayed
    content:
      (customerDiscordId ? `<@${customerDiscordId}> ` : "") +
      (assignedDiscordId ? `<@${assignedDiscordId}>` : ""),

    // // enable mentioning of individual users or roles, but not @everyone/@here
    allowed_mentions: {
      parse: [],
    },
    // embeds to be sent
    embeds: [
      {
        // decimal number colour of the side of the embed
        color: 0x111828,
        // author
        // - icon next to text at top (text is a link)
        author: {
          name: `${customer.display_name}`,
          url: `https://discordapp.com/users/${customer.username}`,
          icon_url: (await cdn.getFileLinkResource(customer.avatar))!,
        },
        // embed title
        // - link on 2nd row
        title: lastOffer.title,
        url: `https://sc-market.space/offer/${session.id}`,
        // embed description
        // - text on 3rd row
        description: (customerDiscordId ? `Discord User Details: <@${customerDiscordId}>\n\n` : "") +
                        `${lastOffer.description}`,
        // custom embed fields: bold title/name, normal content/value below title
        // - located below description, above image.
        fields: [
          {
            name: "Offer",
            value: `${(+lastOffer.cost).toLocaleString("en-US")} aUEC`,
          },
          {
            name: "Kind",
            value: lastOffer.kind,
          },
          ...(lastOffer.collateral
            ? [
                {
                  name: "Collateral",
                  value: `${(+lastOffer.cost).toLocaleString("en-US")} aUEC`,
                },
              ]
            : []),
        ],
        timestamp: lastOffer.timestamp.toISOString(),
      },
    ],
  }
}

export async function generateNewOrderMessage(
  order: DBOrder,
  customer: User,
  assigned: User | null,
) {
  // Get Discord IDs from provider system
  const customerDiscordId = await database.getUserDiscordId(customer.user_id)
  const assignedDiscordId = assigned
    ? await database.getUserDiscordId(assigned.user_id)
    : null

  return {
    // author: {
    //     username: 'SC Market - Order Placed',
    //     avatar_url: 'https://raw.githubusercontent.com/SC-Market/sc-market-frontend/refs/heads/main/src/assets/BG0TEXT1SHADOW1.png',
    // },
    // the username to be displayed
    // the avatar to be displayed

    // // enable mentioning of individual users or roles, but not @everyone/@here
    allowed_mentions: {
      parse: [],
    },
    // embeds to be sent
    embeds: [
      {
        // decimal number colour of the side of the embed
        color: 0x111828,
        // author
        // - icon next to text at top (text is a link)
        author: {
          name: `${customer.display_name}`,
          url: `https://discordapp.com/users/${customer.username}`,
          icon_url: (await cdn.getFileLinkResource(customer.avatar))!,
        },
        // embed title
        // - link on 2nd row
        title: order.title,
        url: `https://sc-market.space/contract/${order.order_id}`,
        // embed description
        // - text on 3rd row
        description: (customerDiscordId ? `Discord User Details: <@${customerDiscordId}>\n\n` : "") +
                        `${order.description}`,
        // custom embed fields: bold title/name, normal content/value below title
        // - located below description, above image.
        fields: [
          {
            name: "Offer",
            value: `${(+order.cost).toLocaleString("en-US")} aUEC`,
          },
          {
            name: "Kind",
            value: order.kind,
          },
          ...(order.collateral
            ? [
                {
                  name: "Collateral",
                  value: `${(+order.cost).toLocaleString("en-US")} aUEC`,
                },
              ]
            : []),
        ],
        timestamp: order.timestamp.toISOString(),
      },
    ],
  }
}

export async function generateStatusUpdateMessage(
  order: DBOrder,
  newStatus: string,
) {
  return {
    allowed_mentions: {
      parse: [],
    },
    embeds: [
      {
        color: status_colors.get(newStatus) || 0x111828,
        author: {
          name: order.title,
        },
        description: `Was: ${order.status}`,
        title: `Order Status Updated - ${newStatus}`,
        url: `https://sc-market.space/contract/${order.order_id}`,
        timestamp: order.timestamp.toISOString(),
      },
    ],
  }
}
export async function generateOfferStatusUpdateMessage(
  session: DBOfferSession,
  newStatus: string,
  user?: User,
) {
  const offer = await database.getMostRecentOrderOffer(session.id)

  const embed: any = {
    color: status_colors.get(newStatus) || 0x111828,
    author: {
      name: offer.title,
    },
    title: `Offer Status Updated - ${newStatus}`,
    url: `https://sc-market.space/offer/${session.id}`,
    timestamp: offer.timestamp.toISOString(),
  }

  // Add user information if provided
  if (user) {
    embed.fields = [
      {
        name: "Updated by",
        value: user.username,
        inline: true,
      },
    ]
  }

  return {
    allowed_mentions: {
      parse: [],
    },
    embeds: [embed],
  }
}

export async function generateAssignedMessage(
  order: DBOrder,
  assigned: User,
) {
  return {
    allowed_mentions: {
      parse: [],
    },
    embeds: [
      {
        color: 0x111828,
        author: {
          name: order.title,
        },
        description: `Someone has been assigned to fulfill this order`,
        title: `Order Assigned - ${assigned.username}`,
        url: `https://sc-market.space/contract/${order.order_id}`,
        timestamp: order.timestamp.toISOString(),
      },
    ],
  }
}

export async function sendOrderDM(order: DBOrder) {
  const customer = order.customer_id
    ? await database.getUser({ user_id: order.customer_id })
    : null
  if (!customer) {
    return
  }

  const assigned = order.assigned_id
    ? await database.getUser({ user_id: order.assigned_id })
    : null

  const people = [assigned]

  for (const person of people) {
    if (person) {
      const discordId = await database.getUserDiscordId(person.user_id)
      if (discordId) {
        await sendDM(
          discordId,
          await generateNewOrderMessage(order, customer, assigned),
        )
      }
    }
  }
}

export async function sendOfferDM(offer: DBOfferSession) {
  const customer = offer.customer_id
    ? await database.getUser({ user_id: offer.customer_id })
    : null
  if (!customer) {
    return
  }

  const assigned = offer.assigned_id
    ? await database.getUser({ user_id: offer.assigned_id })
    : null

  const people = [assigned]

  for (const person of people) {
    if (person) {
      const discordId = await database.getUserDiscordId(person.user_id)
      if (discordId) {
        await sendDM(
          discordId,
          await generateNewOfferMessage(offer, customer, assigned),
        )
      }
    }
  }
}

export async function sendAssignedWebhook(order: DBOrder) {
  let webhooks
  if (order.assigned_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      { user_id: order.assigned_id },
      "order_assigned",
    )
  } else {
    throw Error("Invalid order, no assignee")
  }

  for (const webhook of webhooks) {
    await sendOrderWebhook(order, webhook)
  }
}

export async function sendUserOfferWebhook(order: DBOfferSession) {
  let webhooks
  if (order.assigned_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      { user_id: order.assigned_id },
      "order_assigned",
    )
  } else {
    throw Error("Invalid order, no assignee")
  }

  for (const webhook of webhooks) {
    await sendOfferWebhook(order, webhook)
  }
}

async function sendWebhook(body: any, webhook: DBNotificationWebhook) {
  return fetch(webhook.webhook_url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

async function sendOrderWebhook(
  order: DBOrder,
  webhook: DBNotificationWebhook,
) {
  const customer = await database.getMinimalUser({ user_id: order.customer_id })
  return await sendWebhook(
    {
      // the username to be displayed
      username: "SC Market - Order Placed",
      // the avatar to be displayed
      avatar_url: getLogoUrl(),

      // // enable mentioning of individual users or roles, but not @everyone/@here
      allowed_mentions: {
        parse: [],
      },
      // embeds to be sent
      embeds: [
        {
          // decimal number colour of the side of the embed
          color: 0x111828,
          // author
          // - icon next to text at top (text is a link)
          author: {
            name: customer.display_name,
            url: `https://sc-market.space/profile/${customer.username}`,
            icon_url: customer.avatar,
          },
          // embed title
          // - link on 2nd row
          title: order.title,
          url: `https://sc-market.space/contract/${order.order_id}`,
          // embed description
          // - text on 3rd row
          description: order.description,
          // custom embed fields: bold title/name, normal content/value below title
          // - located below description, above image.
          fields: [
            {
              name: "Offer",
              value: `${(+order.cost).toLocaleString("en-US")} aUEC`,
            },
            {
              name: "Kind",
              value: order.kind,
            },
            {
              name: "Rush",
              value: order.rush ? "True" : "False",
            },
            ...(order.collateral
              ? [
                  {
                    name: "Collateral",
                    value: `${(+order.cost).toLocaleString("en-US")} aUEC`,
                  },
                ]
              : []),
          ],
          timestamp: order.timestamp.toISOString(),
        },
      ],
    },
    webhook,
  )
}

async function sendOfferWebhook(
  session: DBOfferSession,
  webhook: DBNotificationWebhook,
  type: "offer_create" | "counter_offer_create" = "offer_create",
) {
  const customer = await database.getMinimalUser({
    user_id: session.customer_id,
  })
  const most_recent = await database.getMostRecentOrderOffer(session.id)
  return await sendWebhook(
    {
      // the username to be displayed
      username: `SC Market - ${
        type === "offer_create" ? "Offer Received" : "Counter Offer Received"
      }`,
      // the avatar to be displayed
      avatar_url: getLogoUrl(),

      // // enable mentioning of individual users or roles, but not @everyone/@here
      allowed_mentions: {
        parse: [],
      },
      // embeds to be sent
      embeds: [
        {
          // decimal number colour of the side of the embed
          color: 0x111828,
          // author
          // - icon next to text at top (text is a link)
          author: {
            name: customer.display_name,
            url: `https://sc-market.space/profile/${customer.username}`,
            icon_url: customer.avatar,
          },
          // embed title
          // - link on 2nd row
          title: most_recent.title,
          url: `https://sc-market.space/offer/${session.id}`,
          // embed description
          // - text on 3rd row
          description: most_recent.description,
          // custom embed fields: bold title/name, normal content/value below title
          // - located below description, above image.
          fields: [
            {
              name: "Offer",
              value: `${(+most_recent.cost).toLocaleString("en-US")} aUEC`,
            },
            {
              name: "Kind",
              value: most_recent.kind,
            },
          ],
          timestamp: most_recent.timestamp.toISOString(),
        },
      ],
    },
    webhook,
  )
}

export async function sendBidWebhooks(
  listing: DBMarketListingComplete,
  bid: DBMarketBid,
) {
  let webhooks
  if (listing.listing.contractor_seller_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      {
        "notification_webhooks.contractor_id":
          listing.listing.contractor_seller_id,
      },
      "market_item_bid",
    )
  } else if (listing.listing.user_seller_id) {
    webhooks = await database.getNotificationWebhooksByAction(
      { "notification_webhooks.user_id": listing.listing.user_seller_id },
      "market_item_bid",
    )
  } else {
    throw Error("Corrupt listing")
  }

  for (const webhook of webhooks) {
    await marketBidWebhook(listing, bid, webhook)
  }
}

async function marketBidWebhook(
  listing: DBMarketListingComplete,
  bid: DBMarketBid,
  webhook: DBNotificationWebhook,
) {
  const bidder = await database.getMinimalUser({ user_id: bid.user_bidder_id })
  return await sendWebhook(
    {
      username: "SC Market - Bid Received",
      // the avatar to be displayed
      avatar_url: getLogoUrl(),
      // // enable mentioning of individual users or roles, but not @everyone/@here
      allowed_mentions: {
        parse: [],
      },
      // embeds to be sent
      embeds: [
        {
          // decimal number colour of the side of the embed
          color: 0x111828,
          // author
          // - icon next to text at top (text is a link)
          author: {
            name: bidder.display_name,
            url: `https://sc-market.space/profile/${bidder.username}`,
            icon_url: bidder.avatar,
          },
          // embed title
          // - link on 2nd row
          title: listing.details.title,
          url: `https://sc-market.space${formatMarketUrl(listing)}`,
          // embed description
          // - text on 3rd row
          // custom embed fields: bold title/name, normal content/value below title
          // - located below description, above image.
          fields: [
            {
              name: "Bid Amount",
              value: `${(+bid.bid).toLocaleString("en-US")} aUEC`,
            },
          ],
          timestamp: bid.timestamp.toISOString(),
        },
      ],
    },
    webhook,
  )
}

export async function sendOrderCommentWebhooks(
  order: DBOrder,
  comment: DBOrderComment,
) {
  const webhooks = []
  if (order.contractor_id) {
    webhooks.push(
      ...(await database.getNotificationWebhooksByAction(
        { "notification_webhooks.contractor_id": order.contractor_id },
        "order_comment",
      )),
    )
  }

  if (order.assigned_id) {
    webhooks.push(
      ...(await database.getNotificationWebhooksByAction(
        { "notification_webhooks.user_id": order.assigned_id },
        "order_comment",
      )),
    )
  }

  if (order.customer_id) {
    webhooks.push(
      ...(await database.getNotificationWebhooksByAction(
        { "notification_webhooks.user_id": order.customer_id },
        "order_comment",
      )),
    )
  }

  for (const webhook of webhooks) {
    await orderCommentWebhook(order, comment, webhook)
  }
}

async function orderCommentWebhook(
  order: DBOrder,
  comment: DBOrderComment,
  webhook: DBNotificationWebhook,
) {
  const author = await database.getMinimalUser({ user_id: comment.author })
  return await sendWebhook(
    {
      username: "SC Market - Order Comment Received",
      // the avatar to be displayed
      avatar_url: getLogoUrl(),
      // // enable mentioning of individual users or roles, but not @everyone/@here
      allowed_mentions: {
        parse: [],
      },
      // embeds to be sent
      embeds: [
        {
          // decimal number colour of the side of the embed
          color: 0x111828,
          // author
          // - icon next to text at top (text is a link)
          author: {
            name: author.display_name,
            url: `https://sc-market.space/profile/${author.username}`,
            icon_url: author.avatar,
          },
          // embed title
          // - link on 2nd row
          title: order.title,
          url: `https://sc-market.space/contract/${order.order_id}`,
          // embed description
          // - text on 3rd row
          // custom embed fields: bold title/name, normal content/value below title
          // - located below description, above image.
          fields: [
            {
              name: "Comment",
              value: comment.content,
            },
          ],
          timestamp: comment.timestamp.toISOString(),
        },
      ],
    },
    webhook,
  )
}

const status_actions = new Map([
  ["cancelled", "order_status_cancelled"],
  ["fulfilled", "order_status_fulfilled"],
  ["in-progress", "order_status_in_progress"],
])

export async function sendOrderStatusWebhooks(
  order: DBOrder,
  new_status: string,
  actor_id: string,
) {
  const webhooks = []
  if (order.contractor_id) {
    webhooks.push(
      ...(await database.getNotificationWebhooksByAction(
        { "notification_webhooks.contractor_id": order.contractor_id },
        status_actions.get(new_status) || "order_status_not_started",
      )),
    )
  }

  if (order.assigned_id) {
    webhooks.push(
      ...(await database.getNotificationWebhooksByAction(
        { "notification_webhooks.user_id": order.assigned_id },
        status_actions.get(new_status) || "order_status_not_started",
      )),
    )
  }

  if (order.customer_id) {
    webhooks.push(
      ...(await database.getNotificationWebhooksByAction(
        { "notification_webhooks.user_id": order.customer_id },
        status_actions.get(new_status) || "order_status_not_started",
      )),
    )
  }

  for (const webhook of webhooks) {
    try {
      await orderStatusWebhook(order, new_status, actor_id, webhook)
    } catch (e) {
      logger.error(`Failed to post webhook for ${order.order_id}: ${e}`)
    }
  }
}

const status_colors = new Map([
  ["cancelled", 0xaa0000],
  ["Rejected", 0xaa0000],
  ["fulfilled", 0x00aa00],
  ["Accepted", 0x00aa00],
  ["in-progress", 0x0288d1],
  ["Counter-Offered", 0x0288d1],
])

async function orderStatusWebhook(
  order: DBOrder,
  new_status: string,
  actor_id: string,
  webhook: DBNotificationWebhook,
) {
  const actor = await database.getMinimalUser({ user_id: actor_id })
  return await sendWebhook(
    {
      username: "SC Market - Order Status Updated",
      // the avatar to be displayed
      avatar_url: getLogoUrl(),
      // // enable mentioning of individual users or roles, but not @everyone/@here
      allowed_mentions: {
        parse: [],
      },
      // embeds to be sent
      embeds: [
        {
          // decimal number colour of the side of the embed
          color: status_colors.get(new_status) || 0x111828,
          // author
          // - icon next to text at top (text is a link)
          author: {
            name: actor.display_name,
            url: `https://sc-market.space/profile/${actor.username}`,
            icon_url: actor.avatar,
          },
          // embed title
          // - link on 2nd row
          title: order.title,
          url: `https://sc-market.space/contract/${order.order_id}`,
          // embed description
          // - text on 3rd row
          // custom embed fields: bold title/name, normal content/value below title
          // - located below description, above image.
          fields: [
            {
              name: "New Status",
              value: new_status,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    },
    webhook,
  )
}
