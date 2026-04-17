-- ============================================================================
-- Variant Types Verification Script for Task 1.6
-- ============================================================================
-- This script verifies that the variant_types table was seeded correctly
-- with all 4 required variant types and their validation rules.
--
-- Requirements: 4.4, 4.5, 5.1-5.4

\echo '========================================='
\echo 'Variant Types Verification'
\echo '========================================='
\echo ''

-- Check if variant_types table exists
\echo 'Checking if variant_types table exists...'
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'variant_types'
    ) THEN '✓ variant_types table exists'
    ELSE '✗ variant_types table NOT FOUND'
  END AS status;

\echo ''
\echo 'Checking variant_types count...'
SELECT 
  COUNT(*) as total_variant_types,
  CASE 
    WHEN COUNT(*) = 4 THEN '✓ All 4 variant types present'
    ELSE '✗ Expected 4 variant types, found ' || COUNT(*)
  END AS status
FROM variant_types;

\echo ''
\echo '========================================='
\echo 'Variant Type: quality_tier'
\echo '========================================='
SELECT 
  name,
  display_name,
  description,
  value_type,
  min_value,
  max_value,
  display_order,
  affects_pricing,
  searchable,
  filterable,
  CASE 
    WHEN name = 'quality_tier' 
      AND display_name = 'Quality Tier'
      AND value_type = 'integer'
      AND min_value = 1
      AND max_value = 5
      AND display_order = 0
    THEN '✓ quality_tier configured correctly'
    ELSE '✗ quality_tier has incorrect configuration'
  END AS validation_status
FROM variant_types
WHERE name = 'quality_tier';

\echo ''
\echo '========================================='
\echo 'Variant Type: quality_value'
\echo '========================================='
SELECT 
  name,
  display_name,
  description,
  value_type,
  min_value,
  max_value,
  display_order,
  affects_pricing,
  searchable,
  filterable,
  CASE 
    WHEN name = 'quality_value' 
      AND display_name = 'Quality Value'
      AND value_type = 'decimal'
      AND min_value = 0
      AND max_value = 100
      AND display_order = 1
    THEN '✓ quality_value configured correctly'
    ELSE '✗ quality_value has incorrect configuration'
  END AS validation_status
FROM variant_types
WHERE name = 'quality_value';

\echo ''
\echo '========================================='
\echo 'Variant Type: crafted_source'
\echo '========================================='
SELECT 
  name,
  display_name,
  description,
  value_type,
  allowed_values,
  display_order,
  affects_pricing,
  searchable,
  filterable,
  CASE 
    WHEN name = 'crafted_source' 
      AND display_name = 'Source'
      AND value_type = 'enum'
      AND allowed_values::jsonb = '["crafted", "store", "looted", "unknown"]'::jsonb
      AND display_order = 2
    THEN '✓ crafted_source configured correctly'
    ELSE '✗ crafted_source has incorrect configuration'
  END AS validation_status
FROM variant_types
WHERE name = 'crafted_source';

\echo ''
\echo '========================================='
\echo 'Variant Type: blueprint_tier'
\echo '========================================='
SELECT 
  name,
  display_name,
  description,
  value_type,
  min_value,
  max_value,
  display_order,
  affects_pricing,
  searchable,
  filterable,
  CASE 
    WHEN name = 'blueprint_tier' 
      AND display_name = 'Blueprint Tier'
      AND value_type = 'integer'
      AND min_value = 1
      AND max_value = 5
      AND display_order = 3
    THEN '✓ blueprint_tier configured correctly'
    ELSE '✗ blueprint_tier has incorrect configuration'
  END AS validation_status
FROM variant_types
WHERE name = 'blueprint_tier';

\echo ''
\echo '========================================='
\echo 'Display Order Verification'
\echo '========================================='
\echo 'Checking that variant types are ordered correctly...'
SELECT 
  name,
  display_order,
  CASE 
    WHEN display_order = ROW_NUMBER() OVER (ORDER BY display_order) - 1
    THEN '✓'
    ELSE '✗'
  END AS order_status
FROM variant_types
ORDER BY display_order;

\echo ''
\echo '========================================='
\echo 'Validation Rules Summary'
\echo '========================================='
SELECT 
  name,
  value_type,
  COALESCE(min_value::text, 'N/A') as min_value,
  COALESCE(max_value::text, 'N/A') as max_value,
  COALESCE(allowed_values::text, 'N/A') as allowed_values,
  affects_pricing,
  searchable,
  filterable
FROM variant_types
ORDER BY display_order;

\echo ''
\echo '========================================='
\echo 'Index Verification'
\echo '========================================='
\echo 'Checking if idx_variant_types_searchable index exists...'
SELECT 
  indexname,
  indexdef,
  CASE 
    WHEN indexname = 'idx_variant_types_searchable' 
    THEN '✓ Index exists'
    ELSE '✗ Index not found'
  END AS status
FROM pg_indexes
WHERE tablename = 'variant_types'
  AND indexname = 'idx_variant_types_searchable';

\echo ''
\echo '========================================='
\echo 'Verification Complete'
\echo '========================================='
