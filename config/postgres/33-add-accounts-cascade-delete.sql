-- Migration: Add CASCADE DELETE to all foreign keys referencing accounts(user_id)
-- Description: Ensures that when a user is deleted from the accounts table,
--              all related rows in dependent tables are automatically deleted
--              to maintain referential integrity and prevent orphaned records.

BEGIN;

-- =============================================================================
-- 1. CHAT & MESSAGING TABLES
-- =============================================================================

-- chat_participants: Delete participant records when user is deleted
ALTER TABLE public.chat_participants
    DROP CONSTRAINT IF EXISTS chat_participants_user_id_fkey;

ALTER TABLE public.chat_participants
    ADD CONSTRAINT chat_participants_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- messages: Delete messages when author is deleted
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_author_fkey;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_author_fkey 
    FOREIGN KEY (author) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 2. COMMENTS & VOTES
-- =============================================================================

-- comments: Delete comments when author is deleted
ALTER TABLE public.comments
    DROP CONSTRAINT IF EXISTS comments_author_fkey;

ALTER TABLE public.comments
    ADD CONSTRAINT comments_author_fkey 
    FOREIGN KEY (author) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 3. MARKET TABLES
-- =============================================================================

-- market_aggregate_listings_legacy: Delete legacy aggregate listings when user seller is deleted
ALTER TABLE public.market_aggregate_listings_legacy
    DROP CONSTRAINT IF EXISTS market_aggregate_listings_user_seller_id_fkey;

ALTER TABLE public.market_aggregate_listings_legacy
    ADD CONSTRAINT market_aggregate_listings_user_seller_id_fkey 
    FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- market_bids: Delete bids when user bidder is deleted
ALTER TABLE public.market_bids
    DROP CONSTRAINT IF EXISTS market_bids_user_bidder_id_fkey;

