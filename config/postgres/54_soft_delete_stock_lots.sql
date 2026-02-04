-- Add soft delete support to stock_lots
-- Migration: 54_soft_delete_stock_lots.sql

-- Add deleted_at column
ALTER TABLE public.stock_lots 
ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

-- Create partial index for active (non-deleted) lots
CREATE INDEX idx_stock_lots_active 
ON public.stock_lots(listing_id, location_id) 
WHERE deleted_at IS NULL;

-- Update trigger to only consider non-deleted lots
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

    -- Calculate total stock for the listing (only non-deleted lots)
    SELECT COALESCE(SUM(quantity_total), 0) INTO total_stock
    FROM stock_lots
    WHERE listing_id = affected_listing_id
      AND deleted_at IS NULL;

    -- Calculate allocated stock for the listing (only non-deleted lots)
    SELECT COALESCE(SUM(sa.quantity), 0) INTO allocated_stock
    FROM stock_allocations sa
    JOIN stock_lots sl ON sa.lot_id = sl.lot_id
    WHERE sl.listing_id = affected_listing_id
      AND sl.deleted_at IS NULL;

    -- Update the market_listings table
    UPDATE market_listings
    SET quantity_available = total_stock - allocated_stock
    WHERE listing_id = affected_listing_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
