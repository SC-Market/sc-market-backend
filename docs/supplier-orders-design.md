# Supplier Orders — Design

## The Core Question

How should a supplier order differ from a normal market order?

**Normal market order:** buyer finds a listing → adds to cart → places order.
The order is anchored to a specific `listing_id`. The seller must have stock
posted before anything can happen.

**Supplier order (requisition):** buyer wants an item from a known supplier
who may not have it listed yet. The order is anchored to a `game_item_id +
quantity`. No listing required. The supplier accepts, agrees on price, and
delivers.

This mirrors a purchase order in a traditional supply chain: you specify what
is needed, not which shelf it comes from. The supplier determines fulfilment.

---

## How the Existing Model Works

```
market_buy_orders   →  game_item_id           (item-anchored, passive demand signal)
market_orders       →  listing_id             (listing-anchored, confirmed purchase)
offer_market_items  →  listing_id             (offer items, also listing-anchored)
offer_sessions      →  bilateral negotiation wrapper with thread
orders              →  kind, cost, status, customer_id, contractor_id, thread_id
```

The `orders` table already has a `kind` field and a `thread_id`. It supports
services, contracts, and market orders through the same status lifecycle.
This is the right extension point — a requisition is a new `kind`, not a
separate system.

---

## Proposed Data Model

### New order kind: `'requisition'`

An `orders` row with `kind = 'requisition'`. Instead of `market_orders`
(listing-anchored line items), its items live in a new `requisition_items`
table.

**Migration: `64-requisition-orders.sql`**

```sql
CREATE TABLE public.requisition_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    game_item_id    UUID NOT NULL REFERENCES game_items(id),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    agreed_price    BIGINT NOT NULL,    -- price per unit locked at order creation
    fulfilled_qty   INTEGER NOT NULL DEFAULT 0 CHECK (fulfilled_qty >= 0),
    notes           VARCHAR(500)        -- e.g. "Tier 3+, deliver to Lorville"
);

CREATE INDEX idx_requisition_items_order ON requisition_items(order_id);
CREATE INDEX idx_requisition_items_item  ON requisition_items(game_item_id);

-- Extend the offer side for negotiation-phase items:
CREATE TABLE public.offer_requisition_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id        UUID NOT NULL REFERENCES order_offers(id) ON DELETE CASCADE,
    game_item_id    UUID NOT NULL REFERENCES game_items(id),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    max_price       BIGINT              -- buyer's ceiling; NULL = fully negotiable
);

CREATE INDEX idx_offer_req_items_offer ON offer_requisition_items(offer_id);
```

No changes to the `orders` table itself. `kind = 'requisition'` slots in
alongside `'market'`, `'service'`, `'hauling'`, etc.

---

## Market Order vs Requisition — Comparison

| Aspect | Market Order | Requisition |
|--------|-------------|-------------|
| Trigger | Buyer picks listing → cart | Buyer targets supplier → send requisition |
| Items anchored to | `listing_id` (specific listing) | `game_item_id` (item type only) |
| Seller must have stock listed? | Yes | No |
| Price set by | Listing price at checkout | Negotiation; locked at order creation |
| Negotiation | Optional (offer flow) | Always present — supplier proposes price |
| `orders.kind` | `'market'` | `'requisition'` |
| Item junction table | `market_orders` | `requisition_items` |
| Offer item table | `offer_market_items` | `offer_requisition_items` |
| Thread / chat | `orders.thread_id` | Same |
| Delivery tracking | `order_deliveries` | Same |
| Review | `order_reviews` | Same |
| Payment | `orders.cost` + transactions | Same |
| Status lifecycle | `not-started → in-progress → fulfilled` | Same |

Everything shared with market orders (thread, delivery, review, payment,
status updates, notifications) is inherited. Only line-item storage differs.

---

## The Two UX Flows

### Flow A — Quick Requisition (targeted buy order → direct accept)

Used when the buyer sets a price in their buy order and the supplier accepts
as-is. No negotiation required.

```
1. Buyer creates targeted buy order
   → market_buy_orders row:
       visibility        = 'targeted'
       target_supplier_id = supplier's user_id or contractor_id

2. Supplier sees it in Seller Hub → Incoming Orders
   → clicks "Fulfill"

3. System creates:
   → orders row
       kind        = 'requisition'
       customer_id = buyer
       assigned_id = supplier
       cost        = price * quantity  (from buy order)
       status      = 'not-started'
   → requisition_items rows
       game_item_id  = from buy order
       quantity      = from buy order
       agreed_price  = buy order price
   → thread created; both parties added
   → market_buy_orders.fulfilled_timestamp set

4. Supplier delivers in-game, marks "Delivered" in UI
   → order status → 'fulfilled'
   → stock_lot_purchases auto-recorded on buyer side (P1, cost basis)
   → review prompt for both
```

