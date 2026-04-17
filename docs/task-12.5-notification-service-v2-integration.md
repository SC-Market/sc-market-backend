# Task 12.5: Notification Service V2 Integration Guide

## Overview

This document provides guidance on integrating the V2 notification service into V2 controllers. The notification service has been updated to support variant information, quality tiers, and V2-specific notification payloads.

**Requirements:** 43.1-43.10

## New V2 Notification Methods

### 1. `createMarketBidNotificationV2`

Notifies sellers when a bid is placed on their V2 listing.

**Signature:**
```typescript
async createMarketBidNotificationV2(
  listing: GetListingDetailResponse,
  bidAmount: number,
  variantId?: string,
): Promise<void>
```

**Features:**
- Includes variant information in notification text
- Shows quality tier (Bronze, Silver, Gold, Platinum, Diamond)
- Links to V2 listing detail page
- Includes crafted source if available

**Example Usage:**
```typescript
import { notificationService } from "../../../../services/notifications/notification.service.js"

// In your bid creation endpoint
const listing = await listingsV2Service.getListingDetail(listingId)
await notificationService.createMarketBidNotificationV2(
  listing,
  bidAmount,
  variantId // optional - include if bid is for specific variant
)
```

### 2. `createMarketOfferNotificationV2`

Notifies sellers when an offer is made on their V2 listing.

**Signature:**
```typescript
async createMarketOfferNotificationV2(
  listing: GetListingDetailResponse,
  offerAmount: number,
  variantId?: string,
): Promise<void>
```

**Features:**
- Includes variant information in notification text
- Shows quality tier in notification
- Links to V2 listing detail page
- Includes crafted source if available

**Example Usage:**
```typescript
import { notificationService } from "../../../../services/notifications/notification.service.js"

// In your offer creation endpoint
const listing = await listingsV2Service.getListingDetail(listingId)
await notificationService.createMarketOfferNotificationV2(
  listing,
  offerAmount,
  variantId // optional - include if offer is for specific variant
)
```

### 3. `createNewOrderNotificationV2`

Notifies sellers when a new order is created for their V2 listing.

**Signature:**
```typescript
async createNewOrderNotificationV2(
  order: CreateOrderResponse | GetOrderDetailResponse,
  sellerId: string,
): Promise<void>
```

**Features:**
- Includes variant information from order items
- Shows quality tier for first item
- Shows item count if multiple items
- Links to order detail page

**Example Usage:**
```typescript
import { notificationService } from "../../../../services/notifications/notification.service.js"

// In OrdersV2Controller.createOrder
const orderResponse = await ordersV2Service.createOrder(userId, request.items)

// Notify seller of new order
await notificationService.createNewOrderNotificationV2(
  orderResponse,
  orderResponse.seller_id
)
```

### 4. `createOrderStatusNotificationV2`

Notifies buyers when their V2 order status changes.

**Signature:**
```typescript
async createOrderStatusNotificationV2(
  order: GetOrderDetailResponse,
  newStatus: string,
  buyerId: string,
): Promise<void>
```

**Features:**
- Includes variant information from order items
- Shows quality tier for first item
- User-friendly status messages
- Links to order detail page

**Supported Statuses:**
- `pending` - Order Pending
- `confirmed` - Order Confirmed
- `in_progress` - Order In Progress
- `ready` - Order Ready
- `completed` - Order Completed
- `cancelled` - Order Cancelled

**Example Usage:**
```typescript
import { notificationService } from "../../../../services/notifications/notification.service.js"

// In order status update endpoint
const order = await ordersV2Service.getOrderDetail(orderId)
await ordersV2Service.updateOrderStatus(orderId, newStatus)

// Notify buyer of status change
await notificationService.createOrderStatusNotificationV2(
  order,
  newStatus,
  order.buyer.user_id
)
```

## Integration Points

### OrdersV2Controller.createOrder

**Location:** `sc-market-backend/src/api/routes/v2/orders/OrdersV2Controller.ts`

**Current TODO:**
```typescript
// TODO: Requirement 25.11 - Notify seller of new order
// This should be implemented using the existing notification service
```

**Implementation:**
```typescript
// After order creation
const orderResponse = await this.ordersV2Service.createOrder(
  userId,
  request.items
)

// Notify seller of new order (Requirement 25.11)
try {
  await notificationService.createNewOrderNotificationV2(
    orderResponse,
    orderResponse.seller_id
  )
} catch (error) {
  logger.error("Failed to send order notification:", error)
  // Don't fail the order creation if notification fails
}

return orderResponse
```

### CartV2Controller.checkout

**Location:** `sc-market-backend/src/api/routes/v2/cart/CartV2Controller.ts`

**Current TODO:**
```typescript
// TODO: Requirement 32.11 - Notify sellers of new orders
// This should be implemented using the existing notification service
```

**Implementation:**
```typescript
// After successful checkout
const checkoutResult = await this.cartV2Service.checkout(userId)

// Notify sellers of new orders (Requirement 32.11)
for (const order of checkoutResult.orders) {
  try {
    await notificationService.createNewOrderNotificationV2(
      order,
      order.seller_id
    )
  } catch (error) {
    logger.error(`Failed to send order notification for ${order.order_id}:`, error)
    // Don't fail the checkout if notification fails
  }
}

return checkoutResult
```

