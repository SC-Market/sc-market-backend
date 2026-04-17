-- V1 Listing Types and Data Structure Audit
-- Task 2.1: Research V1 listing types and data structure
-- Database: scmarket @ 192.168.88.6

-- ============================================================================
-- PART 1: UNIQUE LISTINGS AUDIT
-- ============================================================================

-- Count of unique listings by status
SELECT 
    ml.status,
    COUNT(*) as count,
    COUNT(DISTINCT ml.user_seller_id) as unique_user_sellers,
    COUNT(DISTINCT ml.contractor_seller_id) as unique_contractor_sellers
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
GROUP BY ml.status
ORDER BY count DESC;

-- Sample unique listings with full structure
SELECT 
    ml.listing_id,
    ml.sale_type,
    ml.price,
    ml.quantity_available,
    ml.status,
    ml.internal,
    ml.user_seller_id,
    ml.contractor_seller_id,
    ml.timestamp,
    ml.expiration,
    mul.accept_offers,
    mul.details_id,
    mld.item_type,
    mld.title,
    mld.description,
    mld.game_item_id
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
LEFT JOIN market_listing_details mld ON mul.details_id = mld.details_id
LIMIT 10;

-- Check for NULL values and edge cases in unique listings
SELECT 
    'NULL user_seller_id AND contractor_seller_id' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
WHERE ml.user_seller_id IS NULL AND ml.contractor_seller_id IS NULL

UNION ALL

SELECT 
    'BOTH user_seller_id AND contractor_seller_id set' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
WHERE ml.user_seller_id IS NOT NULL AND ml.contractor_seller_id IS NOT NULL

UNION ALL

SELECT 
    'NULL details_id' as edge_case,
    COUNT(*) as count
FROM market_unique_listings
WHERE details_id IS NULL

UNION ALL

SELECT 
    'Orphaned (no market_listing)' as edge_case,
    COUNT(*) as count
FROM market_unique_listings mul
LEFT JOIN market_listings ml ON mul.listing_id = ml.listing_id
WHERE ml.listing_id IS NULL

UNION ALL

SELECT 
    'Zero or negative quantity' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
WHERE ml.quantity_available <= 0

UNION ALL

SELECT 
    'Zero or negative price' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
WHERE ml.price <= 0

UNION ALL

SELECT 
    'Expired but still active' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
WHERE ml.status = 'active' AND ml.expiration < NOW();

-- Unique listing sale_type distribution
SELECT 
    ml.sale_type,
    COUNT(*) as count,
    MIN(ml.price) as min_price,
    MAX(ml.price) as max_price,
    AVG(ml.price) as avg_price
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
GROUP BY ml.sale_type
ORDER BY count DESC;

-- ============================================================================
-- PART 2: AGGREGATE LISTINGS AUDIT
-- ============================================================================

-- Count of aggregate listings by status
SELECT 
    ml.status,
    COUNT(*) as count,
    COUNT(DISTINCT ml.user_seller_id) as unique_user_sellers,
    COUNT(DISTINCT ml.contractor_seller_id) as unique_contractor_sellers
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id
GROUP BY ml.status
ORDER BY count DESC;

-- Sample aggregate listings with full structure
SELECT 
    ml.listing_id,
    ml.sale_type,
    ml.price,
    ml.quantity_available,
    ml.status,
    ml.internal,
    ml.user_seller_id,
    ml.contractor_seller_id,
    ml.timestamp,
    ml.expiration,
    mal.aggregate_id,
    ma.wiki_id,
    ma.details_id,
    mld.item_type,
    mld.title,
    mld.description,
    mld.game_item_id
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id
INNER JOIN market_aggregates ma ON mal.aggregate_id = ma.aggregate_id
LEFT JOIN market_listing_details mld ON ma.details_id = mld.details_id
LIMIT 10;

-- Check for NULL values and edge cases in aggregate listings
SELECT 
    'NULL aggregate_id' as edge_case,
    COUNT(*) as count
FROM market_aggregate_listings
WHERE aggregate_id IS NULL

UNION ALL

SELECT 
    'Orphaned aggregate_listing (no market_listing)' as edge_case,
    COUNT(*) as count
FROM market_aggregate_listings mal
LEFT JOIN market_listings ml ON mal.aggregate_listing_id = ml.listing_id
WHERE ml.listing_id IS NULL

UNION ALL