### Flow B — Negotiated Requisition (offer session)

Used when buyer and supplier need to discuss price, partial quantities, or
delivery terms. Mirrors the existing offer session flow with item-anchored items.

```
1. Buyer clicks "Send Order" in Supplier Hub
   (or "Counter" on an incoming buy order)
   → offer_sessions row created   kind = 'requisition'
   → offer_requisition_items rows added
       (game_item_id, quantity, max_price per item)
   → notification to supplier

2. Supplier responds:
   → Accept as-is, OR
   → Counter: new order_offers row with updated cost
              + new offer_requisition_items (different price/qty)

3. Buyer accepts
   → orders row + requisition_items created from agreed offer terms
   → offer_session.status = 'accepted'
   → thread continues as order thread

4. Supplier delivers → same as Flow A step 4
```

---

## Partial Fulfillment

`requisition_items.fulfilled_qty` tracks delivery progress independently of
`quantity`. When a partial delivery is logged:

- `fulfilled_qty` is updated on the `requisition_items` row
- An `order_deliveries` entry is created
- Order status stays `in-progress` until `fulfilled_qty = quantity` on all items
- An `order_status_update` row records the partial delivery

Partial fulfillment is out of scope for P0 — initial implementation assumes a
single delivery. The column is included from the start to avoid a later
migration.

---

## What Does NOT Change

- The public buy orders page (`/buyorders`) only shows `visibility = 'public'`
  buy orders. Targeted buy orders do not appear there.
- The aggregate page (`/market/aggregate/:id`) shows public buy orders as today.
- The cart / checkout flow for normal market orders is untouched.
- The existing `offer_sessions` + `offer_market_items` flow for listing-based
  offers is unchanged. Both item tables can coexist on the same offer if ever
  needed (e.g. an offer that mixes a listed item with a requisition item).

---

## API Surface

### New endpoints

```
POST  /api/v2/requisitions
      Body: { supplier_id, supplier_type,
              items: [{ game_item_id, quantity, max_price }],
              notes }
      → Creates offer_session (kind='requisition') + offer_requisition_items
        Starts Flow B

GET   /api/v2/requisitions
      My requisition orders (as buyer) + status + items. Paginated.

GET   /api/v2/requisitions/:order_id
      Order detail: items, status, thread_id, partial fulfillments

POST  /api/v2/requisitions/:order_id/deliver
      Supplier records a delivery (fulfilled_qty per item)
      Updates fulfilled_qty, creates order_deliveries entry

POST  /api/v2/buy-orders/:id/fulfill
      Supplier accepts targeted buy order directly → Flow A
      Creates requisition order from buy order data
```

### Modified endpoints

```
POST  /api/v2/buy-orders
      + target_supplier_id, target_supplier_type, visibility

GET   /api/v2/buy-orders           (existing — only public, visibility='public')
GET   /api/v2/buy-orders/incoming  (new — supplier inbox, targeted to me)

POST  /api/v2/offer-sessions
      + support for kind='requisition'
      + offer_requisition_items[] in body alongside or instead of offer_market_items[]
```

---

## Notifications

| Event | Recipient |
|-------|-----------|
| Targeted buy order sent | Supplier |
| Supplier accepts / declines | Buyer |
| Counter-offer sent | Other party |
| Requisition order created (agreement) | Both |
| Partial delivery logged | Buyer |
| Order fulfilled | Buyer |
| Review prompt | Both (post-fulfillment) |

Uses existing notification infrastructure. New event types are added to the
notification actions table; no architectural changes.

---

## Open Questions (deferred)

1. **Dispute / cancellation policy.** If a supplier accepts but fails to
   deliver, what is the resolution? The `orders` system has no built-in
   dispute mechanism for any kind. Platform-level question out of scope here.

2. **Multi-supplier requisitions.** Not in P0. Each requisition is one buyer
   to one supplier. Buyers who want to split across suppliers create multiple
   requisitions.

3. **Requisition-to-listing convenience.** When a supplier accepts, should
   the UI offer to pre-fill a listing form? Nice-to-have, not required —
   the supplier can fulfill without ever creating a public listing.

4. **Cost basis auto-record.** When a requisition is fulfilled, `agreed_price`
   from `requisition_items` should be written into `stock_lot_purchases` on
   the buyer's side. Planned for P1. The FK relationship
   (`source_type='requisition'`, `source_id=order_id`) is in the schema now.
