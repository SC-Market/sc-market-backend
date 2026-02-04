-- ============================================================================
-- Remove contractor_id from stock_lots if it exists
-- Migration: 53-remove-contractor-id-from-stock-lots.sql
-- ============================================================================

-- Drop contractor_id column if it exists (from old schema)
ALTER TABLE public.stock_lots DROP COLUMN IF EXISTS contractor_id;
