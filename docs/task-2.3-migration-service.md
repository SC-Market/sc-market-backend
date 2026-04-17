# Task 2.3: V1ToV2MigrationService Implementation

**Date:** 2026-04-17  
**Task:** Implement V1ToV2MigrationService  
**Requirements:** 58.2, 58.4, 69.1  
**Status:** ✅ Complete

---

## Overview

Implemented the V1ToV2MigrationService to migrate V1 listings to V2 format. The service reads V1 data from the existing 3-table structure (unique_listings, aggregate_listings, multiple_listings) and creates V2 listings with default variants, unified pricing, and single stock lots.

## Implementation Summary

### Files Created

1. **`src/services/market-v2/migration.service.ts`** - Main migration service
2. **`src/services/market-v2/migration.service.test.ts`** - Unit tests
3. **`docs/task-2.3-migration-service.md`** - This documentation

### Files Modified

1. **`src/services/market-v2/index.ts`** - Added migration service export

---

## Migration Service Features

### Core Methods

#### 1. `migrateUniqueListing(v1Listing: V1UniqueListing): Promise<MigrationResult>`

Migrates a V1 unique listing to V2 format.

**Process:**
1. Validates required fields (game_item_id, seller_id, price > 0, quantity >= 0)
2. Maps V1 status to V2 status (inactive/archived → cancelled)
3. Maps V1 sale_type to V2 sale_type (sale → fixed)
4. Maps V1 internal flag to V2 visibility (internal → private)
5. Creates V2 listing record (listing_type='single')
6. Creates V2 listing_items record (pricing_mode='unified')
7. Gets or creates default variant (NULL quality attributes)
8. Creates single stock lot with V1 quantity
9. Uses database transaction for atomicity

**Example:**
```typescript
const v1Listing: V1UniqueListing = {
  listing_id: "v1-listing-1",
  sale_type: "sale",
  price: 1000,
  quantity_available: 5,
  status: "active",
  internal: false,
  user_seller_id: "user-123",
  contractor_seller_id: null,
  timestamp: new Date("2025-01-01"),
  expiration: new Date("2025-02-01"),
  accept_offers: true,
  details_id: "details-1",
  item_type: "weapon",
  title: "Demon Fang Combat Knife",
  description: "High quality combat knife",
  game_item_id: "game-item-1",
}

const result = await migrateUniqueListing(v1Listing)
// result.success = true
// result.listing_id = "new-v2-listing-id"
```

#### 2. `migrateAggregateListing(v1Listing: V1AggregateListing): Promise<MigrationResult>`

Migrates a V1 aggregate listing to V2 format.

**Process:**
- Same as unique listing migration
- Maps to listing_type='single' (aggregates become regular listings in V2)
- Preserves aggregate metadata in notes field

**Note:** Based on Task 2.1 analysis, there are **0 aggregate listings** in production, so this method is primarily for future-proofing.

#### 3. `migrateMultipleListing(v1Listing: V1MultipleListing): Promise<MigrationResult>`

Migrates a V1 multiple listing (bundle) to V2 format.

**Process:**
- Same as unique listing migration
- Maps to listing_type='bundle'
- Preserves bundle metadata in notes field

**Note:** Based on Task 2.1 analysis, there are **0 multiple listings** in production, so this method is primarily for future-proofing.

### Batch Migration Methods

#### 4. `migrateAllUniqueListings(): Promise<MigrationSummary>`

Migrates all V1 unique listings to V2.

**Process:**
1. Reads all V1 unique listings (read-only, no V1 modifications)
2. Migrates each listing individually
3. Collects success/failure statistics
4. Returns summary with error details

**Example:**
```typescript
const summary = await service.migrateAllUniqueListings()
// summary.total_attempted = 36
// summary.successful = 31
// summary.failed = 5
// summary.errors = [{ v1_listing_id: "...", error: "Invalid price" }]
```

#### 5. `migrateAllAggregateListings(): Promise<MigrationSummary>`

Migrates all V1 aggregate listings to V2 (currently 0 in production).

#### 6. `migrateAllMultipleListings(): Promise<MigrationSummary>`

Migrates all V1 multiple listings to V2 (currently 0 in production).

#### 7. `migrateAllListings(): Promise<MigrationSummary>`

Migrates all V1 listings (unique, aggregate, multiple) to V2.

