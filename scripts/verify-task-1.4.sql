-- Quick verification script for Task 1.4 completion
-- Checks that the listing_search view and all required indexes exist

\echo '========================================='
\echo 'Task 1.4 Verification: Views and Indexes'
\echo '========================================='
\echo ''

-- Check if listing_search view exists
\echo 'Checking listing_search view...'
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'listing_search';

\echo ''
\echo 'Listing all indexes on V2 tables...'
\echo ''

-- Count indexes by table
SELECT 
  tablename,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'listings',
    'listing_items',
    'item_variants',
    'listing_item_lots',
    'variant_pricing',
    'variant_types'
  )
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo 'Detailed index list...'
\echo ''

-- List all indexes with their definitions
SELECT 
  tablename,
  indexname,
  CASE 
    WHEN indexdef LIKE '%USING gin%' THEN 'GIN'
    WHEN indexdef LIKE '%USING btree%' THEN 'B-tree'
    ELSE 'Other'
  END as index_type
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'listings',
    'listing_items',
    'item_variants',
    'listing_item_lots',
    'variant_pricing',
    'variant_types'
  )
ORDER BY tablename, indexname;

\echo ''
\echo '========================================='
\echo 'Verification Complete!'
\echo '========================================='
