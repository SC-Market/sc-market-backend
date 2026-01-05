-- Migration: Create user_emails table
-- Description: Stores user email addresses separately from accounts table.
--              Users can have one primary email address. Email addresses are
--              never automatically populated from auth providers (Discord, Citizen ID).
--              Users must manually add their email address.

BEGIN;

-- Create user_emails table
CREATE TABLE IF NOT EXISTS public.user_emails (
  email_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  email email NOT NULL,
  email_verified BOOLEAN DEFAULT false NOT NULL,
  is_primary BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  verified_at TIMESTAMP NULL,
  
  -- Constraints
  CONSTRAINT unique_email UNIQUE (email),
  CONSTRAINT unique_user_primary_email UNIQUE (user_id, is_primary) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_emails_email ON public.user_emails(email);
CREATE INDEX IF NOT EXISTS idx_user_emails_user ON public.user_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_user_emails_verified ON public.user_emails(user_id) 
  WHERE email_verified = true AND is_primary = true;
CREATE INDEX IF NOT EXISTS idx_user_emails_primary ON public.user_emails(user_id, is_primary) 
  WHERE is_primary = true;

-- Add comments for documentation
COMMENT ON TABLE public.user_emails IS 'Stores user email addresses separately from accounts table. Users must manually add their email - never auto-populated from auth providers.';
COMMENT ON COLUMN public.user_emails.email_id IS 'Primary key for email record';
COMMENT ON COLUMN public.user_emails.user_id IS 'Foreign key to accounts table';
COMMENT ON COLUMN public.user_emails.email IS 'Email address (validated using email domain type)';
COMMENT ON COLUMN public.user_emails.email_verified IS 'Whether the email address has been verified';
COMMENT ON COLUMN public.user_emails.is_primary IS 'Whether this is the primary email address for the user (one per user)';
COMMENT ON COLUMN public.user_emails.verified_at IS 'Timestamp when email was verified';
COMMENT ON CONSTRAINT unique_email ON public.user_emails IS 'Ensures each email address can only be associated with one account';
COMMENT ON CONSTRAINT unique_user_primary_email ON public.user_emails IS 'Ensures each user can only have one primary email address';

-- Set table owner
COMMIT;
