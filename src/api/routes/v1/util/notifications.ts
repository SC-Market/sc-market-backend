import {
  DBContractorInvite,
  DBMarketBid,
  DBMarketListing,
  DBMarketListingComplete,
  DBMarketOffer,
  DBMessage,
  DBOfferSession,
  DBOrder,
  DBOrderComment,
  DBReview,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  sendAssignedWebhook,
  sendBidWebhooks,
  sendOfferDM,
  sendOfferWebhooks,
  sendOrderCommentWebhooks,
  sendOrderDM,
  sendOrderStatusWebhooks,
  sendOrderWebhooks,
} from "./webhooks.js"
import { sendSystemMessage } from "../chats/helpers.js"
import { manageOfferStatusUpdateDiscord } from "./discord.js"

export async function createOrderNotifications(order: DBOrder) {
  if (order.contractor_id) {
    await createOrderContractorNotification(order)
  }

  if (order.assigned_id) {
    await createOrderAssignedNotification(order)
  } else {
    await sendOrderWebhooks(order)
  }
}

export async function createOfferSiteNotifications(
  offer: DBOfferSession,
  type: "create" | "counteroffer",
) {
  if (offer.contractor_id) {
    await createOfferContractorNotification(
      offer,
      type === "create" ? "offer_create" : "counter_offer_create",
    )
  }

  if (offer.assigned_id) {
    await createOfferAssignedNotification(
      offer,
      type === "create" ? "offer_created" : "counter_offer_created",
    )
  }
}

export async function dispatchOfferNotifications(
  offer: DBOfferSession,
  type: "create" | "counteroffer",
) {
  try {
    // 1 Send DMS
    await sendOfferDM(offer)
  } catch (e) {
    console.error(e)
  }

  try {
    // 4 Send message in chat
    await sendOfferChatMessage(offer)
  } catch (e) {
    console.error(e)
  }

  // 2 Insert notification
  await createOfferSiteNotifications(offer, type)

  try {
    // 3 Send webhooks
    await sendOfferWebhooks(
      offer,
      type === "create" ? "offer_create" : "counter_offer_create",
    )
  } catch (e) {
    console.error(e)
  }

  try {
    if (type === "counteroffer") {
      await sendOfferStatusNotification(offer, "Counter-Offered")
    }
  } catch (e) {
    console.error(e)
  }
}

async function createOrderContractorNotification(object: DBOrder) {
  const action = await database.getNotificationActionByName("order_create")
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: object.order_id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: object.customer_id,
    },
  ])

  const admins = await database.getMembersWithMatchingRole(
    object.contractor_id!,
    { manage_orders: true },
  )

  await database.insertNotifications(
    admins.map((u) => ({
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: u.user_id,
    })),
  )
}

async function createOfferContractorNotification(
  object: DBOfferSession,
  type: "offer_create" | "counter_offer_create" = "offer_create",
) {
  const action = await database.getNotificationActionByName(type)
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: object.id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: object.customer_id,
    },
  ])

  const admins = await database.getMembersWithMatchingRole(
    object.contractor_id!,
    { manage_orders: true },
  )

  await database.insertNotifications(
    admins.map((u) => ({
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: u.user_id,
    })),
  )
}

export async function sendAssignedMessage(order: DBOrder) {
  const assigned = await database.getUser({ user_id: order.assigned_id })
  const chat = await database.getChat({ order_id: order.order_id })
  const content = `Order has been assigned to ${assigned.username}`
  await sendSystemMessage(chat.chat_id, content, false)
}
export async function sendOfferChatMessage(order: DBOfferSession) {
  const chat = await database.getChat({ session_id: order.id })
  const content = `An offer has been submitted`
  await sendSystemMessage(chat.chat_id, content, false)
}

export async function sendUnassignedMessage(order: DBOrder) {
  const chat = await database.getChat({ order_id: order.order_id })
  const content = `Order has been unassigned`
  await sendSystemMessage(chat.chat_id, content, false)
}

export async function createOrderAssignedNotification(order: DBOrder) {
  if (!order.assigned_id) {
    return
  }

  const action = await database.getNotificationActionByName("order_assigned")
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: order.order_id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: order.customer_id,
    },
  ])

  await database.insertNotifications([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: order.assigned_id!,
    },
  ])

  await sendOrderDM(order)
  await sendAssignedWebhook(order)
  await sendAssignedMessage(order)
}

export async function createOfferAssignedNotification(
  session: DBOfferSession,
  type: "offer_created" | "counter_offer_created" = "offer_created",
) {
  if (!session.assigned_id) {
    return
  }

  const action = await database.getNotificationActionByName(
    type === "offer_created" ? "offer_create" : "counter_offer_create",
  )
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: session.id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: session.customer_id,
    },
  ])

  await database.insertNotifications([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: session.assigned_id!,
    },
  ])
}

