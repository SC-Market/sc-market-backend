# Task 2.5: Validate Migration Completeness - Summary

## Overview

Task 2.5 involves validating that the V1 to V2 migration completed successfully by checking:
1. V1 listing count vs V2 listing count (should match for valid listings)
2. All V1 metadata preserved in V2
3. quantity_available computed correctly by trigger
4. Variant deduplication working (no duplicate variants)
5. No V1 tables modified

**Requirements:** 58.2, 58.3, 58.6

## Validation Tools Created

### 1. TypeScript Validation Script

**File:** `scripts/validate-migration-completeness.ts`

**Usage:**
```bash
cd sc-market-backend
npm run validate:migration
```

**Features:**
- ✅ Automated validation of all 5 sub-tasks
- ✅ Detailed error reporting with examples
- ✅ Pass/fail status for each check
- ✅ Comprehensive summary report
- ✅ Exit code 0 for success, 1 for failure

**Database Connection:**
- Parses `DATABASE_PASS` environment variable (JSON format)
- Connects to PostgreSQL database specified in `.env`
- Handles connection errors gracefully

### 2. SQL Validation Script

**File:** `scripts/validate-migration-completeness.sql`

**Usage:**
```bash
psql -h 192.168.88.6 -U scmarket -d scmarket -f scripts/validate-migration-completeness.sql
```

**Features:**
- ✅ Can be run directly on database without Node.js
- ✅ Validates all 5 sub-tasks using SQL queries
- ✅ Shows detailed results with counts and examples
- ✅ Human-readable output with clear pass/fail indicators

**Use Case:** When database connectivity issues prevent running the TypeScript script, this SQL script can be run directly on the database server.

## Validation Checks

### Check 1: Compare V1 vs V2 Listing Counts

**Requirement:** 58.2 - All V1 listings should be migrated to V2

**Validation Logic:**
```sql
-- Count valid V1 listings (with game_item_id and price > 0)
SELECT COUNT(*) FROM unique_listings
WHERE game_item_id IS NOT NULL AND price > 0;

-- Count V2 listings
SELECT COUNT(*) FROM listings;

-- Expected: V2 count >= V1 valid count
```

**Expected Results:**
- V1 total listings: 36
- V1 valid listings: 29 (36 - 7 invalid)
- V1 invalid listings: 7 (2 missing game_item_id + 5 invalid price)
- V2 listings: ≥ 29
- Migration rate: ≥ 100%

**Pass Criteria:** V2 listing count >= V1 valid listing count

### Check 2: Verify V1 Metadata Preserved in V2

**Requirement:** 58.3 - All V1 metadata should be preserved in V2 format

**Validation Logic:**
- Compare V1 and V2 data for migrated listings
- Check title, description, price, game_item_id preservation
- Verify status mapping (inactive/archived → cancelled)
- Verify sale_type mapping (sale → fixed)
- Verify visibility mapping (internal → unlisted)

**Fields Checked:**
1. **title**: Should match exactly
2. **description**: Should match exactly
3. **price**: V1.price should equal V2.base_price
4. **game_item_id**: Should match exactly
5. **status**: V1 inactive/archived → V2 cancelled, others unchanged
6. **sale_type**: V1 sale → V2 fixed, others unchanged
7. **visibility**: V1 internal=true → V2 unlisted, internal=false → V2 public

**Pass Criteria:** 0 metadata mismatches

### Check 3: Validate quantity_available Computed by Trigger

**Requirement:** 58.6 - Trigger should correctly compute quantity_available

**Validation Logic:**
```sql
-- Check that quantity_available matches sum of listed stock lots
SELECT 
  li.quantity_available,
  COALESCE(SUM(lot.quantity_total), 0) as computed_quantity
FROM listing_items li
LEFT JOIN listing_item_lots lot ON lot.item_id = li.item_id AND lot.listed = true
GROUP BY li.item_id, li.quantity_available
HAVING li.quantity_available != COALESCE(SUM(lot.quantity_total), 0);
```

**Trigger Function:** `update_quantity_available()`
- Automatically updates `listing_items.quantity_available`
- Automatically updates `listing_items.variant_count`
- Triggered on INSERT, UPDATE, DELETE of `listing_item_lots`

**Pass Criteria:** 0 quantity mismatches

### Check 4: Validate Variant Deduplication

**Requirement:** 58.6 - Variants should be deduplicated by attributes_hash

**Validation Logic:**
```sql
-- Check for duplicate variants (same game_item_id and attributes_hash)
SELECT 
  game_item_id,
  attributes_hash,
  COUNT(*) as duplicate_count
FROM item_variants
GROUP BY game_item_id, attributes_hash
HAVING COUNT(*) > 1;
```

