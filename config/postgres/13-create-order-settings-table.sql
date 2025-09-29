-- Migration: Create order_settings table
-- Description: Adds support for custom order and offer messages for users and contractors

-- =============================================================================
-- 1. CREATE ORDER_SETTINGS TABLE
-- =============================================================================

CREATE TABLE public.order_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Entity this setting belongs to (either user or contractor)
    entity_type character varying(20) NOT NULL CHECK (entity_type IN ('user', 'contractor')),
    entity_id uuid NOT NULL, -- user_id or contractor_id
    
    -- Setting type
    setting_type character varying(50) NOT NULL CHECK (setting_type IN ('offer_message', 'order_message')),
    
    -- The actual message content
    message_content text NOT NULL DEFAULT '',
    
    -- Whether this setting is enabled
    enabled boolean NOT NULL DEFAULT true,
    
    -- Metadata
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    
    -- Constraints
    CONSTRAINT order_settings_unique_entity_setting UNIQUE (entity_type, entity_id, setting_type)
);

-- =============================================================================
-- 2. ADD FOREIGN KEY CONSTRAINTS
-- =============================================================================

-- Add foreign key constraints to ensure data integrity
-- Note: We can't add FK constraints directly because entity_id can reference either accounts or contractors
-- We'll rely on application-level validation for this

-- =============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX idx_order_settings_entity ON order_settings(entity_type, entity_id);
CREATE INDEX idx_order_settings_type ON order_settings(setting_type);
CREATE INDEX idx_order_settings_enabled ON order_settings(enabled);

-- =============================================================================
-- 4. ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE order_settings IS 'Custom messages for orders and offers';
COMMENT ON COLUMN order_settings.entity_type IS 'Type of entity: user or contractor';
COMMENT ON COLUMN order_settings.entity_id IS 'ID of the user or contractor';
COMMENT ON COLUMN order_settings.setting_type IS 'Type of setting: offer_message or order_message';
COMMENT ON COLUMN order_settings.message_content IS 'The message content to send';
COMMENT ON COLUMN order_settings.enabled IS 'Whether this setting is active';

-- =============================================================================
-- 5. SET TABLE OWNER
-- =============================================================================

ALTER TABLE public.order_settings OWNER TO scmarket;