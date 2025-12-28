-- Migration: Add supported_languages columns
-- Description: Adds support for users and contractors to specify their supported languages
--              Languages are stored as JSON arrays in VARCHAR columns

-- =============================================================================
-- 1. ADD SUPPORTED_LANGUAGES COLUMN TO ACCOUNTS TABLE
-- =============================================================================

ALTER TABLE public.accounts
ADD COLUMN supported_languages character varying(500) DEFAULT '["en"]';

COMMENT ON COLUMN public.accounts.supported_languages IS 
'JSON array of ISO 639-1 language codes (e.g., ["en", "es", "fr"]). Default is ["en"] (English).';

-- =============================================================================
-- 2. ADD SUPPORTED_LANGUAGES COLUMN TO CONTRACTORS TABLE
-- =============================================================================

ALTER TABLE public.contractors
ADD COLUMN supported_languages character varying(500) DEFAULT '["en"]';

COMMENT ON COLUMN public.contractors.supported_languages IS 
'JSON array of ISO 639-1 language codes (e.g., ["en", "es", "fr"]). Default is ["en"] (English).';
