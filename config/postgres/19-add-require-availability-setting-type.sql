-- Migration: Add require_availability setting type
-- Description: Extends order_settings to support requiring buyers to set availability before submitting offers

-- =============================================================================
-- 1. UPDATE CHECK CONSTRAINT
-- =============================================================================

-- Drop the existing constraint
ALTER TABLE public.order_settings 
DROP CONSTRAINT IF EXISTS order_settings_setting_type_check;

-- Add the updated constraint with the new setting type
ALTER TABLE public.order_settings 
ADD CONSTRAINT order_settings_setting_type_check 
CHECK (setting_type IN ('offer_message', 'order_message', 'require_availability'));

-- =============================================================================
-- 2. UPDATE TABLE COMMENT
-- =============================================================================

COMMENT ON COLUMN public.order_settings.setting_type IS 
'Type of setting: offer_message, order_message, or require_availability';
