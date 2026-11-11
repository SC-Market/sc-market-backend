/**
 * Admin › Notification test: send one notification of a given type to a
 * chosen user, built from the first matching real row (order, offer, bid…),
 * through the same in-app, push, email and webhook paths real events use.
 * Moved unchanged from v1 POST /api/admin/notifications/test.
 */
import logger from "../../logger/logger.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"
import * as adminDb from "../../api/routes/v1/admin/database.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import * as marketDb from "../../api/routes/v1/market/database.js"
import * as offerDb from "../../api/routes/v1/offers/database.js"
import * as chatDb from "../../api/routes/v1/chats/database.js"
import { pushNotificationService } from "../push-notifications/push-notification.service.js"
import { emailService } from "../email/email.service.js"
import * as payloadFormatters from "../notifications/notification-payload-formatters.js"
import { webhookService } from "../webhooks/webhook.service.js"
import type {
  AdminTestNotificationData,
  AdminTestNotificationType,
} from "../../api/routes/v2/admin/admin-site.types.js"

/** No sample row of the needed kind exists (answered as 404). */
export class TestNotificationSampleMissingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TestNotificationSampleMissingError"
  }
}

type PushPayload = Parameters<
  typeof pushNotificationService.sendPushNotification
>[1]

async function createTestNotification(
  actionName: string,
  entityId: string,
  targetUserId: string,
  actorId: string,
  // The email templates and webhook senders each take the entity they
  // render; this mirrors what the real events pass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payloadData: Record<string, any>,
  pushPayload?: PushPayload,
  contractorId?: string | null,
): Promise<void> {
  const action = await notificationDb.getNotificationActionByName(actionName)
  const notif_objects = await notificationDb.insertNotificationObjects([
    { action_type_id: action.action_type_id, entity_id: entityId },
  ])
  await notificationDb.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: actorId,
    },
  ])
  await notificationDb.insertNotifications([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: targetUserId,
    },
  ])

  if (pushPayload) {
    try {
      await pushNotificationService.sendPushNotification(
        targetUserId,
        pushPayload,
        actionName,
        contractorId ?? null,
      )
    } catch (error) {
      logger.debug(`Failed to send push notification for test:`, error)
    }
  }

  try {
    await emailService.sendNotificationEmail(
      targetUserId,
      actionName,
      payloadData,
      false,
      contractorId ?? null,
    )
  } catch (error) {
    logger.debug(`Failed to send email notification for test:`, error)
  }

  // Webhooks go by entity type, not notification type.
  try {
    if (payloadData.order && actionName.startsWith("order_")) {
      if (actionName.startsWith("order_status_")) {
        const status = actionName.replace("order_status_", "").replace("_", "-")
        await webhookService.sendOrderStatusWebhooks(
          payloadData.order,
          status,
          actorId,
        )
      } else if (actionName === "order_create") {
        await webhookService.sendOrderWebhooks(payloadData.order)
      }
    } else if (payloadData.offer && actionName.startsWith("offer_")) {
      const offerType =
        actionName === "offer_create" ? "offer_create" : "counter_offer_create"
      await webhookService.sendOfferWebhooks(payloadData.offer, offerType)
    } else if (
      payloadData.listing &&
      payloadData.bid &&
      actionName === "market_item_bid"
    ) {
      await webhookService.sendBidWebhooks(payloadData.listing, payloadData.bid)
    }
  } catch (error) {
    logger.debug(`Failed to send webhooks for test:`, error)
  }
}

function missing(message: string): never {
  throw new TestNotificationSampleMissingError(message)
}

async function firstOrder() {
  const orders = await orderDb.getOrders({})
  if (orders.length === 0) missing("No orders found in database")
  return orders[0]
}

async function firstOffer() {
  const offers = await offerDb.getOfferSessions({})
  if (offers.length === 0) missing("No offers found in database")
  return offers[0]
}

async function firstReview() {
  const reviews = await orderDb.getOrderReviews({})
  if (reviews.length === 0) missing("No reviews found in database")
  return reviews[0]
}

async function firstListing() {
  const listings = await marketDb.getMarketListings({})
  if (listings.length === 0) missing("No market listings found in database")
  return listings[0]
}

/**
 * Send the test notification. Returns the ids of the sample rows used.
 * @throws TestNotificationSampleMissingError when no sample row exists
 */