**Deduplication Logic:**
1. Normalize variant attributes (sort keys alphabetically)
2. Generate SHA-256 hash of normalized attributes
3. Use unique constraint on (game_item_id, attributes_hash)
4. Get-or-create pattern reuses existing variants

**Pass Criteria:** 0 duplicate variants

### Check 5: Confirm V1 Tables Unchanged

**Requirement:** 58.5 - V1 tables should remain unchanged (read-only)

**Validation Logic:**
```sql
-- Verify V1 table row counts match expected values
SELECT COUNT(*) FROM unique_listings;      -- Expected: 36
SELECT COUNT(*) FROM aggregate_listings;   -- Expected: 0
SELECT COUNT(*) FROM multiple_listings;    -- Expected: 0
```

**Expected Counts (from task 2.4):**
- unique_listings: 36
- aggregate_listings: 0
- multiple_listings: 0

**Pass Criteria:** All V1 table counts match expected values

## Current Status

### Database Connectivity Issue

**Issue:** Database connection timeout to 192.168.88.6:5432

**Error:**
```
connect ETIMEDOUT 192.168.88.6:5432
```

**Impact:** Cannot run validation scripts until database connectivity is restored

**Same Issue as Task 2.4:** This is the same connectivity issue that prevented completing the migration of the remaining 21 listings in task 2.4.

### Validation Script Status

✅ **TypeScript validation script created** (`validate-migration-completeness.ts`)
- Implements all 5 validation checks
- Parses DATABASE_PASS JSON correctly
- Provides detailed error reporting
- Returns appropriate exit codes

✅ **SQL validation script created** (`validate-migration-completeness.sql`)
- Can be run directly on database
- Validates all 5 sub-tasks
- Human-readable output

✅ **npm script added** (`npm run validate:migration`)
- Easy command-line execution
- Integrated into package.json

⏳ **Validation execution pending** - Awaiting database connectivity

## Expected Validation Results

Based on task 2.4 migration results, we expect:

### Successful Checks (Likely to Pass)

1. ✅ **Check 3: quantity_available** - Trigger was tested and working in task 1.5
2. ✅ **Check 4: Variant deduplication** - Deduplication logic was fixed in task 2.4
3. ✅ **Check 5: V1 tables unchanged** - Verified in task 2.4 (36 unique listings remain)

### Checks Requiring Database Access

1. ⏳ **Check 1: Listing counts** - Need to verify 15 migrated listings (or more if migration completed)
2. ⏳ **Check 2: Metadata preservation** - Need to verify V1 data preserved in V2 format

### Known Issues from Task 2.4

From the task 2.4 summary:
- ✅ 15/36 listings migrated successfully (42%)
- ⏳ 14/36 listings pending (39% - awaiting database connectivity)
- ❌ 7/36 listings invalid (19% - data quality issues)

**Expected Check 1 Results:**
- If only 15 listings migrated: 15/29 valid listings = 52% migration rate
- If all 29 valid listings migrated: 29/29 valid listings = 100% migration rate

## Next Steps

### 1. Restore Database Connectivity

**Action Required:** Resolve network connectivity to 192.168.88.6:5432

**Options:**
- Check if database server is running
- Verify firewall rules allow connections
- Check VPN/network configuration
- Verify database credentials

### 2. Run Validation Scripts

Once connectivity is restored:

**Option A: TypeScript Script (Recommended)**
```bash
cd sc-market-backend
npm run validate:migration
```

**Option B: SQL Script (Direct Database Access)**
```bash
psql -h 192.168.88.6 -U scmarket -d scmarket -f scripts/validate-migration-completeness.sql
```

### 3. Review Validation Results

**If All Checks Pass:**
- ✅ Task 2.5 complete
- ✅ Migration validated successfully
- ✅ Proceed to task 2.6 (Write migration validation tests)

**If Any Checks Fail:**
- Review failure details
- Fix identified issues
- Re-run migration if necessary
- Re-run validation

### 4. Address Remaining Migration Work

If validation shows only 15 listings migrated:
- Re-run migration script: `npm run migrate:v1-to-v2`
- Expected: 14 more listings should migrate (if connectivity restored)
- Invalid listings (7) will continue to fail (data quality issues)

## Requirements Validation

### Requirement 58.2: Migrate All V1 Listings
✅ **Validation Check 1** - Compares V1 vs V2 listing counts
- Ensures all valid V1 listings migrated to V2
- Accounts for invalid V1 data (missing game_item_id, invalid price)

### Requirement 58.3: Preserve V1 Metadata
✅ **Validation Check 2** - Verifies metadata preservation
- Checks title, description, price, game_item_id
- Validates status, sale_type, visibility mappings
- Samples 10 migrated listings for detailed comparison

