-- Migration: Add composite indexes for common attribute filter combinations
-- This migration adds optimized indexes for frequently used attribute combinations
-- to improve query performance when filtering by multiple attributes

-- Composite index for component filters (size + class)
-- Common use case: filtering quantum drives by size and class
CREATE INDEX IF NOT EXISTS idx_game_item_attrs_size_class
  ON public.game_item_attributes(game_item_id, attribute_name, attribute_value)
  WHERE attribute_name IN ('size', 'class');

COMMENT ON INDEX idx_game_item_attrs_size_class IS 'Optimizes queries filtering by both size and class attributes';

-- Composite index for component filters (size + grade)
-- Common use case: filtering components by size and grade
CREATE INDEX IF NOT EXISTS idx_game_item_attrs_size_grade
  ON public.game_item_attributes(game_item_id, attribute_name, attribute_value)
  WHERE attribute_name IN ('size', 'grade');

COMMENT ON INDEX idx_game_item_attrs_size_grade IS 'Optimizes queries filtering by both size and grade attributes';

-- Composite index for component filters (class + manufacturer)
-- Common use case: filtering by class and manufacturer
CREATE INDEX IF NOT EXISTS idx_game_item_attrs_class_manufacturer
  ON public.game_item_attributes(game_item_id, attribute_name, attribute_value)
  WHERE attribute_name IN ('class', 'manufacturer');

COMMENT ON INDEX idx_game_item_attrs_class_manufacturer IS 'Optimizes queries filtering by both class and manufacturer attributes';

-- Composite index for armor filters (armor_type + color)
-- Common use case: filtering armor by type and color
CREATE INDEX IF NOT EXISTS idx_game_item_attrs_armor_type_color
  ON public.game_item_attributes(game_item_id, attribute_name, attribute_value)
  WHERE attribute_name IN ('armor_type', 'color');

COMMENT ON INDEX idx_game_item_attrs_armor_type_color IS 'Optimizes queries filtering by both armor type and color attributes';

-- Covering index for attribute lookups with all columns
-- This allows index-only scans for common queries
CREATE INDEX IF NOT EXISTS idx_game_item_attrs_covering
  ON public.game_item_attributes(attribute_name, attribute_value, game_item_id);

COMMENT ON INDEX idx_game_item_attrs_covering IS 'Covering index for index-only scans on attribute queries';

-- Analyze the table to update statistics for the query planner
ANALYZE public.game_item_attributes;
