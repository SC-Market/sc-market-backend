--
-- Offer Performance Optimization Indices
-- Adds indices to improve offer search and serialization performance
--

-- 1. Offer sessions search indices (High Priority)
-- Improves WHERE clause performance for common search patterns
CREATE INDEX IF NOT EXISTS idx_offer_sessions_customer_id 
ON public.offer_sessions (customer_id);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_assigned_id 
ON public.offer_sessions (assigned_id);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_contractor_id 
ON public.offer_sessions (contractor_id);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_status 
ON public.offer_sessions (status);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_timestamp 
ON public.offer_sessions (timestamp DESC);

-- 2. Composite indices for common search combinations
CREATE INDEX IF NOT EXISTS idx_offer_sessions_customer_status 
ON public.offer_sessions (customer_id, status);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_contractor_status 
ON public.offer_sessions (contractor_id, status);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_assigned_status 
ON public.offer_sessions (assigned_id, status);

-- 3. Order offers indices (High Priority)
-- Improves getMostRecentOrderOffer performance
CREATE INDEX IF NOT EXISTS idx_order_offers_session_id_timestamp 
ON public.order_offers (session_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_order_offers_session_id 
ON public.order_offers (session_id);

-- 4. Offer market items count index (Medium Priority)
-- Improves getOfferMarketListingCount performance
CREATE INDEX IF NOT EXISTS idx_offer_market_items_offer_id 
ON public.offer_market_items (offer_id);

-- 5. Service lookup index (Low Priority)
-- Improves service name lookups
CREATE INDEX IF NOT EXISTS idx_services_service_id 
ON public.services (service_id);

-- 6. Accounts table indices (Medium Priority)
-- Improves JOIN performance for user lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id 
ON public.accounts (user_id);

-- 7. Contractors table indices (Medium Priority)
-- Improves JOIN performance for contractor lookups
CREATE INDEX IF NOT EXISTS idx_contractors_contractor_id 
ON public.contractors (contractor_id);

-- 8. Additional composite indices for complex queries
-- Optimizes queries that filter by multiple offer session fields
CREATE INDEX IF NOT EXISTS idx_offer_sessions_customer_timestamp 
ON public.offer_sessions (customer_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_contractor_timestamp 
ON public.offer_sessions (contractor_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_offer_sessions_assigned_timestamp 
ON public.offer_sessions (assigned_id, timestamp DESC);

-- 9. Order offers additional indices
-- Optimizes sorting by offer fields
CREATE INDEX IF NOT EXISTS idx_order_offers_timestamp 
ON public.order_offers (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_order_offers_service_id 
ON public.order_offers (service_id);

-- Add comments for documentation
COMMENT ON INDEX idx_offer_sessions_customer_id IS 'Optimizes customer-based offer searches';
COMMENT ON INDEX idx_offer_sessions_assigned_id IS 'Optimizes assigned user-based offer searches';
COMMENT ON INDEX idx_offer_sessions_contractor_id IS 'Optimizes contractor-based offer searches';
COMMENT ON INDEX idx_offer_sessions_status IS 'Optimizes status-based offer filtering';
COMMENT ON INDEX idx_offer_sessions_timestamp IS 'Optimizes timestamp-based sorting';
COMMENT ON INDEX idx_order_offers_session_id_timestamp IS 'Optimizes most recent offer lookups';
COMMENT ON INDEX idx_offer_market_items_offer_id IS 'Optimizes offer item count queries';
COMMENT ON INDEX idx_accounts_user_id IS 'Optimizes user account JOINs';
COMMENT ON INDEX idx_contractors_contractor_id IS 'Optimizes contractor JOINs';
COMMENT ON INDEX idx_offer_sessions_customer_timestamp IS 'Optimizes customer + timestamp sorting';
COMMENT ON INDEX idx_offer_sessions_contractor_timestamp IS 'Optimizes contractor + timestamp sorting';
COMMENT ON INDEX idx_offer_sessions_assigned_timestamp IS 'Optimizes assigned user + timestamp sorting';
COMMENT ON INDEX idx_order_offers_timestamp IS 'Optimizes offer timestamp sorting';
COMMENT ON INDEX idx_order_offers_service_id IS 'Optimizes service-based offer filtering';