-- ============================================================================
-- Stock Migration Script
-- Migrates existing quantity_available data to stock_lots system
-- ============================================================================

-- This script migrates existing stock from market_listings.quantity_available
-- to the new stock_lots table. All migrated lots will be:
-- - Set to Unspecified location
-- - Set to listed=true
-- - Owned by the listing seller (user_seller_id)

BEGIN;

-- Get the Unspecified location ID
DO $$
DECLARE
    v_unspecified_location_id UUID;
BEGIN
    -- Get the Unspecified location ID
    SELECT location_id INTO v_unspecified_location_id
    FROM public.locations
    WHERE name = 'Unspecified' AND is_preset = true
    LIMIT 1;

    -- If Unspecified location doesn't exist, create it
    IF v_unspecified_location_id IS NULL THEN
        INSERT INTO public.locations (name, is_preset, display_order)
        VALUES ('Unspecified', true, 0)
        RETURNING location_id INTO v_unspecified_location_id;
    END IF;

    -- Migrate existing stock to lots
    -- Only migrate listings with quantity_available > 0
    INSERT INTO public.stock_lots (
        listing_id,
        quantity_total,
        location_id,
        owner_id,
        listed,
        created_at
    )
    SELECT 
        ml.listing_id,
        ml.quantity_available,
        v_unspecified_location_id,
        ml.user_seller_id,
        true,
        ml.timestamp
    FROM public.market_listings ml
    WHERE ml.quantity_available > 0
    -- Only migrate if no lots exist for this listing yet
    AND NOT EXISTS (
        SELECT 1 
        FROM public.stock_lots sl 
        WHERE sl.listing_id = ml.listing_id
    );

    -- Log the migration results
    RAISE NOTICE 'Migration completed. Migrated % listings to stock_lots.',
        (SELECT COUNT(*) FROM public.stock_lots);
END $$;

-- ============================================================================
-- Validation Query
-- Verify that quantities match between old and new systems
-- ============================================================================

-- This query should return no rows if migration was successful
-- Any rows returned indicate a mismatch that needs investigation
SELECT 
    ml.listing_id,
    ml.quantity_available as old_quantity,
    public.get_total_stock(ml.listing_id) as new_quantity,
    ml.quantity_available - public.get_total_stock(ml.listing_id) as difference,
    CASE 
        WHEN ml.quantity_available = public.get_total_stock(ml.listing_id) THEN 'OK'
        ELSE 'MISMATCH'
    END as status
FROM public.market_listings ml
WHERE ml.quantity_available > 0
AND ml.quantity_available != public.get_total_stock(ml.listing_id)
ORDER BY difference DESC;

-- Summary statistics
SELECT 
    COUNT(*) as total_listings_with_stock,
    SUM(ml.quantity_available) as total_old_quantity,
    SUM(public.get_total_stock(ml.listing_id)) as total_new_quantity,
    SUM(ml.quantity_available) - SUM(public.get_total_stock(ml.listing_id)) as total_difference
FROM public.market_listings ml
WHERE ml.quantity_available > 0;

COMMIT;

-- ============================================================================
-- Rollback Script
-- Use this to rollback the migration if needed
-- ============================================================================

-- ROLLBACK INSTRUCTIONS:
-- If you need to rollback this migration, run the following:
--
-- BEGIN;
-- 
-- -- Delete all stock lots
-- DELETE FROM public.stock_allocations;
-- DELETE FROM public.stock_lots;
-- 
-- -- Verify market_listings.quantity_available is still intact
-- SELECT COUNT(*) as listings_with_stock
-- FROM public.market_listings
-- WHERE quantity_available > 0;
-- 
-- COMMIT;
