-- Migration 24: Add indices to optimize badge calculation functions
-- These indices will significantly speed up badge calculations, especially for concurrent refreshes
-- Note: Some indices may already exist from previous migrations (9-order-performance-indices.sql, 0-schema.sql)

-- Indices for orders table queries used in badge functions
-- These support queries filtering by assigned_id/contractor_id + status + timestamp
-- Index for fulfilled orders count (get_fulfilled_orders_count) - users
-- Supports: WHERE assigned_id = ? AND contractor_id IS NULL AND status = 'fulfilled'
-- Note: idx_orders_assigned_status exists but doesn't include the WHERE clause for contractor_id IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_assigned_fulfilled 
  ON public.orders(assigned_id, status) 
  WHERE contractor_id IS NULL AND status = 'fulfilled';

-- Index for fulfilled orders count for contractors (get_fulfilled_orders_count)
-- Supports: WHERE contractor_id = ? AND status = 'fulfilled'
-- Note: idx_orders_contractor_status exists but doesn't filter by status = 'fulfilled' only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_contractor_fulfilled 
  ON public.orders(contractor_id, status) 
  WHERE status = 'fulfilled' AND contractor_id IS NOT NULL;

-- Index for orders in last 30/90 days (get_orders_last_30_days, get_orders_last_90_days) - users
-- Supports: WHERE assigned_id = ? AND contractor_id IS NULL AND timestamp >= NOW() - INTERVAL 'X days'
-- Note: idx_orders_assigned_timestamp already exists from 9-order-performance-indices.sql, but this adds the WHERE clause
-- However, the existing index should work fine for timestamp range queries, so we can skip this one
-- Actually, let's keep it as a partial index for better performance on the specific query pattern

-- Index for orders in last 30/90 days for contractors (get_orders_last_30_days, get_orders_last_90_days)
-- Supports: WHERE contractor_id = ? AND timestamp >= NOW() - INTERVAL 'X days'
-- Note: idx_orders_contractor_timestamp already exists from 9-order-performance-indices.sql
-- The existing index should work, but we can verify it covers our use case

-- Indices for order_status_update table used in get_avg_completion_time_hours
-- The function uses DISTINCT ON (order_id) with ORDER BY order_id, timestamp ASC
-- and filters WHERE new_status = 'fulfilled'

-- Index for finding first fulfillment timestamp
-- Supports: DISTINCT ON (order_id) ... WHERE new_status = 'fulfilled' ORDER BY order_id, timestamp ASC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_status_update_fulfilled_first 
  ON public.order_status_update(order_id, timestamp ASC) 
  WHERE new_status = 'fulfilled';

-- Index for contractor_members join in get_contractor_age_months
-- Supports: JOIN contractor_members ... WHERE contractor_id = ?
-- (Already has unique index on contractor_id, user_id, but this helps with the MIN aggregation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contractor_members_contractor_created 
  ON public.contractor_members(contractor_id);

-- Index for accounts.created_at used in get_account_age_months and get_contractor_age_months
-- Supports: WHERE user_id = ? (for get_account_age_months)
-- Note: user_id is likely already the primary key, but this ensures created_at is indexed for age calculations
-- Actually, accounts.user_id is the primary key, so this index may not be needed, but it doesn't hurt

-- Index for order_reviews table (used by existing rating functions)
-- These functions query order_reviews by user_author/contractor_author + order_id
-- Check if these indices already exist, if not create them

-- Index for user reviews (get_rating_count, get_rating_streak, etc.)
-- Supports: WHERE user_author = ? ORDER BY timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_reviews_user_author_timestamp 
  ON public.order_reviews(user_author, timestamp ASC) 
  WHERE user_author IS NOT NULL;

-- Index for contractor reviews (get_rating_count, get_rating_streak, etc.)
-- Supports: WHERE contractor_author = ? ORDER BY timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_reviews_contractor_author_timestamp 
  ON public.order_reviews(contractor_author, timestamp ASC) 
  WHERE contractor_author IS NOT NULL;

-- Index for order_response_times table (used by get_total_assignments and get_response_rate)
-- These functions query by assigned_user_id or assigned_contractor_id

-- Index for user response times
-- Supports: WHERE assigned_user_id = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_response_times_assigned_user 
  ON public.order_response_times(assigned_user_id) 
  WHERE assigned_user_id IS NOT NULL;

-- Index for contractor response times
-- Supports: WHERE assigned_contractor_id = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_response_times_assigned_contractor 
  ON public.order_response_times(assigned_contractor_id) 
  WHERE assigned_contractor_id IS NOT NULL;

COMMENT ON INDEX idx_orders_assigned_fulfilled IS 'Optimizes get_fulfilled_orders_count for users (partial index for contractor_id IS NULL)';
COMMENT ON INDEX idx_orders_contractor_fulfilled IS 'Optimizes get_fulfilled_orders_count for contractors (partial index for fulfilled status)';
COMMENT ON INDEX idx_order_status_update_fulfilled_first IS 'Optimizes get_avg_completion_time_hours by finding first fulfillment timestamp efficiently';
COMMENT ON INDEX idx_contractor_members_contractor_created IS 'Optimizes get_contractor_age_months join and MIN aggregation';
COMMENT ON INDEX idx_order_reviews_user_author_timestamp IS 'Optimizes rating functions for users, especially get_rating_streak which needs ORDER BY timestamp';
COMMENT ON INDEX idx_order_reviews_contractor_author_timestamp IS 'Optimizes rating functions for contractors, especially get_rating_streak which needs ORDER BY timestamp';
COMMENT ON INDEX idx_order_response_times_assigned_user IS 'Optimizes get_total_assignments and get_response_rate for users';
COMMENT ON INDEX idx_order_response_times_assigned_contractor IS 'Optimizes get_total_assignments and get_response_rate for contractors';
