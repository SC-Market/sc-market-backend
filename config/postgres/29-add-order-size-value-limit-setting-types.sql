-- Migration: Add order size and value limit setting types
-- Description: Extends order_settings to support minimum and maximum order size and value limits for sellers

-- =============================================================================
-- 1. UPDATE CHECK CONSTRAINT
-- =============================================================================

-- Drop the existing constraint
ALTER TABLE public.order_settings 
DROP CONSTRAINT IF EXISTS order_settings_setting_type_check;

-- Add the updated constraint with the new setting types
ALTER TABLE public.order_settings 
ADD CONSTRAINT order_settings_setting_type_check 
CHECK (setting_type IN (
    'offer_message', 
    'order_message', 
    'require_availability', 
    'stock_subtraction_timing',
    'min_order_size',
    'max_order_size',
    'min_order_value',
    'max_order_value'
));

-- =============================================================================
-- 2. UPDATE TABLE COMMENT
-- =============================================================================

COMMENT ON COLUMN public.order_settings.setting_type IS 
'Type of setting: offer_message, order_message, require_availability, stock_subtraction_timing, min_order_size, max_order_size, min_order_value, or max_order_value';
