# V2 Auction & Bidding — Feature Parity Plan

## V1 Behavior Summary

- Seller creates listing with `sale_type: 'auction'`, sets starting price, `end_time`, `minimum_bid_increment`
- Buyers place bids; each new bid replaces the user's previous bid (one active bid per user per auction)
- 5-minute timer polls for expired auctions
- Winner gets an auto-created offer (Delivery kind, cost = winning bid)
- Listing status → `archived`, auction status → `concluded`
- Notifications: in-app, push, Discord webhooks, email
- `buyout_price` column exists but is unused
- No anti-sniping (fixed end time)
- Single quantity only

## V2 Tables Needed

### `auction_details_v2`

Extends a V2 listing with auction-specific configuration.

```sql
CREATE TABLE auction_details_v2 (
  listing_id    UUID PRIMARY KEY REFERENCES listings(listing_id) ON DELETE CASCADE,
  end_time      TIMESTAMPTZ NOT NULL,
  min_bid_increment BIGINT NOT NULL DEFAULT 1000 CHECK (min_bid_increment >= 1),
  buyout_price  BIGINT,                    -- optional instant-buy price
  reserve_price BIGINT,                    -- optional minimum price to sell
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'concluded', 'cancelled', 'no_bids')),
  winner_id     UUID,                      -- set when auction concludes
  winning_bid   BIGINT,                    -- set when auction concludes
  concluded_at  TIMESTAMPTZ,               -- when the auction actually ended
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_details_v2_end_time ON auction_details_v2(end_time) WHERE status = 'active';
CREATE INDEX idx_auction_details_v2_status ON auction_details_v2(status);
```

**Changes from V1:**
- `reserve_price` — new, optional minimum to actually sell (V1 had no reserve)
- `winner_id` / `winning_bid` / `concluded_at` — denormalized for fast lookups (V1 derived these at conclusion time)
- `no_bids` status — explicit state for auctions that ended without bids (V1 just archived)
- `TIMESTAMPTZ` instead of `TIMESTAMP` — timezone-aware

### `bids_v2`

```sql
CREATE TABLE bids_v2 (
  bid_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  bidder_id     UUID NOT NULL,             -- accounts.user_id (always a user, even if bidding for org)
  bidder_type   VARCHAR(20) NOT NULL DEFAULT 'user'
                CHECK (bidder_type IN ('user', 'contractor')),
  contractor_id UUID,                      -- if bidding on behalf of an org
  amount        BIGINT NOT NULL CHECK (amount > 0),
  is_active     BOOLEAN NOT NULL DEFAULT true,  -- false = superseded by newer bid
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bids_v2_listing ON bids_v2(listing_id) WHERE is_active = true;
CREATE INDEX idx_bids_v2_bidder ON bids_v2(bidder_id);
CREATE UNIQUE INDEX idx_bids_v2_one_active_per_user ON bids_v2(listing_id, bidder_id) WHERE is_active = true;
```