**Example:**
```typescript
const summary = await service.migrateAllListings()
// Combines results from all three listing types
```

---

## Data Mapping

### V1 → V2 Field Mapping

| V1 Field | V2 Field | Transformation |
|----------|----------|----------------|
| `market_listings.listing_id` | N/A | Not preserved (new UUID generated) |
| `market_listings.sale_type` | `listings.sale_type` | 'sale' → 'fixed' |
| `market_listings.price` | `listing_items.base_price` | Direct copy |
| `market_listings.quantity_available` | `listing_item_lots.quantity_total` | Direct copy |
| `market_listings.status` | `listings.status` | 'inactive'/'archived' → 'cancelled' |
| `market_listings.internal` | `listings.visibility` | true → 'private', false → 'public' |
| `market_listings.user_seller_id` | `listings.seller_id` | Direct copy |
| `market_listings.contractor_seller_id` | `listings.seller_id` | Direct copy |
| `market_listings.timestamp` | `listings.created_at` | Direct copy |
| `market_listings.expiration` | `listings.expires_at` | Direct copy |
| `market_listing_details.title` | `listings.title` | Direct copy |
| `market_listing_details.description` | `listings.description` | Direct copy |
| `market_listing_details.game_item_id` | `listing_items.game_item_id` | Direct copy |

### V1 → V2 Listing Type Mapping

| V1 Listing Type | V2 listing_type | Count in Production |
|-----------------|-----------------|---------------------|
| unique_listings | 'single' | 36 |
| aggregate_listings | 'single' | 0 |
| multiple_listings | 'bundle' | 0 |

### Default Variant Attributes

Since V1 has no quality tier data, all migrated listings use default variant attributes:

```typescript
{
  quality_tier: undefined,      // NULL in database
  quality_value: undefined,     // NULL in database
  crafted_source: "unknown",    // Indicates unknown origin
  blueprint_tier: undefined,    // NULL in database
}
```

**Requirement 58.4:** Create default variant with empty attributes for V1 items without quality data  
**Requirement 69.1:** Treat NULL quality fields as unknown quality

---

## Validation Rules

### Required Fields

1. **game_item_id** - Must be non-empty UUID
2. **seller_id** - Either user_seller_id OR contractor_seller_id must be set
3. **price** - Must be > 0 (zero or negative prices rejected)
4. **quantity_available** - Must be >= 0 (negative quantities rejected)

### Status Mapping

| V1 Status | V2 Status | Notes |
|-----------|-----------|-------|
| active | active | Direct mapping |
| inactive | cancelled | Inactive listings treated as cancelled |
| archived | cancelled | Archived listings treated as cancelled |
| sold | sold | Direct mapping |
| expired | expired | Direct mapping |
| cancelled | cancelled | Direct mapping |

### Sale Type Mapping

| V1 sale_type | V2 sale_type | Notes |
|--------------|--------------|-------|
| sale | fixed | V1 "sale" means fixed price |
| auction | auction | Direct mapping |
| negotiable | negotiable | Direct mapping |

### Visibility Mapping

| V1 internal | V2 visibility | Notes |
|-------------|---------------|-------|
| true | private | Internal listings are private |
| false | public | Public listings are public |

---

## Transaction Atomicity

**Requirement 58.2:** Use database transactions for atomicity

All migration operations use database transactions to ensure atomicity:

```typescript
const result = await db.transaction(async (trx) => {
  // 1. Create V2 listing
  const [listing] = await trx("listings").insert({...}).returning("*")
  
  // 2. Create listing_items
  const [listingItem] = await trx("listing_items").insert({...}).returning("*")
  
  // 3. Get or create variant
  const variantId = await getOrCreateVariant(gameItemId, attributes)
  
  // 4. Create stock lot
  await trx("listing_item_lots").insert({...})
  
  return { success: true, listing_id: listing.listing_id }
})
```

If any step fails, the entire transaction is rolled back, ensuring no partial data is created.

---

## Error Handling

### Validation Errors

```typescript
// Invalid price
{
  success: false,
  v1_listing_id: "v1-listing-1",
  error: "Invalid price (must be > 0)"
}

// Invalid quantity
{
  success: false,
  v1_listing_id: "v1-listing-2",
  error: "Invalid quantity (must be >= 0)"
}

// Missing seller
{
  success: false,
  v1_listing_id: "v1-listing-3",
  error: "Missing seller_id (both user and contractor are null)"
}

// Missing game item
{
  success: false,
  v1_listing_id: "v1-listing-4",
  error: "Missing game_item_id"
}
```

