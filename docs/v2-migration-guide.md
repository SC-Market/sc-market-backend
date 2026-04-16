# Market V2 Migration Guide

**Version**: 2.0.0  
**Target Audience**: System Administrators, DevOps Engineers  
**Estimated Duration**: 2-4 hours (including verification)

---

## Overview

This guide provides step-by-step instructions for migrating from Market V1 to Market V2. The migration is **non-destructive** - V1 data remains unchanged and V1 continues operating normally during and after migration.

### Migration Strategy

- **Parallel Systems**: V2 runs alongside V1 without interference
- **Read-Only V1 Access**: Migration reads V1 data but never modifies it
- **Feature Flag Control**: Users can switch between V1 and V2 experiences
- **Incremental Rollout**: Enable V2 for beta users first, then gradually expand
- **Easy Rollback**: Switch feature flag back to V1 if issues arise

---

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Migration Steps](#migration-steps)
3. [Post-Migration Verification](#post-migration-verification)
4. [Rollback Procedures](#rollback-procedures)
5. [Common Issues and Solutions](#common-issues-and-solutions)
6. [Beta Rollout](#beta-rollout)
7. [Full Rollout](#full-rollout)

---

## Pre-Migration Checklist

### 1. Environment Verification

**✅ Database Version**
```bash
psql -c "SELECT version();"
# Required: PostgreSQL 12 or higher
```

**✅ Database Extensions**
```bash
psql -c "SELECT * FROM pg_extension WHERE extname = 'pgcrypto';"
# Should return pgcrypto extension (or will be created during migration)
```

**✅ Disk Space**
```bash
df -h /var/lib/postgresql
# Ensure at least 10GB free space for V2 tables
```

**✅ Database Backup**
```bash
# Create full backup before migration
pg_dump -Fc sc_market > sc_market_backup_$(date +%Y%m%d_%H%M%S).dump

# Verify backup
pg_restore --list sc_market_backup_*.dump | head -20
```

### 2. Application Verification

**✅ Node.js Version**
```bash
node --version
# Required: Node.js 18 or higher
```

**✅ Dependencies Installed**
```bash
cd sc-market-backend
npm install
```

**✅ Environment Variables**
```bash
# Verify database connection
cat .env | grep DATABASE_URL
# Should point to correct database
```

**✅ Migration System**
```bash
# Check migration status
npm run migrate:status
# Should show all V1 migrations applied
```

### 3. V1 System Health

**✅ V1 API Operational**
```bash
curl http://localhost:3000/api/v1/health
# Should return 200 OK
```

**✅ V1 Listings Count**
```sql
SELECT 
  (SELECT COUNT(*) FROM unique_listings WHERE status = 'active') as unique_count,
  (SELECT COUNT(*) FROM aggregate_listings WHERE status = 'active') as aggregate_count,
  (SELECT COUNT(*) FROM multiple_listings WHERE status = 'active') as multiple_count;
```

**✅ V1 Data Integrity**
```sql
-- Check for orphaned records
SELECT COUNT(*) FROM market_listing_details mld
LEFT JOIN unique_listings ul ON mld.listing_id = ul.listing_id
LEFT JOIN aggregate_listings al ON mld.listing_id = al.listing_id
LEFT JOIN multiple_listings ml ON mld.listing_id = ml.listing_id
WHERE ul.listing_id IS NULL 
  AND al.listing_id IS NULL 
  AND ml.listing_id IS NULL;
-- Should return 0
```

### 4. Monitoring Setup

**✅ Enable Query Logging** (optional but recommended)
```sql
-- Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 50; -- Log queries >50ms
SELECT pg_reload_conf();
```

**✅ Monitoring Dashboard** (if available)
- Grafana dashboard configured
- Database metrics visible
- API metrics visible

---

## Migration Steps

### Step 1: Apply V2 Schema Migrations

**Duration**: 2-5 minutes

```bash
cd sc-market-backend

# Check pending migrations
npm run migrate:status

# Apply all V2 migrations
npm run migrate:latest
```

**Expected Output**:
```
Batch 1 run: 6 migrations
20260416014900_market_v2_core_tables.ts
20260416014954_market_v2_quantity_triggers.ts
20260416015014_market_v2_indexes.ts
20260416015032_market_v2_search_view.ts
20260416015059_market_v2_search_indexes.ts
20260416030903_market_v2_feature_flags.ts
```

**Verification**:
```sql
-- Verify V2 tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('listings', 'listing_items', 'item_variants', 
                     'listing_item_lots', 'variant_pricing', 'variant_types')
ORDER BY table_name;
-- Should return all 6 tables

-- Verify variant_types seeded
SELECT name, display_name FROM variant_types ORDER BY display_order;
-- Should return: quality_tier, quality_value, crafted_source, blueprint_tier

-- Verify trigger created
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_listing_item_lots_quantity';
-- Should return trigger name

-- Verify view created
SELECT viewname FROM pg_views WHERE viewname = 'listing_search';
-- Should return 'listing_search'
```

**⚠️ If Migration Fails**:
```bash
# Check error message
npm run migrate:status

# Rollback if needed
npm run migrate:rollback

# Fix issue and retry
npm run migrate:latest
```

---

### Step 2: Run Data Migration Service

**Duration**: 5-30 minutes (depends on V1 data volume)

**⚠️ IMPORTANT**: This step populates V2 tables from V1 data. It does NOT modify V1 tables.

```bash
# Option 1: Run migration via API endpoint (recommended)
curl -X POST http://localhost:3000/api/v2/migration/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Option 2: Run migration via CLI script (if available)
npm run migrate:data
```

**Expected Output**:
```json
{
  "status": "success",
  "report": {
    "listings_migrated": 150,
    "variants_created": 45,
    "stock_lots_migrated": 320,
    "errors": []
  },
  "duration_ms": 12450
}
```

**Migration Process**:

1. **Migrate Listings** (unique_listings, aggregate_listings, multiple_listings → listings)
   - Preserves all metadata (title, description, seller, timestamps)
   - Maps listing types: unique→single, aggregate→bulk, multiple→bundle

2. **Create Default Variants** (for items without quality data)
   - Creates default variant: quality_tier=1, quality_value=25, crafted_source='store'
   - Skips if variant already exists

3. **Migrate Stock Lots** (V1 inventory → listing_item_lots)
   - Links to listing_items and variants
   - Preserves location and ownership data

4. **Compute Quantities** (trigger automatically updates quantity_available)
   - Trigger fires on stock lot insertion
   - No manual computation needed

**Monitoring Progress**:
```sql
-- Check migration progress (run in separate terminal)
SELECT 
  (SELECT COUNT(*) FROM listings) as v2_listings,
  (SELECT COUNT(*) FROM item_variants) as v2_variants,
  (SELECT COUNT(*) FROM listing_item_lots) as v2_lots;
```

**⚠️ If Migration Fails**:

Check error details:
```json
{
  "status": "error",
  "report": {
    "listings_migrated": 120,
    "variants_created": 35,
    "stock_lots_migrated": 0,
    "errors": [
      "Foreign key violation: game_item_id 'abc-123' not found"
    ]
  }
}
```

Common issues:
- **Foreign key violations**: V1 data references non-existent game items
- **Constraint violations**: Invalid data in V1 (e.g., negative quantities)
- **Timeout**: Large datasets may need batch processing

See [Common Issues](#common-issues-and-solutions) section for solutions.

---

### Step 3: Verify V1 Data Unchanged

**Duration**: 2-5 minutes

**✅ V1 Table Counts**
```sql
-- Compare V1 counts before and after migration
SELECT 
  (SELECT COUNT(*) FROM unique_listings) as unique_count,
  (SELECT COUNT(*) FROM aggregate_listings) as aggregate_count,
  (SELECT COUNT(*) FROM multiple_listings) as multiple_count,
  (SELECT COUNT(*) FROM market_listing_details) as details_count;
-- Should match pre-migration counts
```

**✅ V1 Data Integrity**
```sql
-- Verify no modifications to V1 data
SELECT MAX(updated_at) FROM unique_listings;
SELECT MAX(updated_at) FROM aggregate_listings;
SELECT MAX(updated_at) FROM multiple_listings;
-- Timestamps should be before migration start time
```

**✅ V1 API Still Works**
```bash
# Test V1 search
curl http://localhost:3000/api/v1/listings/search?page=1

# Test V1 listing detail
curl http://localhost:3000/api/v1/listings/{listing_id}
```

---

### Step 4: Verify V2 Data Completeness

**Duration**: 5-10 minutes

**✅ Listing Count Match**
```sql
-- V1 total listings
SELECT 
  (SELECT COUNT(*) FROM unique_listings WHERE status = 'active') +
  (SELECT COUNT(*) FROM aggregate_listings WHERE status = 'active') +
  (SELECT COUNT(*) FROM multiple_listings WHERE status = 'active') as v1_total;

-- V2 total listings
SELECT COUNT(*) FROM listings WHERE status = 'active' as v2_total;

-- Should match
```

**✅ Metadata Preservation**
```sql
-- Sample V1 listing
SELECT listing_id, title, description, status, timestamp 
FROM unique_listings 
LIMIT 1;

-- Corresponding V2 listing
SELECT listing_id, title, description, status, created_at 
FROM listings 
WHERE listing_id = 'LISTING_ID_FROM_ABOVE';

-- Title, description, status should match
-- created_at should equal timestamp
```

**✅ Quantity Computation**
```sql
-- Verify quantity_available computed correctly
SELECT 
  li.item_id,
  li.quantity_available,
  (SELECT SUM(quantity_total) FROM listing_item_lots 
   WHERE item_id = li.item_id AND listed = true) as computed_quantity
FROM listing_items li
LIMIT 10;

-- quantity_available should equal computed_quantity
```

**✅ Variant Deduplication**
```sql
-- Check for duplicate variants (should be 0)
SELECT game_item_id, attributes_hash, COUNT(*) 
FROM item_variants 
GROUP BY game_item_id, attributes_hash 
HAVING COUNT(*) > 1;
-- Should return no rows
```

---

### Step 5: Test V2 API Endpoints

**Duration**: 5-10 minutes

**✅ Health Check**
```bash
curl http://localhost:3000/api/v2/health
# Expected: {"status":"ok","version":"2.0.0","timestamp":"..."}
```

**✅ Variant Types**
```bash
curl http://localhost:3000/api/v2/variant-types
# Expected: {"variant_types":[...]} with 4 types
```

**✅ Search Listings**
```bash
# Basic search
curl "http://localhost:3000/api/v2/listings/search?page=1&page_size=10"

# Search with filters
curl "http://localhost:3000/api/v2/listings/search?quality_tier_min=3&price_max=100000"

# Full-text search
curl "http://localhost:3000/api/v2/listings/search?text=weapon"
```

**✅ Listing Detail**
```bash
# Get first listing ID
LISTING_ID=$(curl -s "http://localhost:3000/api/v2/listings/search?page=1&page_size=1" | jq -r '.listings[0].listing_id')

# Get listing detail
curl "http://localhost:3000/api/v2/listings/$LISTING_ID"
# Expected: Full listing with variants array
```

**✅ Create Listing**
```bash
curl -X POST http://localhost:3000/api/v2/listings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test Listing",
    "description": "Migration test",
    "game_item_id": "VALID_GAME_ITEM_ID",
    "pricing_mode": "unified",
    "base_price": 50000,
    "lots": [
      {
        "quantity": 10,
        "variant_attributes": {
          "quality_tier": 3,
          "quality_value": 75,
          "crafted_source": "crafted"
        }
      }
    ]
  }'
# Expected: 200 OK with created listing
```

---

### Step 6: Performance Verification

**Duration**: 5-10 minutes

**✅ Search Performance**
```sql
-- Enable timing
\timing on

-- Test search query performance
EXPLAIN ANALYZE
SELECT * FROM listing_search
WHERE search_vector @@ to_tsquery('english', 'weapon')
  AND quality_tier_min >= 3
ORDER BY created_at DESC
LIMIT 20;

-- Execution time should be <50ms
-- Should use GIN index on search_vector
```

**✅ Index Usage**
```sql
-- Verify indexes are being used
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM listing_search
WHERE game_item_id = 'SOME_GAME_ITEM_ID'
  AND quality_tier_min >= 4;

-- Should show "Index Scan" or "Bitmap Index Scan"
-- Should NOT show "Seq Scan" on large tables
```

**✅ Trigger Performance**
```sql
-- Test trigger performance
EXPLAIN ANALYZE
INSERT INTO listing_item_lots (item_id, variant_id, quantity_total, listed)
VALUES ('VALID_ITEM_ID', 'VALID_VARIANT_ID', 5, true);

-- Trigger execution should be <10ms
```

---

## Post-Migration Verification

### Verification Checklist

- [ ] All V2 migrations applied successfully
- [ ] V1 data unchanged (counts and timestamps match)
- [ ] V2 listing count matches V1 listing count
- [ ] Metadata preserved (titles, descriptions, sellers)
- [ ] Quantity computation accurate
- [ ] No duplicate variants
- [ ] V1 API still operational
- [ ] V2 API endpoints responding
- [ ] Search performance <50ms
- [ ] Indexes being used
- [ ] Trigger functioning correctly

### Automated Verification Script

```bash
# Run verification script (if available)
npm run verify:migration

# Or run manual SQL verification
psql -f scripts/verify_migration.sql
```

---

## Rollback Procedures

### Scenario 1: Schema Migration Failed

**Symptoms**: Migration command failed, V2 tables not created

**Solution**:
```bash
# Check migration status
npm run migrate:status

# Rollback failed migration
npm run migrate:rollback

# Fix issue (check error message)
# Retry migration
npm run migrate:latest
```

**Impact**: None - V1 unaffected

---

### Scenario 2: Data Migration Failed

**Symptoms**: Migration service returned errors, V2 data incomplete

**Solution**:
```bash
# Clear V2 data
psql -c "TRUNCATE listings, listing_items, item_variants, listing_item_lots, variant_pricing CASCADE;"

# Fix data issues in V1 (if needed)
# Retry data migration
curl -X POST http://localhost:3000/api/v2/migration/run
```

**Impact**: None - V1 unaffected, V2 data cleared and re-migrated

---

### Scenario 3: V2 Performance Issues

**Symptoms**: Search queries >50ms, high database load

**Solution**:
```sql
-- Rebuild indexes
REINDEX TABLE listings;
REINDEX TABLE listing_items;
REINDEX TABLE item_variants;

-- Analyze tables for query planner
ANALYZE listings;
ANALYZE listing_items;
ANALYZE listing_search;

-- Check for missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename IN ('listings', 'listing_items', 'listing_item_lots')
ORDER BY tablename, attname;
```

**Impact**: Temporary performance degradation during reindex

---

### Scenario 4: V2 API Errors

**Symptoms**: V2 endpoints returning 500 errors

**Solution**:
```bash
# Check application logs
tail -f logs/app.log

# Check database logs
tail -f /var/log/postgresql/postgresql-*.log

# Restart application
pm2 restart sc-market-backend

# If persistent, switch users back to V1
psql -c "UPDATE user_preferences SET market_version = 'V1';"
```

**Impact**: Users switched back to V1, V2 disabled

---

### Scenario 5: Complete Rollback to V1

**Symptoms**: Critical V2 issues, need to disable V2 completely

**Solution**:
```bash
# 1. Switch all users to V1
psql -c "UPDATE user_preferences SET market_version = 'V1';"

# 2. Disable V2 API endpoints (optional)
# Edit src/server.ts to comment out V2 routes
# Restart application

# 3. Drop V2 tables (optional, only if abandoning V2)
npm run migrate:rollback --all

# 4. Restore from backup (if V1 data corrupted)
pg_restore -d sc_market sc_market_backup_*.dump
```

**Impact**: V2 completely disabled, V1 fully operational

---

## Common Issues and Solutions

### Issue 1: Foreign Key Violation During Migration

**Error**:
```
Foreign key violation: game_item_id 'abc-123' not found in game_items table
```

**Cause**: V1 listing references non-existent game item

**Solution**:
```sql
-- Find orphaned listings
SELECT l.listing_id, l.title, mld.game_item_id
FROM unique_listings l
JOIN market_listing_details mld ON l.listing_id = mld.listing_id
LEFT JOIN game_items gi ON mld.game_item_id = gi.id
WHERE gi.id IS NULL;

-- Option 1: Fix V1 data (update to valid game_item_id)
UPDATE market_listing_details 
SET game_item_id = 'VALID_GAME_ITEM_ID'
WHERE game_item_id = 'abc-123';

-- Option 2: Skip orphaned listings in migration
-- (modify migration service to skip invalid references)
```

---

### Issue 2: Duplicate Variant Hash Collision

**Error**:
```
Unique constraint violation: duplicate key value violates unique constraint "uq_item_variants_game_item_hash"
```

**Cause**: Two variants with identical attributes but different display names

**Solution**:
```sql
-- Find duplicate variants
SELECT game_item_id, attributes, COUNT(*)
FROM item_variants
GROUP BY game_item_id, attributes
HAVING COUNT(*) > 1;

-- Merge duplicates (keep first, update references)
-- This is handled automatically by migration service
-- If manual fix needed:
UPDATE listing_item_lots
SET variant_id = 'KEEP_THIS_VARIANT_ID'
WHERE variant_id = 'DUPLICATE_VARIANT_ID';

DELETE FROM item_variants WHERE variant_id = 'DUPLICATE_VARIANT_ID';
```

---

### Issue 3: Quantity Mismatch

**Error**:
```
Verification failed: quantity_available does not match computed quantity
```

**Cause**: Trigger not firing or incorrect trigger logic

**Solution**:
```sql
-- Manually recompute quantities
UPDATE listing_items li
SET quantity_available = (
  SELECT COALESCE(SUM(quantity_total), 0)
  FROM listing_item_lots
  WHERE item_id = li.item_id AND listed = true
),
variant_count = (
  SELECT COUNT(DISTINCT variant_id)
  FROM listing_item_lots
  WHERE item_id = li.item_id AND listed = true
);

-- Verify trigger exists
SELECT tgname, tgenabled FROM pg_trigger 
WHERE tgname = 'trg_listing_item_lots_quantity';

-- Re-create trigger if missing
\i migrations/20260416014954_market_v2_quantity_triggers.ts
```

---

### Issue 4: Slow Search Queries

**Error**:
```
Search queries taking >100ms
```

**Cause**: Missing indexes or outdated statistics

**Solution**:
```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT * FROM listing_search
WHERE search_vector @@ to_tsquery('english', 'weapon');

-- If "Seq Scan" appears, rebuild indexes
REINDEX INDEX idx_listings_search_vector;
REINDEX INDEX idx_game_items_search_vector;

-- Update statistics
ANALYZE listings;
ANALYZE game_items;
ANALYZE listing_search;

-- Increase work_mem for complex queries (session-level)
SET work_mem = '64MB';
```

---

### Issue 5: Migration Timeout

**Error**:
```
Migration timed out after 30 minutes
```

**Cause**: Large V1 dataset (>1000 listings)

**Solution**:
```bash
# Option 1: Increase timeout
export MIGRATION_TIMEOUT=3600000  # 1 hour
npm run migrate:data

# Option 2: Batch migration (if supported)
curl -X POST http://localhost:3000/api/v2/migration/run \
  -d '{"batch_size": 100, "batch_delay_ms": 1000}'

# Option 3: Manual batch migration
psql -c "SELECT migrate_batch(0, 100);"    # Listings 0-100
psql -c "SELECT migrate_batch(100, 200);"  # Listings 100-200
# ... continue until complete
```

---

## Beta Rollout

### Phase 1: Developer Testing (Week 1)

**Goal**: Verify V2 functionality with internal developers

**Steps**:
1. Enable V2 for developer accounts:
```sql
UPDATE user_preferences
SET market_version = 'V2'
WHERE user_id IN (SELECT user_id FROM accounts WHERE is_developer = true);
```

2. Monitor error rates:
```sql
SELECT COUNT(*) as error_count, error_code
FROM api_logs
WHERE endpoint LIKE '/api/v2/%'
  AND status_code >= 400
  AND timestamp > NOW() - INTERVAL '1 day'
GROUP BY error_code;
```

3. Collect feedback via internal channels

**Success Criteria**:
- Error rate <0.1%
- Search performance <50ms (p95)
- No critical bugs reported

---

### Phase 2: Beta User Group (Week 2-3)

**Goal**: Test V2 with early adopters

**Steps**:
1. Identify beta users (volunteers, power users)

2. Enable V2 for beta group:
```sql
UPDATE user_preferences
SET market_version = 'V2'
WHERE user_id IN (SELECT user_id FROM beta_users);
```

3. Monitor metrics:
   - Error rate by endpoint
   - Search latency (p50, p95, p99)
   - Listing creation success rate
   - User satisfaction (surveys)

4. Collect feedback via:
   - In-app feedback form
   - Support tickets
   - User surveys

**Success Criteria**:
- Error rate <0.5%
- User satisfaction >80%
- No data loss or corruption
- Performance targets met

---

### Phase 3: Gradual Rollout (Week 4-6)

**Goal**: Incrementally enable V2 for all users

**Steps**:
1. **10% Rollout** (Week 4):
```sql
UPDATE user_preferences
SET market_version = 'V2'
WHERE user_id IN (
  SELECT user_id FROM accounts
  WHERE MOD(CAST(user_id AS INTEGER), 10) = 0
);
```

2. **25% Rollout** (Week 5):
```sql
UPDATE user_preferences
SET market_version = 'V2'
WHERE user_id IN (
  SELECT user_id FROM accounts
  WHERE MOD(CAST(user_id AS INTEGER), 4) = 0
);
```

3. **50% Rollout** (Week 5):
```sql
UPDATE user_preferences
SET market_version = 'V2'
WHERE user_id IN (
  SELECT user_id FROM accounts
  WHERE MOD(CAST(user_id AS INTEGER), 2) = 0
);
```

4. **100% Rollout** (Week 6):
```sql
UPDATE user_preferences
SET market_version = 'V2';
```

**Monitoring at Each Stage**:
- Pause rollout if error rate >1%
- Pause rollout if search latency >100ms (p95)
- Rollback if critical bugs discovered

---

## Full Rollout

### Final Verification

Before 100% rollout:

- [ ] Beta testing completed successfully
- [ ] All critical bugs fixed
- [ ] Performance targets met consistently
- [ ] User feedback positive (>80% satisfaction)
- [ ] Rollback procedures tested
- [ ] Monitoring dashboards configured
- [ ] Support team trained on V2 features

### Rollout Execution

```sql
-- Enable V2 for all users
UPDATE user_preferences SET market_version = 'V2';

-- Verify rollout
SELECT market_version, COUNT(*) 
FROM user_preferences 
GROUP BY market_version;
-- Should show majority on V2
```

### Post-Rollout Monitoring

**First 24 Hours**:
- Monitor error rates every hour
- Check search performance every 15 minutes
- Review support tickets for V2 issues
- Be ready to rollback if needed

**First Week**:
- Daily performance reports
- User satisfaction surveys
- Bug triage and fixes
- Optimize slow queries

**First Month**:
- Weekly performance reviews
- Feature usage analytics
- Plan V1 deprecation timeline

---

## V1 Deprecation (Future)

**Timeline**: 3-6 months after successful V2 rollout

**Steps**:
1. Announce V1 deprecation (3 months notice)
2. Disable V1 API endpoints (read-only mode)
3. Archive V1 tables (backup and drop)
4. Remove V1 code from codebase

**Not Covered in This Guide** - Will be documented separately when ready.

---

## Support

For migration issues:
- **Documentation**: [Troubleshooting Guide](./v2-troubleshooting-guide.md)
- **Database Issues**: [Database Schema Documentation](./v2-database-schema.md)
- **API Issues**: [API Documentation](./v2-api-documentation.md)
- **Emergency Rollback**: See [Rollback Procedures](#rollback-procedures) above

---

## Appendix: Migration Verification SQL

```sql
-- Save as scripts/verify_migration.sql

-- 1. Verify V2 tables exist
SELECT 'V2 Tables' as check_name,
  CASE WHEN COUNT(*) = 6 THEN 'PASS' ELSE 'FAIL' END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('listings', 'listing_items', 'item_variants', 
                     'listing_item_lots', 'variant_pricing', 'variant_types');

-- 2. Verify listing count match
SELECT 'Listing Count Match' as check_name,
  CASE 
    WHEN v1_count = v2_count THEN 'PASS' 
    ELSE 'FAIL: V1=' || v1_count || ' V2=' || v2_count 
  END as status
FROM (
  SELECT 
    (SELECT COUNT(*) FROM unique_listings WHERE status = 'active') +
    (SELECT COUNT(*) FROM aggregate_listings WHERE status = 'active') +
    (SELECT COUNT(*) FROM multiple_listings WHERE status = 'active') as v1_count,
    (SELECT COUNT(*) FROM listings WHERE status = 'active') as v2_count
) counts;

-- 3. Verify quantity computation
SELECT 'Quantity Computation' as check_name,
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS' 
    ELSE 'FAIL: ' || COUNT(*) || ' mismatches' 
  END as status
FROM listing_items li
WHERE li.quantity_available != (
  SELECT COALESCE(SUM(quantity_total), 0)
  FROM listing_item_lots
  WHERE item_id = li.item_id AND listed = true
);

-- 4. Verify no duplicate variants
SELECT 'No Duplicate Variants' as check_name,
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS' 
    ELSE 'FAIL: ' || COUNT(*) || ' duplicates' 
  END as status
FROM (
  SELECT game_item_id, attributes_hash, COUNT(*) as dup_count
  FROM item_variants
  GROUP BY game_item_id, attributes_hash
  HAVING COUNT(*) > 1
) dups;

-- 5. Verify trigger exists
SELECT 'Trigger Exists' as check_name,
  CASE 
    WHEN COUNT(*) = 1 THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
FROM pg_trigger
WHERE tgname = 'trg_listing_item_lots_quantity';

-- 6. Verify view exists
SELECT 'View Exists' as check_name,
  CASE 
    WHEN COUNT(*) = 1 THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
FROM pg_views
WHERE viewname = 'listing_search';
```

Run with:
```bash
psql -f scripts/verify_migration.sql
```
