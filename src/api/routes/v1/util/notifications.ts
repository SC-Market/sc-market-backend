import {
  DBAdminAlert,
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
  DBUser,
} from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"
import { has_permission } from "../util/permissions.js"
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
  user?: DBUser,
) {
  try {
    // 1 Send DMS
    await sendOfferDM(offer)
  } catch (e) {
    logger.debug(`Failed to send offer DM: ${e}`)
  }

  try {
    // 4 Send message in chat
    await sendOfferChatMessage(offer)
  } catch (e) {
    logger.debug(`Failed to send offer chat message: ${e}`)
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
    logger.debug(`Failed to send offer webhooks: ${e}`)
  }

  try {
    if (type === "counteroffer") {
      await sendOfferStatusNotification(offer, "Counter-Offered", user)
    }
  } catch (e) {
    logger.debug(`Failed to send offer status notification: ${e}`)
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
  try {
    const chat = await database.getChat({ session_id: order.id })
    const content = `An offer has been submitted`
    await sendSystemMessage(chat.chat_id, content, false)
  } catch (error) {
    // Log as debug since this is expected when chat creation fails
    logger.debug(
      `Failed to send offer chat message for session ${order.id}: ${error}`,
    )
  }
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
  logger.debug(
    `Creating order message notification for order ${order.order_id}, message ${message.message_id}`,
  )

  try {
    const action = await database.getNotificationActionByName("order_message")
    logger.debug(`Found notification action: ${action.action_type_id}`)

    // Check if there's already a notification object for this order and action type
    const existingNotificationObject =
      await database.getNotificationObjectByEntityAndAction(
        order.order_id,
        action.action_type_id,
      )

    let notificationObjectId: string

    if (existingNotificationObject) {
      // Reuse existing notification object and update timestamp
      notificationObjectId = existingNotificationObject.notification_object_id
      await database.updateNotificationObjectTimestamp(notificationObjectId)
      logger.debug(
        `Reusing existing notification object: ${notificationObjectId}`,
      )
    } else {
      // Create new notification object
      const notif_objects = await database.insertNotificationObjects([
        {
          action_type_id: action.action_type_id,
          entity_id: order.order_id,
        },
      ])
      notificationObjectId = notif_objects[0].notification_object_id
      logger.debug(`Created new notification object: ${notificationObjectId}`)
    }

    // Add notification change for this message
    await database.insertNotificationChange([
      {
        notification_object_id: notificationObjectId,
        actor_id: message.author!,
      },
    ])
    logger.debug(`Created notification change for actor: ${message.author}`)

    let notificationCount = 0
    for (const notified of [order.assigned_id, order.customer_id]) {
      if (!notified || notified === message.author) {
        logger.debug(`Skipping notification for ${notified} (author or null)`)
        continue
      }

      // Check if user already has an unread notification for this order
      const existingNotification =
        await database.getUnreadNotificationByUserAndObject(
          notified,
          notificationObjectId,
        )

      if (existingNotification) {
        logger.debug(
          `User ${notified} already has unread notification, skipping`,
        )
        continue
      }

      await database.insertNotifications([
        {
          notification_object_id: notificationObjectId,
          notifier_id: notified!,
        },
      ])
      notificationCount++
      logger.debug(`Created notification for user: ${notified}`)
    }

    logger.debug(
      `Successfully created ${notificationCount} order message notifications`,
    )
  } catch (error) {
    logger.error(`Error creating order message notification:`, error)
    throw error
  }
}

export async function createOfferMessageNotification(
  session: DBOfferSession,
  message: DBMessage,
) {
  logger.debug(
    `Creating offer message notification for session ${session.id}, message ${message.message_id}`,
  )

  try {
    const action = await database.getNotificationActionByName("offer_message")
    logger.debug(`Found notification action: ${action.action_type_id}`)

    // Check if there's already a notification object for this session and action type
    const existingNotificationObject =
      await database.getNotificationObjectByEntityAndAction(
        session.id,
        action.action_type_id,
      )

    let notificationObjectId: string

    if (existingNotificationObject) {
      // Reuse existing notification object and update timestamp
      notificationObjectId = existingNotificationObject.notification_object_id
      await database.updateNotificationObjectTimestamp(notificationObjectId)
      logger.debug(
        `Reusing existing notification object: ${notificationObjectId}`,
      )
    } else {
      // Create new notification object
      const notif_objects = await database.insertNotificationObjects([
        {
          action_type_id: action.action_type_id,
          entity_id: session.id,
        },
      ])
      notificationObjectId = notif_objects[0].notification_object_id
      logger.debug(`Created new notification object: ${notificationObjectId}`)
    }

    // Add notification change for this message
    await database.insertNotificationChange([
      {
        notification_object_id: notificationObjectId,
        actor_id: message.author!,
      },
    ])
    logger.debug(`Created notification change for actor: ${message.author}`)

    let notificationCount = 0
    for (const notified of [session.assigned_id, session.customer_id]) {
      if (!notified || notified === message.author) {
        logger.debug(`Skipping notification for ${notified} (author or null)`)
        continue
      }

      // Check if user already has an unread notification for this session
      const existingNotification =
        await database.getUnreadNotificationByUserAndObject(
          notified,
          notificationObjectId,
        )

      if (existingNotification) {
        logger.debug(
          `User ${notified} already has unread notification, skipping`,
        )
        continue
      }

      await database.insertNotifications([
        {
          notification_object_id: notificationObjectId,
          notifier_id: notified!,
        },
      ])
      notificationCount++
      logger.debug(`Created notification for user: ${notified}`)
    }

    logger.debug(
      `Successfully created ${notificationCount} offer message notifications`,
    )
  } catch (error) {
    logger.error(`Error creating offer message notification:`, error)
    throw error
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
  user?: DBUser,
) {
  // Send Discord embed
  await manageOfferStatusUpdateDiscord(offer, status, user)

  // Send chat message
  try {
    const chat = await database.getChat({ session_id: offer.id })
    const actionBy = user ? ` by ${user.username}` : ""
    const content = `Offer status updated to **${status}**${actionBy}`
    await sendSystemMessage(chat.chat_id, content, false)
  } catch (error) {
    logger.debug(
      `Failed to send offer status update chat message for session ${offer.id}: ${error}`,
    )
  }
}

export async function createAdminAlertNotifications(alert: DBAdminAlert) {
  try {
    // Get the admin_alert notification action
    const action = await database.getNotificationActionByName("admin_alert")

    // Create notification object
    const notif_objects = await database.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: alert.alert_id,
      },
    ])

    // Add the admin who created the alert as the actor
    await database.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: alert.created_by,
      },
    ])

    // Get target users based on alert target type
    const targetUserIds = await database.getUsersForAlertTarget(
      alert.target_type,
      alert.target_contractor_id || undefined,
    )

    if (targetUserIds.length === 0) {
      logger.warn(`No users found for admin alert target: ${alert.target_type}`)
      return
    }

    // Create notifications for all target users
    const notifications = targetUserIds.map((userId) => ({
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: userId,
    }))

    await database.insertNotifications(notifications)

    logger.info(
      `Created admin alert notifications for ${targetUserIds.length} users`,
      {
        alertId: alert.alert_id,
        targetType: alert.target_type,
        targetContractorId: alert.target_contractor_id,
      },
    )
  } catch (error) {
    logger.error("Failed to create admin alert notifications:", error)
    throw error
  }
}