export async function sendAdminTestNotification(params: {
  notificationType: AdminTestNotificationType
  targetUserId: string
  actorId: string
  contractorId?: string | null
}): Promise<AdminTestNotificationData> {
  const {
    notificationType,
    targetUserId,
    actorId,
    contractorId: chosenContractor,
  } = params

  switch (notificationType) {
    case "order_create": {
      const order = await firstOrder()
      const payload = payloadFormatters.formatOrderNotificationPayload(
        order,
        "order_create",
      )
      const contractorId = chosenContractor ?? order.contractor_id ?? null
      await createTestNotification(
        "order_create",
        order.order_id,
        targetUserId,
        actorId,
        { order },
        payload,
        contractorId,
      )
      return { order_id: order.order_id, contractor_id: contractorId }
    }

    case "order_assigned": {
      const order = await firstOrder()
      const payload = payloadFormatters.formatOrderNotificationPayload(
        order,
        "order_assigned",
      )
      const contractorId = chosenContractor ?? order.contractor_id ?? null
      await createTestNotification(
        "order_assigned",
        order.order_id,
        targetUserId,
        actorId,
        { order },
        payload,
        contractorId,
      )
      return { order_id: order.order_id }
    }

    case "order_message": {
      const order = await firstOrder()
      let chat
      try {
        chat = await chatDb.getChat({ order_id: order.order_id })
      } catch {
        missing("No chat found for order")
      }
      const messages = await chatDb.getMessages({ chat_id: chat.chat_id })
      if (messages.length === 0) missing("No messages found for order chat")
      const message = messages[0]
      const payload =
        await payloadFormatters.formatOrderMessageNotificationPayload(
          order,
          message,
          chat.chat_id,
        )
      const contractorId = chosenContractor ?? order.contractor_id ?? null
      await createTestNotification(
        "order_message",
        order.order_id,
        targetUserId,
        actorId,
        { order, message },
        payload,
        contractorId,
      )
      return { order_id: order.order_id, message_id: message.message_id }
    }

    case "order_review": {
      const review = await firstReview()
      const payload =
        payloadFormatters.formatOrderReviewNotificationPayload(review)
      await createTestNotification(
        "order_review",
        review.review_id,
        targetUserId,
        actorId,
        { review },
        payload,
      )
      return { review_id: review.review_id }
    }

    case "order_status_fulfilled":
    case "order_status_in_progress":
    case "order_status_not_started":
    case "order_status_cancelled": {
      const order = await firstOrder()
      const status = notificationType.replace("order_status_", "")
      const actionName = `order_status_${status.replace("-", "_")}`
      const payload = payloadFormatters.formatOrderNotificationPayload(
        order,
        actionName,
      )
      const contractorId = chosenContractor ?? order.contractor_id ?? null
      await createTestNotification(
        actionName,
        order.order_id,
        targetUserId,
        actorId,
        { order },
        payload,
        contractorId,
      )
      return { order_id: order.order_id, status }
    }

    case "offer_create":
    case "counter_offer_create": {
      const offer = await firstOffer()
      const offerType =
        notificationType === "offer_create" ? "create" : "counteroffer"
      const payload = payloadFormatters.formatOfferNotificationPayload(
        offer,
        offerType,
      )
      const contractorId = chosenContractor ?? offer.contractor_id ?? null
      await createTestNotification(
        notificationType,
        offer.id,
        targetUserId,
        actorId,
        { offer },
        payload,
        contractorId,
      )
      return { offer_id: offer.id }
    }

    case "offer_message": {
      const offer = await firstOffer()
      let chat
      try {
        chat = await chatDb.getChat({ session_id: offer.id })
      } catch {
        missing("No chat found for offer session")
      }
      const messages = await chatDb.getMessages({ chat_id: chat.chat_id })
      if (messages.length === 0) missing("No messages found for offer chat")
      const message = messages[0]
      const payload =
        await payloadFormatters.formatOfferMessageNotificationPayload(
          offer,
          message,
          chat.chat_id,
        )
      const contractorId = chosenContractor ?? offer.contractor_id ?? null
      await createTestNotification(
        "offer_message",
        offer.id,
        targetUserId,
        actorId,
        { offer, message },
        payload,
        contractorId,
      )
      return { offer_id: offer.id, message_id: message.message_id }
    }

    case "market_item_bid": {
      const first = await firstListing()
      const listing = await marketDb.getMarketListingComplete(first.listing_id)
      const bids = await marketDb.getMarketBids({
        listing_id: listing.listing.listing_id,
      })
      if (bids.length === 0) missing("No bids found for listing")
      const bid = bids[0]
      const payload = payloadFormatters.formatMarketBidNotificationPayload(
        listing,
        bid,
      )
      await createTestNotification(
        "market_item_bid",
        bid.bid_id,
        targetUserId,
        actorId,
        { listing, bid },
        payload,
      )
      return { listing_id: listing.listing.listing_id, bid_id: bid.bid_id }
    }

    case "market_item_offer": {
      const listing = await firstListing()
      const offers = await marketDb.getMarketOffers({
        listing_id: listing.listing_id,
      })
      if (offers.length === 0) missing("No offers found for listing")
      const offer = offers[0]
      const payload = payloadFormatters.formatMarketOfferNotificationPayload(
        listing,
        offer,
      )
      await createTestNotification(
        "market_item_offer",
        offer.offer_id,
        targetUserId,
        actorId,
        { listing, offer },
        payload,
      )
      return { listing_id: listing.listing_id, offer_id: offer.offer_id }
    }

    case "contractor_invite": {
      const invites = await contractorDb.getContractorInvites({})
      if (invites.length === 0)
        missing("No contractor invites found in database")
      const invite = invites[0]
      const payload =
        await payloadFormatters.formatContractorInviteNotificationPayload(
          invite,
        )
      await createTestNotification(
        "contractor_invite",
        invite.invite_id,
        targetUserId,
        actorId,
        { invite },
        payload,
      )
      return { invite_id: invite.invite_id }
    }

    case "admin_alert": {
      const alerts = await adminDb.getAdminAlerts({})
      if (alerts.length === 0) missing("No admin alerts found in database")
      const alert = alerts[0]
      const payload =
        payloadFormatters.formatAdminAlertNotificationPayload(alert)
      await createTestNotification(
        "admin_alert",
        alert.alert_id,
        targetUserId,
        actorId,
        { alert },
        payload,
      )
      return { alert_id: alert.alert_id }
    }

    case "order_review_revision_requested": {
      const review = await firstReview()
      const payload =
        payloadFormatters.formatOrderReviewRevisionNotificationPayload(review)
      await createTestNotification(
        "order_review_revision_requested",
        review.review_id,
        targetUserId,
        actorId,
        { review },
        payload,
      )
      return { review_id: review.review_id }
    }
  }
}
