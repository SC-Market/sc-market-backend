/**
 * Notification payload formatters for push notifications.
 * These functions format notification data into push notification payloads.
 */

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
} from "../../clients/database/db-models.js"
import { User } from "../../api/routes/v1/api-models.js"
import { PushNotificationPayload } from "../push-notifications/push-notification.service.types.js"
import { env } from "../../config/env.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import { cdn } from "../../clients/cdn/cdn.js"

/**
 * Base URL for the application (for notification links and assets)
 */
const getBaseUrl = (): string => {
  return env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
}

/**
 * Get notification icon URL
 * Android requires proper PNG icons (not favicon.ico)
 * Use the Android Chrome icon which is optimized for notifications
 */
const getNotificationIcon = (): string => {
  const baseUrl = getBaseUrl()
  // Use Android Chrome 192x192 icon - perfect size for Android notifications
  return `${baseUrl}/android-chrome-192x192.png`
}

/**
 * Get notification badge URL
 * Android badges should be monochrome and small (24x24 or 48x48)
 * Using the 192x192 icon works, but ideally should be a monochrome badge
 */
const getNotificationBadge = (): string => {
  const baseUrl = getBaseUrl()
  // Use Android Chrome 192x192 icon as badge (Android will handle it)
  return `${baseUrl}/android-chrome-192x192.png`
}

/**
 * Format order notification payload
 */
export function formatOrderNotificationPayload(
  order: DBOrder,
  action: string,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/contract/${order.order_id}`

  let title = "New Order"
  let body = `Order: ${order.title || "Untitled Order"}`

  switch (action) {
    case "order_create":
      title = "New Order Created"
      body = `A new order "${order.title || "Untitled"}" has been created`
      break
    case "order_assigned":
      title = "Order Assigned"
      body = `You have been assigned to order "${order.title || "Untitled"}"`
      break
    case "order_status_fulfilled":
      title = "Order Fulfilled"
      body = `Order "${order.title || "Untitled"}" has been fulfilled`
      break
    case "order_status_in_progress":
      title = "Order In Progress"
      body = `Order "${order.title || "Untitled"}" is now in progress`
      break
    case "order_status_not_started":
      title = "Order Status Updated"
      body = `Order "${order.title || "Untitled"}" status updated to not started`
      break
    case "order_status_cancelled":
      title = "Order Cancelled"
      body = `Order "${order.title || "Untitled"}" has been cancelled`
      break
  }

  return {
    title,
    body,
    icon: getNotificationIcon(),
    badge: getNotificationBadge(),
    data: {
      url,
      type: "order",
      entityId: order.order_id,
      action,
    },
    tag: `order-${order.order_id}`,
    requireInteraction: false,
  }
}

/**
 * Get sender information (username and avatar) for notifications
 */
async function getSenderInfo(
  userId: string | null,
): Promise<{ username: string; avatar: string }> {
  if (!userId) {
    return {
      username: "System",
      avatar: getNotificationIcon(),
    }
  }

  try {
    const user = await profileDb.getUser({ user_id: userId })
    if (!user) {
      return {
        username: "Unknown",
        avatar: getNotificationIcon(),
      }
    }

    const avatarUrl = await cdn.getFileLinkResource(user.avatar)

    return {
      username: user.username,
      avatar: avatarUrl || getNotificationIcon(),
    }
  } catch (error) {
    // Fallback if user lookup fails
    return {
      username: "Unknown",
      avatar: getNotificationIcon(),
    }
  }
}

/**
 * Format order message notification payload
 * Now includes sender name and message preview
 */
export async function formatOrderMessageNotificationPayload(
  order: DBOrder,
  message: DBMessage,
  chatId?: string,
): Promise<PushNotificationPayload> {
  const url = chatId
    ? `${getBaseUrl()}/messages?chat_id=${chatId}`
    : `${getBaseUrl()}/contract/${order.order_id}`

  // Get sender information
  const sender = await getSenderInfo(message.author)

  // Truncate message preview to 100 characters
  const messagePreview =
    message.content.length > 100
      ? message.content.substring(0, 97) + "..."
      : message.content

  return {
    title: `${sender.username}: ${messagePreview}`,
    body: messagePreview,
    icon: sender.avatar,
    badge: getNotificationBadge(),
    data: {
      url,
      type: "order",
      entityId: order.order_id,
      action: "order_message",
      chatId: chatId || undefined,
    },
    tag: chatId ? `chat-${chatId}` : `order-message-${order.order_id}`,
    requireInteraction: false,
  }
}

/**
 * Format order comment notification payload
 */
export function formatOrderCommentNotificationPayload(
  order: DBOrder,
  comment: DBOrderComment,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/contract/${order.order_id}`

  return {
    title: "New Comment",
    body: `New comment on order "${order.title || "Untitled"}"`,
    icon: `${getBaseUrl()}/favicon.ico`,
    badge: `${getBaseUrl()}/favicon.ico`,
    data: {
      url,
      type: "order",
      entityId: order.order_id,
      action: "order_comment",
      commentId: comment.comment_id,
    },
    tag: `order-comment-${order.order_id}`,
    requireInteraction: false,
  }
}

/**
 * Format order review notification payload
 */
