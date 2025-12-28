-- Migration 28: Add donor/patron badge system
-- Adds donor_start_date column to accounts table and integrates donor badges into badge system
-- Uses CREATE OR REPLACE VIEW pattern: Add new column at END of SELECT list (after calculated_at)
-- This allows updating base view without dropping it (materialized view still needs drop/recreate)
-- Tested in 28-donor-badge-test.sql - pattern verified to work

BEGIN;

-- Step 1: Add donor_start_date column to accounts table
ALTER TABLE public.accounts
ADD COLUMN donor_start_date timestamp without time zone NULL;

COMMENT ON COLUMN public.accounts.donor_start_date IS
  'Timestamp when user became a donor/patron. NULL if not a donor. Used to calculate donor badge tiers.';

-- Step 2: Update base view to include donor duration calculation
-- Strategy: Add new column at the END of SELECT list to allow CREATE OR REPLACE VIEW
-- This allows us to update the base view without dropping it (tested in 28-donor-badge-test.sql)
-- Only modify the account_data CTE to add donor_duration_months
-- Note: We'll create an intermediate view so materialized view can be refreshed instead of dropped
DROP MATERIALIZED VIEW IF EXISTS public.user_badges_materialized;

-- Use CREATE OR REPLACE VIEW - works because new column is added at the end
CREATE OR REPLACE VIEW public.user_badge_data AS
WITH entities AS (
  -- Users
  SELECT user_id, NULL::uuid AS contractor_id
  FROM accounts
  WHERE user_id IS NOT NULL
  
  UNION ALL
  
  -- Contractors
  SELECT NULL::uuid AS user_id, contractor_id
  FROM contractors
  WHERE contractor_id IS NOT NULL
),
-- Consolidate rating metrics for users (replaces get_total_rating, get_average_rating_float, get_rating_count)
-- Note: Original functions combine reviews received (as assigned user) AND reviews given (as customer)
user_rating_received AS (
  -- Reviews received as assigned user
  SELECT 
    o.assigned_id AS user_id,
    SUM(orv.rating) AS total_rating,
    AVG(orv.rating::float) AS avg_rating,
    COUNT(orv.rating) AS rating_count
  FROM order_reviews orv
  INNER JOIN orders o ON orv.order_id = o.order_id
  WHERE orv.rating > 0
    AND o.assigned_id IS NOT NULL
    AND o.contractor_id IS NULL
    AND orv.role = 'customer'
  GROUP BY o.assigned_id
),
user_rating_given AS (
  -- Reviews given as customer
  SELECT 
    o.customer_id AS user_id,
    SUM(orv.rating) AS total_rating,
    AVG(orv.rating::float) AS avg_rating,
    COUNT(orv.rating) AS rating_count
  FROM order_reviews orv
  INNER JOIN orders o ON orv.order_id = o.order_id
  WHERE orv.rating > 0
    AND o.customer_id IS NOT NULL
    AND orv.role = 'contractor'
  GROUP BY o.customer_id
),
user_rating_aggregated AS (
  SELECT 
    COALESCE(urr.user_id, urg.user_id) AS user_id,
    COALESCE(urr.total_rating, 0) + COALESCE(urg.total_rating, 0) AS total_rating,
    CASE 
      WHEN COALESCE(urr.rating_count, 0) + COALESCE(urg.rating_count, 0) > 0
      THEN (COALESCE(urr.total_rating, 0) + COALESCE(urg.total_rating, 0))::float / 
           (COALESCE(urr.rating_count, 0) + COALESCE(urg.rating_count, 0))
      ELSE 0.0
    END AS avg_rating,
    COALESCE(urr.rating_count, 0) + COALESCE(urg.rating_count, 0) AS rating_count
  FROM user_rating_received urr
  FULL OUTER JOIN user_rating_given urg ON urr.user_id = urg.user_id
  WHERE COALESCE(urr.user_id, urg.user_id) IS NOT NULL
),
-- Consolidate rating metrics for contractors
contractor_rating_aggregated AS (
  SELECT 
    o.contractor_id,
    COALESCE(SUM(orv.rating) FILTER (WHERE orv.rating > 0), 0) AS total_rating,
    COALESCE(AVG(orv.rating::float) FILTER (WHERE orv.rating > 0), 0.0) AS avg_rating,
    COUNT(orv.rating) FILTER (WHERE orv.rating > 0) AS rating_count
  FROM order_reviews orv
  INNER JOIN orders o ON orv.order_id = o.order_id
  WHERE orv.rating > 0
    AND o.contractor_id IS NOT NULL
    AND orv.role = 'customer'
  GROUP BY o.contractor_id
),
-- Rating streaks (optimized with window functions, calculated in batch)
-- Pre-aggregate all user reviews with entity identification and row numbers
user_reviews_with_entity AS (
  SELECT 
    COALESCE(
      CASE WHEN o.assigned_id IS NOT NULL AND o.contractor_id IS NULL AND orv.role = 'customer' 
           THEN o.assigned_id END,
      CASE WHEN o.customer_id IS NOT NULL AND orv.role = 'contractor' 
           THEN o.customer_id END
    ) AS user_id,
    orv.rating,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(
        CASE WHEN o.assigned_id IS NOT NULL AND o.contractor_id IS NULL AND orv.role = 'customer' 
             THEN o.assigned_id END,
        CASE WHEN o.customer_id IS NOT NULL AND orv.role = 'contractor' 
             THEN o.customer_id END
      )
      ORDER BY orv.timestamp DESC
    ) AS row_num
  FROM order_reviews orv
  INNER JOIN orders o ON orv.order_id = o.order_id
  WHERE orv.rating > 0
    AND (
      (o.assigned_id IS NOT NULL AND o.contractor_id IS NULL AND orv.role = 'customer')
      OR (o.customer_id IS NOT NULL AND orv.role = 'contractor')
    )
),
user_rating_streaks AS (
  SELECT 
    user_id,
    COALESCE(
      MIN(row_num) FILTER (WHERE rating < 5),
      MAX(row_num)
    ) AS rating_streak
  FROM user_reviews_with_entity
  WHERE user_id IS NOT NULL
  GROUP BY user_id
),
-- Pre-aggregate all contractor reviews
contractor_reviews_with_entity AS (
  SELECT 
    o.contractor_id,
    orv.rating,
    ROW_NUMBER() OVER (
      PARTITION BY o.contractor_id
      ORDER BY orv.timestamp DESC
    ) AS row_num
  FROM order_reviews orv
  INNER JOIN orders o ON orv.order_id = o.order_id
  WHERE orv.rating > 0
    AND o.contractor_id IS NOT NULL
    AND orv.role = 'customer'
),
contractor_rating_streaks AS (
  SELECT 
    contractor_id,
    COALESCE(
      MIN(row_num) FILTER (WHERE rating < 5),
      MAX(row_num)
    ) AS rating_streak
  FROM contractor_reviews_with_entity
  GROUP BY contractor_id
),
-- Consolidate all order metrics in one query (replaces 4 function calls)
order_metrics AS (
  SELECT 
    assigned_id AS user_id,
    NULL::uuid AS contractor_id,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE status = 'fulfilled') AS fulfilled_orders,
    COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '30 days') AS orders_last_30_days,
    COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '90 days') AS orders_last_90_days
  FROM orders
  WHERE assigned_id IS NOT NULL
    AND contractor_id IS NULL
  GROUP BY assigned_id
  
  UNION ALL
  
  SELECT 
    NULL::uuid AS user_id,
    contractor_id,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE status = 'fulfilled') AS fulfilled_orders,
    COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '30 days') AS orders_last_30_days,
    COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '90 days') AS orders_last_90_days
  FROM orders
  WHERE contractor_id IS NOT NULL
  GROUP BY contractor_id
),
-- Consolidate response metrics in one query (replaces 2 function calls)
response_metrics AS (
  SELECT 
    assigned_user_id AS user_id,
    NULL::uuid AS contractor_id,
    COUNT(*) AS total_assignments,
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE (COUNT(*) FILTER (WHERE response_time_minutes <= 1440)::float / COUNT(*)::float) * 100
    END AS response_rate
  FROM order_response_times
  WHERE assigned_user_id IS NOT NULL
  GROUP BY assigned_user_id
  
  UNION ALL
  
  SELECT 
    NULL::uuid AS user_id,
    assigned_contractor_id AS contractor_id,
    COUNT(*) AS total_assignments,
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE (COUNT(*) FILTER (WHERE response_time_minutes <= 1440)::float / COUNT(*)::float) * 100
    END AS response_rate
  FROM order_response_times
  WHERE assigned_contractor_id IS NOT NULL
  GROUP BY assigned_contractor_id
),
-- Calculate average completion time (optimized with pre-aggregated fulfillment times)
-- Pre-calculate fulfillment times once for all orders
fulfillment_times AS (
  SELECT DISTINCT ON (order_id)
    order_id,
    timestamp AS fulfillment_timestamp
  FROM order_status_update
  WHERE new_status = 'fulfilled'
  ORDER BY order_id, timestamp ASC
),
completion_time_metrics AS (
  SELECT 
    o.assigned_id AS user_id,
    NULL::uuid AS contractor_id,
    AVG(EXTRACT(EPOCH FROM (ft.fulfillment_timestamp - o.timestamp)) / 3600.0) AS avg_completion_time_hours
  FROM orders o
  INNER JOIN fulfillment_times ft ON o.order_id = ft.order_id
  WHERE o.status = 'fulfilled'
    AND o.assigned_id IS NOT NULL
    AND o.contractor_id IS NULL
  GROUP BY o.assigned_id
  
  UNION ALL
  
  SELECT 
    NULL::uuid AS user_id,
    o.contractor_id,
    AVG(EXTRACT(EPOCH FROM (ft.fulfillment_timestamp - o.timestamp)) / 3600.0) AS avg_completion_time_hours
  FROM orders o
  INNER JOIN fulfillment_times ft ON o.order_id = ft.order_id
  WHERE o.status = 'fulfilled'
    AND o.contractor_id IS NOT NULL
  GROUP BY o.contractor_id
),
-- Pre-calculate contractor account creation dates (batch process once)
contractor_account_dates AS (
  SELECT 
    contractor_id,
    MIN(accounts.created_at) AS oldest_created_at
  FROM contractor_members
  INNER JOIN accounts ON contractor_members.user_id = accounts.user_id
  GROUP BY contractor_id
),
-- Account age and creation date (optimized with pre-calculated contractor dates)
-- MODIFIED: Added donor_duration_months calculation
account_data AS (
  SELECT 
    e.user_id,
    e.contractor_id,
    -- User account age
    CASE 
      WHEN e.user_id IS NOT NULL THEN 
        (EXTRACT(YEAR FROM AGE(NOW(), a.created_at)) * 12 + 
         EXTRACT(MONTH FROM AGE(NOW(), a.created_at)))::int
      ELSE NULL
    END AS account_age_months,
    -- User account creation date
    CASE 
      WHEN e.user_id IS NOT NULL THEN a.created_at
      ELSE NULL
    END AS account_created_at,
    -- Donor duration in months (only for users, NULL if not a donor)
    CASE 
      WHEN e.user_id IS NOT NULL AND a.donor_start_date IS NOT NULL THEN
        (EXTRACT(EPOCH FROM (NOW() - a.donor_start_date)) / 2592000)::int
      ELSE NULL
    END AS donor_duration_months
  FROM entities e
  LEFT JOIN accounts a ON e.user_id = a.user_id
  WHERE e.user_id IS NOT NULL
  
  UNION ALL
  
  SELECT 
    NULL::uuid AS user_id,
    e.contractor_id,
    -- Contractor account age (from pre-calculated oldest member)
    (EXTRACT(YEAR FROM AGE(NOW(), cad.oldest_created_at)) * 12 + 
     EXTRACT(MONTH FROM AGE(NOW(), cad.oldest_created_at)))::int AS account_age_months,
    -- Contractor account creation date
    cad.oldest_created_at AS account_created_at,
    -- Contractors don't have donor status
    NULL::int AS donor_duration_months
  FROM entities e
  INNER JOIN contractor_account_dates cad ON e.contractor_id = cad.contractor_id
  WHERE e.contractor_id IS NOT NULL
)
-- Final SELECT combining all metrics
SELECT 
  COALESCE(e.user_id, e.contractor_id) AS entity_id,
  CASE WHEN e.user_id IS NOT NULL THEN 'user' ELSE 'contractor' END AS entity_type,
  e.user_id,
  e.contractor_id,
  
  -- Rating data (from consolidated queries)
  COALESCE(ura.total_rating, cra.total_rating, 0) AS total_rating,
  COALESCE(ura.avg_rating, cra.avg_rating, 0.0) AS avg_rating,
  COALESCE(ura.rating_count, cra.rating_count, 0) AS rating_count,
  COALESCE(urs.rating_streak, crs.rating_streak, 0) AS rating_streak,
  
  -- Order data (from consolidated query)
  COALESCE(om.total_orders, 0) AS total_orders,
  COALESCE(om.fulfilled_orders, 0) AS fulfilled_orders,
  
  -- Response data (from consolidated query)
  COALESCE(resm.total_assignments, 0) AS total_assignments,
  COALESCE(resm.response_rate, 0.0) AS response_rate,
  
  -- Activity data (from consolidated query)
  COALESCE(om.orders_last_30_days, 0) AS orders_last_30_days,
  COALESCE(om.orders_last_90_days, 0) AS orders_last_90_days,
  
  -- Speed data
  ctm.avg_completion_time_hours,
  
  -- Account age
  COALESCE(ad.account_age_months, 0) AS account_age_months,
  
  -- Account creation date
  ad.account_created_at,
  
  -- Timestamps for refresh tracking
  NOW() AS calculated_at,
  
  -- Donor duration (new - added at end to allow CREATE OR REPLACE VIEW)
  ad.donor_duration_months
