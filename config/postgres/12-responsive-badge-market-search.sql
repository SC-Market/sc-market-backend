-- Migration 12: Add responsive badge data to market search views
-- Zero-downtime strategy: rename old views, create new ones, then drop old ones
-- Based on original definitions from 0-schema.sql

BEGIN;

-- Step 1: Rename existing views to temporary names
ALTER VIEW public.market_search RENAME TO market_search_old;
ALTER VIEW public.market_search_complete RENAME TO market_search_complete_old;
ALTER MATERIALIZED VIEW public.market_search_materialized RENAME TO market_search_materialized_old;

-- Step 2: Create new market_search view with responsive badge data
CREATE VIEW public.market_search AS
 SELECT market_listings.listing_id,
    'unique'::text AS listing_type,
    market_listings.sale_type,
        CASE
            WHEN ((market_listings.sale_type)::text = 'auction'::text) THEN ( SELECT COALESCE((( SELECT max(market_bids.bid) AS max
                       FROM public.market_bids
                      WHERE (market_listings.listing_id = market_bids.listing_id)))::bigint, market_listings.price) AS "coalesce")
            ELSE market_listings.price
        END AS price,
        CASE
            WHEN ((market_listings.sale_type)::text = 'auction'::text) THEN ( SELECT COALESCE((( SELECT max(market_bids.bid) AS max
                       FROM public.market_bids
                      WHERE (market_listings.listing_id = market_bids.listing_id)))::bigint, market_listings.price) AS "coalesce")
            ELSE market_listings.price
        END AS minimum_price,
        CASE
            WHEN ((market_listings.sale_type)::text = 'auction'::text) THEN ( SELECT COALESCE((( SELECT max(market_bids.bid) AS max
                       FROM public.market_bids
                      WHERE (market_listings.listing_id = market_bids.listing_id)))::bigint, market_listings.price) AS "coalesce")
            ELSE market_listings.price
        END AS maximum_price,
    market_listings.quantity_available,
    market_listings."timestamp",
    market_listings.expiration,
    public.get_total_rating(market_listings.user_seller_id, market_listings.contractor_seller_id) AS total_rating,
    public.get_average_rating_float(market_listings.user_seller_id, market_listings.contractor_seller_id) AS avg_rating,
    market_listing_details.details_id,
    to_tsvector('english'::regconfig, concat(ARRAY[market_listing_details.title, market_listing_details.description])) AS textsearch,
    market_listings.status,
    market_listings.internal,
    market_listings.user_seller_id,
    ( SELECT accounts.username
           FROM public.accounts
          WHERE (accounts.user_id = market_listings.user_seller_id)) AS user_seller,
    market_listings.contractor_seller_id,
    ( SELECT contractors.spectrum_id
           FROM public.contractors
          WHERE (contractors.contractor_id = market_listings.contractor_seller_id)) AS contractor_seller,
    public.get_auction_end(market_unique_listings.listing_id, market_listings.sale_type) AS auction_end_time,
    public.get_rating_count(market_listings.user_seller_id, market_listings.contractor_seller_id) AS rating_count,
    public.get_rating_streak(market_listings.user_seller_id, market_listings.contractor_seller_id) AS rating_streak,
    public.get_total_orders(market_listings.user_seller_id, market_listings.contractor_seller_id) AS total_orders,
    market_listing_details.details_id AS photo_details,
    -- Add responsive badge data at the end
    public.get_total_assignments(market_listings.user_seller_id, market_listings.contractor_seller_id)::integer AS total_assignments,
    public.get_response_rate(market_listings.user_seller_id, market_listings.contractor_seller_id)::float AS response_rate
   FROM ((public.market_unique_listings
     JOIN public.market_listings ON ((market_unique_listings.listing_id = market_listings.listing_id)))
     JOIN public.market_listing_details ON ((market_unique_listings.details_id = market_listing_details.details_id)))
