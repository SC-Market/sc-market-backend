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
  DBReview,
} from "../../clients/database/db-models.js"
import { EmailTemplateData } from "./email.service.types.js"
import { env } from "../../config/env.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as marketDb from "../../api/routes/v1/market/database.js"
import { unsubscribeLinksFor } from "./unsubscribe-token.js"

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

  // Personal-scope links; sendNotificationEmail sets the exact scope's.
  const links = unsubscribeLinksFor(userId, notificationType, null)

  return {
    userName: user.username,
    userDisplayName: user.display_name,
    locale: user.locale || "en",
    notificationType: notificationType,
    siteName: getSiteName(),
    siteUrl: getBaseUrl(),
    logoUrl: `${getBaseUrl()}/scmarket-logo.png`,
    unsubscribeUrl: links.unsubscribeUrl,
    preferencesUrl: links.preferencesUrl,
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
  const url = `${getBaseUrl()}/offer/${offer.id}`

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
  const url = `${getBaseUrl()}/offer/${offer.id}`

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

  // Get contractor details
  const contractorDb =
    await import("../../api/routes/v1/contractors/database.js")
  const contractor = await contractorDb.getContractor({
    contractor_id: invite.contractor_id,
  })
  // The org's page shows Join / Decline while the invite is pending.
  const url = `${getBaseUrl()}/contractor/${encodeURIComponent(contractor.spectrum_id)}`

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
  const url = alert.link || `${getBaseUrl()}/notifications`

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

/** Listing and watchlist item carried by a `price_alert` email. */
export interface PriceAlertEmailListing {
  listing_id: string
  title: string
  price: number
  quantity: number
  seller_name: string | null
}

export interface PriceAlertEmailWatch {
  query: string
  max_price: number
}

/**
 * Format watchlist price alert email data
 */
export async function formatPriceAlertEmailData(
  listing: PriceAlertEmailListing,
  watch: PriceAlertEmailWatch,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "price_alert")
  const price = listing.price.toLocaleString("en-US")

  return {
    ...baseData,
    notificationTitle: `Price Alert: ${listing.title} is ${price} aUEC`,
    notificationBody: `${listing.title} is listed at ${price} aUEC, at or below your target of ${watch.max_price.toLocaleString("en-US")} aUEC.`,
    actionUrl: `${getBaseUrl()}/market/${listing.listing_id}`,
    listing,
    watch,
  } as EmailTemplateData
}

/** The enquiry an enquiry decision email is about (services/storefront/enquiry-notify.ts). */
export interface StorefrontEnquiryEmailData {
  enquiry_id: string
  target_type: "org" | "shop"
  target: string
  target_name: string
  requested_subdomain: string
  status: string
}

/** Storefront enquiry accepted / declined, to the person who sent it. */
export async function formatStorefrontEnquiryDecisionEmailData(
  enquiry: StorefrontEnquiryEmailData,
  notificationType: "storefront_enquiry_accepted" | "storefront_enquiry_declined",
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, notificationType)
  const accepted = notificationType === "storefront_enquiry_accepted"
  const subdomain = `${enquiry.requested_subdomain}.sc-market.space`
  const name = enquiry.target_name || enquiry.target
  const handle = encodeURIComponent(enquiry.target)
  return {
    ...baseData,
    notificationTitle: accepted ? "Storefront enquiry accepted" : "Storefront enquiry declined",
    notificationBody: accepted
      ? `SC Market staff accepted your branded storefront enquiry for ${name} (${subdomain}).`
      : `SC Market staff declined your branded storefront enquiry for ${name} (${subdomain}).`,
    actionUrl:
      enquiry.target_type === "org"
        ? `${getBaseUrl()}/org/${handle}/manage/storefront`
        : `${getBaseUrl()}/shop/${handle}/settings`,
    enquiry: { ...enquiry, target_name: name, subdomain },
  } as EmailTemplateData
}

/** A pending-offer reminder (services/offer-reminders reminderMessages). */
export interface OfferReminderEmailData {
  stage: "first" | "final" | "buyer"
  title: string
  body: string
  offers: { session_id: string; title: string; counterparty: string; waited: string; url: string }[]
  more: number
  url: string
  withdraw_url: string | null
}

/** Pending-offer reminders: to the seller side (first, final) or the buyer. */
export async function formatOfferReminderEmailData(
  reminder: OfferReminderEmailData,
  notificationType: "offer_pending_reminder" | "offer_pending_final_reminder" | "offer_waiting_buyer",
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, notificationType)
  return {
    ...baseData,
    notificationTitle: reminder.title,
    notificationBody: reminder.body,
    actionUrl: reminder.url,
    offerReminder: reminder,
  } as EmailTemplateData
}
