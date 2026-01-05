-- Migration: Create email_unsubscribe_tokens table
-- Description: Stores email unsubscribe tokens for unsubscribing from email notifications.
--              Tokens don't expire (for permanent unsubscribe) but are single-use.

BEGIN;

-- Create email_unsubscribe_tokens table
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES public.user_emails(email_id) ON DELETE CASCADE,
  email email NOT NULL, -- Denormalized for quick lookup
  token VARCHAR(255) NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  CONSTRAINT unique_unsubscribe_token UNIQUE (token)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_token ON public.email_unsubscribe_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_user ON public.email_unsubscribe_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_email ON public.email_unsubscribe_tokens(email_id);

-- Add comments for documentation
COMMENT ON TABLE public.email_unsubscribe_tokens IS 'Stores email unsubscribe tokens. Tokens are single-use and do not expire.';
COMMENT ON COLUMN public.email_unsubscribe_tokens.token_id IS 'Primary key for token record';
COMMENT ON COLUMN public.email_unsubscribe_tokens.user_id IS 'Foreign key to accounts table';
COMMENT ON COLUMN public.email_unsubscribe_tokens.email_id IS 'Foreign key to user_emails table';
COMMENT ON COLUMN public.email_unsubscribe_tokens.email IS 'Email address (denormalized for quick lookup)';
COMMENT ON COLUMN public.email_unsubscribe_tokens.token IS 'Unique unsubscribe token (cryptographically secure)';
COMMENT ON COLUMN public.email_unsubscribe_tokens.used_at IS 'Timestamp when token was used (null if unused)';
COMMENT ON CONSTRAINT unique_unsubscribe_token ON public.email_unsubscribe_tokens IS 'Ensures each unsubscribe token is unique';

-- Create function to cleanup old used tokens (can be called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_old_email_unsubscribe_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.email_unsubscribe_tokens
  WHERE used_at IS NOT NULL AND used_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_email_unsubscribe_tokens() IS 'Cleans up old used unsubscribe tokens (older than 30 days). Returns count of deleted tokens.';

-- Set table owner
ALTER TABLE public.email_unsubscribe_tokens OWNER TO scmarket;

COMMIT;