UNION
 SELECT market_multiples.multiple_id AS listing_id,
    'multiple'::text AS listing_type,
    'sale'::character varying AS sale_type,
    ( SELECT market_listings_1.price
           FROM public.market_listings market_listings_1
          WHERE (market_listings_1.listing_id = market_multiples.default_listing_id)) AS price,
    min(market_listings.price) AS minimum_price,
    min(market_listings.price) AS maximum_price,
    COALESCE(sum(market_listings.quantity_available), (0)::bigint) AS quantity_available,
    max(market_listings."timestamp") AS "timestamp",
    max(market_listings.expiration) AS expiration,
    max(public.get_total_rating(market_listings.user_seller_id, market_listings.contractor_seller_id)) AS total_rating,
    max(public.get_average_rating_float(market_listings.user_seller_id, market_listings.contractor_seller_id)) AS avg_rating,
    main_details.details_id,
    to_tsvector('english'::regconfig, ((((main_details.title)::text || ' '::text) || (main_details.description)::text) || ( SELECT string_agg((((entry_details.title)::text || ' '::text) || (entry_details.description)::text), ','::text) AS string_agg))) AS textsearch,
        CASE
            WHEN bool_or(((market_listings.status)::text = 'active'::text)) THEN 'active'::text
            ELSE 'inactive'::text
        END AS status,
        CASE
            WHEN bool_or((NOT market_listings.internal)) THEN false
            ELSE true
        END AS internal,
    market_multiples.user_seller_id,
    ( SELECT accounts.username
           FROM public.accounts
          WHERE (accounts.user_id = market_multiples.user_seller_id)) AS user_seller,
    market_multiples.contractor_seller_id,
    ( SELECT contractors.spectrum_id
           FROM public.contractors
          WHERE (contractors.contractor_id = market_multiples.contractor_seller_id)) AS contractor_seller,
    NULL::timestamp without time zone AS auction_end_time,
    public.get_rating_count(market_multiples.user_seller_id, market_multiples.contractor_seller_id) AS rating_count,
    public.get_rating_streak(market_multiples.user_seller_id, market_multiples.contractor_seller_id) AS rating_streak,
    public.get_total_orders(market_multiples.user_seller_id, market_multiples.contractor_seller_id) AS total_orders,
    ( SELECT market_multiple_listings.details_id
           FROM public.market_multiple_listings
          WHERE (market_multiple_listings.multiple_listing_id = market_multiples.default_listing_id)) AS photo_details,
    -- Add responsive badge data at the end
    public.get_total_assignments(market_multiples.user_seller_id, market_multiples.contractor_seller_id)::integer AS total_assignments,
    public.get_response_rate(market_multiples.user_seller_id, market_multiples.contractor_seller_id)::float AS response_rate
   FROM ((((public.market_multiples
     JOIN public.market_listing_details main_details ON ((market_multiples.details_id = main_details.details_id)))
     LEFT JOIN public.market_multiple_listings listings ON ((market_multiples.multiple_id = listings.multiple_id)))
     LEFT JOIN public.market_listings ON ((listings.multiple_listing_id = market_listings.listing_id)))
     JOIN public.market_listing_details entry_details ON ((listings.details_id = entry_details.details_id)))
  GROUP BY market_multiples.multiple_id, main_details.details_id
UNION
 SELECT game_items.id AS listing_id,
    'aggregate'::text AS listing_type,
    'sale'::character varying AS sale_type,
    min(market_listings.price) AS price,
    min(market_listings.price) AS minimum_price,
    max(market_listings.price) AS maximum_price,
    COALESCE(sum(market_listings.quantity_available), (0)::bigint) AS quantity_available,
    max(market_listings."timestamp") AS "timestamp",
    max(market_listings.expiration) AS expiration,
    max(public.get_total_rating(market_listings.user_seller_id, market_listings.contractor_seller_id)) AS total_rating,
    max(public.get_average_rating_float(market_listings.user_seller_id, market_listings.contractor_seller_id)) AS avg_rating,
    ( SELECT d.details_id
           FROM public.market_listing_details d
          WHERE (market_listing_details.game_item_id = d.game_item_id)
         LIMIT 1) AS details_id,
    to_tsvector('english'::regconfig, (((( SELECT d.description
           FROM public.market_listing_details d
          WHERE (market_listing_details.game_item_id = d.game_item_id)
         LIMIT 1))::text || ' '::text) || (( SELECT d.title
           FROM public.market_listing_details d
          WHERE (market_listing_details.game_item_id = d.game_item_id)
         LIMIT 1))::text)) AS textsearch,
    'active'::character varying AS status,
    false AS internal,
    NULL::uuid AS user_seller_id,
    NULL::character varying AS user_seller,
    NULL::uuid AS contractor_seller_id,
    NULL::public.citext AS contractor_seller,
    NULL::timestamp without time zone AS auction_end_time,
    NULL::integer AS rating_count,
    NULL::integer AS rating_streak,
    NULL::integer AS total_orders,
    ( SELECT d.details_id
           FROM public.market_listing_details d
          WHERE (market_listing_details.game_item_id = d.game_item_id)
         LIMIT 1) AS photo_details,
    -- Add responsive badge data at the end (null for aggregate listings)
    NULL::integer AS total_assignments,
    NULL::float AS response_rate
   FROM (((public.game_items
     JOIN public.market_listing_details ON (((market_listing_details.game_item_id = game_items.id) AND (market_listing_details.game_item_id IS NOT NULL))))
     JOIN public.market_unique_listings ON ((market_unique_listings.details_id = market_listing_details.details_id)))
     LEFT JOIN public.market_listings ON (((market_unique_listings.listing_id = market_listings.listing_id) AND (market_listings.quantity_available > 0) AND ((market_listings.status)::text = 'active'::text))))
  GROUP BY market_listing_details.game_item_id, game_items.id;

