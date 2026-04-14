-- Fix quantity_available sync: only active allocations reserve stock.
-- Fulfilled/released rows still store their original quantity for audit; counting
-- them made total_stock - allocated_stock negative after consumeAllocations
-- reduced lot quantities (double-count). Clamp so quantity_available stays >= 0
-- if a race still allows allocated > total briefly.

CREATE OR REPLACE FUNCTION update_listing_quantity_available()
RETURNS TRIGGER AS $$
DECLARE
    affected_listing_id UUID;
    total_stock BIGINT;
    allocated_stock BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'stock_lots' THEN
        IF TG_OP = 'DELETE' THEN
            affected_listing_id := OLD.listing_id;
        ELSE
            affected_listing_id := NEW.listing_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'stock_allocations' THEN
        IF TG_OP = 'DELETE' THEN
            SELECT listing_id INTO affected_listing_id
            FROM stock_lots
            WHERE lot_id = OLD.lot_id::uuid;
        ELSE
            SELECT listing_id INTO affected_listing_id
            FROM stock_lots
            WHERE lot_id = NEW.lot_id::uuid;
        END IF;
    END IF;

    SELECT COALESCE(SUM(quantity_total), 0) INTO total_stock
    FROM stock_lots
    WHERE listing_id = affected_listing_id;

    SELECT COALESCE(SUM(sa.quantity), 0) INTO allocated_stock
    FROM stock_allocations sa
    JOIN stock_lots sl ON sa.lot_id = sl.lot_id
    WHERE sl.listing_id = affected_listing_id
    AND sa.status = 'active';

    UPDATE market_listings
    SET quantity_available = GREATEST(0, total_stock - allocated_stock)
    WHERE listing_id = affected_listing_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
