-- Migration: Add contractor access control to API tokens
-- This migration adds contractor restrictions to the api_tokens table

-- Add contractor_ids column to api_tokens table
ALTER TABLE api_tokens 
ADD COLUMN contractor_ids UUID[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN api_tokens.contractor_ids IS 'Array of contractor UUIDs that this token has access to. Empty array means no restrictions.';

-- Create GIN index for efficient array queries
CREATE INDEX idx_api_tokens_contractor_ids ON api_tokens USING GIN(contractor_ids);

-- Add constraint to ensure contractor_ids is not null
ALTER TABLE api_tokens 
ADD CONSTRAINT chk_contractor_ids_not_null 
CHECK (contractor_ids IS NOT NULL);

-- Update existing tokens to have empty contractor_ids array (no restrictions)
UPDATE api_tokens 
SET contractor_ids = '{}' 
WHERE contractor_ids IS NULL;

-- Add comment for the index
COMMENT ON INDEX idx_api_tokens_contractor_ids IS 'GIN index for efficient queries on contractor_ids array';