-- Step 3: Create new market_search_complete view with responsive badge data
CREATE VIEW public.market_search_complete AS
 SELECT market_search.listing_id,
    market_search.listing_type,
    market_search.sale_type,
    market_search.price,
    market_search.minimum_price,
    market_search.maximum_price,
    market_search.quantity_available,
    market_search."timestamp",
    market_search.expiration,
    market_search.total_rating,
    market_search.avg_rating,
    market_search.details_id,
    (market_search.textsearch || to_tsvector('english'::regconfig, (COALESCE(game_items.name, ''::character varying))::text)) AS textsearch,
    market_search.status,
    market_search.internal,
    market_search.user_seller_id,
    market_search.user_seller,
    market_search.contractor_seller_id,
    market_search.contractor_seller,
    market_search.auction_end_time,
    market_search.rating_count,
    market_search.rating_streak,
    market_search.total_orders,
    market_search.photo_details,
    market_listing_details.title,
    market_listing_details.item_type,
    game_items.name AS item_name,
    market_listing_details.game_item_id,
    to_tsvector('english'::regconfig, concat(ARRAY[market_listing_details.item_type, game_item_categories.category])) AS item_type_ts,
    ( SELECT COALESCE(image_resources.external_url, ('https://cdn.sc-market.space/' || image_resources.filename)::url)
           FROM (public.image_resources
             LEFT JOIN public.market_images ON ((market_images.resource_id = image_resources.resource_id)))
          WHERE (market_images.details_id = market_search.photo_details)
         LIMIT 1) AS photo,
    -- Include responsive badge data at the very end
    market_search.total_assignments,
    market_search.response_rate
   FROM (((public.market_search
     LEFT JOIN public.market_listing_details ON ((market_listing_details.details_id = market_search.details_id)))
     LEFT JOIN public.game_items ON ((market_listing_details.game_item_id = game_items.id)))
     LEFT JOIN public.game_item_categories ON (((market_listing_details.item_type)::text = (game_item_categories.subcategory)::text)));

-- Step 4: Create new materialized view with responsive badge data
CREATE MATERIALIZED VIEW public.market_search_materialized AS
 SELECT market_search_complete.listing_id,
    market_search_complete.listing_type,
    market_search_complete.sale_type,
    market_search_complete.price,
    market_search_complete.minimum_price,
    market_search_complete.maximum_price,
    market_search_complete.quantity_available,
    market_search_complete."timestamp",
    market_search_complete.expiration,
    market_search_complete.total_rating,
    market_search_complete.avg_rating,
    market_search_complete.details_id,
    market_search_complete.textsearch,
    market_search_complete.status,
    market_search_complete.internal,
    market_search_complete.user_seller_id,
    market_search_complete.user_seller,
    market_search_complete.contractor_seller_id,
    market_search_complete.contractor_seller,
    market_search_complete.auction_end_time,
    market_search_complete.rating_count,
    market_search_complete.rating_streak,
    market_search_complete.total_orders,
    market_search_complete.photo_details,
    market_search_complete.title,
    market_search_complete.item_type,
    market_search_complete.item_name,
    market_search_complete.game_item_id,
    market_search_complete.item_type_ts,
    market_search_complete.photo,
    -- Include responsive badge data at the very end
    market_search_complete.total_assignments,
    market_search_complete.response_rate
   FROM public.market_search_complete
  WITH NO DATA;

-- Step 5: Populate the new materialized view
REFRESH MATERIALIZED VIEW public.market_search_materialized;

-- Step 6: Create indexes on the new materialized view
CREATE UNIQUE INDEX IF NOT EXISTS market_search_materialized_listing_id_index ON public.market_search_materialized (listing_id);
CREATE INDEX IF NOT EXISTS market_search_materialized_price_index ON public.market_search_materialized (price);
CREATE INDEX IF NOT EXISTS market_search_materialized_min_price_index ON public.market_search_materialized (minimum_price);
CREATE INDEX IF NOT EXISTS market_search_materialized_max_price_index ON public.market_search_materialized (maximum_price);
CREATE INDEX IF NOT EXISTS market_search_materialized_quantity_index ON public.market_search_materialized (quantity_available);
CREATE INDEX IF NOT EXISTS market_search_materialized_timestamp_index ON public.market_search_materialized ("timestamp");
CREATE INDEX IF NOT EXISTS market_search_materialized_textsearch_index ON public.market_search_materialized (textsearch);
CREATE INDEX IF NOT EXISTS market_search_materialized_status_index ON public.market_search_materialized (status);
CREATE INDEX IF NOT EXISTS market_search_materialized_user_seller_index ON public.market_search_materialized (user_seller_id);
CREATE INDEX IF NOT EXISTS market_search_materialized_contractor_seller_index ON public.market_search_materialized (contractor_seller_id);
CREATE INDEX IF NOT EXISTS market_search_materialized_item_id_index ON public.market_search_materialized (game_item_id);

-- Step 7: Drop the old views (now safe to do so)
DROP VIEW IF EXISTS public.market_search_complete_old CASCADE;
DROP VIEW IF EXISTS public.market_search_old CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.market_search_materialized_old CASCADE;

COMMIT;


