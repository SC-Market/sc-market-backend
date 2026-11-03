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
import {
  buyOrderFilledText,
  emailLocale,
  formatNumber,
  translate,
  waitedFor,
  type BuyOrderFilledFacts,
  type EmailLocale,
  type Vars,
  wipeRelistText,
} from "./i18n/index.js"
import type { IdentityActionKind } from "../identity-admin/identity-admin.service.js"

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
): Promise<Partial<EmailTemplateData> & { locale: EmailLocale }> {
  const user = await profileDb.getUser({ user_id: userId })
  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  // Personal-scope links; sendNotificationEmail sets the exact scope's.
  const links = unsubscribeLinksFor(userId, notificationType, null)

  return {
    userName: user.username,
    userDisplayName: user.display_name,
    // The recipient's language setting (English otherwise): templates,
    // subject and preheader are in it (i18n/index.ts).
    locale: emailLocale(user.locale),
    notificationType: notificationType,
    siteName: getSiteName(),
    siteUrl: getBaseUrl(),
    logoUrl: `${getBaseUrl()}/scmarket-logo.png`,
    unsubscribeUrl: links.unsubscribeUrl,
    preferencesUrl: links.preferencesUrl,
  }
}

/**
 * Subject (notificationTitle) and preheader of a template, in `locale`:
 * "<template>.subject" and "<template>.<preheaderKey>" (preheader by default).
 */
function heading(
  locale: EmailLocale,
  template: string,
  vars: Vars = {},
  preheaderKey = "preheader",
): { notificationTitle: string; notificationBody: string; preheader: string } {
  const preheader = translate(locale, `${template}.${preheaderKey}`, vars)
  return {
    notificationTitle: translate(locale, `${template}.subject`, vars),
    notificationBody: preheader,
    preheader,
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

  const title = order.title || translate(baseData.locale, "common.untitled")
  const status = action.startsWith("order_status_")
  return {
    ...baseData,
    ...heading(baseData.locale, action, { title }, status ? "intro" : "preheader"),
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
    ...heading(baseData.locale, "order_message", {
      author: authorName,
      title: order.title || translate(baseData.locale, "common.untitled"),
    }),
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
  action: "order_review" | "order_review_revision_requested" = "order_review",
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, action)
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
    ...heading(baseData.locale, action, {
      author: authorName,
      title: order.title || translate(baseData.locale, "common.untitled"),
    }),
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
  action:
    | "offer_create"
    | "counter_offer_create"
    | "contract_offer_received"
    | "offer_accepted"
    | "offer_rejected",
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, action)
  const url = `${getBaseUrl()}/offer/${offer.id}`

  return {
    ...baseData,
    ...heading(baseData.locale, action),
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
    ...heading(baseData.locale, "offer_message", { author: authorName }),
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
    ...heading(baseData.locale, "market_item_bid", { title: listing.details.title }),
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
    ...heading(baseData.locale, "market_item_offer", { title: completeListing.details.title }),
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
    ...heading(baseData.locale, "contractor_invite", { org: contractor.name }),
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
    ...heading(baseData.locale, "admin_alert", { title: alert.title }),
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
  const { locale } = baseData

  return {
    ...baseData,
    ...heading(locale, "price_alert", {
      title: listing.title,
      price: formatNumber(locale, listing.price),
      target: formatNumber(locale, watch.max_price),
    }),
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
  const subdomain = `${enquiry.requested_subdomain}.sc-market.space`
  const name = enquiry.target_name || enquiry.target
  const handle = encodeURIComponent(enquiry.target)
  return {
    ...baseData,
    ...heading(baseData.locale, notificationType, { name, subdomain }),
    actionUrl:
      enquiry.target_type === "org"
        ? `${getBaseUrl()}/org/${handle}/manage/storefront`
        : `${getBaseUrl()}/shop/${handle}/settings`,
    enquiry: { ...enquiry, target_name: name, subdomain },
  } as EmailTemplateData
}

/**
 * A pending-offer reminder digest (services/offer-reminders reminderMessages):
 * the facts only, the words are the recipient's language.
 */
export interface OfferReminderEmailData {
  stage: "first" | "final" | "buyer"
  /** Offers in the digest (more than are listed). */
  count: number
  /** The other side of each listed offer, and how long it has waited. */
  offers: { session_id: string; title: string; counterparty: string; waited_hours: number; url: string }[]
  more: number
  url: string
  withdraw_url: string | null
}

const REMINDER_TEMPLATE = {
  first: "offer_pending_reminder",
  final: "offer_pending_final_reminder",
  buyer: "offer_waiting_buyer",
} as const

/** Pending-offer reminders: to the seller side (first, final) or the buyer. */
export async function formatOfferReminderEmailData(
  reminder: OfferReminderEmailData,
  notificationType: "offer_pending_reminder" | "offer_pending_final_reminder" | "offer_waiting_buyer",
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, notificationType)
  const { locale } = baseData
  const template = REMINDER_TEMPLATE[reminder.stage]
  const first = reminder.offers[0]
  const vars = {
    count: reminder.count,
    title: first?.title ?? "",
    waited: first ? waitedFor(locale, first.waited_hours) : "",
    buyer: first?.counterparty ?? "",
    seller: first?.counterparty ?? "",
  }
  const size = reminder.count === 1 ? "single" : "multiple"
  const title = translate(locale, `${template}.subject.${size}`, vars)
  const body = translate(locale, `${template}.body.${size}`, vars)
  return {
    ...baseData,
    notificationTitle: title,
    notificationBody: body,
    preheader: body,
    actionUrl: reminder.url,
    offerReminder: {
      ...reminder,
      title,
      body,
      offers: reminder.offers.map((o) => ({ ...o, waited: waitedFor(locale, o.waited_hours) })),
    },
  } as EmailTemplateData
}

/**
 * An admin changed your account's identity (services/identity-admin): the
 * security email. Mandatory (catalog emailMandatory), so it carries no
 * unsubscribe link.
 */
export interface IdentityChangedEmailData {
  kind: IdentityActionKind
  notice: { old_username?: string; new_username?: string }
}

export async function formatIdentityChangedEmailData(
  identity: IdentityChangedEmailData,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "account_identity_changed")
  const { locale } = baseData
  const body = translate(locale, `account_identity_changed.body.${identity.kind}`, {
    username: identity.notice.new_username ?? "",
  })
  return {
    ...baseData,
    notificationTitle: translate(locale, `account_identity_changed.subject.${identity.kind}`),
    notificationBody: body,
    preheader: body,
    actionUrl: `${getBaseUrl()}/settings`,
    // A deactivated account can't log in: nothing to open.
    identity: { body, hasAction: identity.kind !== "account_deactivated" },
  } as EmailTemplateData
}

