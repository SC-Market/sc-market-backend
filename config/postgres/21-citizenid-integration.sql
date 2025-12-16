-- Migration: Citizen ID Integration
-- Description: Adds support for multiple authentication providers (Discord, Citizen ID, etc.)
--              and separates integration settings from authentication data

BEGIN;

-- Create account_providers table for authentication providers
CREATE TABLE IF NOT EXISTS account_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
    
    -- Provider Identity
    provider_type VARCHAR(50) NOT NULL,  -- 'discord', 'citizenid', 'rsi', etc.
    provider_id VARCHAR(255) NOT NULL,   -- Provider's user ID
    
    -- OAuth Tokens (for OAuth providers)
    access_token TEXT,           -- OAuth access token
    refresh_token TEXT,          -- OAuth refresh token
    token_expires_at TIMESTAMP,
    
    -- Provider Metadata (JSONB for flexibility)
    metadata JSONB,                      -- Provider-specific data
    -- Example for Discord: {"username": "user#1234", "discriminator": "1234"}
    -- Example for Citizen ID: {"roles": ["Citizen"], "email": "user@example.com"}
    -- Example for RSI: {"handle": "@user", "verified": true}
    
    -- Status
    is_primary BOOLEAN DEFAULT false,     -- Primary auth method
    linked_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_provider_per_user UNIQUE (user_id, provider_type),
    CONSTRAINT unique_provider_id UNIQUE (provider_type, provider_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_providers_user_id ON account_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_account_providers_lookup ON account_providers(provider_type, provider_id);
CREATE INDEX IF NOT EXISTS idx_account_providers_primary ON account_providers(user_id, is_primary) WHERE is_primary = true;

-- Add comments
COMMENT ON TABLE account_providers IS 'Authentication providers linked to user accounts';
COMMENT ON COLUMN account_providers.provider_type IS 'Type of provider: discord, citizenid, rsi, etc.';
COMMENT ON COLUMN account_providers.provider_id IS 'The unique identifier from the provider';
COMMENT ON COLUMN account_providers.is_primary IS 'Whether this is the primary authentication method for the user';
COMMENT ON COLUMN account_providers.metadata IS 'Provider-specific metadata stored as JSON';
COMMENT ON COLUMN account_providers.token_expires_at IS 'When the access token expires. NULL means expiration unknown (will be set on first refresh). Tokens are automatically refreshed when expired or expiring soon.';

-- Create account_integrations table for integration settings
CREATE TABLE IF NOT EXISTS account_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
    
    -- Integration Type
    integration_type VARCHAR(50) NOT NULL,  -- 'discord', 'slack', 'email', etc.
    
    -- Integration Settings (JSONB for flexibility)
    settings JSONB NOT NULL DEFAULT '{}',
    -- Example for Discord:
    -- {
    --   "official_server_id": "123456789",
    --   "discord_thread_channel_id": "987654321",
    --   "notifications_enabled": true,
    --   "notification_types": ["orders", "offers", "messages"]
    -- }
    
    -- Status
    enabled BOOLEAN DEFAULT true,
    configured_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    
    CONSTRAINT unique_integration_per_user UNIQUE (user_id, integration_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_integrations_user_id ON account_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_account_integrations_type ON account_integrations(integration_type);

-- Add comments
COMMENT ON TABLE account_integrations IS 'Integration settings for user accounts (e.g., Discord notifications)';
COMMENT ON COLUMN account_integrations.integration_type IS 'Type of integration: discord, slack, email, etc.';
COMMENT ON COLUMN account_integrations.settings IS 'Integration-specific settings stored as JSON';

-- Make discord_id nullable to support users without Discord
ALTER TABLE accounts ALTER COLUMN discord_id DROP NOT NULL;
ALTER TABLE accounts ALTER COLUMN discord_id SET DEFAULT NULL;

-- Migrate existing Discord authentication data to account_providers
-- Note: token_expires_at is set to NULL for migrated tokens since we don't know when they were issued.
-- They will be updated with proper expiration times when refreshed or on next login.
INSERT INTO account_providers (user_id, provider_type, provider_id, access_token, refresh_token, token_expires_at, is_primary, linked_at)
SELECT 
    user_id,
    'discord',
    discord_id::text,
    discord_access_token,
    discord_refresh_token,
    NULL,  -- Expiration unknown for existing tokens, will be set on refresh
    true,  -- All existing Discord accounts are primary
    COALESCE(created_at, NOW())
FROM accounts
WHERE discord_id IS NOT NULL
ON CONFLICT (user_id, provider_type) DO NOTHING;

-- Migrate existing Discord integration settings to account_integrations
INSERT INTO account_integrations (user_id, integration_type, settings, enabled, configured_at)
SELECT 
    user_id,
    'discord',
    jsonb_build_object(
        'official_server_id', official_server_id::text,
        'discord_thread_channel_id', discord_thread_channel_id::text
    ),
    true,
    COALESCE(created_at, NOW())
FROM accounts
WHERE official_server_id IS NOT NULL OR discord_thread_channel_id IS NOT NULL
ON CONFLICT (user_id, integration_type) 
DO UPDATE SET 
    settings = EXCLUDED.settings,
    last_used_at = NOW();

-- Migrate RSI data to account_providers (if spectrum_user_id exists)
INSERT INTO account_providers (user_id, provider_type, provider_id, metadata, is_primary, linked_at)
SELECT 
    user_id,
    'rsi',
    spectrum_user_id,
    jsonb_build_object('verified', rsi_confirmed),
    false,  -- RSI is not a primary auth method
    COALESCE(created_at, NOW())
FROM accounts
WHERE spectrum_user_id IS NOT NULL
ON CONFLICT (user_id, provider_type) DO NOTHING;

COMMIT;
