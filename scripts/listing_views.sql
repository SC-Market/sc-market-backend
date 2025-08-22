ABORT;
BEGIN;

-- Create a view tracking table for both market listings and services
CREATE TABLE IF NOT EXISTS public.listing_views (
    view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_type VARCHAR(20) NOT NULL CHECK (listing_type IN ('market', 'service')),
    listing_id UUID NOT NULL,
    viewer_id UUID REFERENCES public.accounts(user_id),
    viewer_ip INET,
    user_agent TEXT,
    referrer TEXT,
    timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
    session_id TEXT,
    is_unique BOOLEAN DEFAULT true
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_listing_views_listing ON public.listing_views(listing_type, listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_views_timestamp ON public.listing_views(timestamp);
CREATE INDEX IF NOT EXISTS idx_listing_views_viewer ON public.listing_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_listing_views_session ON public.listing_views(session_id);

-- Create a view for aggregated view counts
CREATE OR REPLACE VIEW public.listing_view_stats AS
SELECT 
    listing_type,
    listing_id,
    COUNT(*) as total_views,
    COUNT(DISTINCT viewer_id) as unique_viewers,
    COUNT(DISTINCT session_id) as unique_sessions,
    MIN(timestamp) as first_view,
    MAX(timestamp) as last_view
FROM public.listing_views
GROUP BY listing_type, listing_id;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.listing_views TO scmarket;
GRANT SELECT ON public.listing_view_stats TO scmarket;

COMMIT;