export async function createOrderMessageNotification(
  order: DBOrder,
  message: DBMessage,
) {
  const action = await database.getNotificationActionByName("order_message")

  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: order.order_id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: message.author,
    },
  ])

  for (const notified of [order.assigned_id, order.customer_id]) {
    if (!notified || notified === message.author) {
      continue
    }

    await database.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: notified!,
      },
    ])
  }
}

export async function createOfferMessageNotification(
  session: DBOfferSession,
  message: DBMessage,
) {
  const action = await database.getNotificationActionByName("offer_message")

  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: session.id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: message.author,
    },
  ])

  for (const notified of [session.assigned_id, session.customer_id]) {
    if (!notified || notified === message.author) {
      continue
    }

    await database.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: notified!,
      },
    ])
  }
}

export async function marketBidNotification(
  listing: DBMarketListingComplete,
  bid: DBMarketBid,
) {
  if (listing.listing.contractor_seller_id) {
    const admins = await database.getMembersWithMatchingRole(
      listing.listing.contractor_seller_id,
      { manage_market: true },
    )

    if (bid.user_bidder_id) {
      await marketUpdateNotification(
        bid.user_bidder_id,
        bid.bid_id,
        "market_item_bid",
        admins.map((u) => u.user_id),
      )
    }
  }

  if (listing.listing.user_seller_id) {
    if (bid.user_bidder_id) {
      await marketUpdateNotification(
        bid.user_bidder_id,
        bid.bid_id,
        "market_item_bid",
        [listing.listing.user_seller_id],
      )
    }
  }

  await sendBidWebhooks(listing, bid)
}

export async function marketOfferNotification(
  listing: DBMarketListing,
  offer: DBMarketOffer,
) {
  if (listing.contractor_seller_id) {
    const admins = await database.getMembersWithMatchingRole(
      listing.contractor_seller_id,
      { manage_market: true },
    )

    if (offer.buyer_user_id) {
      await marketUpdateNotification(
        offer.buyer_user_id,
        offer.offer_id,
        "market_item_offer",
        admins.map((u) => u.user_id),
      )
    }
  }

  if (listing.user_seller_id) {
    if (offer.buyer_user_id) {
      await marketUpdateNotification(
        offer.buyer_user_id,
        offer.offer_id,
        "market_item_offer",
        [listing.user_seller_id],
      )
    }
  }
}

async function marketUpdateNotification(
  actor_id: string,
  entity_id: string,
  action_name: string,
  users: string[],
) {
  const action = await database.getNotificationActionByName(action_name)
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: entity_id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: actor_id,
    },
  ])

  await database.insertNotifications(
    users.map((u) => ({
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: u,
    })),
  )
}

export async function createOrderCommentNotification(
  comment: DBOrderComment,
  actor_id: string,
) {
  const order = await database.getOrder({ order_id: comment.order_id })

  const action = await database.getNotificationActionByName("order_comment")
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: comment.comment_id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id,
    },
  ])

  if (order.assigned_id && actor_id !== order.assigned_id) {
    await database.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: order.assigned_id!,
      },
    ])
  }

  if (actor_id !== order.customer_id) {
    await database.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: order.customer_id!,
      },
    ])
  }

  await sendOrderCommentWebhooks(order, comment)
}

export async function createOrderReviewNotification(review: DBReview) {
  const order = await database.getOrder({ order_id: review.order_id })

  if (!order.assigned_id) {
    return
  }

  const action = await database.getNotificationActionByName("order_review")
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: review.review_id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: order.customer_id,
    },
  ])

  await database.insertNotifications([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: order.assigned_id!,
    },
  ])
}

export async function createOrderStatusNotification(
  order: DBOrder,
  new_status: string,
  actor_id: string,
) {
  const action_name = `order_status_${new_status.replace("-", "_")}`
  const action = await database.getNotificationActionByName(action_name)
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: order.order_id,
    },
  ])

  await database.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: actor_id,
    },
  ])

  if (order.assigned_id && order.assigned_id !== actor_id) {
    await database.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: order.assigned_id!,
      },
    ])
  }

  if (order.customer_id !== actor_id) {
    await database.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: order.customer_id,
      },
    ])
  }

  await sendOrderStatusWebhooks(order, new_status, actor_id)
}

export async function createContractorInviteNotification(
  invite: DBContractorInvite,
) {
  const action = await database.getNotificationActionByName("contractor_invite")
  const notif_objects = await database.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: invite.invite_id,
    },
  ])

  await database.insertNotifications([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: invite.user_id,
    },
  ])
}

export async function sendOfferStatusNotification(
  offer: DBOfferSession,
  status: "Rejected" | "Accepted" | "Counter-Offered",
) {
  await manageOfferStatusUpdateDiscord(offer, status)
}
