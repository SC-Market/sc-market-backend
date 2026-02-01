-- Add uex_uuid column to game_items table
ALTER TABLE game_items ADD COLUMN uex_uuid uuid;

-- Create index for lookups
CREATE INDEX idx_game_items_uex_uuid ON game_items(uex_uuid);
