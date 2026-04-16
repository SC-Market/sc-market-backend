-- Migration: Order Alert Subscriptions + claim_orders permission
-- Adds claim_orders permission to contractor roles and order alert subscription channels

-- Add claim_orders permission to contractor_roles
ALTER TABLE public.contractor_roles
  ADD COLUMN IF NOT EXISTS claim_orders BOOLEAN NOT NULL DEFAULT false;

-- Order alert subscriptions table (one subscription per channel for now)
CREATE TABLE IF NOT EXISTS public.order_alert_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    contractor_id UUID REFERENCES public.contractors(contractor_id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.accounts(user_id) ON DELETE CASCADE,
    created_by_discord_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT order_alert_sub_channel_unique UNIQUE (channel_id),
    CONSTRAINT order_alert_sub_entity CHECK (
        (contractor_id IS NOT NULL AND user_id IS NULL) OR
        (contractor_id IS NULL AND user_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_order_alert_sub_contractor ON public.order_alert_subscriptions(contractor_id) WHERE contractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_alert_sub_user ON public.order_alert_subscriptions(user_id) WHERE user_id IS NOT NULL;
