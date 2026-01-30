-- Add negotiable flag to buy orders; allow price to be NULL when negotiable
ALTER TABLE public.market_buy_orders
    ADD COLUMN IF NOT EXISTS negotiable boolean NOT NULL DEFAULT false;

ALTER TABLE public.market_buy_orders
    ALTER COLUMN price DROP NOT NULL;
