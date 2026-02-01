-- Add delivery_preference column to market_listing_details
ALTER TABLE market_listing_details
ADD COLUMN delivery_preference VARCHAR(20)
CHECK (delivery_preference IN ('delivery', 'pickup', 'any'));

COMMENT ON COLUMN market_listing_details.delivery_preference IS 'Whether seller offers delivery, requires pickup, or allows either (null = not specified)';
