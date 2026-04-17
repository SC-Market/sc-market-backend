/**
 * Notification payload formatters for V2 market notifications.
 * These functions format V2 listing and order data into push notification payloads.
 * 
 * Requirements: 43.1-43.10
 */

import { PushNotificationPayload } from "../push-notifications/push-notification.service.types.js"
import { env } from "../../config/env.js"
import {
  GetListingDetailResponse,
  VariantDetail,
} from "../../api/routes/v2/types/listings.types.js"
import {
  CreateOrderResponse,
  GetOrderDetailResponse,
  OrderItemDetail,
} from "../../api/routes/v2/types/orders.types.js"

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
 * Format quality tier for display in notifications
 * Requirement 43.3: Show quality tier in notification text
 */
function formatQualityTier(variant: VariantDetail | OrderItemDetail["variant"]): string {
  const qualityTier = variant.attributes.quality_tier
  if (!qualityTier) {
    return ""
  }
  
  // Map quality tiers to readable names
  const tierNames: Record<number, string> = {
    1: "Bronze",
    2: "Silver", 
    3: "Gold",
    4: "Platinum",
    5: "Diamond"
  }
  
  const tierName = tierNames[qualityTier] || `Tier ${qualityTier}`
  return ` (${tierName})`
}

/**
 * Format variant information for notification text
 * Requirement 43.2: Include variant information in notifications
 */
function formatVariantInfo(variant: VariantDetail | OrderItemDetail["variant"]): string {
  const parts: string[] = []
  
  // Add quality tier
  if (variant.attributes.quality_tier) {
    parts.push(formatQualityTier(variant))
  }
  
  // Add crafted source if available
  if (variant.attributes.crafted_source && variant.attributes.crafted_source !== 'unknown') {
    const sourceLabels: Record<string, string> = {
      crafted: "Crafted",
      store: "Store",
      looted: "Looted"
    }
    parts.push(sourceLabels[variant.attributes.crafted_source] || variant.attributes.crafted_source)
  }
  
  return parts.join(" - ")
}

/**
 * Format market bid notification payload for V2 listings
 * Requirement 43.5: Provide formatMarketBidNotificationPayloadV2 function
 * Requirement 43.7: Include variant details if bid/offer is for specific variant
 */
export function formatMarketBidNotificationPayloadV2(
  listing: GetListingDetailResponse,
  bidAmount: number,
  variantId?: string,
): PushNotificationPayload {
  // Requirement 43.4: Link to V2 listing detail page when feature flag is V2
  const url = `${getBaseUrl()}/market/${listing.listing.listing_id}`
  
  let body = `A new bid of ${bidAmount} aUEC has been placed on "${listing.listing.title}"`
  
  // Requirement 43.7: Include variant details if bid is for specific variant
  if (variantId && listing.items.length > 0) {
    const item = listing.items[0]
    const variant = item.variants.find(v => v.variant_id === variantId)
    
    if (variant) {
      const variantInfo = formatVariantInfo(variant)
      if (variantInfo) {
        body += ` - ${variantInfo}`
      }
    }
  }
  
  return {
    title: "New Bid",
    body,
    icon: getNotificationIcon(),
    badge: getNotificationBadge(),
    data: {
      url,
      type: "market_listing_v2",
      entityId: listing.listing.listing_id,
      action: "market_item_bid_v2",
      variantId: variantId || undefined,
    },
    tag: `market-bid-v2-${listing.listing.listing_id}`,
    requireInteraction: false,
  }
}

/**
 * Format market offer notification payload for V2 listings
 * Requirement 43.6: Provide formatMarketOfferNotificationPayloadV2 function
 * Requirement 43.7: Include variant details if bid/offer is for specific variant
 */
export function formatMarketOfferNotificationPayloadV2(
  listing: GetListingDetailResponse,
  offerAmount: number,
  variantId?: string,
): PushNotificationPayload {
  // Requirement 43.4: Link to V2 listing detail page when feature flag is V2
  const url = `${getBaseUrl()}/market/${listing.listing.listing_id}`
  
  let body = `A new offer of ${offerAmount} aUEC has been made on "${listing.listing.title}"`
  
  // Requirement 43.7: Include variant details if offer is for specific variant
  if (variantId && listing.items.length > 0) {
    const item = listing.items[0]
    const variant = item.variants.find(v => v.variant_id === variantId)
    
    if (variant) {
      const variantInfo = formatVariantInfo(variant)
      if (variantInfo) {
        body += ` - ${variantInfo}`
      }
    }
  }
  
  return {
    title: "New Offer",
    body,
    icon: getNotificationIcon(),
    badge: getNotificationBadge(),
    data: {
      url,
      type: "market_listing_v2",
      entityId: listing.listing.listing_id,
      action: "market_item_offer_v2",
      variantId: variantId || undefined,
    },
    tag: `market-offer-v2-${listing.listing.listing_id}`,
    requireInteraction: false,
  }
}

