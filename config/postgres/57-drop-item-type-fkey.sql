-- Drop foreign key constraint on item_type
ALTER TABLE market_listing_details 
DROP CONSTRAINT IF EXISTS market_listing_details_game_item_categories_subcategory_fk;