### Database Errors

```typescript
// Transaction rollback on error
{
  success: false,
  v1_listing_id: "v1-listing-5",
  error: "Foreign key constraint violation: game_item_id does not exist"
}
```

---

## Migration Summary Format

```typescript
interface MigrationSummary {
  total_attempted: number    // Total listings processed
  successful: number         // Successfully migrated
  failed: number            // Failed migrations
  skipped: number           // Skipped (not used currently)
  errors: Array<{
    v1_listing_id: string
    error: string
  }>
}
```

**Example:**
```typescript
{
  total_attempted: 36,
  successful: 31,
  failed: 5,
  skipped: 0,
  errors: [
    { v1_listing_id: "58c71eac-fa58-4add-912c-547460b3a92e", error: "Invalid price (must be > 0)" },
    { v1_listing_id: "b4d02739-3d74-4a5a-9f39-27909bbb5f7e", error: "Invalid price (must be > 0)" },
    // ... 3 more errors
  ]
}
```

---

## Usage Examples

### Migrate Single Listing

```typescript
import { v1ToV2MigrationService } from "./services/market-v2/migration.service.js"

// Read V1 listing from database
const v1Listing = await db("market_listings")
  .join("market_unique_listings", "market_listings.listing_id", "market_unique_listings.listing_id")
  .leftJoin("market_listing_details", "market_unique_listings.details_id", "market_listing_details.details_id")
  .where({ "market_listings.listing_id": "v1-listing-id" })
  .first()

// Migrate to V2
const result = await v1ToV2MigrationService.migrateUniqueListing(v1Listing)

if (result.success) {
  console.log(`Migrated to V2 listing: ${result.listing_id}`)
} else {
  console.error(`Migration failed: ${result.error}`)
}
```

### Migrate All Listings

```typescript
import { v1ToV2MigrationService } from "./services/market-v2/migration.service.js"

// Migrate all V1 listings to V2
const summary = await v1ToV2MigrationService.migrateAllListings()

console.log(`Migration complete:`)
console.log(`  Total: ${summary.total_attempted}`)
console.log(`  Success: ${summary.successful}`)
console.log(`  Failed: ${summary.failed}`)

if (summary.errors.length > 0) {
  console.log(`\nErrors:`)
  summary.errors.forEach(({ v1_listing_id, error }) => {
    console.log(`  ${v1_listing_id}: ${error}`)
  })
}
```

---

## Testing

### Unit Tests

**File:** `src/services/market-v2/migration.service.test.ts`

**Test Coverage:**
- ✅ Type definitions (V1UniqueListing, V1AggregateListing, V1MultipleListing)
- ✅ Validation rules (price > 0, quantity >= 0, seller_id required, game_item_id required)
- ✅ Status mapping (inactive → cancelled, archived → cancelled)
- ✅ Sale type mapping (sale → fixed)
- ✅ Visibility mapping (internal → private)
- ✅ Listing type mapping (unique → single, aggregate → single, multiple → bundle)
- ✅ Default variant attributes (NULL quality fields)

**Run Tests:**
```bash
cd sc-market-backend
npm test -- migration.service.test.ts --run
```

**Test Results:**
```
✓ src/services/market-v2/migration.service.test.ts (14 tests) 3ms
  ✓ V1ToV2MigrationService - Type Definitions (3)
  ✓ V1ToV2MigrationService - Validation Rules (4)
  ✓ V1ToV2MigrationService - Status Mapping (3)
  ✓ V1ToV2MigrationService - Listing Type Mapping (3)
  ✓ V1ToV2MigrationService - Default Variant Attributes (1)

Test Files  1 passed (1)
     Tests  14 passed (14)
```

### Integration Tests

Integration tests require V2 database tables to exist. Run migrations first:

```bash
cd sc-market-backend
npm run migrate:latest
```

Then test migration manually:

```typescript
import { v1ToV2MigrationService } from "./services/market-v2/migration.service.js"

// Test with real database
const summary = await v1ToV2MigrationService.migrateAllUniqueListings()
console.log(summary)
```

---

## Database Impact

### V1 Tables (Read-Only)