ALTER TABLE public.market_bids
    ADD CONSTRAINT market_bids_user_bidder_id_fkey 
    FOREIGN KEY (user_bidder_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- market_buy_orders: Delete buy orders when buyer is deleted
ALTER TABLE public.market_buy_orders
    DROP CONSTRAINT IF EXISTS market_buy_orders_buyer_id_fkey;

ALTER TABLE public.market_buy_orders
    ADD CONSTRAINT market_buy_orders_buyer_id_fkey 
    FOREIGN KEY (buyer_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- market_listings: Delete listings when user seller is deleted
ALTER TABLE public.market_listings
    DROP CONSTRAINT IF EXISTS market_listings_new_user_seller_id_fkey;

ALTER TABLE public.market_listings
    ADD CONSTRAINT market_listings_new_user_seller_id_fkey 
    FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- market_listings_legacy: Delete legacy listings when user seller is deleted
ALTER TABLE public.market_listings_legacy
    DROP CONSTRAINT IF EXISTS market_listings_user_seller_id_fkey;

ALTER TABLE public.market_listings_legacy
    ADD CONSTRAINT market_listings_user_seller_id_fkey 
    FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- market_multiple: Delete multiple listings when user seller is deleted
ALTER TABLE public.market_multiple
    DROP CONSTRAINT IF EXISTS market_multiple_user_seller_id_fkey;

ALTER TABLE public.market_multiple
    ADD CONSTRAINT market_multiple_user_seller_id_fkey 
    FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- market_multiples: Delete multiples when user seller is deleted
ALTER TABLE public.market_multiples
    DROP CONSTRAINT IF EXISTS market_multiples_user_seller_id_fkey;

ALTER TABLE public.market_multiples
    ADD CONSTRAINT market_multiples_user_seller_id_fkey 
    FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 4. NOTIFICATION TABLES
-- =============================================================================

-- notification_change: Delete notification changes when actor is deleted
ALTER TABLE public.notification_change
    DROP CONSTRAINT IF EXISTS notification_change_actor_id_fkey;

ALTER TABLE public.notification_change
    ADD CONSTRAINT notification_change_actor_id_fkey 
    FOREIGN KEY (actor_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- notification: Delete notifications when notifier is deleted
ALTER TABLE public.notification
    DROP CONSTRAINT IF EXISTS notification_notifier_id_fkey;

ALTER TABLE public.notification
    ADD CONSTRAINT notification_notifier_id_fkey 
    FOREIGN KEY (notifier_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- notification_webhooks: Delete webhooks when user is deleted
ALTER TABLE public.notification_webhooks
    DROP CONSTRAINT IF EXISTS order_webhooks_user_id_fkey;

ALTER TABLE public.notification_webhooks
    ADD CONSTRAINT order_webhooks_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 5. ORDER TABLES
-- =============================================================================

-- order_comments: Delete order comments when author is deleted
ALTER TABLE public.order_comments
    DROP CONSTRAINT IF EXISTS order_comments_author_fkey;

ALTER TABLE public.order_comments
    ADD CONSTRAINT order_comments_author_fkey 
    FOREIGN KEY (author) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- order_offers: Delete order offers when actor is deleted
ALTER TABLE public.order_offers
    DROP CONSTRAINT IF EXISTS order_offers_actor_id_fkey;

ALTER TABLE public.order_offers
    ADD CONSTRAINT order_offers_actor_id_fkey 
    FOREIGN KEY (actor_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- order_reviews: Delete order reviews when author is deleted
ALTER TABLE public.order_reviews
    DROP CONSTRAINT IF EXISTS order_reviews_author_fkey;

ALTER TABLE public.order_reviews
    ADD CONSTRAINT order_reviews_author_fkey 
    FOREIGN KEY (user_author) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- services (order_templates): Delete service templates when assigned user is deleted
ALTER TABLE public.services
    DROP CONSTRAINT IF EXISTS order_templates_assigned_id_fkey;

ALTER TABLE public.services
    ADD CONSTRAINT order_templates_assigned_id_fkey 
    FOREIGN KEY (assigned_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- services (order_templates): Delete service templates when owner user is deleted
ALTER TABLE public.services
    DROP CONSTRAINT IF EXISTS order_templates_user_id_fkey;

ALTER TABLE public.services
    ADD CONSTRAINT order_templates_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- orders: Delete orders when assigned user is deleted
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_assigned_id_fkey;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_assigned_id_fkey 
    FOREIGN KEY (assigned_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- orders: Delete orders when customer is deleted
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_customer_id_fkey 
    FOREIGN KEY (customer_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- public_contracts: Delete public contracts when customer is deleted
ALTER TABLE public.public_contracts
    DROP CONSTRAINT IF EXISTS public_contracts_customer_id_fkey;

ALTER TABLE public.public_contracts
    ADD CONSTRAINT public_contracts_customer_id_fkey 
    FOREIGN KEY (customer_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 6. SHIP TABLES
-- =============================================================================

-- ship_checkins: Delete ship checkins when user is deleted
ALTER TABLE public.ship_checkins
    DROP CONSTRAINT IF EXISTS ship_checkins_user_id_fkey;

ALTER TABLE public.ship_checkins
    ADD CONSTRAINT ship_checkins_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- ships: Delete ships when owner is deleted
ALTER TABLE public.ships
    DROP CONSTRAINT IF EXISTS ships_owner_fkey;

ALTER TABLE public.ships
    ADD CONSTRAINT ships_owner_fkey 
    FOREIGN KEY (owner) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 7. USER SETTINGS TABLES
-- =============================================================================

-- user_contractor_settings: Delete user contractor settings when user is deleted
ALTER TABLE public.user_contractor_settings
    DROP CONSTRAINT IF EXISTS user_contractor_settings_user_id_fkey;

ALTER TABLE public.user_contractor_settings
    ADD CONSTRAINT user_contractor_settings_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 8. LISTING VIEWS TABLE
-- =============================================================================

-- listing_views: Delete view records when viewer is deleted
-- Note: Foreign key was defined inline in CREATE TABLE, so PostgreSQL auto-generated constraint name
-- We'll drop and recreate it with CASCADE DELETE
DO $$
DECLARE
    viewer_constraint_name TEXT;
BEGIN
    -- Find the actual constraint name for viewer_id
    SELECT tc.constraint_name INTO viewer_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
        AND tc.table_name = 'listing_views'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'viewer_id'
    LIMIT 1;

    -- Drop and recreate viewer_id constraint with CASCADE
    IF viewer_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.listing_views DROP CONSTRAINT %I', viewer_constraint_name);
    END IF;
    
    ALTER TABLE public.listing_views
        ADD CONSTRAINT listing_views_viewer_id_fkey 
        FOREIGN KEY (viewer_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;
END $$;

-- =============================================================================
-- 9. CONTENT REPORTS TABLE
-- =============================================================================

-- content_reports: Delete reports when reporter is deleted
-- Note: Foreign keys were defined inline in CREATE TABLE, so PostgreSQL auto-generated constraint names
-- We'll drop and recreate them with CASCADE DELETE
DO $$
DECLARE
    reporter_constraint_name TEXT;
    handled_by_constraint_name TEXT;
BEGIN
    -- Find the actual constraint name for reporter_id
    SELECT tc.constraint_name INTO reporter_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
        AND tc.table_name = 'content_reports'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'reporter_id'
    LIMIT 1;

    -- Find the actual constraint name for handled_by
    SELECT tc.constraint_name INTO handled_by_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
        AND tc.table_name = 'content_reports'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'handled_by'
    LIMIT 1;

    -- Drop and recreate reporter_id constraint with CASCADE
    IF reporter_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.content_reports DROP CONSTRAINT %I', reporter_constraint_name);
    END IF;
    
    ALTER TABLE public.content_reports
        ADD CONSTRAINT content_reports_reporter_id_fkey 
        FOREIGN KEY (reporter_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

    -- Drop and recreate handled_by constraint with SET NULL (since it's nullable)
    IF handled_by_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.content_reports DROP CONSTRAINT %I', handled_by_constraint_name);
    END IF;
    
    ALTER TABLE public.content_reports
        ADD CONSTRAINT content_reports_handled_by_fkey 
        FOREIGN KEY (handled_by) REFERENCES public.accounts(user_id) ON DELETE SET NULL;
END $$;

-- =============================================================================
-- 10. ARCHIVE TABLES
-- =============================================================================

-- contractor_archive_details: Delete archive details when archiver is deleted
ALTER TABLE public.contractor_archive_details
    DROP CONSTRAINT IF EXISTS contractor_archive_details_archived_by_fkey;

ALTER TABLE public.contractor_archive_details
    ADD CONSTRAINT contractor_archive_details_archived_by_fkey 
    FOREIGN KEY (archived_by) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

-- =============================================================================
-- 11. CASCADE CHAINS: Foreign keys referencing tables that cascade from accounts
-- =============================================================================

-- Since offer_sessions will be deleted when users are deleted (via customer_id/assigned_id),
-- we need to ensure all foreign keys referencing offer_sessions also cascade

-- chats: Delete chats when offer_session is deleted (which happens when user is deleted)
ALTER TABLE public.chats
    DROP CONSTRAINT IF EXISTS chats_session_id_fkey;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES public.offer_sessions(id) ON DELETE CASCADE;

-- Since chats will be deleted when offer_sessions are deleted (which happens when users are deleted),
-- we need to ensure all foreign keys referencing chats also cascade

-- chat_participants: Delete participants when chat is deleted
ALTER TABLE public.chat_participants
    DROP CONSTRAINT IF EXISTS chat_participants_chat_id_fkey;

ALTER TABLE public.chat_participants
    ADD CONSTRAINT chat_participants_chat_id_fkey 
    FOREIGN KEY (chat_id) REFERENCES public.chats(chat_id) ON DELETE CASCADE;

-- messages: Delete messages when chat is deleted
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_chat_id_fkey;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_chat_id_fkey 
    FOREIGN KEY (chat_id) REFERENCES public.chats(chat_id) ON DELETE CASCADE;

-- orders: Delete orders when offer_session is deleted (which happens when user is deleted)
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_offer_session_id_fkey;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_offer_session_id_fkey 
    FOREIGN KEY (offer_session_id) REFERENCES public.offer_sessions(id) ON DELETE CASCADE;

-- public_contract_offers: Delete contract offers when offer_session is deleted
ALTER TABLE public.public_contract_offers
    DROP CONSTRAINT IF EXISTS public_contract_offers_session_id_fkey;

ALTER TABLE public.public_contract_offers
    ADD CONSTRAINT public_contract_offers_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES public.offer_sessions(id) ON DELETE CASCADE;

-- Note: order_offers_session_id_fkey already has ON DELETE CASCADE, so no change needed

COMMIT;