export async function createOrderReviewRevisionNotification(
  review: DBReview,
  requester: User,
) {
  try {
    // Determine notification recipients
    const recipients: string[] = []

    if (review.user_author) {
      // Individual review author
      recipients.push(review.user_author)
    } else if (review.contractor_author) {
      // Organization review - notify all members with manage_orders permission
      const members = await database.getContractorMembers({
        contractor_id: review.contractor_author,
      })

      for (const member of members) {
        const hasPermission = await has_permission(
          review.contractor_author,
          member.user_id,
          "manage_orders",
        )
        if (hasPermission) {
          recipients.push(member.user_id)
        }
      }
    }

    if (recipients.length === 0) {
      logger.warn("No recipients found for review revision notification", {
        review_id: review.review_id,
        user_author: review.user_author,
        contractor_author: review.contractor_author,
      })
      return
    }

    // Get notification action
    const action = await database.getNotificationActionByName(
      "order_review_revision_requested",
    )

    // Create notification object
    const notif_objects = await database.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: review.review_id,
      },
    ])

    await database.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: requester.user_id,
      },
    ])

    // Create notifications for all recipients
    const notifications = recipients.map((recipient_id) => ({
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: recipient_id,
    }))

    await database.insertNotifications(notifications)

    logger.info("Created review revision notifications", {
      review_id: review.review_id,
      recipient_count: recipients.length,
      requester_id: requester.user_id,
    })
  } catch (error) {
    logger.error("Failed to create review revision notification:", error)
    throw error
  }
}
