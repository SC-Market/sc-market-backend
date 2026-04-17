-- Task 2.5: Validate Migration Completeness (SQL Version)
-- This SQL script can be run directly on the database to validate migration completeness
-- Requirements: 58.2, 58.3, 58.6

\echo '================================================================================'
\echo 'Task 2.5: Migration Completeness Validation'
\echo '================================================================================'
\echo ''

-- Sub-task 1: Compare V1 listing count vs V2 listing count
\echo 'Check 1: Comparing V1 vs V2 listing counts...'
\echo ''

SELECT 
  'V1 Total Listings' as metric,
  COUNT(*) as count
FROM unique_listings
UNION ALL
SELECT 
  'V1 Valid Listings (with game_item_id and price > 0)' as metric,
  COUNT(*) as count
FROM unique_listings
WHERE game_item_id IS NOT NULL
  AND price > 0
UNION ALL
SELECT 
  'V1 Invalid Listings' as metric,
  COUNT(*) as count
FROM unique_listings
WHERE game_item_id IS NULL
  OR price <= 0
UNION ALL
SELECT 
  'V2 Listings' as metric,
  COUNT(*) as count
FROM listings;

\echo ''
\echo 'Expected: V2 Listings >= V1 Valid Listings'
\echo ''

-- Sub-task 2: Verify all V1 metadata preserved in V2
\echo 'Check 2: Verifying V1 metadata preserved in V2...'
\echo ''

-- Sample check: Compare V1 and V2 data for migrated listings
WITH v1_v2_comparison AS (
  SELECT 
    v1.listing_id as v1_listing_id,
    v1.title as v1_title,
    v1.description as v1_description,
    v1.price as v1_price,
    v1.quantity as v1_quantity,
    v1.game_item_id as v1_game_item_id,
    v1.status as v1_status,
    v1.sale_type as v1_sale_type,
    v1.internal as v1_internal,
    v2.listing_id as v2_listing_id,
    v2.title as v2_title,
    v2.description as v2_description,
    v2.status as v2_status,
    v2.sale_type as v2_sale_type,
    v2.visibility as v2_visibility,
    li.base_price as v2_price,
    li.quantity_available as v2_quantity,
    li.game_item_id as v2_game_item_id,
    CASE 
      WHEN v1.title != v2.title THEN 'title_mismatch'
      WHEN v1.description != v2.description THEN 'description_mismatch'
      WHEN v1.price != li.base_price THEN 'price_mismatch'
      WHEN v1.game_item_id != li.game_item_id THEN 'game_item_id_mismatch'
      WHEN (CASE WHEN v1.status IN ('inactive', 'archived') THEN 'cancelled' ELSE v1.status END) != v2.status THEN 'status_mismatch'
      WHEN (CASE WHEN v1.sale_type = 'sale' THEN 'fixed' ELSE v1.sale_type END) != v2.sale_type THEN 'sale_type_mismatch'
      WHEN (CASE WHEN v1.internal THEN 'unlisted' ELSE 'public' END) != v2.visibility THEN 'visibility_mismatch'
      ELSE NULL
    END as mismatch_type
  FROM unique_listings v1
  LEFT JOIN listing_item_lots lot ON lot.notes LIKE '%' || v1.listing_id || '%'
  LEFT JOIN listing_items li ON li.item_id = lot.item_id
  LEFT JOIN listings v2 ON v2.listing_id = li.listing_id
  WHERE v1.game_item_id IS NOT NULL
    AND v1.price > 0
)
SELECT 
  'Migrated Listings Checked' as metric,
  COUNT(*) as count
FROM v1_v2_comparison
WHERE v2_listing_id IS NOT NULL
UNION ALL
SELECT 
  'Metadata Mismatches Found' as metric,
  COUNT(*) as count
FROM v1_v2_comparison
WHERE mismatch_type IS NOT NULL;

\echo ''
\echo 'Expected: 0 metadata mismatches'
\echo ''

-- Show first 5 mismatches if any
\echo 'First 5 metadata mismatches (if any):'
SELECT 
  v1_listing_id,
  mismatch_type,
  CASE mismatch_type
    WHEN 'title_mismatch' THEN 'V1: ' || v1_title || ' | V2: ' || v2_title
    WHEN 'description_mismatch' THEN 'V1: ' || COALESCE(v1_description, 'NULL') || ' | V2: ' || COALESCE(v2_description, 'NULL')
    WHEN 'price_mismatch' THEN 'V1: ' || v1_price || ' | V2: ' || v2_price
    WHEN 'game_item_id_mismatch' THEN 'V1: ' || v1_game_item_id || ' | V2: ' || v2_game_item_id
    WHEN 'status_mismatch' THEN 'V1: ' || v1_status || ' | V2: ' || v2_status
    WHEN 'sale_type_mismatch' THEN 'V1: ' || v1_sale_type || ' | V2: ' || v2_sale_type
    WHEN 'visibility_mismatch' THEN 'V1: ' || v1_internal || ' | V2: ' || v2_visibility
  END as details