FROM entities e
LEFT JOIN user_rating_aggregated ura ON e.user_id = ura.user_id
LEFT JOIN contractor_rating_aggregated cra ON e.contractor_id = cra.contractor_id
LEFT JOIN user_rating_streaks urs ON e.user_id = urs.user_id
LEFT JOIN contractor_rating_streaks crs ON e.contractor_id = crs.contractor_id
LEFT JOIN order_metrics om ON (e.user_id IS NOT NULL AND e.user_id = om.user_id)
                          OR (e.contractor_id IS NOT NULL AND e.contractor_id = om.contractor_id)
LEFT JOIN response_metrics resm ON (e.user_id IS NOT NULL AND e.user_id = resm.user_id)
                                OR (e.contractor_id IS NOT NULL AND e.contractor_id = resm.contractor_id)
LEFT JOIN completion_time_metrics ctm ON (e.user_id IS NOT NULL AND e.user_id = ctm.user_id)
                                      OR (e.contractor_id IS NOT NULL AND e.contractor_id = ctm.contractor_id)
LEFT JOIN account_data ad ON (e.user_id IS NOT NULL AND e.user_id = ad.user_id)
                          OR (e.contractor_id IS NOT NULL AND e.contractor_id = ad.contractor_id);

COMMENT ON VIEW public.user_badge_data IS 'Optimized base view containing all raw data needed for badge calculations. Includes donor duration calculation for donor badges. When adding new badge data columns, always add them at the END of the SELECT list to allow CREATE OR REPLACE VIEW updates.';

