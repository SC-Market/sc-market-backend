-- Migration: Add allocation_mode setting type
-- Description: Extends order_settings to support configuring allocation behavior (auto, manual, none)

-- =============================================================================
-- 1. UPDATE CHECK CONSTRAINT
-- =============================================================================

-- Drop the existing constraint
ALTER TABLE public.order_settings 
DROP CONSTRAINT IF EXISTS order_settings_setting_type_check;

-- Add the updated constraint with the new setting type
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
    'max_order_value',
    'allocation_mode'
));

-- =============================================================================
-- 2. UPDATE TABLE COMMENT
-- =============================================================================

COMMENT ON COLUMN public.order_settings.setting_type IS 
'Type of setting: offer_message, order_message, require_availability, stock_subtraction_timing, min_order_size, max_order_size, min_order_value, max_order_value, or allocation_mode';

-- =============================================================================
-- 3. ADD COMMENT FOR ALLOCATION_MODE
-- =============================================================================

COMMENT ON TABLE public.order_settings IS 
'Custom messages and settings for orders and offers. 
allocation_mode values stored in message_content: auto (default), manual, none';
