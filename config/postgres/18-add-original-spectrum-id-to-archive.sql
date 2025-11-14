-- Migration: Add original_spectrum_id to contractor_archive_details
-- This allows us to track the original spectrum_id before it was changed during archiving

BEGIN;

ALTER TABLE public.contractor_archive_details
    ADD COLUMN IF NOT EXISTS original_spectrum_id character varying(100);

COMMENT ON COLUMN public.contractor_archive_details.original_spectrum_id IS 'Original spectrum_id before archiving (e.g., ~TEST123)';

COMMIT;
