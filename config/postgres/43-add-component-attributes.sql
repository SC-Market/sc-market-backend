-- Migration 43: Add component attribute columns to game_items table
-- This migration adds columns for ship component attributes including size, grade, class, manufacturer, and type
-- Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7

-- Add new columns to game_items table
ALTER TABLE game_items 
ADD COLUMN IF NOT EXISTS component_size INTEGER,
ADD COLUMN IF NOT EXISTS component_grade CHAR(1),
ADD COLUMN IF NOT EXISTS component_class VARCHAR(50),
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
ADD COLUMN IF NOT EXISTS component_type VARCHAR(50);

-- Create individual indexes for efficient filtering on each column
CREATE INDEX IF NOT EXISTS idx_game_items_component_size 
ON game_items(component_size) 
WHERE component_size IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_game_items_component_grade 
ON game_items(component_grade) 
WHERE component_grade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_game_items_component_class 
ON game_items(component_class) 
WHERE component_class IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_game_items_manufacturer 
ON game_items(manufacturer) 
WHERE manufacturer IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_game_items_component_type 
ON game_items(component_type) 
WHERE component_type IS NOT NULL;

-- Create composite index for common filter combinations
-- This index supports queries that filter by multiple component attributes simultaneously
CREATE INDEX IF NOT EXISTS idx_game_items_component_filters 
ON game_items(component_type, component_size, component_grade, manufacturer) 
WHERE component_type IS NOT NULL 
   OR component_size IS NOT NULL 
   OR component_grade IS NOT NULL 
   OR manufacturer IS NOT NULL;

-- Add comments to document the columns
COMMENT ON COLUMN game_items.component_size IS 'Size class of ship components (0-12), e.g., Size 3 Quantum Drive';
COMMENT ON COLUMN game_items.component_grade IS 'Quality grade for non-weapon components (A, B, C, D), where A is highest quality';
COMMENT ON COLUMN game_items.component_class IS 'Performance/design classification (Military, Stealth, Industrial, Civilian, Competition, Racing)';
COMMENT ON COLUMN game_items.manufacturer IS 'In-game manufacturer/company name (e.g., Crusader Industries, Behring)';
COMMENT ON COLUMN game_items.component_type IS 'Functional category (Quantum Drive, Cooler, Shield Generator, Power Plant, Ship Weapon)';
