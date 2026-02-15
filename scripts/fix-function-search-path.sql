-- Fix search_path for all existing functions
-- Run this in your database to update functions without recreating them

ALTER FUNCTION public.get_auction_end(uuid, character varying) SET search_path TO public;
ALTER FUNCTION public.get_average_rating(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.get_average_rating_float(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.get_offer_status(uuid, uuid, character varying) SET search_path TO public;
ALTER FUNCTION public.get_order_count() SET search_path TO public;
ALTER FUNCTION public.get_order_count(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.get_rating_count(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.get_rating_streak(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.get_total_orders(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.get_total_rating(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.get_week_order_count() SET search_path TO public;
ALTER FUNCTION public.get_week_order_count(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.log_status_change() SET search_path TO public;
ALTER FUNCTION public.market_log_status_change() SET search_path TO public;
ALTER FUNCTION public.order_log_status_change() SET search_path TO public;
ALTER FUNCTION public.update_listing_expiration() SET search_path TO public;
ALTER FUNCTION public.update_public_contract_expiration() SET search_path TO public;
