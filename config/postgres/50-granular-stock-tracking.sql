-- ============================================================================
-- Granular Stock Tracking System
-- Migration: 50-granular-stock-tracking.sql
-- 
-- This migration implements a granular stock tracking system with stock lots,
-- locations, allocations, and allocation strategies.
-- ============================================================================

-- ============================================================================
-- 1.2: Create locations table with preset seed data
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.locations (
    location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    is_preset BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER,
    created_by UUID REFERENCES public.accounts(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE public.locations OWNER TO scmarket;

-- Add unique constraint on preset location names
CREATE UNIQUE INDEX idx_locations_preset_name ON public.locations(name) WHERE is_preset = true;

-- Create indexes on is_preset and created_by
CREATE INDEX idx_locations_preset ON public.locations(is_preset, display_order);
CREATE INDEX idx_locations_created_by ON public.locations(created_by);

-- Seed preset locations for major verse locations
-- Unspecified location (default)
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Unspecified', true, 0);

-- Major Cities
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Orison', true, 10);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Lorville', true, 20);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Area18', true, 30);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('New Babbage', true, 40);

-- Space Stations
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Port Olisar', true, 50);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Grim HEX', true, 60);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Everus Harbor', true, 70);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Baijini Point', true, 80);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('Seraphim Station', true, 90);

-- Rest Stops
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('CRU-L1', true, 100);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('CRU-L4', true, 110);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('CRU-L5', true, 120);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('HUR-L1', true, 130);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('HUR-L2', true, 140);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('HUR-L3', true, 150);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('HUR-L4', true, 160);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('HUR-L5', true, 170);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('ARC-L1', true, 180);
INSERT INTO public.locations (name, is_preset, display_order) VALUES ('MIC-L1', true, 190);

