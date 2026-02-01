-- Migration: Add game item attributes system
-- This migration creates tables for storing flexible key-value attributes for game items
-- and admin-managed attribute definitions

-- Create attribute_definitions table for admin-managed attribute schema
CREATE TABLE IF NOT EXISTS public.attribute_definitions (
    attribute_name VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    attribute_type VARCHAR(20) NOT NULL CHECK (attribute_type IN ('select', 'multiselect', 'range', 'text')),
    allowed_values TEXT[], -- NULL for free-form, array for enums
    applicable_item_types VARCHAR(50)[], -- Which item types this applies to
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.attribute_definitions IS 'Defines valid attributes and their UI presentation for game items';
COMMENT ON COLUMN public.attribute_definitions.attribute_name IS 'Unique identifier for the attribute (e.g., "size", "class", "manufacturer")';
COMMENT ON COLUMN public.attribute_definitions.display_name IS 'Human-readable name shown in UI';
COMMENT ON COLUMN public.attribute_definitions.attribute_type IS 'UI control type: select, multiselect, range, or text';
COMMENT ON COLUMN public.attribute_definitions.allowed_values IS 'Array of valid values for enum-type attributes, NULL for free-form';
COMMENT ON COLUMN public.attribute_definitions.applicable_item_types IS 'Array of game item types this attribute applies to';
COMMENT ON COLUMN public.attribute_definitions.display_order IS 'Order in which to display this attribute in the UI';

-- Create game_item_attributes table with composite primary key
CREATE TABLE IF NOT EXISTS public.game_item_attributes (
    game_item_id UUID NOT NULL REFERENCES public.game_items(id) ON DELETE CASCADE,
    attribute_name VARCHAR(50) NOT NULL,
    attribute_value VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (game_item_id, attribute_name)
);

COMMENT ON TABLE public.game_item_attributes IS 'Stores key-value attributes for game items';
COMMENT ON COLUMN public.game_item_attributes.game_item_id IS 'Foreign key to game_items table';
COMMENT ON COLUMN public.game_item_attributes.attribute_name IS 'Name of the attribute (e.g., "size", "class")';
COMMENT ON COLUMN public.game_item_attributes.attribute_value IS 'Value of the attribute (e.g., "4", "Military")';

-- Create indexes for query optimization
-- Index on game_item_id for efficient lookups when joining with market search
CREATE INDEX IF NOT EXISTS idx_game_item_attributes_item_id 
    ON public.game_item_attributes(game_item_id);

-- Composite index on attribute_name and attribute_value for efficient filtering
CREATE INDEX IF NOT EXISTS idx_game_item_attributes_name_value 
    ON public.game_item_attributes(attribute_name, attribute_value);

-- Index on attribute_name alone for queries that filter by attribute name
CREATE INDEX IF NOT EXISTS idx_game_item_attributes_name 
    ON public.game_item_attributes(attribute_name);

COMMENT ON INDEX idx_game_item_attributes_item_id IS 'Optimizes joins with game_items and market search queries';
COMMENT ON INDEX idx_game_item_attributes_name_value IS 'Optimizes filtering by specific attribute name-value pairs';
COMMENT ON INDEX idx_game_item_attributes_name IS 'Optimizes queries that filter by attribute name';
