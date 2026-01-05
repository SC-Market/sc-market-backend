-- Migration: Create email_verification_tokens table
-- Description: Stores email verification tokens for verifying user email addresses.
--              Tokens expire after 24 hours and are single-use.

BEGIN;

-- Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES public.user_emails(email_id) ON DELETE CASCADE,
  email email NOT NULL, -- Denormalized for quick lookup
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  CONSTRAINT unique_token UNIQUE (token)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verification_token ON public.email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON public.email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_email ON public.email_verification_tokens(email_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON public.email_verification_tokens(expires_at);

-- Add comments for documentation
COMMENT ON TABLE public.email_verification_tokens IS 'Stores email verification tokens. Tokens expire after 24 hours and are single-use.';
COMMENT ON COLUMN public.email_verification_tokens.token_id IS 'Primary key for token record';
COMMENT ON COLUMN public.email_verification_tokens.user_id IS 'Foreign key to accounts table';
COMMENT ON COLUMN public.email_verification_tokens.email_id IS 'Foreign key to user_emails table';
COMMENT ON COLUMN public.email_verification_tokens.email IS 'Email address (denormalized for quick lookup)';
COMMENT ON COLUMN public.email_verification_tokens.token IS 'Unique verification token (cryptographically secure)';
COMMENT ON COLUMN public.email_verification_tokens.expires_at IS 'Token expiration timestamp (24 hours from creation)';
COMMENT ON COLUMN public.email_verification_tokens.used_at IS 'Timestamp when token was used (null if unused)';
COMMENT ON CONSTRAINT unique_token ON public.email_verification_tokens IS 'Ensures each verification token is unique';

-- Create function to cleanup expired tokens (can be called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_email_verification_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.email_verification_tokens
  WHERE expires_at < NOW()
     OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_email_verification_tokens() IS 'Cleans up expired and old used email verification tokens. Returns count of deleted tokens.';

COMMIT;
