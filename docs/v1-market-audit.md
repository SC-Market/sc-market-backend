# V1 market audit (2026-10-24)

Audit only: nothing here has been removed. Companion to commit
`chore(flags): retire market_v2 in the backend` on `chore/retire-market-v2-flag`.

Sources searched (all read-only):
- backend `src/` and `scripts/` (this branch, rebased on `f33813f2e`)
- frontend `/Users/willemhs/personal/scmarket/frontend/src`. App-code usage was
  resolved per import (which module a hook is imported *from*), because the
  generated V2 client reuses many of the same hook names (`useGetMyListingsQuery`,
  `useCancelBuyOrderMutation`, `useGetLocationsQuery`, ...). A grep on the hook
  name alone over-reports.
- Discord bot: the bot's repo isn't local. What's covered here is only the
  backend side: the `discord_app` routers in `src/clients/discord_api/*`
  (`/register`, `/threads`, `/alert-subscriptions`), which run on the separate
  bot-facing Express app in `src/server.ts`.

## How V1 market is exposed

- `marketRouter` (`src/api/routes/v1/market/routes.ts`) is mounted **twice**:
  `/api/market/*` (`api-router.ts:37`) and `/api/v1/market/*`
  (`api-v1-router.ts`). The stock-lot router is mounted inside it, plus
  `allocationRouter` under `/api/orders/*` and `contractorAllocationsRouter`
  under `/api/contractors/*`.
- **Public API.** `populateUser` (`src/api/middleware/populate-user.ts`) accepts
  `Authorization: Bearer scm_...` on every request, so **every V1 route can be
  reached with an API token**. Write routes check `market:write` / `market:read`
  scopes (`requireScopes`, `src/api/middleware/auth.ts:181`). Tokens with
  `full`, `readonly` (for reads) or `admin` also pass. The public GETs need no
  auth at all.
