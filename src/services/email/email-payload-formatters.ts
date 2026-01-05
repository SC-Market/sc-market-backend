/**
 * Email payload formatters for email notifications.
 * These functions format notification data into email template data.
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
import { EmailTemplateData } from "./email.service.types.js"
import { env } from "../../config/env.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as marketDb from "../../api/routes/v1/market/database.js"

/**
 * Base URL for the application
 */
const getBaseUrl = (): string => {
  return env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"
}

/**
 * Get site name
 */
const getSiteName = (): string => {
  return "SC Market"
}

/**
 * Generate unsubscribe URL with token
 */
const getUnsubscribeUrl = async (
  userId: string,
  emailId: string,
  email: string,
): Promise<string> => {
  const baseUrl = getBaseUrl()
  // Generate or get existing unsubscribe token
  const unsubscribeTokenDb =
    await import("../../api/routes/v1/email/unsubscribe-database.js")

  // Check for existing active token
  const activeTokens = await unsubscribeTokenDb.getActiveUnsubscribeTokens(
    userId,
    emailId,
  )

  let token: string
  if (activeTokens.length > 0) {
    // Reuse existing token
    token = activeTokens[0].token
  } else {
    // Create new token
    const tokenRecord = await unsubscribeTokenDb.createUnsubscribeToken(
      userId,
      emailId,
      email,
    )
    token = tokenRecord.token
  }

  return `${baseUrl}/email/unsubscribe/${token}`
}

/**
 * Generate preferences URL
 */
const getPreferencesUrl = (): string => {
  const baseUrl = getBaseUrl()
  return `${baseUrl}/settings?tab=email`
}

/**
 * Base template data with common fields
 */
async function getBaseTemplateData(
  userId: string,
  notificationType: string,
): Promise<Partial<EmailTemplateData>> {
  const user = await profileDb.getUser({ user_id: userId })
  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  // Get user's email to generate unsubscribe token
  const userEmailDb =
    await import("../../api/routes/v1/email/user-email-database.js")
  const userEmail = await userEmailDb.getPrimaryEmail(userId)

  let unsubscribeUrl = `${getBaseUrl()}/settings?tab=email`
  if (userEmail) {
    unsubscribeUrl = await getUnsubscribeUrl(
      userId,
      userEmail.email_id,
      userEmail.email,
    )
  }

  return {
    userName: user.username,
    userDisplayName: user.display_name,
    locale: user.locale || "en",
    notificationType: notificationType,
    siteName: getSiteName(),
    siteUrl: getBaseUrl(),
    logoUrl: `${getBaseUrl()}/scmarket-logo.png`,
    unsubscribeUrl,
    preferencesUrl: getPreferencesUrl(),
  }
}

/**
 * Format order notification email data
 */
export async function formatOrderNotificationEmailData(
  order: DBOrder,
  action: string,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, action)
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
    ...baseData,
    notificationTitle: title,
    notificationBody: body,
    actionUrl: url,
    order: {
      order_id: order.order_id,
      title: order.title,
      description: order.description,
      cost: order.cost,
      status: order.status,
    },
  } as EmailTemplateData
}

/**
 * Format order message notification email data
 */
export async function formatOrderMessageEmailData(
  order: DBOrder,
  message: DBMessage,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "order_message")
  const url = `${getBaseUrl()}/contract/${order.order_id}`

  // Get message author
  const author = await profileDb.getUser({ user_id: message.author })
  const authorName = author?.display_name || author?.username || "Unknown"

  return {
    ...baseData,
    notificationTitle: "New Message on Order",
    notificationBody: `${authorName} sent a message on order "${order.title || "Untitled"}"`,
    actionUrl: url,
    order: {
      order_id: order.order_id,
      title: order.title,
    },
    message: {
      content: message.content,
      author: authorName,
      timestamp: message.timestamp,
    },
  } as EmailTemplateData
}

/**
 * Format order comment notification email data
 */
export async function formatOrderCommentEmailData(
  comment: DBOrderComment,
  order: DBOrder,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "order_comment")
  const url = `${getBaseUrl()}/contract/${order.order_id}`

  const author = await profileDb.getUser({ user_id: comment.author })
  const authorName = author?.display_name || author?.username || "Unknown"

  return {
    ...baseData,
    notificationTitle: "New Comment on Order",
    notificationBody: `${authorName} commented on order "${order.title || "Untitled"}"`,
    actionUrl: url,
    order: {
      order_id: order.order_id,
      title: order.title,
    },
    comment: {
      content: comment.content,
      author: authorName,
      timestamp: comment.timestamp,
    },
  } as EmailTemplateData
}

/**
 * Format order review notification email data
 */
