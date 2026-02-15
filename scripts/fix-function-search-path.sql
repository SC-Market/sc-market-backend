-- Fix search_path for all existing functions
-- Run this in your database to update functions without recreating them

-- Functions from 0-schema.sql
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

-- Functions from other migrations
ALTER FUNCTION get_total_assignments(uuid, uuid) SET search_path TO public;
ALTER FUNCTION get_response_rate(uuid, uuid) SET search_path TO public;
ALTER FUNCTION get_account_age_months(uuid) SET search_path TO public;
ALTER FUNCTION get_contractor_age_months(uuid) SET search_path TO public;
ALTER FUNCTION get_fulfilled_orders_count(uuid, uuid) SET search_path TO public;
ALTER FUNCTION get_orders_last_30_days(uuid, uuid) SET search_path TO public;
ALTER FUNCTION get_orders_last_90_days(uuid, uuid) SET search_path TO public;
ALTER FUNCTION get_avg_completion_time_hours(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.cleanup_expired_email_verification_tokens() SET search_path TO public;
ALTER FUNCTION public.cleanup_old_email_unsubscribe_tokens() SET search_path TO public;
ALTER FUNCTION public.create_contractor(uuid, text, text, text) SET search_path TO public;
ALTER FUNCTION public.get_available_stock(uuid) SET search_path TO public;
ALTER FUNCTION public.get_public_quantity(uuid) SET search_path TO public;
ALTER FUNCTION public.get_reserved_stock(uuid) SET search_path TO public;
ALTER FUNCTION public.get_total_stock(uuid) SET search_path TO public;
ALTER FUNCTION public.sync_listing_quantity() SET search_path TO public;
ALTER FUNCTION public.sync_listing_quantity_on_allocation() SET search_path TO public;
ALTER FUNCTION public.sync_listings_on_setting_change() SET search_path TO public;
ALTER FUNCTION update_listing_quantity_available() SET search_path TO public;
ALTER FUNCTION update_updated_at_column() SET search_path TO public;