/**
 * Format new order notification payload for V2 orders
 * Requirement 43.8: Notify sellers of new orders with variant information
 */
export function formatNewOrderNotificationPayloadV2(
  order: CreateOrderResponse | GetOrderDetailResponse,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/orders/${order.order_id}`
  
  // Build notification body with variant information
  let body = `New order for ${order.total_price} aUEC`
  
  // Add variant information from first item
  if (order.items.length > 0) {
    const firstItem = order.items[0]
    const variantInfo = formatVariantInfo(firstItem.variant)
    
    if (variantInfo) {
      body += ` - ${variantInfo}`
    }
    
    // Add item count if multiple items
    if (order.items.length > 1) {
      body += ` and ${order.items.length - 1} more item${order.items.length > 2 ? 's' : ''}`
    }
  }
  
  return {
    title: "New Order",
    body,
    icon: getNotificationIcon(),
    badge: getNotificationBadge(),
    data: {
      url,
      type: "order_v2",
      entityId: order.order_id,
      action: "order_create_v2",
    },
    tag: `order-v2-${order.order_id}`,
    requireInteraction: false,
  }
}

/**
 * Format order status change notification payload for V2 orders
 * Requirement 43.9: Notify buyers of order status changes
 */
export function formatOrderStatusNotificationPayloadV2(
  order: GetOrderDetailResponse,
  newStatus: string,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/orders/${order.order_id}`
  
  // Map status to user-friendly messages
  const statusMessages: Record<string, { title: string; body: string }> = {
    pending: {
      title: "Order Pending",
      body: "Your order is pending confirmation",
    },
    confirmed: {
      title: "Order Confirmed",
      body: "Your order has been confirmed",
    },
    in_progress: {
      title: "Order In Progress",
      body: "Your order is being prepared",
    },
    ready: {
      title: "Order Ready",
      body: "Your order is ready for pickup",
    },
    completed: {
      title: "Order Completed",
      body: "Your order has been completed",
    },
    cancelled: {
      title: "Order Cancelled",
      body: "Your order has been cancelled",
    },
  }
  
  const message = statusMessages[newStatus] || {
    title: "Order Status Updated",
    body: `Your order status has been updated to ${newStatus}`,
  }
  
  // Add variant information from first item
  let body = message.body
  if (order.items.length > 0) {
    const firstItem = order.items[0]
    const variantInfo = formatVariantInfo(firstItem.variant)
    
    if (variantInfo) {
      body += ` - ${variantInfo}`
    }
  }
  
  return {
    title: message.title,
    body,
    icon: getNotificationIcon(),
    badge: getNotificationBadge(),
    data: {
      url,
      type: "order_v2",
      entityId: order.order_id,
      action: `order_status_${newStatus}_v2`,
    },
    tag: `order-status-v2-${order.order_id}`,
    requireInteraction: false,
  }
}

/**
 * Format buy order match notification payload for V2 buy orders
 * Requirement 43.10: Notify sellers when buy orders match their listings
 */
export function formatBuyOrderMatchNotificationPayloadV2(
  buyOrderId: string,
  listingId: string,
  listingTitle: string,
  variantId: string,
  variant: VariantDetail,
): PushNotificationPayload {
  const url = `${getBaseUrl()}/market/${listingId}`
  
  let body = `Your listing "${listingTitle}" matches a buy order`
  
  // Add variant information
  const variantInfo = formatVariantInfo(variant)
  if (variantInfo) {
    body += ` - ${variantInfo}`
  }
  
  return {
    title: "Buy Order Match",
    body,
    icon: getNotificationIcon(),
    badge: getNotificationBadge(),
    data: {
      url,
      type: "buy_order_match_v2",
      entityId: buyOrderId,
      listingId,
      variantId,
      action: "buy_order_match_v2",
    },
    tag: `buy-order-match-v2-${buyOrderId}-${listingId}`,
    requireInteraction: false,
  }
}
