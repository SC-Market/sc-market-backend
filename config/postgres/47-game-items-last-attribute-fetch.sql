-- Add last_attribute_fetch column to track when attributes were last updated
ALTER TABLE game_items ADD COLUMN last_attribute_fetch TIMESTAMP;

-- Create index for efficient queries
CREATE INDEX idx_game_items_last_attribute_fetch ON game_items(last_attribute_fetch);
