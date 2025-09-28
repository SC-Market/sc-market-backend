--
-- Order Performance Optimization Indices
-- Adds indices to improve order search and serialization performance
--

-- 1. Orders search indices (High Priority)
-- Improves WHERE clause performance for common search patterns
CREATE INDEX IF NOT EXISTS idx_orders_customer_id 
ON public.orders (customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_id 
ON public.orders (assigned_id);

CREATE INDEX IF NOT EXISTS idx_orders_contractor_id 
ON public.orders (contractor_id);

CREATE INDEX IF NOT EXISTS idx_orders_status 
ON public.orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_timestamp 
ON public.orders (timestamp DESC);

-- 2. Composite indices for common search combinations
CREATE INDEX IF NOT EXISTS idx_orders_customer_status 
ON public.orders (customer_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_contractor_status 
ON public.orders (contractor_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_status 
ON public.orders (assigned_id, status);

-- 3. Market orders indices (High Priority)
-- Improves getOrderMarketListingCount performance
CREATE INDEX IF NOT EXISTS idx_market_orders_order_id 
ON public.market_orders (order_id);

CREATE INDEX IF NOT EXISTS idx_market_orders_listing_id 
ON public.market_orders (listing_id);

-- 4. Additional composite indices for complex queries
-- Optimizes queries that filter by multiple order fields
CREATE INDEX IF NOT EXISTS idx_orders_customer_timestamp 
ON public.orders (customer_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_orders_contractor_timestamp 
ON public.orders (contractor_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_timestamp 
ON public.orders (assigned_id, timestamp DESC);

-- 5. Order-specific indices
-- Optimizes sorting by order fields
CREATE INDEX IF NOT EXISTS idx_orders_title 
ON public.orders (title);

CREATE INDEX IF NOT EXISTS idx_orders_kind 
ON public.orders (kind);

CREATE INDEX IF NOT EXISTS idx_orders_payment_type 
ON public.orders (payment_type);

CREATE INDEX IF NOT EXISTS idx_orders_service_id 
ON public.orders (service_id);

-- 6. Order applicants indices (Medium Priority)
-- Improves applicant-related queries
CREATE INDEX IF NOT EXISTS idx_order_applicants_order_id 
ON public.order_applicants (order_id);

CREATE INDEX IF NOT EXISTS idx_order_applicants_user_applicant_id 
ON public.order_applicants (user_applicant_id);

CREATE INDEX IF NOT EXISTS idx_order_applicants_org_applicant_id 
ON public.order_applicants (org_applicant_id);

-- 7. Order reviews indices (Low Priority)
-- Improves review-related queries
CREATE INDEX IF NOT EXISTS idx_order_reviews_order_id 
ON public.order_reviews (order_id);

CREATE INDEX IF NOT EXISTS idx_order_reviews_contractor_author 
ON public.order_reviews (contractor_author);

CREATE INDEX IF NOT EXISTS idx_order_reviews_user_author 
ON public.order_reviews (user_author);

-- Add comments for documentation
COMMENT ON INDEX idx_orders_customer_id IS 'Optimizes customer-based order searches';
COMMENT ON INDEX idx_orders_assigned_id IS 'Optimizes assigned user-based order searches';
COMMENT ON INDEX idx_orders_contractor_id IS 'Optimizes contractor-based order searches';
COMMENT ON INDEX idx_orders_status IS 'Optimizes status-based order filtering';
COMMENT ON INDEX idx_orders_timestamp IS 'Optimizes timestamp-based sorting';
COMMENT ON INDEX idx_market_orders_order_id IS 'Optimizes order item count queries';
COMMENT ON INDEX idx_orders_customer_timestamp IS 'Optimizes customer + timestamp sorting';
COMMENT ON INDEX idx_orders_contractor_timestamp IS 'Optimizes contractor + timestamp sorting';
COMMENT ON INDEX idx_orders_assigned_timestamp IS 'Optimizes assigned user + timestamp sorting';
COMMENT ON INDEX idx_orders_title IS 'Optimizes title-based sorting';
COMMENT ON INDEX idx_orders_kind IS 'Optimizes kind-based filtering';
COMMENT ON INDEX idx_orders_payment_type IS 'Optimizes payment type filtering';
COMMENT ON INDEX idx_orders_service_id IS 'Optimizes service-based filtering';
COMMENT ON INDEX idx_order_applicants_order_id IS 'Optimizes order applicant queries';
COMMENT ON INDEX idx_order_applicants_user_applicant_id IS 'Optimizes user applicant queries';
COMMENT ON INDEX idx_order_applicants_org_applicant_id IS 'Optimizes organization applicant queries';
COMMENT ON INDEX idx_order_reviews_order_id IS 'Optimizes order review queries';
COMMENT ON INDEX idx_order_reviews_contractor_author IS 'Optimizes contractor review queries';
COMMENT ON INDEX idx_order_reviews_user_author IS 'Optimizes user review queries';