/**
 * The unread-message reminder (services/dm-reminders): how many
 * conversations wait, and where to answer them.
 */
export interface UnreadReminderEmailData {
  conversations: number
  url: string
}

export async function formatUnreadReminderEmailData(
  reminder: UnreadReminderEmailData,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "dm_reminder")
  const { locale } = baseData
  const count = reminder.conversations
  const size = count === 1 ? "single" : "multiple"
  const body = translate(locale, `dm_reminder.body.${size}`, { count })
  return {
    ...baseData,
    notificationTitle: translate(locale, `dm_reminder.subject.${size}`, { count }),
    notificationBody: body,
    preheader: body,
    actionUrl: reminder.url,
    unreadCount: reminder.conversations,
  } as EmailTemplateData
}

/**
 * "Your buy order was filled" (services/notifications/buy-order-filled.ts),
 * to the buyer: who filled it, what and for how much, and whether the buy
 * order stays open. Links to the new order.
 */
export interface BuyOrderFilledEmailData extends BuyOrderFilledFacts {
  order_id: string
}

export async function formatBuyOrderFilledEmailData(
  fill: BuyOrderFilledEmailData,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "buy_order_filled")
  const text = buyOrderFilledText(baseData.locale, fill)
  return {
    ...baseData,
    notificationTitle: text.title,
    notificationBody: text.body,
    preheader: text.body,
    actionUrl: `${getBaseUrl()}/contract/${fill.order_id}`,
    buyOrderFill: { body: text.body, status: text.status },
  } as EmailTemplateData
}

/**
 * "Your listings were paused for the wipe. Relist them in one tap."
 * (services/listing-wipe), in the user's language. Links to My Listings,
 * where the "Relist all" banner is.
 */
export interface WipeRelistEmailData {
  wipe_id: string
  /** Site path of the relist banner (/market/me). */
  path: string
}

export async function formatWipeRelistEmailData(
  wipe: WipeRelistEmailData,
  userId: string,
): Promise<EmailTemplateData> {
  const baseData = await getBaseTemplateData(userId, "listing_paused_by_wipe")
  const text = wipeRelistText(baseData.locale)
  return {
    ...baseData,
    notificationTitle: text.title,
    notificationBody: text.body,
    preheader: text.tap,
    actionUrl: `${getBaseUrl()}${wipe.path}`,
    wipeRelist: { body: text.body },
  } as EmailTemplateData
}
