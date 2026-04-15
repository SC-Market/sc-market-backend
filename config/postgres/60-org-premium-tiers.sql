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