export async function formatOrderReviewEmailData(
  review: DBReview,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "order_review")
  const url = `${getBaseUrl()}/contract/${review.order_id}`

  const author = review.user_author
    ? await profileDb.getUser({ user_id: review.user_author })
    : null
  const authorName = author?.display_name || author?.username || "Unknown"

  // Get order for template
  const orderDb = await import("../../api/routes/v1/orders/database.js")
  const order = await orderDb.getOrder({ order_id: review.order_id })

  return {
    ...baseData,
    notificationTitle: "New Review on Order",
    notificationBody: `${authorName} left a review on your order`,
    actionUrl: url,
    order: {
      order_id: order.order_id,
      title: order.title,
    },
    review: {
      review_id: review.review_id,
      rating: review.rating,
      content: review.content,
      author: authorName,
      timestamp: review.timestamp,
      revision_message: review.revision_message,
    },
  } as EmailTemplateData
}

/**
 * Format offer notification email data
 */
export async function formatOfferNotificationEmailData(
  offer: DBOfferSession,
  action: "offer_create" | "counter_offer_create",
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, action)
  const url = `${getBaseUrl()}/offers/${offer.id}`

  const title =
    action === "offer_create" ? "New Offer Created" : "Counter Offer Received"
  const body =
    action === "offer_create"
      ? `A new offer has been created`
      : `You received a counter offer`

  return {
    ...baseData,
    notificationTitle: title,
    notificationBody: body,
    actionUrl: url,
    offer: {
      id: offer.id,
      status: offer.status,
    },
  } as EmailTemplateData
}

/**
 * Format offer message notification email data
 */
export async function formatOfferMessageEmailData(
  offer: DBOfferSession,
  message: DBMessage,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "offer_message")
  const url = `${getBaseUrl()}/offers/${offer.id}`

  const author = await profileDb.getUser({ user_id: message.author })
  const authorName = author?.display_name || author?.username || "Unknown"

  return {
    ...baseData,
    notificationTitle: "New Message on Offer",
    notificationBody: `${authorName} sent a message on your offer`,
    actionUrl: url,
    offer: {
      id: offer.id,
      status: offer.status,
    },
    message: {
      content: message.content,
      author: authorName,
      timestamp: message.timestamp,
    },
  } as EmailTemplateData
}

/**
 * Format market bid notification email data
 */
export async function formatMarketBidEmailData(
  listing: DBMarketListingComplete,
  bid: DBMarketBid,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "market_item_bid")
  const url = `${getBaseUrl()}/market/${listing.listing.listing_id}`

  return {
    ...baseData,
    notificationTitle: "New Bid on Market Listing",
    notificationBody: `Someone placed a bid on "${listing.details.title}"`,
    actionUrl: url,
    listing: {
      listing_id: listing.listing.listing_id,
      title: listing.details.title,
    },
    bid: {
      bid_id: bid.bid_id,
      bid: bid.bid,
    },
  } as EmailTemplateData
}

/**
 * Format market offer notification email data
 */
export async function formatMarketOfferEmailData(
  listing: DBMarketListing,
  offer: DBMarketOffer,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "market_item_offer")
  const url = `${getBaseUrl()}/market/${listing.listing_id}`

  // Fetch complete listing to get title (same approach as formatMarketBidEmailData)
  const completeListing = await marketDb.getMarketListingComplete(
    listing.listing_id,
  )

  return {
    ...baseData,
    notificationTitle: "New Offer on Market Listing",
    notificationBody: `Someone made an offer on "${completeListing.details.title}"`,
    actionUrl: url,
    listing: {
      listing_id: listing.listing_id,
      title: completeListing.details.title,
    },
    offer: {
      offer_id: offer.offer_id,
      offer: offer.offer,
    },
  } as EmailTemplateData
}

/**
 * Format contractor invite notification email data
 */
export async function formatContractorInviteEmailData(
  invite: DBContractorInvite,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "contractor_invite")
  const url = `${getBaseUrl()}/contractors`

  // Get contractor details
  const contractorDb = await import("../../api/routes/v1/contractors/database.js")
  const contractor = await contractorDb.getContractor({
    contractor_id: invite.contractor_id,
  })

  return {
    ...baseData,
    notificationTitle: "Contractor Invitation",
    notificationBody: `You have been invited to join "${contractor.name}"`,
    actionUrl: url,
    contractor: {
      contractor_id: contractor.contractor_id,
      name: contractor.name,
      description: contractor.description,
    },
    invite: {
      invite_id: invite.invite_id,
      message: invite.message,
    },
  } as EmailTemplateData
}

/**
 * Format admin alert notification email data
 */
export async function formatAdminAlertEmailData(
  alert: DBAdminAlert,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "admin_alert")
  const url = `${getBaseUrl()}/admin/alerts`

  return {
    ...baseData,
    notificationTitle: "Admin Alert",
    notificationBody: alert.content || "You have a new admin alert",
    actionUrl: url,
    alert: {
      alert_id: alert.alert_id,
      content: alert.content,
      title: alert.title,
      target_type: alert.target_type,
      timestamp: alert.created_at,
    },
  } as EmailTemplateData
}