### Requirement 58.6: Correct Trigger Computation
✅ **Validation Check 3** - Validates quantity_available
- Ensures trigger correctly computes quantity_available
- Ensures trigger correctly computes variant_count
- Checks all listing_items records

✅ **Validation Check 4** - Validates variant deduplication
- Ensures no duplicate variants exist
- Verifies unique constraint on (game_item_id, attributes_hash)

### Requirement 58.5: V1 Tables Unchanged
✅ **Validation Check 5** - Confirms V1 tables unchanged
- Verifies row counts match expected values
- Ensures read-only access to V1 tables

## Conclusion

Task 2.5 validation infrastructure is **complete and ready to execute**:

✅ **TypeScript validation script** - Comprehensive automated validation
✅ **SQL validation script** - Direct database validation option
✅ **npm script integration** - Easy command-line execution
✅ **All 5 sub-tasks implemented** - Complete validation coverage
✅ **Requirements mapped** - All requirements 58.2, 58.3, 58.6 validated

⏳ **Execution pending** - Awaiting database connectivity restoration

Once database connectivity is restored, run `npm run validate:migration` to complete task 2.5.

## Files Created

1. **`scripts/validate-migration-completeness.ts`** - TypeScript validation script
2. **`scripts/validate-migration-completeness.sql`** - SQL validation script
3. **`docs/task-2.5-validation-summary.md`** - This summary document
4. **`package.json`** - Added `validate:migration` npm script

## Usage Examples

### Run TypeScript Validation
```bash
cd sc-market-backend
npm run validate:migration
```

### Run SQL Validation
```bash
# From database server
psql -U scmarket -d scmarket -f /path/to/validate-migration-completeness.sql

# From remote machine
psql -h 192.168.88.6 -U scmarket -d scmarket -f scripts/validate-migration-completeness.sql
```

### Expected Output (Success)
```
================================================================================
Task 2.5: Migration Completeness Validation
================================================================================

Check 1: Comparing V1 vs V2 listing counts...
   V1 total listings: 36
   V1 valid listings: 29
   V1 invalid listings: 7
   V2 listings: 29
   Migration rate: 100.0%

Check 2: Verifying V1 metadata preserved in V2...
   Checked 10 migrated listings
   Found 0 metadata mismatches

Check 3: Validating quantity_available computed by trigger...
   Checked all listing_items records
   Found 0 quantity mismatches

Check 4: Validating variant deduplication...
   Total variants: 29
   Duplicate variants: 0

Check 5: Confirming V1 tables remain unchanged...
   unique_listings: 36 (expected: 36)
   aggregate_listings: 0 (expected: 0)
   multiple_listings: 0 (expected: 0)

================================================================================
VALIDATION SUMMARY
================================================================================

✅ Check 1: All valid V1 listings migrated (29/29)
✅ Check 2: All V1 metadata preserved in V2 (checked 10 listings)
✅ Check 3: All quantity_available values computed correctly by trigger
✅ Check 4: Variant deduplication working correctly (29 unique variants)
✅ Check 5: V1 tables remain unchanged (read-only access verified)

Total: 5 passed, 0 failed

✅ VALIDATION PASSED - Migration completed successfully
```

### Expected Output (Partial Migration)
```
================================================================================
VALIDATION SUMMARY
================================================================================

❌ Check 1: Not all valid V1 listings migrated (15/29)
✅ Check 2: All V1 metadata preserved in V2 (checked 10 listings)
✅ Check 3: All quantity_available values computed correctly by trigger
✅ Check 4: Variant deduplication working correctly (15 unique variants)
✅ Check 5: V1 tables remain unchanged (read-only access verified)

Total: 4 passed, 1 failed

❌ VALIDATION FAILED - Migration has issues that need to be addressed
```

## Troubleshooting

### Database Connection Timeout

**Symptom:** `connect ETIMEDOUT 192.168.88.6:5432`

**Solutions:**
1. Check database server is running: `systemctl status postgresql`
2. Check firewall allows connections: `sudo ufw status`
3. Check PostgreSQL allows remote connections: `pg_hba.conf`
4. Verify network connectivity: `ping 192.168.88.6`
5. Check VPN/network configuration

### Invalid DATABASE_PASS Format

**Symptom:** `Failed to parse DATABASE_PASS`

**Solution:** Ensure `.env` has correct JSON format:
```
DATABASE_PASS={"username":"scmarket","password":"scmarket","dbname":"scmarket","port":5432,"host":"192.168.88.6"}
```

### Permission Denied

**Symptom:** `permission denied for table unique_listings`

**Solution:** Ensure database user has SELECT permissions on V1 tables:
```sql
GRANT SELECT ON unique_listings, aggregate_listings, multiple_listings TO scmarket;
```
