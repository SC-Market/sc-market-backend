-- Migration: Add show_in_filters column to attribute_definitions
-- This controls whether an attribute appears as a filter in the market sidebar

ALTER TABLE attribute_definitions
ADD COLUMN IF NOT EXISTS show_in_filters BOOLEAN NOT NULL DEFAULT false;

-- Set common filterable attributes to show by default
UPDATE attribute_definitions
SET show_in_filters = true
WHERE attribute_name IN ('size', 'class', 'manufacturer', 'grade', 'component_type', 'color', 'quality');

-- Create index for filtering queries
CREATE INDEX IF NOT EXISTS idx_attribute_definitions_show_in_filters
ON attribute_definitions(show_in_filters)
WHERE show_in_filters = true;
