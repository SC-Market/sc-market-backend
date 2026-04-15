-- Migration: Org Premium Tiers & Org Themes
-- Adds premium tier tracking for orgs and custom theme storage for white-label

-- Premium tiers table
CREATE TABLE IF NOT EXISTS public.org_premium_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id VARCHAR NOT NULL REFERENCES public.contractors(contractor_id) ON DELETE CASCADE,
    tier VARCHAR NOT NULL DEFAULT 'white_label',
    custom_domain VARCHAR UNIQUE,
    granted_by VARCHAR NOT NULL REFERENCES public.users(user_id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT org_premium_tiers_contractor_unique UNIQUE (contractor_id)
);

CREATE INDEX IF NOT EXISTS idx_org_premium_tiers_contractor ON public.org_premium_tiers(contractor_id);
CREATE INDEX IF NOT EXISTS idx_org_premium_tiers_tier ON public.org_premium_tiers(tier) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_premium_tiers_domain ON public.org_premium_tiers(custom_domain) WHERE custom_domain IS NOT NULL AND revoked_at IS NULL;

-- Org themes table
CREATE TABLE IF NOT EXISTS public.org_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id VARCHAR NOT NULL REFERENCES public.contractors(contractor_id) ON DELETE CASCADE,
    theme_data JSONB NOT NULL DEFAULT '{"light":{},"dark":{}}'::jsonb,
    favicon_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR NOT NULL REFERENCES public.users(user_id),
    CONSTRAINT org_themes_contractor_unique UNIQUE (contractor_id)
);

CREATE INDEX IF NOT EXISTS idx_org_themes_contractor ON public.org_themes(contractor_id);

-- Seed existing white-label orgs (contractor_id and granted_by must be filled with actual IDs)
-- These are placeholders; update with real contractor_ids and an admin user_id before running
-- INSERT INTO public.org_premium_tiers (contractor_id, tier, custom_domain, granted_by)
-- SELECT c.contractor_id, 'white_label', domain, (SELECT user_id FROM public.users WHERE role = 'admin' LIMIT 1)
-- FROM (VALUES
--   ('BWINCORP', 'bwsc.sc-market.space'),
--   ('MEDRUNNER', 'medrunner.sc-market.space'),
--   ('RSNM', 'redscar.sc-market.space')
-- ) AS v(spectrum_id, domain)
-- JOIN public.contractors c ON c.spectrum_id = v.spectrum_id;
