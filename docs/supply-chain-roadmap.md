# Supply Chain & Supplier Tools — Roadmap

## Background

SC Market's current model is fully listing-anchored: buyers browse listings,
sellers post listings, buy orders reference a `game_item_id` but fulfillment
still requires someone to have stock listed. There is no structured way for a
buyer to reach out to a known supplier who may not have stock posted, no
supplier discovery mechanism, and no seller-side tooling for managing
ongoing supply relationships.

This document covers two phases of work to address this.

---

## P0 — Groundwork (Supplier Infrastructure)

### 1. Supplier Roster

**What:** A private, per-user list of SC players or orgs the user regularly
sources from. Not publicly visible. Used to enable targeted buy orders and
power future features (restock rules, supply signals, roster-broadcast orders).

**DB migration** (`62-supplier-roster.sql`):

```sql
CREATE TABLE public.supplier_relationships (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id         UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
    supplier_type    VARCHAR(20) NOT NULL CHECK (supplier_type IN ('user', 'contractor')),
    supplier_id      UUID NOT NULL,   -- user_id or contractor_id depending on type
    nickname         VARCHAR(100),    -- private label, only visible to buyer
    notes            TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'blocked')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (buyer_id, supplier_type, supplier_id)
);

CREATE INDEX idx_supplier_relationships_buyer    ON supplier_relationships(buyer_id);
CREATE INDEX idx_supplier_relationships_supplier ON supplier_relationships(supplier_type, supplier_id);
```

Adding a supplier does NOT notify them — it is a buyer-side organising tool.

**API** (`/api/v2/suppliers`):

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/v2/suppliers`      | List my suppliers (auth required)        |
| POST   | `/api/v2/suppliers`      | Add supplier by username or spectrum_id  |
| PATCH  | `/api/v2/suppliers/:id`  | Update nickname / notes                  |
| DELETE | `/api/v2/suppliers/:id`  | Remove from roster                       |

Response includes: supplier profile (avatar, username, handle), historical
trade count, computed reliability score, last activity timestamp.

**Reliability score:** `fulfilled_requisitions / total_sent_requisitions` where
the denominator only counts requisitions that are closed (fulfilled, cancelled,
or expired). Displayed as N/A until >= 3 closed requisitions exist.

**Frontend (Seller Hub → Suppliers):**
- Table: avatar, name, type badge (user/org), items supplied historically,
  reliability %, last activity, quick "Send order" CTA per row
- Add via search-by-username or org tag
- Per-supplier detail panel: purchase history table, price history chart per item


---

### 2. Targeted Buy Orders

**What:** Extend `market_buy_orders` with a visibility layer. A targeted
buy order is only visible to a named supplier. If declined or expired, the
buyer can choose to broadcast publicly.

**DB migration** (`63-targeted-buy-orders.sql`):

```sql
ALTER TABLE market_buy_orders
    ADD COLUMN target_supplier_id   UUID,
    ADD COLUMN target_supplier_type VARCHAR(20)
                                    CHECK (target_supplier_type IN ('user', 'contractor')),
    ADD COLUMN visibility           VARCHAR(20) NOT NULL DEFAULT 'public'
                                    CHECK (visibility IN ('public', 'targeted', 'roster')),
    ADD COLUMN declined_at          TIMESTAMPTZ,
    ADD COLUMN declined_by          UUID;

-- visibility = 'public'   → current behaviour, appears on buy orders page
-- visibility = 'targeted' → only visible to target_supplier_id / target_supplier_type
-- visibility = 'roster'   → visible to all active suppliers in buyer's roster (P1)

CREATE INDEX idx_buy_orders_target     ON market_buy_orders(target_supplier_id)
    WHERE target_supplier_id IS NOT NULL;
CREATE INDEX idx_buy_orders_visibility ON market_buy_orders(visibility, fulfilled_timestamp)
    WHERE fulfilled_timestamp IS NULL;
```

**Decline flow:** Supplier declines → `declined_at` / `declined_by` set.
Buyer notified with prompt: "NightOwl_SC declined — post publicly?"
Buyer confirms → `visibility` updated to `'public'`.

**API changes:**

- `POST /api/v2/buy-orders` — accept optional `target_supplier_id`,
  `target_supplier_type`, `visibility` fields
- `GET /api/v2/buy-orders/incoming` — new endpoint (auth required). Returns
  targeted buy orders where `target_supplier_id = me AND fulfilled_timestamp IS NULL
  AND declined_at IS NULL`. Paginated.
- `POST /api/v2/buy-orders/:id/decline` — supplier declines
- `POST /api/v2/buy-orders/:id/broadcast` — buyer broadcasts declined order publicly

**Frontend — buyer side:**
On the buy order creation form, add an optional "Direct to supplier" field
(search-within-my-roster autocomplete). When set, `visibility = 'targeted'`.

**Frontend — supplier side (Seller Hub → Incoming Orders):**
New tab. Cards: item, quantity, buyer's price, buyer identity + rating, expiry.
Actions: **Fulfill** (quick path) / **Decline** / **Counter** (opens offer flow).


---

### 3. Supplier Orders (Requisitions)

See `supplier-orders-design.md` for the full design. Summary:

A supplier order reuses the existing `orders` infrastructure with
`kind = 'requisition'`. Items are anchored to `game_item_id` (not a
`listing_id`) via a new `requisition_items` table. The supplier does NOT
need to have stock listed to fulfill.

The negotiation phase goes through the existing `offer_sessions` mechanism,
extended with `offer_requisition_items` alongside the existing
`offer_market_items`.

---

## P1 — Seller Tools

### 4. Restock Rules

Automatic buy order posting when stock falls below a configured threshold.

```sql
CREATE TABLE public.restock_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                UUID NOT NULL REFERENCES accounts(user_id),
    owner_type              VARCHAR(20) NOT NULL CHECK (owner_type IN ('user', 'contractor')),
    game_item_id            UUID NOT NULL REFERENCES game_items(id),
    threshold_qty           INTEGER NOT NULL CHECK (threshold_qty > 0),
    restock_qty             INTEGER NOT NULL CHECK (restock_qty > 0),
    max_price_per_unit      BIGINT NOT NULL,
    preferred_supplier_id   UUID,
    preferred_supplier_type VARCHAR(20),
    visibility              VARCHAR(20) NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public', 'targeted', 'roster')),
    enabled                 BOOLEAN NOT NULL DEFAULT true,
    last_fired_at           TIMESTAMPTZ,
    cooldown_hours          INTEGER NOT NULL DEFAULT 24,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

