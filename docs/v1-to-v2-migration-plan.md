# V1 → V2 Market Migration Plan

## Overview

Migrate all V1 market data to V2 tables without data loss. V1 tables remain untouched (read-only) throughout the process. The migration is idempotent and can be re-run safely.

## Execution Order

### Phase 0: Inventory Decoupling (Before Data Migration)

Execute the V2.1 decoupled inventory changes first (see `v2.1-decoupled-inventory.md`). This adds `owner_id`, `game_item_id`, and `listing_id` columns to `listing_item_lots` so the data migration can create lots in the right shape from the start.

1. **Run inventory schema migration** — ALTER `listing_item_lots` to add new columns
2. **Backfill existing V2 lots** — populate `owner_id`, `game_item_id`, `listing_id` from existing relationships
3. **Update quantity trigger** — handle lot movement between listings
4. **Update stock lot service** — support unlisted lots
5. **Deploy frontend** — "Manage Inventory" rename is already live

This eliminates the `__custom_item__` sentinel hack — custom listings just have lots with `game_item_id = NULL`.

### Phase 1: Pre-Migration

6. **Backup production database** — `scripts/backup-database.sh`
7. **Run on staging clone first** — restore backup, run migration, validate
8. **Run `knex_migrations` rename** if needed:
   ```sql
   UPDATE knex_migrations SET name = '..._columns.ts' WHERE name = '..._columns.js';
   UPDATE knex_migrations SET name = '..._views_v2.ts' WHERE name = '..._views_v2.js';
   ```
9. **Run pending knex migrations** — `NODE_OPTIONS="--import tsx" npx knex migrate:latest`

### Phase 2: Data Migration

10. **Run migration script:**
    ```bash
    npx tsx scripts/run-v1-to-v2-migration-standalone.ts
    ```
    - Reads V1 tables (no modifications)
    - Creates V2 listings, items, variants, lots (with `owner_id` + `game_item_id`), photos
    - Records all mappings in `v1_v2_listing_map` and `v1_v2_stock_lot_map`
    - Reports success/failure counts

### Phase 3: Validation

11. **Run validation script:**
    ```bash
    npx tsx scripts/validate-migration-completeness.ts
    ```
    Checks: mapping completeness, metadata preservation, photo counts, stock lot mapping, bundle structure, variant deduplication.

### Phase 4: Rollout

12. **Feature flag rollout** — increase `market_v2` rollout percentage gradually: 5% → 10% → 25% → 50% → 100%
13. **Monitor** — Bugsnag errors, user reports, data consistency

### Rollback

- Set `market_v2` rollout to 0% — instant revert to V1 for all users
- V1 tables are never modified — always available as fallback
- V2 data can be wiped and re-migrated if needed

## What Gets Migrated

| V1 Source | V2 Destination | Status |
|---|---|---|
| `market_listings` + `market_unique_listings` + `market_listing_details` | `listings` + `listing_items` | ✅ Ready |
| `market_aggregate_listings` + `market_aggregates` | `listings` + `listing_items` (type=single) | ✅ Ready |
| `market_multiple_listings` + `market_multiple` | `listings` + `listing_items` (type=bundle, multi-item) | ✅ Ready |
| `market_images` | `listing_photos_v2` (reuses `image_resources`) | ✅ Ready |
| `stock_lots` | `listing_item_lots` (with `owner_id`, `game_item_id`) | ✅ Ready |
| `market_price_history` | `price_history_v2` | 🔧 TODO |
| `market_auction_details` | `auction_details_v2` | 🔧 TODO (see `v2-auction-feature-parity.md`) |
| `market_bids` | `bids_v2` | 🔧 TODO (see `v2-auction-feature-parity.md`) |

## What Does NOT Get Migrated

| V1 Table | Reason |
|---|---|
| `market_orders` | V1 orders keep V1 line items. New V2 orders use `order_market_items_v2`. |
| `offer_market_items` | V1 offers keep V1 line items. New V2 offers use `offer_market_items_v2`. |
| `stock_allocations` | Tied to V1 orders. V2 orders create their own allocations. |
| `cart_items` | Transient data, no migration needed. |

## Data Mapping

### Listings

| V1 Field | V2 Field | Transformation |
|---|---|---|
| `market_listings.listing_id` | `v1_v2_listing_map.v1_listing_id` | Tracked in mapping table |
| `market_listing_details.title` | `listings.title` | Direct copy |
| `market_listing_details.description` | `listings.description` | Direct copy |
| `market_listings.price` | `listing_items.base_price` | Direct copy (0 allowed) |
| `market_listings.quantity_available` | `listing_item_lots.quantity_total` | Via stock lots or fallback |
| `market_listings.status` | `listings.status` | Normalized: `inactive`/`archived` → `cancelled`, past expiration → `expired` |
| `market_listings.sale_type` | `listings.sale_type` | `sale` → `fixed`, unknown → `fixed` |
| `market_listings.internal` | `listings.visibility` | `true` → `private`, `false` → `public` |
| `market_listings.bulk_discount_tiers` | `listing_items.bulk_discount_tiers` | Direct copy (JSONB) |
| `market_listings.timestamp` | `listings.created_at` | Direct copy |
| `market_listings.expiration` | `listings.expires_at` | Direct copy |

### Listing Types

| V1 Type | V2 `listing_type` | Notes |
|---|---|---|
| `market_unique_listings` | `single` | One listing_item per listing |
| `market_aggregate_listings` | `single` | Flattened from aggregate structure |
| `market_multiple_listings` | `bundle` | Multiple listing_items per listing (one per sub-item) |

### Variants

All V1 listings get a default variant with `crafted_source: "unknown"` and no quality data. V2 listings created natively will have real quality/variant data.

### Stock Lots

After inventory decoupling, lots are created with direct ownership:

| V1 `stock_lots` Field | V2 `listing_item_lots` Field |
|---|---|
| `lot_id` | `v1_v2_stock_lot_map.v1_lot_id` |
| `listing_id` | `listing_id` (direct, nullable) |
| — | `owner_id` (from listing seller) |
| — | `game_item_id` (from `listing_items` or NULL for custom) |
| `quantity_total` | `quantity_total` |
| `location_id` | `location_id` (shared `locations` table) |
| `owner_id` | `owner_id` |
| `listed` | `listed` |
| `notes` | `notes` |

Listings without V1 `stock_lots` rows get a single lot created from `quantity_available`.

### Photos

V1 `market_images` links `resource_id` → `details_id`. V2 `listing_photos_v2` links `resource_id` → `listing_id`. The `image_resources` table is shared — no image data is duplicated.

### Price History (TODO)

V1 `market_price_history` has daily snapshots per `game_item_id`. V2 `price_history_v2` is event-based per variant. Migration maps each V1 row to a V2 row with the default variant and `event_type = 'legacy_snapshot'`.

## Tracking Tables

| Table | Purpose |
|---|---|
| `v1_v2_listing_map` | Maps `v1_listing_id` → `v2_listing_id` with listing type |
| `v1_v2_stock_lot_map` | Maps `v1_lot_id` → `v2_lot_id` |

These enable idempotency (skip already-migrated), URL redirects, and cross-referencing.

## Safety Properties

- **Zero data loss**: V1 tables are read-only during migration
- **Idempotent**: Checks `v1_v2_listing_map` before each listing — safe to re-run
- **Transactional**: Each listing migrates in its own DB transaction
- **Instant rollback**: Feature flag controls which version users see
- **Custom listings preserved**: Lots with `game_item_id = NULL` (no sentinel needed)