SELECT 
    'Orphaned aggregate (no market_aggregate)' as edge_case,
    COUNT(*) as count
FROM market_aggregate_listings mal
LEFT JOIN market_aggregates ma ON mal.aggregate_id = ma.aggregate_id
WHERE ma.aggregate_id IS NULL

UNION ALL

SELECT 
    'NULL wiki_id in aggregates' as edge_case,
    COUNT(*) as count
FROM market_aggregates
WHERE wiki_id IS NULL

UNION ALL

SELECT 
    'NULL details_id in aggregates' as edge_case,
    COUNT(*) as count
FROM market_aggregates
WHERE details_id IS NULL

UNION ALL

SELECT 
    'Zero or negative quantity' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id
WHERE ml.quantity_available <= 0

UNION ALL

SELECT 
    'Zero or negative price' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id
WHERE ml.price <= 0;

-- Aggregate listing sale_type distribution
SELECT 
    ml.sale_type,
    COUNT(*) as count,
    MIN(ml.price) as min_price,
    MAX(ml.price) as max_price,
    AVG(ml.price) as avg_price
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id
GROUP BY ml.sale_type
ORDER BY count DESC;

-- ============================================================================
-- PART 3: MULTIPLE LISTINGS AUDIT
-- ============================================================================

-- Count of multiple listings by status
SELECT 
    ml.status,
    COUNT(*) as count,
    COUNT(DISTINCT ml.user_seller_id) as unique_user_sellers,
    COUNT(DISTINCT ml.contractor_seller_id) as unique_contractor_sellers
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id
GROUP BY ml.status
ORDER BY count DESC;

-- Sample multiple listings with full structure
SELECT 
    ml.listing_id,
    ml.sale_type,
    ml.price,
    ml.quantity_available,
    ml.status,
    ml.internal,
    ml.user_seller_id,
    ml.contractor_seller_id,
    ml.timestamp,
    ml.expiration,
    mml.multiple_id,
    mml.details_id,
    mm.user_seller_id as multiple_user_seller_id,
    mm.contractor_seller_id as multiple_contractor_seller_id,
    mm.details_id as multiple_details_id,
    mm.default_listing_id,
    mm.timestamp as multiple_timestamp,
    mld.item_type,
    mld.title,
    mld.description,
    mld.game_item_id
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id
INNER JOIN market_multiples mm ON mml.multiple_id = mm.multiple_id
LEFT JOIN market_listing_details mld ON mml.details_id = mld.details_id
LIMIT 10;

-- Check for NULL values and edge cases in multiple listings
SELECT 
    'NULL multiple_id' as edge_case,
    COUNT(*) as count
FROM market_multiple_listings
WHERE multiple_id IS NULL

UNION ALL

SELECT 
    'NULL details_id in multiple_listings' as edge_case,
    COUNT(*) as count
FROM market_multiple_listings
WHERE details_id IS NULL

UNION ALL

SELECT 
    'Orphaned multiple_listing (no market_listing)' as edge_case,
    COUNT(*) as count
FROM market_multiple_listings mml
LEFT JOIN market_listings ml ON mml.multiple_listing_id = ml.listing_id
WHERE ml.listing_id IS NULL

UNION ALL

SELECT 
    'Orphaned multiple (no market_multiple)' as edge_case,
    COUNT(*) as count
FROM market_multiple_listings mml
LEFT JOIN market_multiples mm ON mml.multiple_id = mm.multiple_id
WHERE mm.multiple_id IS NULL

UNION ALL

SELECT 
    'NULL default_listing_id in multiples' as edge_case,
    COUNT(*) as count
FROM market_multiples
WHERE default_listing_id IS NULL

UNION ALL

SELECT 
    'Zero or negative quantity' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id
WHERE ml.quantity_available <= 0

UNION ALL

SELECT 
    'Zero or negative price' as edge_case,
    COUNT(*) as count
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id
WHERE ml.price <= 0;

-- Multiple listing sale_type distribution
SELECT 
    ml.sale_type,
    COUNT(*) as count,
    MIN(ml.price) as min_price,
    MAX(ml.price) as max_price,
    AVG(ml.price) as avg_price
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id
GROUP BY ml.sale_type
ORDER BY count DESC;

-- ============================================================================
-- PART 4: OVERALL STATUS AND PRICING ANALYSIS
-- ============================================================================

