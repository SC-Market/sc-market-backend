-- Check current database state for task 1.4 verification

-- Check if core tables exist
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'listings',
    'listing_items',
    'item_variants',
    'listing_item_lots',
    'variant_pricing',
    'variant_types'
  )
ORDER BY table_name;

-- Check if listing_search view exists
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'listing_search';

-- Check all indexes on V2 tables
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'listings',
    'listing_items',
    'item_variants',
    'listing_item_lots',
    'variant_pricing',
    'listing_search'
  )
ORDER BY tablename, indexname;

-- Check migration history
SELECT * FROM knex_migrations ORDER BY id;