- **Documented.** 22 of the market routes have `oapi.validPath` specs
  (`v1/market/openapi.ts`) and are published at `/api/v1/openapi.json`, at
  `/api/v1/docs`, and in the "V1 API" tab of the public Scalar docs at `/docs`
  (`server.ts`). `docs/TOKEN_AUTH_USAGE_EXAMPLES.md:181` uses
  `GET /api/market/mine` as *the* API-token example. The stock-lot and
  allocation routes, plus multiple/*, buyorder/*, aggregate/{history,update,:id},
  export, categories/category, items/*, have no spec, so they are undocumented.
- **No per-route access logs in the app.** Nothing logs method+path for
  successful requests (only errors/Bugsnag and rate-limit hits), so traffic
  checks have to use the reverse proxy / CDN access logs. See the prod checks
  below.

Classification key:
- **LIVE**: a reachable first-party caller exists (named).
- **INTERNAL-ONLY**: the only callers are frontend code on an orphaned route,
  or hooks that are exported but never called. Dead once that frontend code is
  deleted.
- **DEAD**: no first-party caller at all.
- **+EXT**: also reachable or advertised to API-token users (documented in the
  public V1 OpenAPI), so it's **UNKNOWN EXTERNAL** until the proxy logs show no
  traffic.

## Route table

FE = frontend. "hook only" = defined/exported in the FE client but never used
by app code. Hook files: `features/market/api/marketApi.ts` (M),
`store/api/stockLotsApi.ts` (S), `store/api/stock-lots.ts` (S2: a separate
`createApi` whose hooks are imported nowhere, so the whole file is dead).

Orphaned FE route: `/org/:contractor_id/listings` → `pages/market/ManageStock`
(the V1 `ItemStock` / `MyItemStock` / `ManageStockArea` / `ItemStockToolbar` /
`useStockManagement` / `MarketSearchArea` / `SelectGameItem*` chain). It is
still registered in `App.tsx` (~line 1021) but nothing links to it.
`ManageListingsTabBar` navigates to `/shop/:slug/*` or `/market/manage*`, which
are V2 pages.

| # | Method + path (`/api/market` ≡ `/api/v1/market`) | Auth | FE caller | Other callers | Class |
|---|---|---|---|---|---|
| 1 | GET `/stats` | public | M `getMarketStats` → `components/landing/OrderStatistics.tsx` on `LandingPage` | reads `orders` only (`orderDb.getOrderStats`), not V1 tables | **LIVE** +EXT |
| 2 | POST `/listings/stats` | user | M `getStatsForListings`, hook only | n/a | INTERNAL-ONLY +EXT |
| 3 | POST `/listings/batch-update` | market:write | M → `ItemStockToolbar` (orphan route) | n/a | INTERNAL-ONLY +EXT |
| 4 | POST `/listings/batch-update-quantity` | market:write | M → `ManageStockArea` (orphan route) | n/a | INTERNAL-ONLY +EXT |
| 5 | PUT `/listing/:id` | market:write | M → `useStockManagement` (orphan route); `MarketActions.tsx` imports it but never calls it | n/a | INTERNAL-ONLY +EXT |
| 6 | POST `/listing/:id/update_quantity` | market:write | M → `useStockManagement` (orphan) | n/a | INTERNAL-ONLY +EXT |
| 7 | POST `/listing/:id/refresh` | market:write | M → `useStockManagement` (orphan) | n/a | INTERNAL-ONLY +EXT |
| 8 | GET `/listings/:id` | public | M `getMarketListing` → `features/notifications/types/NotificationBid.tsx` (V1 bid notifications); `OrderAllocationView` is never rendered; `SplitAllocationView` imports it but never calls it | n/a | **LIVE** (legacy bid notifications) +EXT |
| 9 | GET `/listing/:id/orders` | manager | M hook only | n/a | INTERNAL-ONLY +EXT |
| 10 | POST `/purchase` | market:write | M hook only | n/a | INTERNAL-ONLY +EXT |
| 11 | POST `/listings/:id/bids` | market:write | M hook only | n/a | INTERNAL-ONLY +EXT |
| 12 | POST `/listings` | market:write | M `createMarketListing` → `useStockManagement` (orphan); `createAggregateListing` hook only | n/a | INTERNAL-ONLY +EXT |
| 13 | POST `/listing/:id/photos` | market:write | M hook only | n/a | INTERNAL-ONLY +EXT |
| 14 | POST `/listings/:id/views` | public | M hook only (two duplicate hooks) | n/a | INTERNAL-ONLY +EXT |
| 15 | GET `/mine` | market:read | M → `MyItemStock` (orphan) | **API-token doc example** | INTERNAL-ONLY, **UNKNOWN EXTERNAL** |
| 16 | GET `/listings` | public | M lazy hook → `MarketSearchArea` (orphan); `SelectMarketListing.tsx` is never rendered | reads `market_search_materialized` | INTERNAL-ONLY +EXT |
| 17 | GET `/user/:username` | public | M `getUserListings` hook only | n/a | INTERNAL-ONLY +EXT |
| 18 | GET `/contractor/:spectrum_id` | public | none | n/a | DEAD +EXT |
| 19 | GET `/aggregates/buyorders` | public | M → `BuyOrdersViewPaginated` on **`/orders`** (`pages/contracting/CreateOrder.tsx:24`) | reads `market_buy_orders` | **LIVE** +EXT |
| 20 | GET `/aggregate/:id/chart` | public | M hook only | reads `market_price_history` | INTERNAL-ONLY +EXT |
| 21 | GET `/aggregate/:id/history` | public | M hook only | n/a | INTERNAL-ONLY |
| 22 | POST `/aggregate/:id/update` | admin | M hook only | n/a | INTERNAL-ONLY |
| 23 | GET `/aggregate/:id` | public | M `getAggregateById` hook only | n/a | INTERNAL-ONLY |
| 24 | GET `/multiple/:id` | public | M hook only | n/a | INTERNAL-ONLY |
| 25 | POST `/multiple/contractor/:sid/create` | market:write + org perm | none | n/a | DEAD |
| 26 | POST `/multiple/create` | market:write | M hook only | n/a | INTERNAL-ONLY |
| 27 | POST `/multiple/:id/update` | market:write | M hook only | n/a | INTERNAL-ONLY |
| 28 | POST `/buyorder/create` | market:write | M hook only | n/a | INTERNAL-ONLY |
| 29 | POST `/buyorder/:id/fulfill` | market:write | M hook only (the V2 views use the V2 hook of the same name) | n/a | INTERNAL-ONLY |
| 30 | POST `/buyorder/:id/cancel` | market:write | M → `BuyOrderRow` in `DashBuyOrdersArea.tsx` (rendered by #19's view on `/orders`) | writes `market_buy_orders.expiry` | **LIVE** |
| 31 | GET `/export` | market:read | none | n/a | DEAD; token-scoped, so UNKNOWN EXTERNAL |
| 32 | GET `/categories` | public | M → `useGameItemData` → `SelectGameItem*` (orphan chain only) | n/a | INTERNAL-ONLY |
| 33 | GET `/category/:category` | public | same as #32 | n/a | INTERNAL-ONLY |
| 34 | GET `/items/search` | public | M `useLazySearchGameItemsQuery`, hook only (V2 has its own) | n/a | INTERNAL-ONLY |
| 35 | GET `/items/:game_item_id/aggregate` | public | M hook only | n/a | INTERNAL-ONLY |
| 36 | GET `/item/:name` | public | M → `useStockManagement` (orphan) | n/a | INTERNAL-ONLY +EXT |
| 37 | GET `/seller/analytics` | market:read | none (`/api/v2/analytics/*` replaced it) | n/a | DEAD +EXT |
| 38 | GET `/lots` | market:read | S `searchLots`, hook only | n/a | INTERNAL-ONLY |
| 39 | PUT `/listings/:id/stock` | market:write | S2 only (dead file) | n/a | DEAD |
| 40 | GET `/listings/:id/lots` | market:read | S → `SplitAllocationView` in **`pages/contracting/ViewOrder.tsx:361`** (allocation tab) | reads V1 `stock_lots`, falls back to V2 `listing_item_lots` | **LIVE** |
| 41 | POST `/listings/:id/lots` | market:write | S → `CreateLotDialog` (only in `StockManager`, which is never rendered) | n/a | INTERNAL-ONLY |
| 42 | PATCH `/lots/:id` | market:write | S → `LotListItem` (never rendered) | n/a | INTERNAL-ONLY |
| 43 | DELETE `/lots/:id` | market:write | same as #42 | n/a | INTERNAL-ONLY |
| 44 | POST `/lots/:id/transfer` | market:write | S → `TransferLotDialog` (never rendered) | n/a | INTERNAL-ONLY |
| 45 | GET `/locations` | market:read | S → `LocationSelector` in **`pages/inventory/InventoryPage.tsx:359`** | `locations` (shared); **no V2 equivalent** | **LIVE** |
| 46 | POST `/locations` | market:write | S → `LocationSelector` (InventoryPage) | same as #45 | **LIVE** |
| 47 | GET `/api/orders/:order_id/allocations` | market:read | S → `SplitAllocationView` (ViewOrder) | reads `market_orders` + `order_market_items_v2`, `stock_allocations` | **LIVE** |
| 48 | POST `/api/orders/:order_id/allocations/manual` | market:write | S → `SplitAllocationView` (ViewOrder) | `allocation.service` | **LIVE** |
| 49 | GET `/api/contractors/:sid/allocations` | market:read | S → `AllAllocatedLotsGrid` (never rendered) | n/a | INTERNAL-ONLY |

Stale FE hooks with **no backend route** (they 404 today): M
`deleteMarketListing` (DELETE `/listings/:id`), `getListingBids` (GET
`/listings/:id/bids`), `acceptBid` (POST `/bids/:id/accept`; imported in
`Bids.tsx` but never called).

### Discord bot (backend side)

- `POST /threads/market/quantity/:opt` (discord_app,
  `src/clients/discord_api/threads.ts:172`) is **LIVE / UNKNOWN EXTERNAL**. It
  resolves the listing through V1 `marketDb.getMarketListing`
  (`market_listings`) and adjusts V1 `stock_lots` via `StockLotService`. The
  bot's `/stock` picker (`selectSellerListings`, `threads.ts:279`) now returns
  **V2** listing ids from `listing_search`, so this route most likely answers
  `400 Invalid listing` for every listing a user can pick. Treat it as a bug,
  not only as V1 code.
- The other bot routes (`/threads/market/{price,create,buy,offer,import-uex}`)
  already use V2 `listings`. `registration.ts` and `threads.ts` import
  `marketDb.upsertDailyActivity`, which is generic (`CALL
  upsert_daily_activity`) and only lives in the V1 file.
- I found no `/api/market` HTTP call from the backend to anything. Whether the
  bot itself calls `/api/market/*` over HTTP can only be checked in the bot
  repo or in the proxy logs (filter on the bot's user-agent / source IP).

### Sitemap

`src/services/sitemap/sitemap.service.ts:120` reads the V2 `listing_search`
view and emits `/market/<slug>` page URLs. **No V1 dependency.**

### Background tasks (`src/tasks/tasks.ts` → `timers.ts`)

| Task | Interval | V1 effect |
|---|---|---|
| `rebuild_search_view` | **every 5 min** | `REFRESH MATERIALIZED VIEW CONCURRENTLY market_search_materialized` (`v1/market/database.ts:2138`). Only #16 and `attribute-query-optimizer.ts` read the view. `attribute-import.service.ts:207` also refreshes it after imports. |
| `process_auctions` | 5 min | reads `market_auction_details` / `market_bids`, creates offers, archives `market_listings` (V1 auctions; V2 has `process_auctions_v2`) |
| `process_expiring_market_listings` | 1 h | `UPDATE market_listings SET status='inactive'` |
| `update_price_history` | 6 h | `CALL upsert_daily_price_history()` → INSERT `market_price_history` from active V1 listings (V2 has `snapshot_price_history_v2`) |
| `fetchAndInsertCommodities` (`tasks/commodities.ts`) | 24 h | INSERT `market_listing_details` for each new UEX commodity and sets `game_items.details_id` |
| `refresh_badge_view` | 4 h | `user_badges_materialized`. Not V1-specific (profile/contractor ratings use it), but its function lives in the V1 file |

## Shared code inside V1 files (must be moved, not deleted)

`src/api/routes/v1/market/database.ts` is imported by live, non-market modules:
`api/middleware/activity.ts` (`upsertDailyActivity`, on every authenticated
request), `clients/discord_api/*`, `services/email/email-payload-formatters.ts`,
`services/discord/order-alerts.ts`, `services/contractors/archive-contractor.service.ts`,
`v1/orders/{helpers,serializers}.ts`, `v1/offers/*`, `v1/notifications/database.ts`,
`v1/admin/controller.ts`, `v1/services/controller.ts` (`trackListingView`,
`getSellerListingAnalytics`), `v1/util/{formatting,webhooks}.ts`, and `tasks/timers.ts`.
Most of those calls render **legacy V1 orders/offers**
(`getMarketListingComplete`, `getOfferMarketListings`, `getMarketListingOrders`).

Rating helpers: `getUserRating` / `getContractorRating`
(`v1/util/formatting.ts:869,920`) are **not market-specific and are LIVE**.
They read `user_badges_materialized`, with a reviews/orders fallback, and are
called by V1 profile and contractor endpoints (`profiles/controller.ts:932`,
`profiles/database.ts:692`, `profiles/serializers.ts:79`,
`contractors/database.ts:217`, and `formatting.ts:808-813,1000` for order
stubs and contractor details). Keep them. They are out of scope for V1-market
removal.

## V1 tables: written vs. read

| Table / object | Still **written** by | Read by (outside V1 market routes) |
|---|---|---|
| `market_listings` | V1 routes (#3-7, #12); `process_expiring_market_listings`; `process_auctions`; `archive-contractor.service`; `orders/helpers.ts:791` (stock decrement for V1 orders); `account-deletion.service` | V2 `OrdersV2Controller:400`, `OffersV2Controller:258` (legacy order/offer display); `contractors/database.ts:1059`; admin; discord `/market/quantity` |
| `market_listing_details` | V1 create routes; **`tasks/commodities.ts:50` (daily)**; `scripts/merge-duplicate-items.ts` | V2 orders/offers (legacy display); `v1/offers/controller.ts` |
| `market_unique_listings`, `market_multiples`, `market_multiple_listings`, `market_aggregates`, `market_aggregate_listings`, `market_images`, `market_auction_details` | V1 routes only (+ `process_auctions` → auction details) | V2 orders/offers read `market_unique_listings` for legacy rows; `formatting.ts` |
| `market_bids` | V1 #11 only | `process_auctions`; `notifications/database.ts:439` (legacy bid notifications → FE #8) |
| `market_buy_orders` | V1 #28-30 (**#30 is live**); `account-deletion.service`; merge script | `v1/orders/database.ts` |
| `market_price_history` | **`update_price_history` (6 h)**; merge script | V1 #20 only |
| `market_search_materialized` (matview) | refreshed **every 5 min** + after attribute import | V1 #16, `attribute-query-optimizer.ts` |
| `market_offers`, `market_offer_listings` | none found (pre-offers-system) | `notifications/database.ts:458`, admin |
| `market_orders` | **shared**: `OrdersV2Controller:156` inserts V2 listing ids "for V1 compatibility"; `orders/helpers.ts:317` | V2 orders (shop resolution, lists), allocations (#47), `formatting.ts:247` |
| `offer_market_items` | `orders/helpers.ts:576` and `offers/*` when an offer has V1 listings | offers/orders serializers, order-alerts, webhooks |
| `stock_lots` | V1 stock-lot routes; `allocation.service`; `StockLotService` (discord `/market/quantity`, V1 orders) | #40, V2 `ListingsV2Controller`, `order-lifecycle.service` |
| `stock_allocations` | `allocation.service` (#48, V1 order flow) | V2 `OrdersV2Controller`, `StockLotsV2Controller`, #47 |
| `v1_v2_listing_map`, `v1_v2_stock_lot_map` | the one-off migration script only | `scripts/validate-migration-completeness.ts` only |

So `market_orders`, `offer_market_items`, `stock_allocations` and `locations`
are **shared**, not V1-only. The V1-only tables still receive **automatic**
writes from three timers (expiry, auctions, price history) and the commodities
task, even if no user ever touches V1 again.

The V1 schema predates the knex migrations (`scripts/*.sql`), so the FKs into
V1 tables are not visible in `migrations/`. Query 9 below lists them from the
catalog.

## Recommended removal order

1. **Prod checks first** (queries + logs below). Removal is blocked by:
   unmapped active V1 listings or lots, open V1 orders/offers, open V1 buy
   orders/auctions, and any external `/api/market` or `/api/v1/market` traffic.
2. **Fix / port the LIVE callers** (each needs a V2 path first):
   - `/orders` page: `BuyOrdersViewPaginated` / `BuyOrderRow` → V2
     `/api/v2/buy-orders/mine` and the V2 cancel (#19, #30).
   - Landing `OrderStatistics` → a V2 stats endpoint, or move `/stats` as-is
     (it only reads `orders`) (#1).
   - `NotificationBid` → V2 listing fetch (#8). V1 bid notifications should
     age out; see query 7.
   - `ViewOrder` allocation tab → V2 lots/allocations (#40, #47, #48).
   - `InventoryPage` `LocationSelector` → needs a V2 locations controller (#45,
     #46).
   - Discord `/threads/market/quantity/:opt` → V2 `listing_item_lots`. This one
     is probably already broken for every V2 listing.
3. **Frontend dead-code sweep** (no backend change): delete the orphaned
   `/org/:contractor_id/listings` route and its V1 `ManageStock` chain;
   `SelectMarketListing`, `OrderAllocationView`, `StockManager` and its dialogs,
   `AllAllocatedLotsGrid`; the whole `store/api/stock-lots.ts`; every
   hook-only M/S endpoint; the 3 stale hooks with no backend route. After this,
   every INTERNAL-ONLY row becomes DEAD.
4. **Backend: remove undocumented DEAD routes first** (no public contract):
   multiple/*, aggregate/{history,update,:id}, buyorder/create & fulfill,
   items/*, categories/category, `/export`, stock-lot writes #41-44, #38, #39,
   #49. Then publish a deprecation notice for the **documented** V1 market
   routes (OpenAPI `deprecated: true`, a note in `/docs`, rewrite the
   `TOKEN_AUTH_USAGE_EXAMPLES.md` example to `/api/v2/listings/mine`), wait one
   log window, and remove them.
5. **Stop V1 timers**: `rebuild_search_view` (5-min matview refresh) and the
   refresh in `attribute-import.service` once #16 is gone; `update_price_history`
   once #20 is gone; `process_auctions` and `process_expiring_market_listings`
   once queries 5-6 show nothing open; stop `commodities.ts` writing
   `market_listing_details`/`game_items.details_id` (check that no V2 code reads
   `game_items.details_id` first).
6. **Move shared helpers** out of `v1/market/database.ts`
   (`upsertDailyActivity`, `refreshBadgeView`, `trackListingView`,
   `getListingViewStats`, `getSellerListingAnalytics`, and the legacy
   order/offer readers) into a service, then delete the V1 market router files.
7. **Data, last**: a schema migration (not data-only, so it needs its own
   review) to `DROP MATERIALIZED VIEW market_search_materialized`, drop the
   `upsert_daily_price_history` procedure, and only then archive/drop V1-only
   tables. **Keep them read-only for as long as V2 order/offer detail still
   joins them for legacy orders** (`OrdersV2Controller:400`,
   `OffersV2Controller:258`). Either snapshot title/price onto the order rows
   first or keep the tables. Do not drop `market_orders`, `offer_market_items`,
   `stock_allocations` or `locations`: they are shared.

## Prod checks for Willem (all read-only)

Run against a read replica if you have one. None of these write.

```sql
-- 1. V1 listings vs the V1→V2 map
SELECT
  (SELECT count(*) FROM market_listings)                                   AS v1_listings,
  (SELECT count(*) FROM market_listings WHERE status = 'active')           AS v1_active,
  (SELECT count(*) FROM v1_v2_listing_map)                                 AS mapped,
  (SELECT count(*) FROM market_listings ml
     WHERE NOT EXISTS (SELECT 1 FROM v1_v2_listing_map m
                       WHERE m.v1_listing_id = ml.listing_id))             AS unmapped,
  (SELECT count(*) FROM market_listings ml
     WHERE ml.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM v1_v2_listing_map m
                       WHERE m.v1_listing_id = ml.listing_id))             AS unmapped_active;

-- 1b. Map breakdown and when the migration ran
SELECT v1_listing_type, count(*), min(migrated_at), max(migrated_at)
FROM v1_v2_listing_map GROUP BY 1 ORDER BY 1;

-- 1c. Unmapped listings by status (what the migration skipped)
SELECT ml.status, count(*), max(ml.timestamp) AS newest
FROM market_listings ml
WHERE NOT EXISTS (SELECT 1 FROM v1_v2_listing_map m WHERE m.v1_listing_id = ml.listing_id)
GROUP BY 1 ORDER BY 2 DESC;

-- 2. V1 stock lots vs map; unmapped lots that still hold stock
SELECT
  (SELECT count(*) FROM stock_lots)                                         AS v1_lots,
  (SELECT count(*) FROM v1_v2_stock_lot_map)                                AS mapped_lots,
  (SELECT count(*) FROM stock_lots sl
     WHERE sl.quantity_total > 0
       AND NOT EXISTS (SELECT 1 FROM v1_v2_stock_lot_map m
                       WHERE m.v1_lot_id = sl.lot_id))                      AS unmapped_lots_with_stock;

-- 3. Last-write timestamps on V1 tables (anything after the cutover = something still writes V1)
SELECT 'market_listings.timestamp'       AS col, max(timestamp)::text FROM market_listings
UNION ALL SELECT 'market_listings created after first map', count(*)::text
  FROM market_listings WHERE timestamp > (SELECT min(migrated_at) FROM v1_v2_listing_map)
UNION ALL SELECT 'market_buy_orders.created',    max(created_timestamp)::text   FROM market_buy_orders
UNION ALL SELECT 'market_buy_orders.fulfilled',  max(fulfilled_timestamp)::text FROM market_buy_orders
UNION ALL SELECT 'market_bids.timestamp',        max(timestamp)::text           FROM market_bids
UNION ALL SELECT 'market_price_history.date',    max(date)::text                FROM market_price_history
UNION ALL SELECT 'stock_lots.updated_at',        max(updated_at)::text          FROM stock_lots
UNION ALL SELECT 'stock_allocations.updated_at', max(updated_at)::text          FROM stock_allocations;

-- 4. Write counters since the last stats reset. Run twice ~a week apart and diff:
--    any growth on a V1-only table means a writer is still active.
SELECT s.relname, s.n_tup_ins, s.n_tup_upd, s.n_tup_del, s.n_live_tup,
       s.last_autoanalyze, d.stats_reset
FROM pg_stat_user_tables s CROSS JOIN pg_stat_database d
WHERE d.datname = current_database()
  AND s.relname IN ('market_listings','market_listing_details','market_unique_listings',
                    'market_multiples','market_multiple_listings','market_aggregates',
                    'market_aggregate_listings','market_buy_orders','market_auction_details',
                    'market_bids','market_images','market_price_history','market_offers',
                    'market_offer_listings','market_orders','offer_market_items',
                    'stock_lots','stock_allocations')
ORDER BY s.relname;

-- 5. Open V1 work that blocks stopping the V1 timers / deleting routes
SELECT 'active V1 listings with stock' AS what, count(*) FROM market_listings
  WHERE status = 'active' AND quantity_available > 0
UNION ALL SELECT 'V1 listings expiring in future', count(*) FROM market_listings
  WHERE status = 'active' AND expiration > now()
UNION ALL SELECT 'open V1 buy orders', count(*) FROM market_buy_orders
  WHERE fulfilled_timestamp IS NULL AND expiry > now()
UNION ALL SELECT 'V1 auctions not concluded', count(*) FROM market_auction_details
  WHERE status <> 'concluded';

-- 6. Non-terminal orders/offers that still point at V1 listings
--    (status values: adjust if your terminal set differs)
SELECT o.status, count(DISTINCT o.order_id), max(o.timestamp)
FROM orders o
JOIN market_orders mo ON mo.order_id = o.order_id
JOIN market_listings ml ON ml.listing_id = mo.listing_id
GROUP BY 1 ORDER BY 2 DESC;

SELECT oo.status, count(DISTINCT oo.id), max(oo.timestamp)
FROM order_offers oo
JOIN offer_market_items omi ON omi.offer_id = oo.id
JOIN market_listings ml ON ml.listing_id = omi.listing_id
GROUP BY 1 ORDER BY 2 DESC;

-- 6b. market_orders is shared: how many rows point at V1 vs V2 listings
SELECT
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM market_listings ml WHERE ml.listing_id = mo.listing_id)) AS v1_rows,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.listing_id = mo.listing_id))        AS v2_rows
FROM market_orders mo;

-- 7. Legacy V1 bid notifications still visible (FE NotificationBid → GET /api/market/listings/:id)
SELECT count(*), max(no.timestamp)
FROM notification_object no
JOIN market_bids b ON b.bid_id::text = no.entity_id::text;

-- 8. API tokens that could be calling V1 market routes
--    (scope check only; the route itself is only in the proxy logs)
SELECT id, user_id, name, scopes, last_used_at, expires_at
FROM api_tokens
WHERE last_used_at > now() - interval '30 days'
  AND revoked_at IS NULL
  AND (scopes && ARRAY['market:read','market:write','full','readonly','admin']::text[])
ORDER BY last_used_at DESC;
-- If scopes is jsonb rather than text[], use:
--   AND scopes ?| array['market:read','market:write','full','readonly','admin']

-- 9. FKs pointing INTO V1 tables (V1 schema predates knex migrations)
SELECT conrelid::regclass AS referencing_table, conname, confrelid::regclass AS v1_table,
       pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid::regclass::text IN ('market_listings','market_listing_details','market_unique_listings',
        'market_multiples','market_aggregates','market_buy_orders','market_bids','stock_lots')
ORDER BY 3, 1;

-- 10. What depends on the matview / procedure
SELECT pg_size_pretty(pg_total_relation_size('market_search_materialized')) AS size,
       (SELECT count(*) FROM market_search_materialized) AS rows;
SELECT DISTINCT dependent.relname
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dependent ON dependent.oid = r.ev_class
WHERE d.refobjid = 'market_search_materialized'::regclass AND dependent.relname <> 'market_search_materialized';
```

Logs (reverse proxy / CDN, not the app; the app does not log successful
requests by path). Over 30 days:
- Group by path template + method + status for `^/api/(v1/)?market/`,
  `^/api/orders/[^/]+/allocations`, `^/api/contractors/[^/]+/allocations`.
- Split by `Authorization: Bearer scm_` vs cookie (or by user-agent: browser vs
  scripts) to separate first-party from API-token traffic.
- Bot app: hits on `/threads/market/quantity/` and their status codes. A wall
  of 400s confirms it's broken for V2 listings.
- Bugsnag: `[4xx|5xx] ... /api/market/` errors (from `error-handler.ts:123`).