FROM (
  SELECT 
    v1.listing_id as v1_listing_id,
    v1.title as v1_title,
    v1.description as v1_description,
    v1.price as v1_price,
    v1.game_item_id as v1_game_item_id,
    v1.status as v1_status,
    v1.sale_type as v1_sale_type,
    v1.internal as v1_internal,
    v2.title as v2_title,
    v2.description as v2_description,
    v2.status as v2_status,
    v2.sale_type as v2_sale_type,
    v2.visibility as v2_visibility,
    li.base_price as v2_price,
    li.game_item_id as v2_game_item_id,
    CASE 
      WHEN v1.title != v2.title THEN 'title_mismatch'
      WHEN v1.description != v2.description THEN 'description_mismatch'
      WHEN v1.price != li.base_price THEN 'price_mismatch'
      WHEN v1.game_item_id != li.game_item_id THEN 'game_item_id_mismatch'
      WHEN (CASE WHEN v1.status IN ('inactive', 'archived') THEN 'cancelled' ELSE v1.status END) != v2.status THEN 'status_mismatch'
      WHEN (CASE WHEN v1.sale_type = 'sale' THEN 'fixed' ELSE v1.sale_type END) != v2.sale_type THEN 'sale_type_mismatch'
      WHEN (CASE WHEN v1.internal THEN 'unlisted' ELSE 'public' END) != v2.visibility THEN 'visibility_mismatch'
      ELSE NULL
    END as mismatch_type
  FROM unique_listings v1
  LEFT JOIN listing_item_lots lot ON lot.notes LIKE '%' || v1.listing_id || '%'
  LEFT JOIN listing_items li ON li.item_id = lot.item_id
  LEFT JOIN listings v2 ON v2.listing_id = li.listing_id
  WHERE v1.game_item_id IS NOT NULL
    AND v1.price > 0
) sub
WHERE mismatch_type IS NOT NULL
LIMIT 5;

\echo ''

-- Sub-task 3: Check quantity_available computed correctly by trigger
\echo 'Check 3: Validating quantity_available computed by trigger...'
\echo ''

SELECT 
  'Listing Items with Incorrect quantity_available' as metric,
  COUNT(*) as count
FROM listing_items li
LEFT JOIN (
  SELECT 
    item_id,
    COALESCE(SUM(quantity_total), 0) as computed_quantity,
    COUNT(DISTINCT variant_id) as computed_variant_count
  FROM listing_item_lots
  WHERE listed = true
  GROUP BY item_id
) computed ON computed.item_id = li.item_id
WHERE li.quantity_available != COALESCE(computed.computed_quantity, 0)
   OR li.variant_count != COALESCE(computed.computed_variant_count, 0);

\echo ''
\echo 'Expected: 0 mismatches'
\echo ''

-- Show first 5 mismatches if any
\echo 'First 5 quantity_available mismatches (if any):'
SELECT 
  li.item_id,
  li.quantity_available as stored_quantity,
  COALESCE(computed.computed_quantity, 0) as computed_quantity,
  li.variant_count as stored_variant_count,
  COALESCE(computed.computed_variant_count, 0) as computed_variant_count
FROM listing_items li
LEFT JOIN (
  SELECT 
    item_id,
    COALESCE(SUM(quantity_total), 0) as computed_quantity,
    COUNT(DISTINCT variant_id) as computed_variant_count
  FROM listing_item_lots
  WHERE listed = true
  GROUP BY item_id
) computed ON computed.item_id = li.item_id
WHERE li.quantity_available != COALESCE(computed.computed_quantity, 0)
   OR li.variant_count != COALESCE(computed.computed_variant_count, 0)
LIMIT 5;

\echo ''

-- Sub-task 4: Validate variant deduplication working
\echo 'Check 4: Validating variant deduplication...'
\echo ''

SELECT 
  'Total Variants' as metric,
  COUNT(*) as count
FROM item_variants
UNION ALL
SELECT 
  'Duplicate Variants (same game_item_id + attributes_hash)' as metric,
  COUNT(*) as count
FROM (
  SELECT 
    game_item_id,
    attributes_hash,
    COUNT(*) as duplicate_count
  FROM item_variants
  GROUP BY game_item_id, attributes_hash
  HAVING COUNT(*) > 1
) duplicates;

\echo ''
\echo 'Expected: 0 duplicate variants'
\echo ''

-- Show first 5 duplicate variants if any
\echo 'First 5 duplicate variants (if any):'
SELECT 
  game_item_id,
  attributes_hash,
  COUNT(*) as duplicate_count,
  array_agg(variant_id) as variant_ids
FROM item_variants
GROUP BY game_item_id, attributes_hash
HAVING COUNT(*) > 1
LIMIT 5;

\echo ''

-- Sub-task 5: Confirm no V1 tables modified
\echo 'Check 5: Confirming V1 tables remain unchanged...'
\echo ''

SELECT 
  'unique_listings' as table_name,
  COUNT(*) as current_count,
  36 as expected_count,
  CASE WHEN COUNT(*) = 36 THEN 'PASS' ELSE 'FAIL' END as status
FROM unique_listings
UNION ALL
SELECT 
  'aggregate_listings' as table_name,
  COUNT(*) as current_count,
  0 as expected_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM aggregate_listings
UNION ALL
SELECT 
  'multiple_listings' as table_name,
  COUNT(*) as current_count,
  0 as expected_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM multiple_listings;

\echo ''
\echo 'Expected: All tables show PASS status'
\echo ''

\echo '================================================================================'
\echo 'VALIDATION COMPLETE'
\echo '================================================================================'
\echo ''
\echo 'Review the results above to determine if migration was successful.'
\echo 'All checks should show 0 mismatches/errors and PASS status.'
\echo ''
