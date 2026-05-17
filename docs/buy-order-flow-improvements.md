# Buy Order Flow Improvements

## Current State

The V2 buy order system has:
- **Browse** (`BuyOrdersViewV2`) — grid of game items with active buy orders
- **Create** (`CreateBuyOrderPageV2`) — two-step: search item → fill form
- **Backend** (`BuyOrdersV2Controller`) — create standing orders, fulfill, cancel

## Problems

1. **Disconnected from browsing context** — Users see a listing, decide they want to create a buy order for that item, but must navigate away to `/buyorders/create` and re-search the item from scratch.

2. **No price intelligence** — The create form doesn't show what sellers are currently listing the item for, or what existing buy orders offer. Users set prices blind.

3. **Form is too flat** — Quality filters, negotiable toggle, and min/max price are all shown upfront. Most users just want: item, price, quantity.

4. **No "quick buy order" shortcut** — From a listing detail page or the aggregate view, there's no single-click path to create a buy order for that item.

5. **No notification when matched** — If a seller lists an item matching a buy order's criteria, neither party is proactively notified.

6. **Fulfillment is manual** — Sellers must browse buy orders, find matching ones, and manually fulfill. No auto-matching.

## Proposed Improvements

### Phase 1: Contextual Buy Orders (Frontend)

**1.1 — "Place Buy Order" button on listing detail and aggregate pages**

Add a button/link on `ListingDetailV2` and `GameItemListingsV2` that pre-fills the buy order form with the current game item. Opens inline as a dialog or navigates with query params (`?game_item_id=xxx&item_name=yyy`).

**1.2 — Price guidance in the create form**

When a game item is selected, show:
- Current lowest listing price for that item
- Average listing price
- Existing buy order price range (highest and average)
- A "competitive price" suggestion (e.g., 90% of lowest listing)

Use the existing `GET /game-items/{id}/listings` endpoint and a new `GET /buy-orders/stats?game_item_id=xxx` endpoint.

**1.3 — Simplified form with advanced collapse**

Same pattern as CreateListingV2:
- Always visible: Item (pre-filled when contextual), Price, Quantity
- Collapsed: Quality filters, negotiable toggle, expiry date, notes

**1.4 — Pre-fill from URL params**

`/buyorders/create?game_item_id=xxx&name=yyy&type=zzz` auto-selects the item and skips the search step.

### Phase 2: Smart Matching (Backend)

**2.1 — Buy order matching engine**

When a new listing is created (or price/quantity updated), check if it matches any active buy orders:
- Same `game_item_id`
- Listing price ≤ buy order `price_per_unit`
- Quality within buy order's quality range (if specified)
- Quantity available ≥ 1

**2.2 — Match notifications**

When a match is found:
- Notify the buy order creator: "A listing matching your buy order is now available"
- Notify the seller: "Your listing matches X active buy orders"
- Both via in-app notification and optional Discord/email

**2.3 — New endpoint: `GET /buy-orders/stats`**

Returns aggregate stats for a game item's buy orders:
```json
{
  "game_item_id": "uuid",
  "active_count": 12,
  "total_quantity_wanted": 450,
  "price_min": 5000,
  "price_max": 15000,
  "price_avg": 9200
}
```

### Phase 3: Auto-Fulfillment (Backend + Frontend)

**3.1 — Optional auto-fulfill**

Buy orders can opt into auto-fulfillment: when a matching listing appears, automatically place a purchase if:
- Price is within the buy order's range
- Quality matches
- Buyer has sufficient wallet balance (if wallet feature exists) or pre-authorized

**3.2 — Partial fulfillment**

Allow buy orders to be partially fulfilled. If a buy order wants 100 units and a listing has 20, fulfill 20 and keep the buy order active for the remaining 80.

**3.3 — Expiry and renewal**

Buy orders should have an optional expiry date. Expired orders auto-cancel. Users can set "auto-renew" to extend by 7/14/30 days.

### Phase 4: Buy Order Discovery (Frontend)

**4.1 — "Buy Orders" tab on game item page**

On `GameItemListingsV2`, add a tab showing all active buy orders for that item. Sellers see demand at a glance.

**4.2 — Seller dashboard: "Matching Buy Orders"**

On the seller's stock management page, show a section: "X buy orders match your inventory" with a link to fulfill them.

**4.3 — Buy order badges on listing cards**

In the listing search grid, show a small badge on items that have active buy orders (demand indicator).

## Implementation Order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | 1.1 — Contextual "Place Buy Order" button | S | High — removes biggest friction |
| P0 | 1.4 — Pre-fill from URL params | XS | High — enables 1.1 |
| P1 | 1.3 — Simplified form with collapse | S | Medium — reduces cognitive load |
| P1 | 1.2 — Price guidance | M | High — informed pricing |
| P2 | 2.3 — Buy order stats endpoint | S | Enables 1.2 and 4.1 |
| P2 | 2.1 — Match engine | M | High — core value prop |
| P2 | 2.2 — Match notifications | M | High — drives engagement |
| P3 | 4.1 — Buy orders tab on item page | S | Medium — seller discovery |
| P3 | 3.1 — Auto-fulfill | L | Medium — power user feature |
| P3 | 3.2 — Partial fulfillment | M | Medium — commodity trading |
| P4 | 3.3 — Expiry and renewal | S | Low — housekeeping |
| P4 | 4.2 — Seller matching dashboard | M | Medium |
| P4 | 4.3 — Demand badges | S | Low — nice to have |
