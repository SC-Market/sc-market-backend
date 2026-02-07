-- Add mobile_nav_tabs column to account_settings table
-- This allows users to customize which tabs appear in their mobile bottom navigation

ALTER TABLE account_settings
ADD COLUMN IF NOT EXISTS mobile_nav_tabs TEXT[];

-- Add comment to explain the column
COMMENT ON COLUMN account_settings.mobile_nav_tabs IS 'Array of tab IDs for customized mobile bottom navigation (max 5 tabs)';
