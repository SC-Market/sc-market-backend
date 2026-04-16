# Market V2 Troubleshooting Guide

**Version**: 2.0.0  
**Target Audience**: Developers, System Administrators, Support Engineers

---

## Overview

This guide provides solutions for common issues encountered with the Market V2 system, including performance problems, API errors, database issues, and feature flag troubleshooting.

---

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Performance Issues](#performance-issues)
3. [API Errors](#api-errors)
4. [Database Issues](#database-issues)
5. [Feature Flag Issues](#feature-flag-issues)
6. [Frontend Component Issues](#frontend-component-issues)
7. [Migration Issues](#migration-issues)
8. [Monitoring and Alerting](#monitoring-and-alerting)

---

## Quick Diagnostics

### System Health Check

```bash
# 1. Check API health
curl http://localhost:3000/api/v2/health
# Expected: {"status":"ok","version":"2.0.0","timestamp":"..."}

# 2. Check database connection
psql -c "SELECT 1;"
# Expected: 1 row returned

# 3. Check V2 tables exist
psql -c "SELECT COUNT(*) FROM listings;"
# Expected: Number of listings

# 4. Check application logs
tail -f logs/app.log | grep ERROR

# 5. Check database logs
tail -f /var/log/postgresql/postgresql-*.log | grep ERROR
```

### Common Symptoms and Quick Fixes

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| 500 errors on all V2 endpoints | Database connection issue | Check DATABASE_URL, restart app |
| Search returns no results | Empty V2 tables | Run data migration |
| Search very slow (>1s) | Missing indexes | Run REINDEX, ANALYZE |
| Quantity always 0 | Trigger not working | Recreate trigger |
| Feature flag not switching | Cache issue | Clear session storage |
| Frontend shows V1 despite flag | API not updated | Restart backend |

---

## Performance Issues

### Issue 1: Search Queries Slow (>50ms)

**Symptoms**:
- Search endpoint taking >50ms
- Database CPU high
- Slow query logs showing listing_search queries

**Diagnosis**:
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM listing_search
WHERE search_vector @@ to_tsquery('english', 'weapon')
  AND quality_tier_min >= 3
ORDER BY created_at DESC
LIMIT 20;

-- Look for:
-- - "Seq Scan" (bad - should use index)
-- - "Index Scan" or "Bitmap Index Scan" (good)
-- - Execution time >50ms
```

**Solutions**:

**Solution 1: Rebuild Indexes**
```sql
-- Rebuild full-text search indexes
REINDEX INDEX idx_listings_search_vector;
REINDEX INDEX idx_game_items_search_vector;

-- Rebuild other indexes
REINDEX TABLE listings;
REINDEX TABLE listing_items;
REINDEX TABLE item_variants;

-- Update statistics
ANALYZE listings;
ANALYZE listing_items;
ANALYZE listing_search;
```

**Solution 2: Check Index Usage**
```sql
-- Verify indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('listings', 'listing_items', 'item_variants')
ORDER BY tablename, indexname;

-- If missing, recreate from migration
npm run migrate:rollback
npm run migrate:latest
```

**Solution 3: Optimize Query**
```sql
-- Increase work_mem for complex queries (session-level)
SET work_mem = '64MB';

-- Or permanently (requires restart)
ALTER SYSTEM SET work_mem = '64MB';
SELECT pg_reload_conf();
```

**Solution 4: Materialize View** (if >200 listings)
```sql
-- Convert to materialized view
DROP VIEW listing_search;
CREATE MATERIALIZED VIEW listing_search AS
SELECT ... -- same query as before

-- Create refresh trigger
CREATE OR REPLACE FUNCTION refresh_listing_search()
RETURNS TRIGGER AS $
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY listing_search;
  RETURN NULL;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_listing_search
AFTER INSERT OR UPDATE OR DELETE ON listings
FOR EACH STATEMENT
EXECUTE PROCEDURE refresh_listing_search();
```

---

### Issue 2: High Database CPU Usage

**Symptoms**:
- Database CPU >80%
- Slow response times across all endpoints
- Connection pool exhausted

**Diagnosis**:
```sql
-- Check active queries
SELECT pid, usename, state, query, query_start
FROM pg_stat_activity
WHERE state = 'active'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
WHERE mean_time > 50
ORDER BY mean_time DESC
LIMIT 10;
```

**Solutions**:

**Solution 1: Kill Long-Running Queries**
```sql
-- Find long-running queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '5 minutes';

-- Kill specific query
SELECT pg_terminate_backend(PID);
```

**Solution 2: Increase Connection Pool**
```javascript
// In knexfile.ts
pool: {
  min: 2,
  max: 20,  // Increase from 10
  acquireTimeoutMillis: 30000
}
```

**Solution 3: Add Query Timeout**
```sql
-- Set statement timeout (30 seconds)
ALTER DATABASE sc_market SET statement_timeout = '30s';
```

---

### Issue 3: Trigger Performance Degradation

**Symptoms**:
- INSERT/UPDATE/DELETE on listing_item_lots very slow
- Trigger execution time >10ms
- Quantity updates delayed

**Diagnosis**:
```sql
-- Test trigger performance
EXPLAIN ANALYZE
INSERT INTO listing_item_lots (item_id, variant_id, quantity_total, listed)
VALUES ('VALID_ITEM_ID', 'VALID_VARIANT_ID', 5, true);

-- Check trigger execution time in output
```

**Solutions**:

**Solution 1: Optimize Trigger Query**
```sql
-- Current trigger uses subqueries
-- If slow, consider denormalizing further

-- Check if composite index exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'listing_item_lots' 
  AND indexname = 'idx_listing_item_lots_item_listed';

-- If missing, create it
CREATE INDEX idx_listing_item_lots_item_listed 
ON listing_item_lots (item_id, listed);
```

**Solution 2: Batch Updates**
```javascript
// In application code, batch inserts
await trx.batchInsert('listing_item_lots', lots, 100);
// Trigger fires once per batch instead of per row
```

---

## API Errors

### Issue 4: 400 Validation Errors

**Symptoms**:
- POST /api/v2/listings returns 400
- Error message: "Validation failed"
- validationErrors array in response

**Diagnosis**:
```bash
# Check error response
curl -X POST http://localhost:3000/api/v2/listings \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}' \
  | jq '.error.validationErrors'
```

**Common Validation Errors**:

**Error 1: Missing Required Fields**
```json
{
  "field": "game_item_id",
  "message": "game_item_id is required",
  "code": "required"
}
```
**Solution**: Include all required fields (title, description, game_item_id, pricing_mode, lots)

**Error 2: Invalid Quality Tier**
```json
{
  "field": "lots[0].variant_attributes.quality_tier",
  "message": "Quality tier must be between 1 and 5",
  "code": "range"
}
```
**Solution**: Use quality_tier values 1-5 only

**Error 3: Invalid Pricing Mode**
```json
{
  "field": "base_price",
  "message": "base_price is required when pricing_mode is unified",
  "code": "required"
}
```
**Solution**: 
- If pricing_mode='unified', include base_price
- If pricing_mode='per_variant', include price in each lot

**Error 4: Invalid Variant Attributes**
```json
{
  "field": "lots[0].variant_attributes.crafted_source",
  "message": "crafted_source must be one of: crafted, store, looted, unknown",
  "code": "enum"
}
```
**Solution**: Use valid enum values from variant_types table

---

### Issue 5: 404 Not Found Errors

**Symptoms**:
- GET /api/v2/listings/{id} returns 404
- Listing exists in database

**Diagnosis**:
```sql
-- Check if listing exists
SELECT listing_id, status FROM listings WHERE listing_id = 'LISTING_ID';

-- Check if listing is active
SELECT listing_id, status FROM listings 
WHERE listing_id = 'LISTING_ID' AND status = 'active';
```

**Solutions**:

**Solution 1: Listing Not Active**
```sql
-- listing_search view only shows active listings
-- If status is 'sold', 'expired', or 'cancelled', it won't appear

-- Update status if needed
UPDATE listings SET status = 'active' WHERE listing_id = 'LISTING_ID';
```

**Solution 2: Wrong Listing ID**
```bash
# Verify listing ID format (should be UUID)
echo "LISTING_ID" | grep -E '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
```

---

### Issue 6: 500 Internal Server Errors

**Symptoms**:
- Random 500 errors on V2 endpoints
- Error logged but not descriptive

**Diagnosis**:
```bash
# Check application logs
tail -f logs/app.log | grep "ERROR"

# Check for database errors
tail -f /var/log/postgresql/postgresql-*.log | grep "ERROR"

# Check for uncaught exceptions
grep "Unhandled" logs/app.log
```

**Common Causes**:

**Cause 1: Database Connection Lost**
```bash
# Check database is running
pg_isready -h localhost -p 5432

# Check connection pool
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'sc_market';"
```
**Solution**: Restart database or application

**Cause 2: Foreign Key Violation**
```sql
-- Check for invalid game_item_id
SELECT li.item_id, li.game_item_id
FROM listing_items li
LEFT JOIN game_items gi ON li.game_item_id = gi.id
WHERE gi.id IS NULL;
```
**Solution**: Fix invalid references or add validation

**Cause 3: Null Pointer Exception**
```javascript
// Check for null safety in code
// Example: seller_rating can be null
const rating = listing.seller_rating ?? 0;
```

---

## Database Issues

### Issue 7: Quantity Mismatch

**Symptoms**:
- listing_items.quantity_available doesn't match actual quantity
- Frontend shows wrong quantity

**Diagnosis**:
```sql
-- Find mismatches
SELECT 
  li.item_id,
  li.quantity_available as stored_quantity,
  COALESCE(SUM(lil.quantity_total), 0) as actual_quantity
FROM listing_items li
LEFT JOIN listing_item_lots lil ON li.item_id = lil.item_id AND lil.listed = true
GROUP BY li.item_id, li.quantity_available
HAVING li.quantity_available != COALESCE(SUM(lil.quantity_total), 0);
```

**Solutions**:

**Solution 1: Trigger Not Firing**
```sql
-- Check trigger exists and is enabled
SELECT tgname, tgenabled FROM pg_trigger 
WHERE tgname = 'trg_listing_item_lots_quantity';

-- If disabled, enable it
ALTER TABLE listing_item_lots ENABLE TRIGGER trg_listing_item_lots_quantity;

-- If missing, recreate it
\i migrations/20260416014954_market_v2_quantity_triggers.ts
```

**Solution 2: Manual Recomputation**
```sql
-- Recompute all quantities
UPDATE listing_items li
SET 
  quantity_available = (
    SELECT COALESCE(SUM(quantity_total), 0)
    FROM listing_item_lots
    WHERE item_id = li.item_id AND listed = true
  ),
  variant_count = (
    SELECT COUNT(DISTINCT variant_id)
    FROM listing_item_lots
    WHERE item_id = li.item_id AND listed = true
  );
```

---

### Issue 8: Duplicate Variants

**Symptoms**:
- Same variant attributes created multiple times
- Unique constraint violation on insert

**Diagnosis**:
```sql
-- Find duplicate variants
SELECT game_item_id, attributes, COUNT(*) as dup_count
FROM item_variants
GROUP BY game_item_id, attributes
HAVING COUNT(*) > 1;
```

**Solutions**:

**Solution 1: Merge Duplicates**
```sql
-- For each duplicate, keep first and update references
WITH duplicates AS (
  SELECT variant_id, game_item_id, attributes,
    ROW_NUMBER() OVER (PARTITION BY game_item_id, attributes ORDER BY created_at) as rn
  FROM item_variants
)
UPDATE listing_item_lots lil
SET variant_id = (
  SELECT variant_id FROM duplicates WHERE rn = 1 AND game_item_id = iv.game_item_id AND attributes = iv.attributes
)
FROM item_variants iv
WHERE lil.variant_id = iv.variant_id
  AND iv.variant_id IN (SELECT variant_id FROM duplicates WHERE rn > 1);

-- Delete duplicates
DELETE FROM item_variants
WHERE variant_id IN (
  SELECT variant_id FROM duplicates WHERE rn > 1
);
```

**Solution 2: Prevent Future Duplicates**
```sql
-- Verify unique constraint exists
SELECT conname, contype FROM pg_constraint 
WHERE conrelid = 'item_variants'::regclass 
  AND conname = 'uq_item_variants_game_item_hash';

-- If missing, recreate it
ALTER TABLE item_variants 
ADD CONSTRAINT uq_item_variants_game_item_hash 
UNIQUE (game_item_id, attributes_hash);
```

---

### Issue 9: View Not Updating

**Symptoms**:
- listing_search view shows stale data
- New listings not appearing in search

**Diagnosis**:
```sql
-- Check if view is materialized
SELECT schemaname, matviewname FROM pg_matviews WHERE matviewname = 'listing_search';
-- If returns row, it's materialized (needs refresh)

-- Check if view is regular
SELECT schemaname, viewname FROM pg_views WHERE viewname = 'listing_search';
-- If returns row, it's regular (should be real-time)
```

**Solutions**:

**Solution 1: Regular View (Should Be Real-Time)**
```sql
-- If regular view shows stale data, check underlying tables
SELECT COUNT(*) FROM listings WHERE status = 'active';
SELECT COUNT(*) FROM listing_search;
-- Counts should match

-- If mismatch, recreate view
DROP VIEW listing_search;
\i migrations/20260416015032_market_v2_search_view.ts
```

**Solution 2: Materialized View (Needs Refresh)**
```sql
-- Refresh materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY listing_search;

-- Set up auto-refresh trigger (see Performance Issue 1, Solution 4)
```

---

## Feature Flag Issues

### Issue 10: Feature Flag Not Switching

**Symptoms**:
- Debug panel shows V2 selected but user sees V1
- Feature flag API returns V2 but frontend shows V1

**Diagnosis**:
```bash
# Check feature flag API
curl http://localhost:3000/api/v2/debug/feature-flag \
  -H "Authorization: Bearer USER_TOKEN"

# Check user_preferences table
psql -c "SELECT user_id, market_version FROM user_preferences WHERE user_id = 'USER_ID';"

# Check session storage (in browser console)
sessionStorage.getItem('market_version')
```

**Solutions**:

**Solution 1: Clear Session Storage**
```javascript
// In browser console
sessionStorage.clear();
location.reload();
```

**Solution 2: Update Database**
```sql
-- Verify user_preferences table exists
SELECT COUNT(*) FROM user_preferences;

-- Update user's preference
UPDATE user_preferences 
SET market_version = 'V2' 
WHERE user_id = 'USER_ID';

-- If row doesn't exist, insert it
INSERT INTO user_preferences (user_id, market_version)
VALUES ('USER_ID', 'V2')
ON CONFLICT (user_id) DO UPDATE SET market_version = 'V2';
```

**Solution 3: Restart Application**
```bash
# Feature flag cache may be stale
pm2 restart sc-market-backend
pm2 restart sc-market-frontend
```

---

### Issue 11: Debug Panel Not Visible

**Symptoms**:
- Debug panel doesn't appear in UI
- User is developer but panel hidden

**Diagnosis**:
```sql
-- Check if user has developer privileges
SELECT user_id, is_developer FROM accounts WHERE user_id = 'USER_ID';

-- Check if feature flag service is working
curl http://localhost:3000/api/v2/debug/feature-flag \
  -H "Authorization: Bearer USER_TOKEN"
```

**Solutions**:

**Solution 1: Grant Developer Privileges**
```sql
UPDATE accounts SET is_developer = true WHERE user_id = 'USER_ID';
```

**Solution 2: Check Frontend Code**
```javascript
// In DebugPanel.tsx
const { isDeveloper } = useFeatureFlag();
if (!isDeveloper) return null;

// Verify isDeveloper is true
console.log('isDeveloper:', isDeveloper);
```

**Solution 3: Check API Authorization**
```bash
# Verify token is valid
curl http://localhost:3000/api/v2/debug/feature-flag \
  -H "Authorization: Bearer USER_TOKEN" \
  -v
# Should return 200, not 401 or 403
```

---

## Frontend Component Issues

### Issue 12: ListingSearchV2 Returns No Results

**Symptoms**:
- Search returns empty array
- V1 search works fine
- Database has listings

**Diagnosis**:
```bash
# Check API directly
curl "http://localhost:3000/api/v2/listings/search?page=1&page_size=10"

# Check if RTK Query is configured correctly
# In browser console:
console.log(store.getState().api.queries);
```

**Solutions**:

**Solution 1: Check API Base URL**
```typescript
// In RTK Query configuration
export const marketV2Api = createApi({
  reducerPath: 'marketV2Api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/v2' }),  // Verify this
  endpoints: (builder) => ({...})
});
```

**Solution 2: Check CORS Headers**
```bash
# Check if CORS headers are present
curl -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS \
  http://localhost:3000/api/v2/listings/search \
  -v
# Should return Access-Control-Allow-Origin header
```

**Solution 3: Check Network Tab**
```javascript
// In browser DevTools Network tab:
// 1. Filter by "search"
// 2. Check request URL
// 3. Check response status
// 4. Check response body
```

---

### Issue 13: Variant Breakdown Not Displaying

**Symptoms**:
- ListingDetailV2 shows listing but no variants
- API returns variants but UI doesn't render them

**Diagnosis**:
```bash
# Check API response
curl "http://localhost:3000/api/v2/listings/LISTING_ID" | jq '.items[0].variants'

# Should return array of variants
```

**Solutions**:

**Solution 1: Check Data Structure**
```typescript
// In ListingDetailV2.tsx
console.log('Listing data:', data);
console.log('Variants:', data?.items[0]?.variants);

// Verify variants array exists and has items
```

**Solution 2: Check Conditional Rendering**
```typescript
// Ensure variants are rendered
{data?.items[0]?.variants?.length > 0 && (
  <VariantBreakdown variants={data.items[0].variants} />
)}
```

**Solution 3: Check VariantBreakdown Component**
```typescript
// In VariantBreakdown.tsx
console.log('Variants prop:', variants);

// Verify component receives data
```

---

### Issue 14: Create Listing Form Validation Errors

**Symptoms**:
- Form submission fails with validation errors
- Error messages not displayed

**Diagnosis**:
```javascript
// In browser console
// Check form state
console.log('Form data:', formData);

// Check validation errors
console.log('Errors:', error);
```

**Solutions**:

**Solution 1: Display Validation Errors**
```typescript
// In CreateListingV2.tsx
{error?.data?.error?.validationErrors?.map((ve) => (
  <Alert severity="error" key={ve.field}>
    {ve.field}: {ve.message}
  </Alert>
))}
```

**Solution 2: Validate Before Submit**
```typescript
const validateForm = () => {
  const errors = [];
  
  if (!formData.title) errors.push('Title is required');
  if (!formData.game_item_id) errors.push('Game item is required');
  if (formData.pricing_mode === 'unified' && !formData.base_price) {
    errors.push('Base price is required for unified pricing');
  }
  
  return errors;
};

const handleSubmit = async () => {
  const errors = validateForm();
  if (errors.length > 0) {
    setValidationErrors(errors);
    return;
  }
  
  await createListing({ createListingRequest: formData });
};
```

---

## Migration Issues

### Issue 15: Migration Service Timeout

**Symptoms**:
- Migration API returns timeout error
- Migration takes >30 minutes

**Diagnosis**:
```sql
-- Check V1 data volume
SELECT 
  (SELECT COUNT(*) FROM unique_listings) as unique_count,
  (SELECT COUNT(*) FROM aggregate_listings) as aggregate_count,
  (SELECT COUNT(*) FROM multiple_listings) as multiple_count;
```

**Solutions**:

**Solution 1: Increase Timeout**
```javascript
// In migration service
const MIGRATION_TIMEOUT = 3600000; // 1 hour

// Or via environment variable
export MIGRATION_TIMEOUT=3600000
npm run migrate:data
```

**Solution 2: Batch Migration**
```javascript
// Modify migration service to process in batches
async function migrateBatch(offset: number, limit: number) {
  const listings = await db('unique_listings')
    .limit(limit)
    .offset(offset);
  
  for (const listing of listings) {
    await migrateListing(listing);
  }
}

// Run in batches
for (let i = 0; i < totalListings; i += 100) {
  await migrateBatch(i, 100);
  console.log(`Migrated ${i + 100} / ${totalListings}`);
}
```

---

## Monitoring and Alerting

### Setting Up Monitoring

**Metrics to Monitor**:

1. **Search Performance**
```sql
-- Create monitoring view
CREATE VIEW v2_search_performance AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  AVG(duration_ms) as avg_duration,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration,
  COUNT(*) as request_count
FROM api_logs
WHERE endpoint = '/api/v2/listings/search'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC;
```

2. **Error Rates**
```sql
-- Create error monitoring view
CREATE VIEW v2_error_rates AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
  COUNT(*) as total_count,
  (COUNT(*) FILTER (WHERE status_code >= 400)::float / COUNT(*)) * 100 as error_rate
FROM api_logs
WHERE endpoint LIKE '/api/v2/%'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC;
```

3. **Database Performance**
```sql
-- Monitor slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%listing_search%'
ORDER BY mean_time DESC
LIMIT 10;
```

### Setting Up Alerts

**Alert 1: Search Performance Degradation**
```sql
-- Alert if p95 latency >50ms
SELECT 
  CASE 
    WHEN p95_duration > 50 THEN 'ALERT: Search performance degraded'
    ELSE 'OK'
  END as status,
  p95_duration
FROM v2_search_performance
WHERE hour = DATE_TRUNC('hour', NOW())
LIMIT 1;
```

**Alert 2: Error Rate Spike**
```sql
-- Alert if error rate >1%
SELECT 
  CASE 
    WHEN error_rate > 1 THEN 'ALERT: High error rate'
    ELSE 'OK'
  END as status,
  error_rate
FROM v2_error_rates
WHERE hour = DATE_TRUNC('hour', NOW())
LIMIT 1;
```

**Alert 3: Database Connection Pool Exhausted**
```sql
-- Alert if >90% connections used
SELECT 
  CASE 
    WHEN (active_connections::float / max_connections) > 0.9 
    THEN 'ALERT: Connection pool near limit'
    ELSE 'OK'
  END as status,
  active_connections,
  max_connections
FROM (
  SELECT 
    COUNT(*) as active_connections,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
  FROM pg_stat_activity
  WHERE datname = 'sc_market'
) stats;
```

### Grafana Dashboard (if available)

**Panels to Add**:
1. Search latency (p50, p95, p99) - line chart
2. Error rate by endpoint - bar chart
3. Active listings count - single stat
4. Database CPU usage - gauge
5. Connection pool usage - gauge
6. Slow queries (>50ms) - table

---

## Emergency Procedures

### Emergency Rollback to V1

**When to Use**: Critical V2 issues affecting all users

**Steps**:
```bash
# 1. Switch all users to V1
psql -c "UPDATE user_preferences SET market_version = 'V1';"

# 2. Verify rollback
psql -c "SELECT market_version, COUNT(*) FROM user_preferences GROUP BY market_version;"

# 3. Monitor V1 health
curl http://localhost:3000/api/v1/health

# 4. Investigate V2 issues
tail -f logs/app.log | grep "ERROR"
```

### Emergency Database Restore

**When to Use**: Data corruption or loss

**Steps**:
```bash
# 1. Stop application
pm2 stop sc-market-backend

# 2. Restore from backup
pg_restore -d sc_market -c sc_market_backup_YYYYMMDD.dump

# 3. Verify restore
psql -c "SELECT COUNT(*) FROM listings;"

# 4. Restart application
pm2 start sc-market-backend
```

---

## Support Contacts

For issues not covered in this guide:
- **Database Issues**: [Database Schema Documentation](./v2-database-schema.md)
- **API Issues**: [API Documentation](./v2-api-documentation.md)
- **Migration Issues**: [Migration Guide](./v2-migration-guide.md)
- **Error Handling**: [Error Handling Documentation](../ERROR_HANDLING_DOCUMENTATION.md)
