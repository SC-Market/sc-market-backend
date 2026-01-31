-- Migration: Add component attributes to game_items table
-- This migration adds columns for ship component attributes including size, grade, class, manufacturer, and type
-- Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Add new columns to game_items table
ALTER TABLE public.game_items 
ADD COLUMN IF NOT EXISTS component_size INTEGER,
ADD COLUMN IF NOT EXISTS component_grade CHAR(1),
ADD COLUMN IF NOT EXISTS component_class VARCHAR(50),
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
ADD COLUMN IF NOT EXISTS component_type VARCHAR(50);

-- Add check constraint for component_size (valid range 0-12)
ALTER TABLE public.game_items
ADD CONSTRAINT game_items_component_size_check 
CHECK (component_size IS NULL OR (component_size >= 0 AND component_size <= 12));

-- Add check constraint for component_grade (valid grades A, B, C, D)
ALTER TABLE public.game_items
ADD CONSTRAINT game_items_component_grade_check 
CHECK (component_grade IS NULL OR component_grade IN ('A', 'B', 'C', 'D'));

-- Add comments to document the new columns
COMMENT ON COLUMN public.game_items.component_size IS 'Size class of the component (0-12), nullable for non-components';
COMMENT ON COLUMN public.game_items.component_grade IS 'Quality grade of non-weapon components (A, B, C, D), nullable for weapons and non-components';
COMMENT ON COLUMN public.game_items.component_class IS 'Performance classification (Military, Stealth, Industrial, Civilian, Competition, Racing), nullable';
COMMENT ON COLUMN public.game_items.manufacturer IS 'In-game manufacturer name, nullable';
COMMENT ON COLUMN public.game_items.component_type IS 'Component type (Quantum Drive, Cooler, Shield Generator, Power Plant, Ship Weapon), nullable for non-components';

-- Create indexes for efficient filtering on the new columns
CREATE INDEX IF NOT EXISTS idx_game_items_component_size ON public.game_items(component_size) WHERE component_size IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_items_component_grade ON public.game_items(component_grade) WHERE component_grade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_items_component_class ON public.game_items(component_class) WHERE component_class IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_items_manufacturer ON public.game_items(manufacturer) WHERE manufacturer IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_items_component_type ON public.game_items(component_type) WHERE component_type IS NOT NULL;

-- Create composite index for common filter combinations
-- This index optimizes queries that filter by multiple component attributes simultaneously
CREATE INDEX IF NOT EXISTS idx_game_items_component_filters 
ON public.game_items(component_type, component_size, component_grade, component_class, manufacturer) 
WHERE component_type IS NOT NULL;

-- Add comment to document the composite index
COMMENT ON INDEX public.idx_game_items_component_filters IS 'Composite index for efficient multi-attribute component filtering';