### BuyOrdersV2Controller.createDirectPurchase

**Location:** `sc-market-backend/src/api/routes/v2/buy-orders/BuyOrdersV2Controller.ts`

**Current TODO:**
```typescript
// TODO: Notify seller of new order
// This should be implemented using the existing notification service
```

**Implementation:**
```typescript
// After order creation from buy order
const orderResponse = await this.buyOrdersV2Service.createDirectPurchase(
  userId,
  request
)

// Notify seller of new order
try {
  await notificationService.createNewOrderNotificationV2(
    orderResponse,
    orderResponse.seller_id
  )
} catch (error) {
  logger.error("Failed to send order notification:", error)
  // Don't fail the order creation if notification fails
}

return orderResponse
```

## Notification Payload Examples

### Market Bid Notification (with variant)

```json
{
  "title": "New Bid",
  "body": "A new bid of 50000 aUEC has been placed on \"Rare Mining Tool\" - (Diamond) Crafted",
  "icon": "https://sc-market.space/android-chrome-192x192.png",
  "badge": "https://sc-market.space/android-chrome-192x192.png",
  "data": {
    "url": "https://sc-market.space/market/listing-123",
    "type": "market_listing_v2",
    "entityId": "listing-123",
    "action": "market_item_bid_v2",
    "variantId": "variant-456"
  },
  "tag": "market-bid-v2-listing-123",
  "requireInteraction": false
}
```

### New Order Notification (with variant)

```json
{
  "title": "New Order",
  "body": "New order for 100000 aUEC - (Diamond) Crafted",
  "icon": "https://sc-market.space/android-chrome-192x192.png",
  "badge": "https://sc-market.space/android-chrome-192x192.png",
  "data": {
    "url": "https://sc-market.space/orders/order-123",
    "type": "order_v2",
    "entityId": "order-123",
    "action": "order_create_v2"
  },
  "tag": "order-v2-order-123",
  "requireInteraction": false
}
```

### Order Status Change Notification

```json
{
  "title": "Order Completed",
  "body": "Your order has been completed - (Diamond) Crafted",
  "icon": "https://sc-market.space/android-chrome-192x192.png",
  "badge": "https://sc-market.space/android-chrome-192x192.png",
  "data": {
    "url": "https://sc-market.space/orders/order-123",
    "type": "order_v2",
    "entityId": "order-123",
    "action": "order_status_completed_v2"
  },
  "tag": "order-status-v2-order-123",
  "requireInteraction": false
}
```

## Quality Tier Display

Quality tiers are displayed with user-friendly names:

| Tier | Display Name |
|------|--------------|
| 1    | Bronze       |
| 2    | Silver       |
| 3    | Gold         |
| 4    | Platinum     |
| 5    | Diamond      |

## Error Handling

All notification methods should be wrapped in try-catch blocks to prevent notification failures from breaking the main operation:

```typescript
try {
  await notificationService.createNewOrderNotificationV2(order, sellerId)
} catch (error) {
  logger.error("Failed to send notification:", error)
  // Continue with the main operation
}
```

## Testing

Unit tests are provided in `notification-payload-formatters-v2.test.ts` covering:
- Bid notifications with and without variants
- Offer notifications with and without variants
- New order notifications with single and multiple items
- Order status change notifications for all statuses
- Buy order match notifications
- Quality tier formatting for all tiers (1-5)

Run tests with:
```bash
npm test -- notification-payload-formatters-v2.test.ts --run
```

## Future Enhancements

The following features could be added in future iterations:

1. **Buy Order Match Notifications**: Notify sellers when their listings match active buy orders
2. **Price Change Notifications**: Notify buyers when items in their cart change price
3. **Stock Availability Notifications**: Notify buyers when out-of-stock items become available
4. **Quality Tier Alerts**: Notify buyers when higher quality tiers become available for watched items

## Related Files

- `sc-market-backend/src/services/notifications/notification-payload-formatters-v2.ts` - V2 payload formatters
- `sc-market-backend/src/services/notifications/notification-payload-formatters-v2.test.ts` - Unit tests
- `sc-market-backend/src/services/notifications/notification.service.ts` - Notification service interface and implementation
- `sc-market-backend/src/api/routes/v2/types/listings.types.ts` - V2 listing types
- `sc-market-backend/src/api/routes/v2/types/orders.types.ts` - V2 order types

## Requirements Coverage

- ✅ 43.1: Update notification service for V2 listings
- ✅ 43.2: Include variant information in notifications
- ✅ 43.3: Show quality tier in notification text
- ✅ 43.4: Link to V2 listing detail page when feature flag is V2
- ✅ 43.5: Provide formatMarketBidNotificationPayloadV2 function
- ✅ 43.6: Provide formatMarketOfferNotificationPayloadV2 function
- ✅ 43.7: Include variant details if bid/offer is for specific variant
- ✅ 43.8: Notify sellers of new orders with variant information
- ✅ 43.9: Notify buyers of order status changes
- ✅ 43.10: Notify sellers when buy orders match their listings (function provided)
