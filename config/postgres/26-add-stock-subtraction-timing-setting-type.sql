-- Migration: Add stock_subtraction_timing setting type
-- Description: Extends order_settings to support configuring when stock is subtracted (on order received or on order accepted)

-- =============================================================================
-- 1. UPDATE CHECK CONSTRAINT
-- =============================================================================

-- Drop the existing constraint
ALTER TABLE public.order_settings 
DROP CONSTRAINT IF EXISTS order_settings_setting_type_check;

-- Add the updated constraint with the new setting type
ALTER TABLE public.order_settings 
ADD CONSTRAINT order_settings_setting_type_check 
CHECK (setting_type IN ('offer_message', 'order_message', 'require_availability', 'stock_subtraction_timing'));

-- =============================================================================
-- 2. UPDATE TABLE COMMENT
-- =============================================================================

COMMENT ON COLUMN public.order_settings.setting_type IS 
'Type of setting: offer_message, order_message, require_availability, or stock_subtraction_timing';
