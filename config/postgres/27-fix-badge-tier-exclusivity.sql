-- Migration 27: Fix badge tier exclusivity to prevent multiple tiers of same badge category
-- The previous SQL allowed multiple tiers to match (e.g., all speed badges if completion time was low enough)
-- This migration fixes the CASE statements to ensure only the highest tier per category is included

BEGIN;

-- Drop and recreate the materialized view with fixed badge logic
DROP MATERIALIZED VIEW IF EXISTS public.user_badges_materialized;

CREATE MATERIALIZED VIEW public.user_badges_materialized AS
SELECT 
  entity_id,
  entity_type,
  user_id,
  contractor_id,
  
  -- Array of badge identifiers (only highest tier per category)
  -- Using nested CASE statements to ensure mutual exclusivity
  ARRAY_REMOVE(ARRAY[
    -- Rating badges - only highest tier applies (using 0-5 scale: 4.995 = 99.9%, 4.95 = 99%, 4.75 = 95%, 4.5 = 90%)
    CASE 
      WHEN avg_rating >= 4.995 AND total_orders >= 25 THEN 'rating_99_9'
      WHEN avg_rating >= 4.95 AND total_orders >= 25 THEN 'rating_99'
      WHEN avg_rating >= 4.75 AND total_orders >= 25 THEN 'rating_95'
      WHEN avg_rating >= 4.5 AND total_orders >= 25 THEN 'rating_90'
    END,
    -- Streak badges - only highest tier applies
    CASE 
      WHEN rating_streak >= 50 THEN 'streak_pro'
      WHEN rating_streak >= 25 THEN 'streak_gold'
      WHEN rating_streak >= 15 THEN 'streak_silver'
      WHEN rating_streak >= 5 THEN 'streak_copper'
    END,
    -- Volume badges - only highest tier applies
    CASE 
      WHEN fulfilled_orders >= 5000 THEN 'volume_pro'
      WHEN fulfilled_orders >= 1000 THEN 'volume_gold'
      WHEN fulfilled_orders >= 500 THEN 'volume_silver'
      WHEN fulfilled_orders >= 100 THEN 'volume_copper'
    END,
    -- Activity badges - only highest applicable
    CASE 
      WHEN orders_last_30_days >= 20 THEN 'power_seller'
      WHEN orders_last_30_days >= 10 THEN 'busy_seller'
      WHEN orders_last_30_days >= 5 THEN 'active_seller'
    END,
    -- Speed badges - only highest tier applies (mutually exclusive conditions)
    CASE 
      WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 3 AND fulfilled_orders >= 100 THEN 'speed_pro'
      WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 6 AND fulfilled_orders >= 50 THEN 'speed_gold'
      WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 12 AND fulfilled_orders >= 25 THEN 'speed_silver'
      WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 24 AND fulfilled_orders >= 10 THEN 'speed_copper'
    END,
    -- Consistency badges - only highest tier applies
    CASE 
      WHEN account_age_months >= 36 AND orders_last_90_days >= 20 AND fulfilled_orders >= 200 THEN 'consistency_pro'
      WHEN account_age_months >= 24 AND orders_last_90_days >= 15 AND fulfilled_orders >= 100 THEN 'consistency_gold'
      WHEN account_age_months >= 12 AND orders_last_90_days >= 10 AND fulfilled_orders >= 50 THEN 'consistency_silver'
      WHEN account_age_months >= 6 AND orders_last_90_days >= 5 AND fulfilled_orders >= 25 THEN 'consistency_copper'
    END,
    -- Early adopter badge (special, can display with others)
    CASE WHEN account_age_months >= 24 THEN 'early_adopter' END,
    -- Responsive badge
    CASE WHEN total_assignments >= 10 AND response_rate >= 90 THEN 'responsive' END
  ], NULL) AS badge_ids,
  
  -- JSON metadata with all calculation data
  jsonb_build_object(
    'avg_rating', avg_rating,
    'rating_count', rating_count,
    'rating_streak', rating_streak,
    'total_orders', total_orders,
    'fulfilled_orders', fulfilled_orders,
    'total_assignments', total_assignments,
    'response_rate', response_rate,
    'total_rating', total_rating,
    'orders_last_30_days', orders_last_30_days,
    'orders_last_90_days', orders_last_90_days,
    'avg_completion_time_hours', avg_completion_time_hours,
    'account_age_months', account_age_months,
    'account_created_at', account_created_at,
    'calculated_at', calculated_at
  ) AS badge_metadata,
  
  calculated_at
FROM public.user_badge_data;

-- Recreate indexes on materialized view
CREATE UNIQUE INDEX user_badges_materialized_entity_idx 
  ON public.user_badges_materialized(entity_id, entity_type);

CREATE INDEX user_badges_materialized_user_id_idx 
  ON public.user_badges_materialized(user_id) 
  WHERE user_id IS NOT NULL;

CREATE INDEX user_badges_materialized_contractor_id_idx 
  ON public.user_badges_materialized(contractor_id) 
  WHERE contractor_id IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.user_badges_materialized IS 'Materialized view with pre-calculated badge identifiers and metadata. Fixed to ensure only highest tier per category is included (mutually exclusive CASE statements).';

-- Populate the materialized view
REFRESH MATERIALIZED VIEW public.user_badges_materialized;

COMMIT;
