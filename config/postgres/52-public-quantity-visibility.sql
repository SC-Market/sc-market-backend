-- ============================================================================
-- Migration 52: Public Quantity Visibility
-- ============================================================================
-- This migration adds support for stock_subtraction_timing setting to control
-- what quantity is shown to the public, independent of physical allocation.
--
-- Requirements: 5.7, 12.1
-- ============================================================================

-- Function to get public-facing quantity for a listing based on stock_subtraction_timing
-- This is separate from physical allocation and controls what buyers see
CREATE OR REPLACE FUNCTION public.get_public_quantity(
    p_listing_id UUID,
    p_stock_subtraction_timing TEXT DEFAULT 'on_accepted'
) 
RETURNS INTEGER AS $$
DECLARE
    v_available INTEGER;
    v_reserved INTEGER;
BEGIN
    -- Get available and reserved stock
    v_available := public.get_available_stock(p_listing_id);
    v_reserved := public.get_reserved_stock(p_listing_id);
    
    -- Apply visibility logic based on stock_subtraction_timing
    CASE p_stock_subtraction_timing
        -- 'on_accepted' (default): Show only available stock (hide allocated)
        WHEN 'on_accepted' THEN
            RETURN v_available;
        
        -- 'on_received': Show available + reserved (hide nothing until offer received)
        WHEN 'on_received' THEN
            RETURN v_available + v_reserved;
        
        -- 'dont_subtract': Show available + reserved (never hide stock)
        WHEN 'dont_subtract' THEN
            RETURN v_available + v_reserved;
        
        -- Default to 'on_accepted' behavior
        ELSE
            RETURN v_available;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

ALTER FUNCTION public.get_public_quantity(UUID, TEXT) OWNER TO scmarket;

-- Update the sync trigger to look up the actual stock_subtraction_timing setting
-- This ensures quantity_available reflects the correct public visibility for each listing
CREATE OR REPLACE FUNCTION public.sync_listing_quantity() 
RETURNS TRIGGER AS $$
DECLARE
    v_listing_id UUID;
    v_user_id UUID;
    v_contractor_id UUID;
    v_stock_subtraction_timing TEXT;
BEGIN
    -- Determine the listing_id based on the operation
    IF TG_OP = 'DELETE' THEN
        v_listing_id := OLD.listing_id;
    ELSE
        v_listing_id := NEW.listing_id;
    END IF;

    -- Get the listing's seller info to look up their setting
    SELECT user_seller_id, contractor_seller_id
    INTO v_user_id, v_contractor_id
    FROM public.market_listings
    WHERE listing_id = v_listing_id;

    -- Look up stock_subtraction_timing setting (contractor takes precedence over user)
    -- Default to 'on_accepted' if no setting exists
    SELECT COALESCE(
        (SELECT message_content 
         FROM public.order_settings 
         WHERE setting_type = 'stock_subtraction_timing'
         AND entity_type = 'contractor'
         AND entity_id = v_contractor_id
         LIMIT 1),
        (SELECT message_content 
         FROM public.order_settings 
         WHERE setting_type = 'stock_subtraction_timing'
         AND entity_type = 'user'
         AND entity_id = v_user_id
         LIMIT 1),
        'on_accepted'
    ) INTO v_stock_subtraction_timing;

    -- Update the market_listings quantity_available using the appropriate setting
    UPDATE public.market_listings
    SET quantity_available = public.get_public_quantity(v_listing_id, v_stock_subtraction_timing)
    WHERE listing_id = v_listing_id;

    -- Return appropriate value based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.sync_listing_quantity() OWNER TO scmarket;

-- Trigger function to update all listing quantities when stock_subtraction_timing setting changes
CREATE OR REPLACE FUNCTION public.sync_listings_on_setting_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process if this is a stock_subtraction_timing setting
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.setting_type = 'stock_subtraction_timing' THEN
        -- Update all listings for this user or contractor
        UPDATE public.market_listings
        SET quantity_available = public.get_public_quantity(listing_id, NEW.message_content)
        WHERE (NEW.entity_type = 'user' AND user_seller_id = NEW.entity_id)
           OR (NEW.entity_type = 'contractor' AND contractor_seller_id = NEW.entity_id);
    ELSIF TG_OP = 'DELETE' AND OLD.setting_type = 'stock_subtraction_timing' THEN
        -- Revert to default 'on_accepted' behavior
        UPDATE public.market_listings
        SET quantity_available = public.get_public_quantity(listing_id, 'on_accepted')
        WHERE (OLD.entity_type = 'user' AND user_seller_id = OLD.entity_id)
           OR (OLD.entity_type = 'contractor' AND contractor_seller_id = OLD.entity_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.sync_listings_on_setting_change() OWNER TO scmarket;

-- Create trigger on order_settings for stock_subtraction_timing changes
DROP TRIGGER IF EXISTS sync_listings_on_setting_change_trigger ON public.order_settings;
CREATE TRIGGER sync_listings_on_setting_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.order_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_listings_on_setting_change();
