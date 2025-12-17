-- Migration 23: Create badge data views
-- Creates base view with all badge calculation data and materialized view with pre-calculated badges

BEGIN;

-- Step 1: Create base view with all badge calculation data
CREATE VIEW public.user_badge_data AS
SELECT 
  -- Entity identification (either user_id or contractor_id, not both)
  COALESCE(user_id, contractor_id) AS entity_id,
  CASE WHEN user_id IS NOT NULL THEN 'user' ELSE 'contractor' END AS entity_type,
  user_id,
  contractor_id,
  
  -- Rating data
  public.get_total_rating(user_id, contractor_id) AS total_rating,
  public.get_average_rating_float(user_id, contractor_id) AS avg_rating,
  public.get_rating_count(user_id, contractor_id) AS rating_count,
  public.get_rating_streak(user_id, contractor_id) AS rating_streak,
  
  -- Order data
  public.get_total_orders(user_id, contractor_id) AS total_orders,
  public.get_fulfilled_orders_count(user_id, contractor_id) AS fulfilled_orders,
  
  -- Response data
  public.get_total_assignments(user_id, contractor_id) AS total_assignments,
  public.get_response_rate(user_id, contractor_id) AS response_rate,
  
  -- Activity data
  public.get_orders_last_30_days(user_id, contractor_id) AS orders_last_30_days,
  public.get_orders_last_90_days(user_id, contractor_id) AS orders_last_90_days,
  
  -- Speed data
  public.get_avg_completion_time_hours(user_id, contractor_id) AS avg_completion_time_hours,
  
  -- Account age (for users only, contractors use oldest member)
  CASE 
    WHEN user_id IS NOT NULL THEN public.get_account_age_months(user_id)
    ELSE public.get_contractor_age_months(contractor_id)
  END AS account_age_months,
  
  -- Account creation date (for early adopter badge)
  CASE 
    WHEN user_id IS NOT NULL THEN (SELECT created_at FROM accounts WHERE user_id = entities.user_id)
    ELSE (SELECT MIN(accounts.created_at) 
          FROM contractor_members 
          INNER JOIN accounts ON contractor_members.user_id = accounts.user_id
          WHERE contractor_members.contractor_id = entities.contractor_id)
  END AS account_created_at,
  
  -- Timestamps for refresh tracking
  NOW() AS calculated_at
FROM (
  -- Users
  SELECT user_id, NULL::uuid AS contractor_id
  FROM accounts
  WHERE user_id IS NOT NULL
  
  UNION ALL
  
  -- Contractors
  SELECT NULL::uuid AS user_id, contractor_id
  FROM contractors
  WHERE contractor_id IS NOT NULL
) entities;

COMMENT ON VIEW public.user_badge_data IS 'Base view containing all raw data needed for badge calculations';

-- Step 2: Create materialized view with pre-calculated badge identifiers
CREATE MATERIALIZED VIEW public.user_badges_materialized AS
SELECT 
  entity_id,
  entity_type,
  user_id,
  contractor_id,
  
  -- Array of badge identifiers (only highest tier per category)
  ARRAY_REMOVE(ARRAY[
    -- Rating badges - only highest tier applies
    CASE WHEN avg_rating >= 49.95 AND total_orders >= 25 THEN 'rating_99_9' END,
    CASE WHEN avg_rating >= 49.5 AND avg_rating < 49.95 AND total_orders >= 25 THEN 'rating_99' END,
    CASE WHEN avg_rating >= 47.5 AND avg_rating < 49.5 AND total_orders >= 25 THEN 'rating_95' END,
    CASE WHEN avg_rating >= 45 AND avg_rating < 47.5 AND total_orders >= 25 THEN 'rating_90' END,
    -- Streak badges - only highest tier applies
    CASE WHEN rating_streak >= 50 THEN 'streak_pro' END,
    CASE WHEN rating_streak >= 25 AND rating_streak < 50 THEN 'streak_gold' END,
    CASE WHEN rating_streak >= 15 AND rating_streak < 25 THEN 'streak_silver' END,
    CASE WHEN rating_streak >= 5 AND rating_streak < 15 THEN 'streak_copper' END,
    -- Volume badges - only highest tier applies
    CASE WHEN fulfilled_orders >= 5000 THEN 'volume_pro' END,
    CASE WHEN fulfilled_orders >= 1000 AND fulfilled_orders < 5000 THEN 'volume_gold' END,
    CASE WHEN fulfilled_orders >= 500 AND fulfilled_orders < 1000 THEN 'volume_silver' END,
    CASE WHEN fulfilled_orders >= 100 AND fulfilled_orders < 500 THEN 'volume_copper' END,
    -- Activity badges - only highest applicable
    CASE WHEN orders_last_30_days >= 20 THEN 'power_seller' END,
    CASE WHEN orders_last_30_days >= 10 AND orders_last_30_days < 20 THEN 'busy_seller' END,
    CASE WHEN orders_last_30_days >= 5 AND orders_last_30_days < 10 THEN 'active_seller' END,
    -- Speed badges - only highest tier applies
    CASE WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 3 AND fulfilled_orders >= 100 THEN 'speed_pro' END,
    CASE WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 6 AND fulfilled_orders >= 50 THEN 'speed_gold' END,
    CASE WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 12 AND fulfilled_orders >= 25 THEN 'speed_silver' END,
    CASE WHEN avg_completion_time_hours IS NOT NULL AND avg_completion_time_hours < 24 AND fulfilled_orders >= 10 THEN 'speed_copper' END,
    -- Consistency badges - only highest tier applies
    CASE WHEN account_age_months >= 36 AND orders_last_90_days >= 20 AND fulfilled_orders >= 200 THEN 'consistency_pro' END,
    CASE WHEN account_age_months >= 24 AND account_age_months < 36 AND orders_last_90_days >= 15 AND fulfilled_orders >= 100 THEN 'consistency_gold' END,
    CASE WHEN account_age_months >= 12 AND account_age_months < 24 AND orders_last_90_days >= 10 AND fulfilled_orders >= 50 THEN 'consistency_silver' END,
    CASE WHEN account_age_months >= 6 AND account_age_months < 12 AND orders_last_90_days >= 5 AND fulfilled_orders >= 25 THEN 'consistency_copper' END,
    -- Early adopter badge (special, can display with others)
    -- Accounts that are 24+ months old are considered early adopters
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
FROM public.user_badge_data
WITH NO DATA;


COMMENT ON MATERIALIZED VIEW public.user_badges_materialized IS 'Materialized view with pre-calculated badge identifiers and metadata for fast lookups';

-- Step 3: Create indexes on materialized view
CREATE UNIQUE INDEX user_badges_materialized_entity_idx 
  ON public.user_badges_materialized(entity_id, entity_type);

CREATE INDEX user_badges_materialized_user_id_idx 
  ON public.user_badges_materialized(user_id) 
  WHERE user_id IS NOT NULL;

CREATE INDEX user_badges_materialized_contractor_id_idx 
  ON public.user_badges_materialized(contractor_id) 
  WHERE contractor_id IS NOT NULL;

-- Step 4: Populate the materialized view
REFRESH MATERIALIZED VIEW public.user_badges_materialized;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_badges_materialized;

COMMIT;
