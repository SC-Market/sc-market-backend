# V1 → V2 Market Migration Plan

## Overview

Migrate all V1 market data to V2 tables without data loss. V1 tables remain untouched (read-only) throughout the process. The migration is idempotent and can be re-run safely.

## What Gets Migrated

| V1 Source | V2 Destination | Status |
|---|---|---|
| `market_listings` + `market_unique_listings` + `market_listing_details` | `listings` + `listing_items` | ✅ Ready |
| `market_aggregate_listings` + `market_aggregates` | `listings` + `listing_items` (type=single) | ✅ Ready |
| `market_multiple_listings` + `market_multiple` | `listings` + `listing_items` (type=bundle, multi-item) | ✅ Ready |
| `market_images` | `listing_photos_v2` (reuses `image_resources`) | ✅ Ready |
| `stock_lots` | `listing_item_lots` | ✅ Ready |
| `market_price_history` | `price_history_v2` | 🔧 TODO |
| `market_auction_details` | V2 auction tables | 🔧 TODO (see Auction Feature Parity) |
| `market_bids` | V2 bid tables | 🔧 TODO (see Auction Feature Parity) |

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
| `market_listings.price` | `listing_items.base_price` | Direct copy |
| `market_listings.quantity_available` | `listing_item_lots.quantity_total` | Via stock lots or fallback |
| `market_listings.status` | `listings.status` | `inactive`/`archived` → `cancelled` |
| `market_listings.sale_type` | `listings.sale_type` | `sale` → `fixed` (or `negotiable` if `accept_offers=true`) |
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

| V1 `stock_lots` Field | V2 `listing_item_lots` Field |
|---|---|
| `lot_id` | `v1_v2_stock_lot_map.v1_lot_id` |
| `listing_id` | Via `listing_items.item_id` (through mapping) |
| `quantity_total` | `quantity_total` |
| `location_id` | `location_id` (shared `locations` table) |
| `owner_id` | `owner_id` |
| `listed` | `listed` |
| `notes` | `notes` |

Listings without V1 `stock_lots` rows get a single lot created from `quantity_available`.

### Photos

V1 `market_images` links `resource_id` → `details_id`. V2 `listing_photos_v2` links `resource_id` → `listing_id`. The `image_resources` table is shared — no image data is duplicated.

### Price History

V1 `market_price_history` has daily snapshots per `game_item_id`. V2 `price_history_v2` is event-based per variant. Migration maps each V1 row to a V2 row with the default variant and `event_type = 'legacy_snapshot'`.

## Tracking Tables

| Table | Purpose |
|---|---|
| `v1_v2_listing_map` | Maps `v1_listing_id` → `v2_listing_id` with listing type |
| `v1_v2_stock_lot_map` | Maps `v1_lot_id` → `v2_lot_id` |

These enable idempotency (skip already-migrated), URL redirects, and cross-referencing.

## Execution Steps

### Pre-Migration

1. **Backup production database** — `scripts/backup-database.sh`
2. **Run on staging clone first** — restore backup, run migration, validate
3. **Run `knex_migrations` rename** if needed:
   ```sql
   UPDATE knex_migrations SET name = '..._columns.ts' WHERE name = '..._columns.js';
   UPDATE knex_migrations SET name = '..._views_v2.ts' WHERE name = '..._views_v2.js';
   ```
4. **Run pending knex migrations** — `NODE_OPTIONS="--import tsx" npx knex migrate:latest`

### Migration

5. **Run migration script:**
   ```bash
   npx tsx scripts/run-v1-to-v2-migration-standalone.ts
   ```
   - Reads V1 tables (no modifications)
   - Creates V2 listings, items, variants, lots, photos
   - Records all mappings
   - Reports success/failure counts

### Validation

6. **Run validation script:**
   ```bash
   npx tsx scripts/validate-migration-completeness.ts
   ```
   Checks: mapping completeness, metadata preservation, photo counts, stock lot mapping, bundle structure, variant deduplication.

### Rollout

7. **Feature flag rollout** — increase `market_v2` rollout percentage gradually: 5% → 10% → 25% → 50% → 100%
8. **Monitor** — Bugsnag errors, user reports, data consistency

### Rollback

- Set `market_v2` rollout to 0% — instant revert to V1 for all users
- V1 tables are never modified — always available as fallback
- V2 data can be wiped and re-migrated if needed

## Safety Properties

- **Zero data loss**: V1 tables are read-only during migration
- **Idempotent**: Checks `v1_v2_listing_map` before each listing — safe to re-run
- **Transactional**: Each listing migrates in its own DB transaction
- **Instant rollback**: Feature flag controls which version users see
