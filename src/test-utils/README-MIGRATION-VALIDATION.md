# Migration Validation Tests - Task 2.6

## Overview

This test suite validates that the V1 to V2 migration service correctly migrates data while preserving integrity and leaving V1 tables unchanged.

**Requirements:** 58.2, 58.5

## Test Coverage

### 1. Unique Listing Migration Preserves All Fields
- ✅ Creates V2 listing with correct metadata
- ✅ Preserves timestamps from V1
- ✅ Creates listing_items with unified pricing
- ✅ Creates default variant with NULL quality attributes
- ✅ Creates stock lot with correct quantity
- ✅ Triggers update of quantity_available
- ✅ Maps V1 status correctly (active, inactive, archived, sold, expired)
- ✅ Maps internal flag to visibility (private/public)

### 2. Aggregate Listing Migration Handles Multiple Stock Lots
- ✅ Creates V2 listing with listing_type=single
- ✅ Preserves aggregate listing metadata
- ✅ Creates single stock lot for aggregate
- ✅ Uses default variant for aggregate

### 3. Multiple Listing Migration Creates Multiple Listing Items
- ✅ Creates V2 listing with listing_type=bundle
- ✅ Preserves multiple listing metadata
- ✅ Creates listing_items for bundle
- ✅ Uses unified pricing for bundle

### 4. Default Variant Creation for Items Without Quality Data
- ✅ Creates variant with NULL quality_tier
- ✅ Sets crafted_source to unknown
- ✅ Reuses default variant across multiple listings (deduplication)

### 5. V1 Tables Remain Unchanged After Migration
- ✅ Does not modify V1 market_listings table
- ✅ Only reads from V1 tables, never writes
- ✅ Preserves V1 data integrity after multiple migrations

### 6. Edge Cases and Error Handling
- ✅ Rejects listing with missing game_item_id
- ✅ Rejects listing with invalid price (≤ 0)
- ✅ Rejects listing with negative quantity
- ✅ Rejects listing with missing seller_id
- ✅ Handles contractor seller correctly

## Running the Tests

### Prerequisites

1. Database must be accessible at the configured host
2. All V2 migrations must be applied
3. Test game items must exist in the database

### Execute Tests

```bash
# Run all migration validation tests
npm test -- migration-validation.test.ts --run

# Run specific test suite
npm test -- migration-validation.test.ts -t "unique listing migration" --run

# Run with verbose output
npm test -- migration-validation.test.ts --run --reporter=verbose
```

### Database Connection

Tests connect to the database specified in `knexfile.js` (development environment).

**Safety Check:** Tests verify they're not running against production by checking the database name.

## Test Data

Tests create temporary test data and clean up after each test:
- Test listings use unique IDs with timestamps
- All test data is deleted in `afterAll` hooks
- V1 tables are never modified (read-only access)

## Requirements Validation

### Requirement 58.2: Migrate All V1 Listings

✅ **Test Coverage:**
- Unique listing migration preserves all fields
- Aggregate listing migration handles stock lots
- Multiple listing migration creates listing_items
- Default variant creation for items without quality data

**Validation:**
- All V1 metadata preserved in V2 format
- Correct listing_type mapping (single, bundle)
- Unified pricing mode used
- Default variants created with NULL quality attributes

### Requirement 58.5: V1 Tables Unchanged

✅ **Test Coverage:**
- V1 tables remain unchanged after migration
- Only read operations on V1 tables
- Row counts verified before and after migration

**Validation:**
- V1 table row counts identical before/after
- No write operations to V1 tables
- Multiple migrations don't affect V1 data

## Known Limitations

1. **Database Connectivity Required:** Tests skip if database is not accessible
2. **Test Game Items:** Requires at least one game item in the database
3. **Cleanup Dependencies:** Tests clean up V2 data but never touch V1 data

## Troubleshooting

### Tests Skipped

If all tests are skipped, check:
1. Database connectivity (can you connect to the database?)
2. Database configuration in `knexfile.js`
3. Network access to database host

### Connection Timeout

```
Error: connect ETIMEDOUT 192.168.88.6:5432
```

**Solution:** Verify database host is accessible and port 5432 is open.

### No Game Items Found

```
Error: No game items found in database
```

**Solution:** Ensure the database has at least one game item record.

## Related Files

- **Migration Service:** `src/services/market-v2/migration.service.ts`
- **Migration Service Tests:** `src/services/market-v2/migration.service.test.ts`
- **Variant Service:** `src/services/market-v2/variant.service.ts`
- **Database Migrations:** `migrations/20260417000000_market_v2_core_tables.ts`

## Next Steps

After these tests pass:
- ✅ Task 2.6 complete
- ➡️ Proceed to Phase 3: Backend API - Listings (Week 3)