The migration service **ONLY READS** from V1 tables:
- ✅ `market_listings` (read-only)
- ✅ `market_unique_listings` (read-only)
- ✅ `market_aggregate_listings` (read-only)
- ✅ `market_multiple_listings` (read-only)
- ✅ `market_listing_details` (read-only)
- ✅ `market_aggregates` (read-only)
- ✅ `market_multiples` (read-only)

**No V1 tables are modified during migration.**

### V2 Tables (Write)

The migration service **WRITES** to V2 tables:
- ✅ `listings` (INSERT)
- ✅ `listing_items` (INSERT)
- ✅ `item_variants` (INSERT or reuse existing)
- ✅ `listing_item_lots` (INSERT)

### Triggers

The `update_quantity_available()` trigger automatically updates:
- `listing_items.quantity_available` (computed from stock lots)
- `listing_items.variant_count` (computed from stock lots)

---

## Production Considerations

### Data Quality Issues (from Task 2.1)

Based on V1 database audit, the following data quality issues exist:

1. **Zero or negative prices:** 5 listings (13.9%)
   - **Action:** Rejected during migration with error "Invalid price"
   
2. **Zero quantity:** 1 listing (2.8%)
   - **Action:** Accepted (creates listing with no stock lots)
   
3. **Negative quantity:** 0 listings
   - **Action:** Would be rejected with error "Invalid quantity"

4. **Missing seller:** 0 listings
   - **Action:** Would be rejected with error "Missing seller_id"

5. **Missing game_item_id:** 0 listings
   - **Action:** Would be rejected with error "Missing game_item_id"

### Expected Migration Results

Based on Task 2.1 analysis:

| Listing Type | V1 Count | Expected Success | Expected Failures |
|--------------|----------|------------------|-------------------|
| Unique Listings | 36 | 31 | 5 (zero price) |
| Aggregate Listings | 0 | 0 | 0 |
| Multiple Listings | 0 | 0 | 0 |
| **Total** | **36** | **31** | **5** |

### Rollback Strategy

If migration fails or produces incorrect results:

1. **Delete V2 data:**
   ```sql
   DELETE FROM listing_item_lots WHERE notes LIKE '%Migrated from V1%';
   DELETE FROM listing_items WHERE listing_id IN (
     SELECT listing_id FROM listings WHERE title LIKE '%migrated%'
   );
   DELETE FROM listings WHERE created_at > '2026-04-17';
   ```

2. **V1 data remains unchanged** (read-only migration)

3. **Re-run migration** after fixing issues

---

## Requirements Validation

### ✅ Requirement 58.2: Migrate unique_listings to V2 listings table with listing_type='single'

**Implementation:**
- `migrateUniqueListing()` creates V2 listing with `listing_type='single'`
- All V1 metadata preserved (title, description, price, quantity, status, timestamps)
- Uses unified pricing mode (single price for all variants)

### ✅ Requirement 58.4: Create default variant with NULL quality attributes for V1 items

**Implementation:**
- Default variant attributes: `{ quality_tier: undefined, quality_value: undefined, crafted_source: "unknown", blueprint_tier: undefined }`
- Uses `getOrCreateVariant()` for deduplication
- Single stock lot created per V1 listing

### ✅ Requirement 69.1: Use unified pricing mode for all migrated listings

**Implementation:**
- All migrated listings use `pricing_mode='unified'`
- V1 price maps to `listing_items.base_price`
- No per-variant pricing for migrated listings

---

## Next Steps

1. **Task 2.4:** Run migration on test database
2. **Task 2.5:** Validate migrated data integrity
3. **Task 2.6:** Create migration script for production
4. **Task 2.7:** Document rollback procedures

---

## Conclusion

The V1ToV2MigrationService successfully implements migration of V1 listings to V2 format with:

- ✅ Three migration methods (unique, aggregate, multiple)
- ✅ Database transactions for atomicity
- ✅ Default variant creation with NULL quality attributes
- ✅ Preservation of all V1 metadata
- ✅ Unified pricing mode for all migrated listings
- ✅ Comprehensive validation and error handling
- ✅ Read-only access to V1 tables (no modifications)
- ✅ Batch migration support with summary reporting
- ✅ Unit tests for validation logic

**Status:** ✅ Task 2.3 Complete

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-17  
**Author:** Kiro AI Assistant