-- All possible status values in use
SELECT DISTINCT status, COUNT(*) as count
FROM market_listings
GROUP BY status
ORDER BY count DESC;

-- All possible sale_type values in use
SELECT DISTINCT sale_type, COUNT(*) as count
FROM market_listings
GROUP BY sale_type
ORDER BY count DESC;

-- Pricing model analysis
SELECT 
    'Unique Listings' as listing_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN ml.price = 0 THEN 1 END) as zero_price_count,
    MIN(ml.price) as min_price,
    MAX(ml.price) as max_price,
    AVG(ml.price) as avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ml.price) as median_price
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id

UNION ALL

SELECT 
    'Aggregate Listings' as listing_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN ml.price = 0 THEN 1 END) as zero_price_count,
    MIN(ml.price) as min_price,
    MAX(ml.price) as max_price,
    AVG(ml.price) as avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ml.price) as median_price
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id

UNION ALL

SELECT 
    'Multiple Listings' as listing_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN ml.price = 0 THEN 1 END) as zero_price_count,
    MIN(ml.price) as min_price,
    MAX(ml.price) as max_price,
    AVG(ml.price) as avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ml.price) as median_price
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id;

-- Quantity tracking analysis
SELECT 
    'Unique Listings' as listing_type,
    COUNT(*) as total_count,
    MIN(ml.quantity_available) as min_quantity,
    MAX(ml.quantity_available) as max_quantity,
    AVG(ml.quantity_available) as avg_quantity,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ml.quantity_available) as median_quantity
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id

UNION ALL

SELECT 
    'Aggregate Listings' as listing_type,
    COUNT(*) as total_count,
    MIN(ml.quantity_available) as min_quantity,
    MAX(ml.quantity_available) as max_quantity,
    AVG(ml.quantity_available) as avg_quantity,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ml.quantity_available) as median_quantity
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id

UNION ALL

SELECT 
    'Multiple Listings' as listing_type,
    COUNT(*) as total_count,
    MIN(ml.quantity_available) as min_quantity,
    MAX(ml.quantity_available) as max_quantity,
    AVG(ml.quantity_available) as avg_quantity,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ml.quantity_available) as median_quantity
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id;

-- ============================================================================
-- PART 5: LISTING TYPE DISTRIBUTION
-- ============================================================================

-- Overall listing type distribution
SELECT 
    'Unique Listings' as listing_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM market_listings), 2) as percentage
FROM market_listings ml
INNER JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id

UNION ALL

SELECT 
    'Aggregate Listings' as listing_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM market_listings), 2) as percentage
FROM market_listings ml
INNER JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id

UNION ALL

SELECT 
    'Multiple Listings' as listing_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM market_listings), 2) as percentage
FROM market_listings ml
INNER JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id

UNION ALL

SELECT 
    'Unclassified (no type)' as listing_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM market_listings), 2) as percentage
FROM market_listings ml
LEFT JOIN market_unique_listings mul ON ml.listing_id = mul.listing_id
LEFT JOIN market_aggregate_listings mal ON ml.listing_id = mal.aggregate_listing_id
LEFT JOIN market_multiple_listings mml ON ml.listing_id = mml.multiple_listing_id
WHERE mul.listing_id IS NULL 
  AND mal.aggregate_listing_id IS NULL 
  AND mml.multiple_listing_id IS NULL;

-- ============================================================================
-- PART 6: ITEM TYPE ANALYSIS
-- ============================================================================

-- Item types in unique listings
SELECT 
    mld.item_type,
    COUNT(*) as count
FROM market_unique_listings mul
LEFT JOIN market_listing_details mld ON mul.details_id = mld.details_id
GROUP BY mld.item_type
ORDER BY count DESC
LIMIT 20;

-- Item types in aggregate listings
SELECT 
    mld.item_type,
    COUNT(*) as count
FROM market_aggregate_listings mal
INNER JOIN market_aggregates ma ON mal.aggregate_id = ma.aggregate_id
LEFT JOIN market_listing_details mld ON ma.details_id = mld.details_id
GROUP BY mld.item_type
ORDER BY count DESC
LIMIT 20;

-- Item types in multiple listings
SELECT 
    mld.item_type,
    COUNT(*) as count
FROM market_multiple_listings mml
LEFT JOIN market_listing_details mld ON mml.details_id = mld.details_id
GROUP BY mld.item_type
ORDER BY count DESC
LIMIT 20;