-- ============================================================================
-- 1.1: Create stock_lots table with indexes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_lots (
    lot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.market_listings(listing_id) ON DELETE CASCADE,
    quantity_total INTEGER NOT NULL CHECK (quantity_total >= 0),
    location_id UUID REFERENCES public.locations(location_id) ON DELETE SET NULL,
    owner_id UUID REFERENCES public.accounts(user_id) ON DELETE SET NULL,
    listed BOOLEAN NOT NULL DEFAULT true,
    notes VARCHAR(1000),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_lots OWNER TO scmarket;

-- Create indexes on listing_id, location_id, owner_id, and listed columns
CREATE INDEX idx_stock_lots_listing ON public.stock_lots(listing_id);
CREATE INDEX idx_stock_lots_location ON public.stock_lots(location_id);
CREATE INDEX idx_stock_lots_owner ON public.stock_lots(owner_id);
CREATE INDEX idx_stock_lots_listed ON public.stock_lots(listed) WHERE listed = true;

-- ============================================================================
-- 1.3: Create stock_allocations table with indexes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_allocations (
    allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id UUID NOT NULL REFERENCES public.stock_lots(lot_id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'released', 'fulfilled')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_allocations OWNER TO scmarket;

-- Create indexes on lot_id, order_id, and status
CREATE INDEX idx_allocations_lot ON public.stock_allocations(lot_id);
CREATE INDEX idx_allocations_order ON public.stock_allocations(order_id);
CREATE INDEX idx_allocations_status ON public.stock_allocations(status) WHERE status = 'active';

-- ============================================================================
-- 1.4: Create allocation_strategies table for organization preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.allocation_strategies (
    strategy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID REFERENCES public.contractors(contractor_id) ON DELETE CASCADE,
    strategy_type VARCHAR(20) NOT NULL CHECK (strategy_type IN ('fifo', 'location_priority')),
    location_priority_order UUID[],
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(contractor_id)
);

ALTER TABLE public.allocation_strategies OWNER TO scmarket;

-- ============================================================================
-- 1.5: Create database functions for stock aggregation
-- ============================================================================

-- Function to get available stock (not allocated) for a listing
CREATE OR REPLACE FUNCTION public.get_available_stock(p_listing_id UUID) 
RETURNS INTEGER AS $$
    SELECT COALESCE(SUM(
        sl.quantity_total - COALESCE(
            (SELECT SUM(sa.quantity) 
             FROM public.stock_allocations sa 
             WHERE sa.lot_id = sl.lot_id 
             AND sa.status = 'active'), 
            0
        )
    ), 0)::INTEGER
    FROM public.stock_lots sl
    WHERE sl.listing_id = p_listing_id
    AND sl.listed = true;
$$ LANGUAGE SQL STABLE;

ALTER FUNCTION public.get_available_stock(UUID) OWNER TO scmarket;

-- Function to get reserved stock (allocated) for a listing
CREATE OR REPLACE FUNCTION public.get_reserved_stock(p_listing_id UUID) 
RETURNS INTEGER AS $$
    SELECT COALESCE(SUM(sa.quantity), 0)::INTEGER
    FROM public.stock_allocations sa
    JOIN public.stock_lots sl ON sa.lot_id = sl.lot_id
    WHERE sl.listing_id = p_listing_id
    AND sa.status = 'active'
    AND sl.listed = true;
$$ LANGUAGE SQL STABLE;

ALTER FUNCTION public.get_reserved_stock(UUID) OWNER TO scmarket;

-- Function to get total stock for a listing (all lots)
CREATE OR REPLACE FUNCTION public.get_total_stock(p_listing_id UUID) 
RETURNS INTEGER AS $$
    SELECT COALESCE(SUM(quantity_total), 0)::INTEGER
    FROM public.stock_lots
    WHERE listing_id = p_listing_id;
$$ LANGUAGE SQL STABLE;

ALTER FUNCTION public.get_total_stock(UUID) OWNER TO scmarket;

-- ============================================================================
-- 1.6: Create triggers for backward compatibility
-- ============================================================================

-- Trigger function to keep quantity_available in sync
CREATE OR REPLACE FUNCTION public.sync_listing_quantity() 
RETURNS TRIGGER AS $$
DECLARE
    v_listing_id UUID;
BEGIN
    -- Determine the listing_id based on the operation
    IF TG_OP = 'DELETE' THEN
        v_listing_id := OLD.listing_id;
    ELSE
        v_listing_id := NEW.listing_id;
    END IF;

    -- Update the market_listings quantity_available
    UPDATE public.market_listings
    SET quantity_available = public.get_available_stock(v_listing_id)
    WHERE listing_id = v_listing_id;

    -- Return appropriate value based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.sync_listing_quantity() OWNER TO scmarket;

-- Create trigger on stock_lots INSERT/UPDATE/DELETE
CREATE TRIGGER trigger_sync_listing_quantity_on_lot_change
AFTER INSERT OR UPDATE OR DELETE ON public.stock_lots
FOR EACH ROW
EXECUTE FUNCTION public.sync_listing_quantity();

-- Trigger function to sync on allocation changes
CREATE OR REPLACE FUNCTION public.sync_listing_quantity_on_allocation() 
RETURNS TRIGGER AS $$
DECLARE
    v_listing_id UUID;
BEGIN
    -- Get the listing_id from the lot
    IF TG_OP = 'DELETE' THEN
        SELECT listing_id INTO v_listing_id
        FROM public.stock_lots
        WHERE lot_id = OLD.lot_id;
    ELSE
        SELECT listing_id INTO v_listing_id
        FROM public.stock_lots
        WHERE lot_id = NEW.lot_id;
    END IF;

    -- Update the market_listings quantity_available
    IF v_listing_id IS NOT NULL THEN
        UPDATE public.market_listings
        SET quantity_available = public.get_available_stock(v_listing_id)
        WHERE listing_id = v_listing_id;
    END IF;

    -- Return appropriate value based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.sync_listing_quantity_on_allocation() OWNER TO scmarket;

-- Create trigger on stock_allocations INSERT/UPDATE/DELETE
CREATE TRIGGER trigger_sync_listing_quantity_on_allocation_change
AFTER INSERT OR UPDATE OR DELETE ON public.stock_allocations
FOR EACH ROW
EXECUTE FUNCTION public.sync_listing_quantity_on_allocation();

-- ============================================================================
-- End of migration
-- ============================================================================
