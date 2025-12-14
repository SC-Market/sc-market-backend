BEGIN;

-- Change order_offers.description and orders.description from VARCHAR(2000) to TEXT
-- This allows merged offers to have longer descriptions while middleware
-- still enforces the 2000 character limit for individual offers/orders
ALTER TABLE order_offers 
  ALTER COLUMN description TYPE TEXT;

ALTER TABLE orders 
  ALTER COLUMN description TYPE TEXT;

COMMIT;
