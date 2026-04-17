-- Verification script for database views and indexes
-- Task 1.4: Create database views and indexes

-- ============================================================================
-- CHECK VIEWS
-- ============================================================================
SELECT 
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE viewname = 'listing_search';

-- ============================================================================
-- CHECK INDEXES ON LISTINGS TABLE
-- ============================================================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'listings'
ORDER BY indexname;

-- ============================================================================
-- CHECK INDEXES ON LISTING_ITEMS TABLE
-- ============================================================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'listing_items'
ORDER BY indexname;

-- ============================================================================
-- CHECK INDEXES ON ITEM_VARIANTS TABLE
-- ============================================================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'item_variants'
ORDER BY indexname;

-- ============================================================================
-- CHECK INDEXES ON LISTING_ITEM_LOTS TABLE
-- ============================================================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'listing_item_lots'
ORDER BY indexname;

-- ============================================================================
-- CHECK INDEXES ON LISTING_SEARCH VIEW
-- ============================================================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'listing_search'
ORDER BY indexname;

-- ============================================================================
-- VERIFY INDEX USAGE WITH EXPLAIN
-- ============================================================================
-- Test query 1: Full-text search
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM listing_search
WHERE search_vector @@ to_tsquery('english', 'weapon');

-- Test query 2: Quality tier filter
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM listing_search
WHERE quality_tier_min >= 3
  AND quality_tier_max <= 5;

-- Test query 3: Game item filter
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM listing_search
WHERE game_item_id = '00000000-0000-0000-0000-000000000001';

-- Test query 4: Price range filter
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM listing_search
WHERE price_min >= 1000
  AND price_max <= 10000;

-- Test query 5: Combined filters
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM listing_search
WHERE game_item_id = '00000000-0000-0000-0000-000000000001'
  AND quality_tier_min >= 3
  AND price_min >= 1000
  AND search_vector @@ to_tsquery('english', 'crafted');