export function formatOrderReviewNotificationPayload(
  review: DBReview,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/contract/${review.order_id}`

  return {
    title: "New Review",
    body: `You have received a new review`,
    icon: `${getBaseUrl()}/favicon.ico`,
    badge: `${getBaseUrl()}/favicon.ico`,
    data: {
      url,
      type: "order_review",
      entityId: review.review_id,
      action: "order_review",
    },
    tag: `order-review-${review.review_id}`,
    requireInteraction: false,
  }
}

/**
 * Format order review revision notification payload
 */
export function formatOrderReviewRevisionNotificationPayload(
  review: DBReview,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/contract/${review.order_id}`

  return {
    title: "Review Revision Requested",
    body: `A revision has been requested for your review`,
    icon: `${getBaseUrl()}/favicon.ico`,
    badge: `${getBaseUrl()}/favicon.ico`,
    data: {
      url,
      type: "order_review",
      entityId: review.review_id,
      action: "order_review_revision_requested",
    },
    tag: `order-review-revision-${review.review_id}`,
    requireInteraction: false,
  }
}

/**
 * Format offer notification payload
 */
export function formatOfferNotificationPayload(
  offer: DBOfferSession,
  type: "create" | "counteroffer",
): PushNotificationPayload {
  const url = `${getBaseUrl()}/offer/${offer.id}`

  const title = type === "create" ? "New Offer" : "Counter-Offer"
  const body =
    type === "create"
      ? `A new offer has been submitted`
      : `A counter-offer has been submitted`

  return {
    title,
    body,
    icon: getNotificationIcon(),
    badge: getNotificationBadge(),
    data: {
      url,
      type: "offer",
      entityId: offer.id,
      action: type === "create" ? "offer_create" : "counter_offer_create",
    },
    tag: `offer-${offer.id}`,
    requireInteraction: false,
  }
}

/**
 * Format offer message notification payload
 * Now includes sender name and message preview
 */
export async function formatOfferMessageNotificationPayload(
  session: DBOfferSession,
  message: DBMessage,
  chatId?: string,
): Promise<PushNotificationPayload> {
  const url = chatId
    ? `${getBaseUrl()}/messages?chat_id=${chatId}`
    : `${getBaseUrl()}/offer/${session.id}`

  // Get sender information
  const sender = await getSenderInfo(message.author)

  // Truncate message preview to 100 characters
  const messagePreview =
    message.content.length > 100
      ? message.content.substring(0, 97) + "..."
      : message.content

  return {
    title: `${sender.username}: ${messagePreview}`,
    body: messagePreview,
    icon: sender.avatar,
    badge: getNotificationBadge(),
    data: {
      url,
      type: "offer",
      entityId: session.id,
      action: "offer_message",
      chatId: chatId || undefined,
    },
    tag: chatId ? `chat-${chatId}` : `offer-message-${session.id}`,
    requireInteraction: false,
  }
}

/**
 * Format market bid notification payload
 */
export function formatMarketBidNotificationPayload(
  listing: DBMarketListingComplete,
  bid: DBMarketBid,
): PushNotificationPayload {
  // All DBMarketListingComplete types have a listing property
  const listingId =
    "listing" in listing
      ? listing.listing.listing_id
      : (listing as any).listing_id
  const url = `${getBaseUrl()}/market/${listingId}`

  // Extract title from details (all types have details)
  let title = "your listing"
  if ("details" in listing) {
    title = listing.details.title
  }

  return {
    title: "New Bid",
    body: `A new bid has been placed on "${title}"`,
    icon: `${getBaseUrl()}/favicon.ico`,
    badge: `${getBaseUrl()}/favicon.ico`,
    data: {
      url,
      type: "market_listing",
      entityId: listingId,
      action: "market_item_bid",
      bidId: bid.bid_id,
    },
    tag: `market-bid-${bid.bid_id}`,
    requireInteraction: false,
  }
}

/**
 * Format market offer notification payload
 * Note: DBMarketListing doesn't have title, so we use a generic message
 */
export function formatMarketOfferNotificationPayload(
  listing: DBMarketListing,
  offer: DBMarketOffer,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/market/${listing.listing_id}`

  return {
    title: "New Offer",
    body: `A new offer has been made on your listing`,
    icon: `${getBaseUrl()}/favicon.ico`,
    badge: `${getBaseUrl()}/favicon.ico`,
    data: {
      url,
      type: "market_listing",
      entityId: listing.listing_id,
      action: "market_item_offer",
      offerId: offer.offer_id,
    },
    tag: `market-offer-${offer.offer_id}`,
    requireInteraction: false,
  }
}

/**
 * Format contractor invite notification payload
 */
export function formatContractorInviteNotificationPayload(
  invite: DBContractorInvite,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/contractors`

  return {
    title: "Contractor Invitation",
    body: `You have been invited to join a contractor organization`,
    icon: `${getBaseUrl()}/favicon.ico`,
    badge: `${getBaseUrl()}/favicon.ico`,
    data: {
      url,
      type: "contractor_invite",
      entityId: invite.invite_id,
      action: "contractor_invite",
    },
    tag: `contractor-invite-${invite.invite_id}`,
    requireInteraction: false,
  }
}

/**
 * Format admin alert notification payload
 */
export function formatAdminAlertNotificationPayload(
  alert: DBAdminAlert,
): PushNotificationPayload {
  const url = alert.link || `${getBaseUrl()}/admin`

  return {
    title: alert.title,
    body: alert.content,
    icon: `${getBaseUrl()}/favicon.ico`,
    badge: `${getBaseUrl()}/favicon.ico`,
    data: {
      url,
      type: "admin_alert",
      entityId: alert.alert_id,
      action: "admin_alert",
    },
    tag: `admin-alert-${alert.alert_id}`,
    requireInteraction: true, // Admin alerts should require interaction
  }
}
