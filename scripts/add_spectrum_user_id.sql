-- Migration to add spectrum_user_id column to accounts table
-- This column will store the primary identifier from the Spectrum API

ALTER TABLE public.accounts 
ADD COLUMN spectrum_user_id character varying(50);

-- Add index for performance on spectrum_user_id lookups
CREATE INDEX CONCURRENTLY idx_accounts_spectrum_user_id ON public.accounts(spectrum_user_id);

-- Add unique constraint to ensure each spectrum_user_id is only used once
ALTER TABLE public.accounts 
ADD CONSTRAINT accounts_spectrum_user_id_unique UNIQUE (spectrum_user_id);

-- Add comment to document the column
COMMENT ON COLUMN public.accounts.spectrum_user_id IS 'Primary identifier from the RSI Spectrum API, fetched during profile verification';
