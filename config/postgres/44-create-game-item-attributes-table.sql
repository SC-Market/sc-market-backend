-- Migration 44: Create game_item_attributes table for flexible attribute storage
-- This migration creates a key-value table for storing all game item attributes
-- Requirements: 14.1, 14.3, 16.1, 16.2, 16.3, 16.4, 16.5

-- Create the game_item_attributes table
CREATE TABLE IF NOT EXISTS game_item_attributes (
  id SERIAL PRIMARY KEY,
  game_item_id UUID NOT NULL,
  attribute_key VARCHAR(100) NOT NULL,
  attribute_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraint to game_items with CASCADE delete
  CONSTRAINT fk_game_item_attributes_game_item 
    FOREIGN KEY (game_item_id) 
    REFERENCES game_items(id) 
    ON DELETE CASCADE,
  
  -- Ensure unique key per item (one value per attribute key per item)
  CONSTRAINT game_item_attributes_unique_key 
    UNIQUE (game_item_id, attribute_key)
);

-- Composite index for looking up all attributes of a specific item
-- This supports queries like: "Get all attributes for item X"
CREATE INDEX IF NOT EXISTS idx_game_item_attributes_item_key 
ON game_item_attributes(game_item_id, attribute_key);

-- Index for filtering items by attribute (MOST IMPORTANT for search performance)
-- This supports queries like: "Find all items where attribute_key='component_size' AND attribute_value='3'"
CREATE INDEX IF NOT EXISTS idx_game_item_attributes_key_value 
ON game_item_attributes(attribute_key, attribute_value);

-- Index for reverse lookup (which items have this attribute)
-- This supports queries like: "Find all items that have attribute_key='armor_class'"
CREATE INDEX IF NOT EXISTS idx_game_item_attributes_key 
ON game_item_attributes(attribute_key);

-- Add table and column comments for documentation
COMMENT ON TABLE game_item_attributes IS 
'Flexible key-value storage for all game item attributes. Allows adding new attributes without schema changes.';

COMMENT ON COLUMN game_item_attributes.game_item_id IS 
'Foreign key reference to game_items table. Links attributes to specific game items.';

COMMENT ON COLUMN game_item_attributes.attribute_key IS 
'Attribute name/key. Standard keys include: component_size, component_grade, component_class, manufacturer, component_type, armor_class, color. Custom keys can be added without schema changes.';

COMMENT ON COLUMN game_item_attributes.attribute_value IS 
'Attribute value stored as text. All values are stored as strings for flexibility.';

-- Document standard attribute keys
COMMENT ON TABLE game_item_attributes IS 
'Flexible key-value storage for all game item attributes.

Standard Attribute Keys:
- component_size: Size class of ship components (e.g., "1", "2", "3", "12")
- component_grade: Quality grade for non-weapon components (e.g., "A", "B", "C", "D")
- component_class: Performance/design classification (e.g., "Military", "Stealth", "Industrial", "Civilian", "Competition", "Racing")
- manufacturer: In-game manufacturer/company name (e.g., "Crusader Industries", "Behring", "Origin Jumpworks")
- component_type: Functional category (e.g., "Quantum Drive", "Cooler", "Shield Generator", "Power Plant", "Ship Weapon")
- armor_class: Weight classification of armor items (e.g., "Light", "Medium", "Heavy")
- color: Visual color or paint scheme (e.g., "Red", "Blue", "Black", "Camo")

Custom attributes can be added by simply inserting new key-value pairs without any schema changes.
Examples: weight, durability, faction, rarity, etc.';