**Changes from V1:**
- `is_active` flag instead of deleting old bids — preserves bid history
- `bidder_type` + `contractor_id` — cleaner than V1's separate `user_bidder_id`/`contractor_bidder_id` columns
- Unique partial index enforces one active bid per user per auction (V1 did this by deleting)
- `amount` instead of `bid` — clearer naming

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v2/listings` | Create auction (existing, add auction_details) |
| GET | `/api/v2/listings/:id/bids` | Get active bids for listing |
| POST | `/api/v2/listings/:id/bids` | Place bid |
| DELETE | `/api/v2/listings/:id/bids` | Withdraw bid (new — V1 didn't support this) |

### Create Auction

Extend the existing `POST /api/v2/listings` endpoint. When `sale_type: 'auction'`:
- Require `auction_details: { end_time, min_bid_increment, buyout_price?, reserve_price? }`
- Validate `end_time` is in the future
- Create `auction_details_v2` row alongside the listing

### Place Bid

`POST /api/v2/listings/:id/bids`

```typescript
Request:  { amount: number }
Response: { bid_id, amount, is_highest: boolean, current_highest: number }
```

Validation:
- Listing must be `sale_type: 'auction'` and `status: 'active'`
- Auction must not be expired (`end_time > now()`)
- `amount >= current_highest + min_bid_increment` (or `amount >= base_price + min_bid_increment` if no bids)
- Bidder is not the seller
- If bidder has an existing active bid, mark it `is_active = false` before inserting new one

### Get Bids

`GET /api/v2/listings/:id/bids`

Returns active bids sorted by amount descending. Include bidder minimal profile.

## Auction Processing (Timer)

Reuse the existing 5-minute polling pattern from V1 `process_auctions`:

1. Query `auction_details_v2 WHERE status = 'active' AND end_time <= now()`
2. For each expired auction:
   - Get highest active bid
   - If bids exist and amount >= reserve_price (or no reserve):
     - Set `status = 'concluded'`, `winner_id`, `winning_bid`, `concluded_at`
     - Create offer via `createOffer()` with V2 variant items
     - Set listing `status = 'sold'`
   - If no bids or reserve not met:
     - Set `status = 'no_bids'` or `'cancelled'`
     - Set listing `status = 'expired'`
3. Send notifications to winner and seller

## Notifications

Reuse existing notification infrastructure:
- `createMarketBidNotificationV2(listing, bid)` — notify seller of new bid
- `createAuctionWonNotificationV2(listing, winner)` — notify winner
- `createAuctionEndedNotificationV2(listing)` — notify seller of conclusion
- Discord webhooks: extend `sendBidWebhooks` to handle V2 listings
- Push notifications: same pattern as V1

## Migration of V1 Auction Data

### Active Auctions (status = 'active')

These need careful handling:
1. Migrate listing to V2 (already handled by listing migration)
2. Create `auction_details_v2` row from `market_auction_details`
3. Migrate active bids from `market_bids` to `bids_v2` (all as `is_active = true` since V1 deletes old bids)
4. The V1 timer continues processing V1 auctions until cutover

### Concluded Auctions (status = 'concluded')

Historical data only:
1. Create `auction_details_v2` with `status = 'concluded'`
2. Migrate bids as `is_active = false` (historical record)
3. Set `winner_id` and `winning_bid` from the highest bid

## Frontend Changes

### Listing View (`MarketListingView` / `ListingDetailV2`)
- Show auction end time countdown
- Show current highest bid
- Bid input with validation (>= current + increment)
- "Place Bid" button
- Bid history table

### Listing Card (`ListingCardV2`)
- Show auction badge
- Show current price (highest bid or starting price)
- Show time remaining

### Create Listing Form (`CreateListingV2`)
- When `sale_type = 'auction'`: show end_time picker, min_bid_increment input, optional reserve_price, optional buyout_price

### Notifications
- New bid notification component (similar to V1 `NotificationBid.tsx`)
- Auction won notification component

## Implementation Order

1. **Migration**: Add `auction_details_v2` and `bids_v2` tables
2. **Migration service**: Add auction data migration (details + bids)
3. **Backend**: Bid placement endpoint with validation
4. **Backend**: Auction processing timer (V2 version)
5. **Backend**: Extend listing creation to handle auction details
6. **Frontend**: Bid UI on listing detail page
7. **Frontend**: Auction fields in create listing form
8. **Frontend**: Bid notifications
9. **Price history**: Record auction sale prices in `price_history_v2`

## Future Improvements (Not in V1, optional for V2)

- **Anti-sniping**: Extend `end_time` by N minutes if a bid is placed in the last M minutes
- **Buyout**: Implement instant-buy at `buyout_price` (column exists in V1 but unused)
- **Reserve price**: Don't sell if highest bid < reserve (new feature)
- **Multi-quantity auctions**: Support auctioning multiple units (V1 is single-quantity only)
- **Real-time bid updates**: WebSocket push for live bid tracking