A DB trigger or polling job watches `quantity_available` on `market_listings`.
When qty falls below `threshold_qty` and the cooldown has passed, a new
`market_buy_order` is created using the rule's visibility and supplier settings.
Buyer is alerted when the rule fires.

---

### 5. Cost Basis / Margin Tracking

```sql
CREATE TABLE public.stock_lot_purchases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id          UUID NOT NULL REFERENCES stock_lots(lot_id) ON DELETE CASCADE,
    source_type     VARCHAR(20) NOT NULL
                    CHECK (source_type IN ('buy_order', 'requisition', 'manual', 'crafted')),
    source_id       UUID,
    quantity        INTEGER NOT NULL,
    price_per_unit  BIGINT NOT NULL,
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes           TEXT
);
```

Blended cost is a weighted average of `price_per_unit * quantity` across all
lots for a `game_item_id` per seller. Shown in Seller Hub as margin % against
current listing price.

When a requisition is fulfilled, `agreed_price` from `requisition_items` is
auto-written into `stock_lot_purchases` (`source_type='requisition'`).

---

### 6. Production Pipeline (UI)

A composed dashboard view in Seller Hub across crafting jobs, refinery queue,
stock lots, and listings. No new tables — query-only.

---

### 7. Seller Availability Status

Extend `user_presence_tracking` (migration 58):

```sql
ALTER TABLE user_presence_tracking
    ADD COLUMN availability_status  VARCHAR(20) DEFAULT 'offline'
                                    CHECK (availability_status IN
                                        ('mining', 'active', 'back_soon', 'offline')),
    ADD COLUMN delivery_eta_minutes INTEGER;
```

Shown on active listings and in supplier roster cards.

---

### 8. Batch Price Update

Frontend only. Checkbox selection on My Listings table in Seller Hub.
Batch toolbar: set absolute price, apply % or fixed delta, toggle
active/inactive. Uses existing `updateListing` RTK mutation in a Promise.all.

---

### 9. Supply Signals

```sql
CREATE TABLE public.supply_signals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id           UUID NOT NULL REFERENCES accounts(user_id),
    seller_type         VARCHAR(20) NOT NULL CHECK (seller_type IN ('user', 'contractor')),
    game_item_id        UUID NOT NULL REFERENCES game_items(id),
    typical_qty_min     INTEGER NOT NULL,
    typical_qty_max     INTEGER NOT NULL,
    price_min           BIGINT NOT NULL,
    price_max           BIGINT NOT NULL,
    delivery_locations  TEXT[],
    notes               VARCHAR(500),
    active              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supply_signals_item ON supply_signals(game_item_id) WHERE active = true;
```

Public declaration that a seller regularly supplies an item. Not a listing —
no stock required. Appears in buy order search results as "potential suppliers"
below active listings. Buyers can message or post a targeted buy order directly.

---

## UX — Seller Hub Separation

All supply chain and seller tools live in a dedicated **Seller Hub** section
(`/seller`), separate from the buyer-facing market sidebar. The main market
navigation (Browse, Buy Orders, Cart) is untouched.

Seller Hub is hidden until the user has at least one active listing, then
appears automatically in the top navbar. P1 tools (restock rules, margin
tracker, pipeline, supply signals) are grouped under "Advanced" in the Seller
Hub sidebar and collapsed by default — one settings toggle reveals them.

Three top-level zones:

| Zone | URL | Audience |
|------|-----|----------|
| Market | `/market`, `/buyorders` | Buyers |
| Seller Hub | `/seller` | Sellers |
| Org Admin | `/org/:id` | Org managers |

---

## Implementation Order

| Week | Work |
|------|------|
| 1–2  | Supplier roster: DB + API + frontend list/add/remove |
| 3    | Targeted buy orders: DB extension + API + buyer form update |
| 4    | Incoming Orders inbox: Seller Hub tab + fulfill/decline/counter |
| 5    | Requisition orders: DB + offer flow extension + order creation |
| 6    | Seller Hub shell: route + sidebar + availability status toggle |
| 7    | Batch price update (frontend) + supply signals |
| 8    | Cost basis tracking: DB + auto-record on requisition fulfillment |
| 9–10 | Restock rules: DB + trigger/job + frontend config |
| 11+  | Production pipeline view |
