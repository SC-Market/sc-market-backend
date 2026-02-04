-- Trigger to automatically update market_listings.quantity_available
-- when stock_lots or stock_allocations change

-- Function to recalculate quantity_available for a listing
CREATE OR REPLACE FUNCTION update_listing_quantity_available()
RETURNS TRIGGER AS $$
DECLARE
    affected_listing_id UUID;
    total_stock BIGINT;
    allocated_stock BIGINT;
BEGIN
    -- Determine which listing_id was affected
    IF TG_TABLE_NAME = 'stock_lots' THEN
        IF TG_OP = 'DELETE' THEN
            affected_listing_id := OLD.listing_id;
        ELSE
            affected_listing_id := NEW.listing_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'stock_allocations' THEN
        -- Get listing_id from the lot
        IF TG_OP = 'DELETE' THEN
            SELECT listing_id INTO affected_listing_id
            FROM stock_lots
            WHERE lot_id = OLD.lot_id;
        ELSE
            SELECT listing_id INTO affected_listing_id
            FROM stock_lots
            WHERE lot_id = NEW.lot_id;
        END IF;
    END IF;

    -- Calculate total stock for the listing
    SELECT COALESCE(SUM(quantity_total), 0) INTO total_stock
    FROM stock_lots
    WHERE listing_id = affected_listing_id;

    -- Calculate allocated stock for the listing
    SELECT COALESCE(SUM(sa.quantity), 0) INTO allocated_stock
    FROM stock_allocations sa
    JOIN stock_lots sl ON sa.lot_id = sl.lot_id
    WHERE sl.listing_id = affected_listing_id;

    -- Update the market_listings table
    UPDATE market_listings
    SET quantity_available = total_stock - allocated_stock
    WHERE listing_id = affected_listing_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_quantity_on_lot_change ON stock_lots;
DROP TRIGGER IF EXISTS trigger_update_quantity_on_allocation_change ON stock_allocations;

-- Trigger on stock_lots changes
CREATE TRIGGER trigger_update_quantity_on_lot_change
AFTER INSERT OR UPDATE OR DELETE ON stock_lots
FOR EACH ROW
EXECUTE FUNCTION update_listing_quantity_available();

-- Trigger on stock_allocations changes
CREATE TRIGGER trigger_update_quantity_on_allocation_change
AFTER INSERT OR UPDATE OR DELETE ON stock_allocations
FOR EACH ROW
EXECUTE FUNCTION update_listing_quantity_available();
