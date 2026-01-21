-- Migration: Add discord_invite column to offer_sessions
-- Description: Stores the Discord server invite URL created when an offer/order is created,
--              allowing users to access the server invite when viewing the order/offer.

BEGIN;

-- Add discord_invite column to offer_sessions table
ALTER TABLE public.offer_sessions
  ADD COLUMN IF NOT EXISTS discord_invite TEXT;

COMMIT;
