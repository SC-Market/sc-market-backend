-- Migration: Create API tokens table
-- Description: Adds support for API token authentication with scoped permissions

CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_expires_at ON api_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_tokens_last_used_at ON api_tokens(last_used_at);

-- Add constraint to ensure scopes array is not empty
ALTER TABLE api_tokens ADD CONSTRAINT check_scopes_not_empty CHECK (array_length(scopes, 1) > 0);

-- Add constraint to ensure name is not empty
ALTER TABLE api_tokens ADD CONSTRAINT check_name_not_empty CHECK (length(trim(name)) > 0);

-- Add comment to table
COMMENT ON TABLE api_tokens IS 'API tokens for third-party integrations with scoped permissions';
COMMENT ON COLUMN api_tokens.token_hash IS 'SHA-256 hash of the actual token (never store plain text)';
COMMENT ON COLUMN api_tokens.scopes IS 'Array of permission scopes granted to this token';
COMMENT ON COLUMN api_tokens.expires_at IS 'Optional expiration date for the token';
COMMENT ON COLUMN api_tokens.last_used_at IS 'Timestamp of the last API call using this token';