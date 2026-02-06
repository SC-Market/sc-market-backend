# Granular Stock Tracking Migration Guide

This guide explains how to apply the granular stock tracking database migration to your SC Market backend.

## Overview

The granular stock tracking system introduces:

- **Stock Lots**: Atomic inventory records with location, owner, and listed/unlisted state
- **Locations**: Preset verse locations and custom user-defined locations
- **Allocations**: Temporary reservations of stock for orders
- **Allocation Strategies**: Organization-level preferences for stock allocation

## Files Created

1. **`config/postgres/50-granular-stock-tracking.sql`** - Main schema migration
   - Creates `locations` table with preset locations
   - Creates `stock_lots` table for granular inventory tracking
   - Creates `stock_allocations` table for order reservations
   - Creates `allocation_strategies` table for organization preferences
   - Creates database functions for stock aggregation
   - Creates triggers for backward compatibility

2. **`scripts/migrate-stock-to-lots.sql`** - Data migration script
   - Migrates existing `quantity_available` data to `stock_lots`
   - Includes validation queries
   - Includes rollback instructions

## Migration Steps

### Step 1: Apply Schema Changes

Run the main migration file to create the new tables, functions, and triggers:

```bash
psql -U scmarket -d scmarket -f config/postgres/50-granular-stock-tracking.sql
```

Or if using Docker:

```bash
docker exec -i sc-market-postgres psql -U scmarket -d scmarket < config/postgres/50-granular-stock-tracking.sql
```

### Step 2: Verify Schema

Check that all tables were created successfully:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('locations', 'stock_lots', 'stock_allocations', 'allocation_strategies');
```

You should see all 4 tables listed.

### Step 3: Migrate Existing Data

Run the data migration script to convert existing stock to the new system:

```bash
psql -U scmarket -d scmarket -f scripts/migrate-stock-to-lots.sql
```

Or with Docker:

```bash
docker exec -i sc-market-postgres psql -U scmarket -d scmarket < scripts/migrate-stock-to-lots.sql
```

### Step 4: Validate Migration

The migration script includes validation queries that will automatically run. Review the output:

1. **Mismatch Query**: Should return 0 rows (no mismatches)
2. **Summary Statistics**: Should show `total_difference = 0`

If there are any mismatches, investigate before proceeding.

### Step 5: Test Backward Compatibility

The system maintains backward compatibility with the existing `quantity_available` column. Test that it updates correctly:

```sql
-- Insert a test lot
INSERT INTO stock_lots (listing_id, quantity_total, location_id, listed)
SELECT
    listing_id,
    10,
    (SELECT location_id FROM locations WHERE name = 'Unspecified' LIMIT 1),
    true
FROM market_listings
LIMIT 1
RETURNING listing_id;

-- Check that quantity_available was updated
SELECT listing_id, quantity_available
FROM market_listings
WHERE listing_id = '<listing_id_from_above>';

-- Clean up test data
DELETE FROM stock_lots WHERE listing_id = '<listing_id_from_above>' AND quantity_total = 10;
```

## Rollback Procedure

If you need to rollback the migration:

```sql
BEGIN;

-- Delete all allocations and lots
DELETE FROM stock_allocations;
DELETE FROM stock_lots;

-- Verify market_listings.quantity_available is still intact
SELECT COUNT(*) as listings_with_stock
FROM market_listings
WHERE quantity_available > 0;

COMMIT;
```

To completely remove the schema:

```sql
-- Drop triggers
DROP TRIGGER IF EXISTS trigger_sync_listing_quantity_on_allocation_change ON stock_allocations;
DROP TRIGGER IF EXISTS trigger_sync_listing_quantity_on_lot_change ON stock_lots;

-- Drop functions
DROP FUNCTION IF EXISTS sync_listing_quantity_on_allocation();
DROP FUNCTION IF EXISTS sync_listing_quantity();
DROP FUNCTION IF EXISTS get_total_stock(UUID);
DROP FUNCTION IF EXISTS get_reserved_stock(UUID);
DROP FUNCTION IF EXISTS get_available_stock(UUID);

-- Drop tables (in order due to foreign keys)
DROP TABLE IF EXISTS allocation_strategies;
DROP TABLE IF EXISTS stock_allocations;
DROP TABLE IF EXISTS stock_lots;
DROP TABLE IF EXISTS locations;
```

## Key Features

### Backward Compatibility

The system maintains the existing `quantity_available` column in `market_listings` through database triggers. Any changes to stock lots or allocations automatically update this column, ensuring existing code continues to work.

### Stock Aggregation Functions

Three new functions provide stock information:

- `get_available_stock(listing_id)` - Returns available (unallocated) stock
- `get_reserved_stock(listing_id)` - Returns allocated stock
- `get_total_stock(listing_id)` - Returns total stock across all lots

### Preset Locations

The migration seeds 20 preset locations including:

- Major cities (Orison, Lorville, Area18, New Babbage)
- Space stations (Port Olisar, Grim HEX, Everus Harbor, etc.)
- Rest stops (CRU-L1, HUR-L1, ARC-L1, MIC-L1, etc.)

Users can also create custom locations.

## Next Steps

After successful migration:

1. Deploy backend services that use the new stock lot system
2. Update frontend to support the new stock management UI
3. Test order creation with automatic allocation
4. Monitor for any issues with stock synchronization

## Troubleshooting

### Issue: Quantity mismatches after migration

**Solution**: Run the validation query from the migration script to identify specific listings with mismatches. Investigate the source data and re-run migration if needed.

### Issue: Triggers not firing

**Solution**: Verify triggers are enabled:

```sql
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname LIKE '%sync_listing_quantity%';
```

### Issue: Performance concerns with large datasets

**Solution**: The migration includes indexes on all foreign keys and frequently queried columns. If performance is still an issue, consider:

- Adding additional indexes based on query patterns
- Using materialized views for complex aggregations
- Implementing caching at the application layer

## Support

For questions or issues with the migration, refer to:

- Design document: `.kiro/specs/granular-stock-tracking/design.md`
- Requirements document: `.kiro/specs/granular-stock-tracking/requirements.md`
- Task list: `.kiro/specs/granular-stock-tracking/tasks.md`