-- Step 3: Create intermediate view for badge calculations
-- This allows us to update badge logic with CREATE OR REPLACE VIEW without dropping materialized view
-- The materialized view will select FROM this view, so we can just refresh it after updates
CREATE OR REPLACE VIEW public.user_badges_view AS
SELECT 
  entity_id,
  entity_type,
  user_id,
  contractor_id,
  
  -- Array of badge identifiers (only highest tier per category)
  -- Using nested CASE statements to ensure mutual exclusivity (following migration 27 pattern)
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
    -- Donor badges - only highest tier applies (new)
    CASE 
      WHEN donor_duration_months IS NOT NULL AND donor_duration_months >= 12 THEN 'donor_pro'
      WHEN donor_duration_months IS NOT NULL AND donor_duration_months >= 6 THEN 'donor_gold'
      WHEN donor_duration_months IS NOT NULL AND donor_duration_months >= 3 THEN 'donor_silver'
      WHEN donor_duration_months IS NOT NULL AND donor_duration_months >= 1 THEN 'donor_copper'
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
    'donor_duration_months', donor_duration_months,
    'calculated_at', calculated_at
  ) AS badge_metadata,
  
  calculated_at
FROM public.user_badge_data;

COMMENT ON VIEW public.user_badges_view IS 'Intermediate view for badge calculations. Can be updated with CREATE OR REPLACE VIEW when adding new badges. The materialized view selects from this, allowing non-destructive badge updates.';

-- Step 4: Recreate materialized view to select from intermediate view
-- This is a one-time migration - future badge additions won't need to drop/recreate
-- The materialized view now selects FROM user_badges_view, so we can just refresh it
CREATE MATERIALIZED VIEW public.user_badges_materialized AS
SELECT * FROM public.user_badges_view;

-- Recreate indexes on materialized view
CREATE UNIQUE INDEX user_badges_materialized_entity_idx 
  ON public.user_badges_materialized(entity_id, entity_type);

CREATE INDEX user_badges_materialized_user_id_idx 
  ON public.user_badges_materialized(user_id) 
  WHERE user_id IS NOT NULL;

CREATE INDEX user_badges_materialized_contractor_id_idx 
  ON public.user_badges_materialized(contractor_id) 
  WHERE contractor_id IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.user_badges_materialized IS 'Materialized view with pre-calculated badge identifiers and metadata. Selects from user_badges_view. Can be refreshed (not dropped) when badge logic changes in the intermediate view.';

-- Populate the materialized view
REFRESH MATERIALIZED VIEW public.user_badges_materialized;

COMMIT;
