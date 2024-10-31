--
-- PostgreSQL database dump
--

-- Dumped from database version 14.2 (Debian 14.2-1.pgdg110+1)
-- Dumped by pg_dump version 14.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: email; Type: DOMAIN; Schema: public; Owner: voc_sc
--

CREATE DOMAIN public.email AS character varying(320)
	CONSTRAINT email_check CHECK (((VALUE)::text ~ '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'::text));


ALTER DOMAIN public.email OWNER TO voc_sc;

--
-- Name: url; Type: DOMAIN; Schema: public; Owner: voc_sc
--

CREATE DOMAIN public.url AS character varying(2048)
	CONSTRAINT url_check CHECK (((VALUE)::text ~ 'https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,255}\.[a-z]{2,9}\y([-a-zA-Z0-9@:%_\+.~#?&//=]*)$'::text));


ALTER DOMAIN public.url OWNER TO voc_sc;

--
-- Name: get_auction_end(uuid, character varying); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_auction_end(uuid, character varying) RETURNS timestamp without time zone
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    IF $2 = 'auction' THEN
        RETURN (SELECT end_time
                FROM market_auction_details
                WHERE listing_id = $1
                LIMIT 1);
    ELSE
        RETURN NULL;
    END IF;
END;
$_$;


ALTER FUNCTION public.get_auction_end(uuid, character varying) OWNER TO dashboard;

--
-- Name: get_average_rating(uuid, uuid); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_average_rating(uuid, uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    IF $1 IS NOT NULL THEN
        RETURN (SELECT COALESCE(AVG(order_reviews.rating), 0) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE (CASE
                           WHEN assigned_id = $1 AND contractor_id IS null AND role = 'customer' THEN TRUE
                           WHEN customer_id = $1 AND role = 'contractor' THEN TRUE
                           ELSE FALSE
                    END)
                  AND rating > 0);
    ELSE
        RETURN (SELECT COALESCE(AVG(order_reviews.rating), 0) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE contractor_id = $2
                  AND role = 'customer'
                  AND rating > 0);
    END IF;
END;
$_$;


ALTER FUNCTION public.get_average_rating(uuid, uuid) OWNER TO dashboard;

--
-- Name: get_order_count(); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_order_count() RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN (SELECT COUNT(*)                                                         as total_orders,
           (SELECT SUM(orders.cost) FROM orders WHERE status = 'fulfilled') as total_order_value
    FROM orders as t);
END;
$$;


ALTER FUNCTION public.get_order_count() OWNER TO dashboard;

--
-- Name: get_order_count(uuid, uuid); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_order_count(uuid, uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    SELECT COUNT(*), (SELECT SUM(orders.cost) FROM orders WHERE status = 'fulfilled') FROM orders as t;
END;
$$;


ALTER FUNCTION public.get_order_count(uuid, uuid) OWNER TO dashboard;

--
-- Name: get_rating_count(uuid, uuid); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_rating_count(uuid, uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    IF $1 IS NOT NULL THEN
        RETURN (SELECT COUNT(order_reviews.rating) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE (CASE
                           WHEN assigned_id = $1 AND contractor_id IS null AND role = 'customer' THEN TRUE
                           WHEN customer_id = $1 AND role = 'contractor' THEN TRUE
                           ELSE FALSE
                    END)
                  AND rating > 0);
    ELSE
        RETURN (SELECT COUNT(order_reviews.rating) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE contractor_id = $2
                  AND role = 'customer'
                  AND rating > 0);
    END IF;
END;
$_$;


ALTER FUNCTION public.get_rating_count(uuid, uuid) OWNER TO dashboard;

--
-- Name: get_rating_streak(uuid, uuid); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_rating_streak(uuid, uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    IF $1 IS NOT NULL THEN
        RETURN (WITH numbered as (SELECT *, row_number() OVER (ORDER BY order_reviews.timestamp DESC) AS row_number
                                  FROM order_reviews
                                           INNER JOIN orders USING (order_id)
                                  WHERE (CASE
                                             WHEN assigned_id = $1 AND contractor_id IS null AND role = 'customer'
                                                 THEN TRUE
                                             WHEN customer_id = $1 AND role = 'contractor' THEN TRUE
                                             ELSE FALSE
                                      END)
                                    AND rating > 0)
                    (SELECT COALESCE(
                                    (SELECT row_number
                                     FROM numbered
                                     WHERE rating < 5
                                     LIMIT 1),
                                    (SELECT COUNT(*) FROM numbered)
                            )));
    ELSE
        RETURN (WITH numbered as (SELECT *, row_number() OVER (ORDER BY order_reviews.timestamp DESC) AS row_number
                                  FROM order_reviews
                                           INNER JOIN orders USING (order_id)
                                  WHERE rating > 0
                                    AND contractor_id = $2
                                    AND role = 'customer')
                    (SELECT COALESCE(
                                    (SELECT row_number
                                     FROM numbered
                                     WHERE rating < 5
                                     LIMIT 1),
                                    (SELECT COUNT(*) FROM numbered)
                            )));
    END IF;
END;
$_$;


ALTER FUNCTION public.get_rating_streak(uuid, uuid) OWNER TO dashboard;

--
-- Name: get_total_orders(uuid, uuid); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_total_orders(uuid, uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    IF $1 IS NOT NULL THEN
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE contractor_id IS null
                  AND assigned_id = $1);
    ELSE
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE contractor_id = $2);
    END IF;
END;
$_$;


ALTER FUNCTION public.get_total_orders(uuid, uuid) OWNER TO dashboard;

--
-- Name: get_total_rating(uuid, uuid); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_total_rating(uuid, uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    IF $1 IS NOT NULL THEN
        RETURN (SELECT COALESCE(SUM(order_reviews.rating), 0) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE (CASE
                           WHEN assigned_id = $1 AND contractor_id IS null AND role = 'customer' THEN TRUE
                           WHEN customer_id = $1 AND role = 'contractor' THEN TRUE
                           ELSE FALSE
                    END)
                  AND rating > 0);
    ELSE
        RETURN (SELECT COALESCE(SUM(order_reviews.rating), 0) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE contractor_id = $2
                  AND role = 'customer'
                  AND rating > 0);
    END IF;
END;
$_$;


ALTER FUNCTION public.get_total_rating(uuid, uuid) OWNER TO dashboard;

--
-- Name: get_week_order_count(); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_week_order_count() RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN (SELECT COUNT(*)                                                                 as week_orders,
           (SELECT SUM(orders.cost)
            FROM orders
            WHERE status = 'fulfilled' AND timestamp > (NOW() - INTERVAL '1 week')) as week_order_value
    FROM orders t
    WHERE timestamp > (NOW() - INTERVAL '1 week'));
END;
$$;


ALTER FUNCTION public.get_week_order_count() OWNER TO dashboard;

--
-- Name: get_week_order_count(uuid, uuid); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.get_week_order_count(uuid, uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    SELECT COUNT(*),
           (SELECT SUM(orders.cost) FROM orders WHERE status = 'fulfilled' AND timestamp > (NOW() - INTERVAL '1 week'))
    FROM orders t
    WHERE timestamp > (NOW() - INTERVAL '1 week');
END;
$$;


ALTER FUNCTION public.get_week_order_count(uuid, uuid) OWNER TO dashboard;

--
-- Name: update_listing_expiration(); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.update_listing_expiration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.expiration = now() + '1 month';
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_listing_expiration() OWNER TO dashboard;

--
-- Name: update_public_contract_expiration(); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.update_public_contract_expiration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.expiration = now() + '1 month';
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_public_contract_expiration() OWNER TO dashboard;

--
-- Name: update_unique_listing_expiration(); Type: FUNCTION; Schema: public; Owner: dashboard
--

CREATE FUNCTION public.update_unique_listing_expiration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE market_listings SET expiration = NOW() + '4 months' WHERE listing_id = NEW.listing_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_unique_listing_expiration() OWNER TO dashboard;

--
-- Name: upsert_daily_activity(uuid); Type: PROCEDURE; Schema: public; Owner: dashboard
--

CREATE PROCEDURE public.upsert_daily_activity(IN uuid)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    INSERT INTO activity_history(user_id) VALUES ($1) ON CONFLICT DO NOTHING;
END;
$_$;


ALTER PROCEDURE public.upsert_daily_activity(IN uuid) OWNER TO dashboard;

--
-- Name: upsert_daily_price_history(); Type: PROCEDURE; Schema: public; Owner: dashboard
--

CREATE PROCEDURE public.upsert_daily_price_history()
    LANGUAGE plpgsql
    AS $$
BEGIN
    WITH item_prices as (SELECT market_listing_details.game_item_id as game_item_id,
                                COALESCE(MIN(price), 0)              AS price,
                                COALESCE(SUM(quantity_available), 0) as quantity_available
                         FROM market_listings
                                  INNER JOIN market_unique_listings
                                             ON market_listings.listing_id = market_unique_listings.listing_id
                                  INNER JOIN market_listing_details
                                             ON market_unique_listings.details_id =
                                                market_listing_details.details_id
                                  INNER JOIN game_items ON market_listing_details.game_item_id = game_items.id
                         WHERE market_listings.status = 'active'
                           AND quantity_available > 0
                         GROUP BY game_item_id)
    INSERT
    INTO market_price_history(game_item_id, price, quantity_available)
    SELECT *
    FROM item_prices
    WHERE price > 0

    ON CONFLICT DO NOTHING;
END;
$$;


ALTER PROCEDURE public.upsert_daily_price_history() OWNER TO dashboard;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_settings; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.account_settings (
    user_id uuid NOT NULL,
    discord_order_share boolean DEFAULT false NOT NULL,
    discord_public boolean DEFAULT false NOT NULL
);


ALTER TABLE public.account_settings OWNER TO voc_sc;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.accounts (
    username character varying(100) NOT NULL,
    rsi_confirmed boolean DEFAULT false NOT NULL,
    display_name character varying(100) NOT NULL,
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    avatar uuid DEFAULT '5226c767-0599-419b-ae71-a7303c441db0'::uuid NOT NULL,
    banner uuid DEFAULT '0008300c-fc6a-4e4e-9488-7d696f00e8b2'::uuid NOT NULL,
    profile_description character varying(2000) DEFAULT ''::character varying NOT NULL,
    discord_id bigint NOT NULL,
    role character varying(30) DEFAULT 'user'::character varying NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    discord_access_token character varying(200) DEFAULT ''::character varying NOT NULL,
    discord_refresh_token character varying(200) DEFAULT ''::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    official_server_id bigint,
    discord_thread_channel_id bigint
);


ALTER TABLE public.accounts OWNER TO voc_sc;

--
-- Name: activity_history; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.activity_history (
    date date DEFAULT CURRENT_DATE NOT NULL,
    user_id uuid NOT NULL
);


ALTER TABLE public.activity_history OWNER TO dashboard;

--
-- Name: chat_participants; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.chat_participants (
    chat_id uuid NOT NULL,
    user_id uuid NOT NULL
);


ALTER TABLE public.chat_participants OWNER TO voc_sc;

--
-- Name: chats; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.chats (
    chat_id uuid DEFAULT gen_random_uuid() NOT NULL,
    icon uuid,
    name character varying(100),
    order_id uuid,
    session_id uuid
);


ALTER TABLE public.chats OWNER TO voc_sc;

--
-- Name: comment_votes; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.comment_votes (
    comment_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    upvote boolean NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comment_votes OWNER TO voc_sc;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.comments (
    comment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    author uuid NOT NULL,
    content character varying(2000) NOT NULL,
    reply_to uuid,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.comments OWNER TO voc_sc;

--
-- Name: contractor_fields; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractor_fields (
    contractor_id uuid NOT NULL,
    field character varying(30) NOT NULL
);


ALTER TABLE public.contractor_fields OWNER TO voc_sc;

--
-- Name: contractor_fleet; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractor_fleet (
    ship_id uuid,
    contractor_id uuid
);


ALTER TABLE public.contractor_fleet OWNER TO voc_sc;

--
-- Name: contractor_invite_codes; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractor_invite_codes (
    contractor_id uuid NOT NULL,
    invite_id uuid DEFAULT gen_random_uuid() NOT NULL,
    max_uses smallint DEFAULT 0 NOT NULL,
    times_used smallint DEFAULT 0 NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.contractor_invite_codes OWNER TO voc_sc;

--
-- Name: contractor_invites; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractor_invites (
    contractor_id uuid NOT NULL,
    user_id uuid NOT NULL,
    message character varying(200) DEFAULT ''::character varying NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    invite_id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE public.contractor_invites OWNER TO voc_sc;

--
-- Name: contractor_member_roles; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractor_member_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


ALTER TABLE public.contractor_member_roles OWNER TO voc_sc;

--
-- Name: contractor_members; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractor_members (
    contractor_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(30) NOT NULL
);


ALTER TABLE public.contractor_members OWNER TO voc_sc;

--
-- Name: contractor_roles; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractor_roles (
    contractor_id uuid NOT NULL,
    role_id uuid DEFAULT gen_random_uuid() NOT NULL,
    "position" integer NOT NULL,
    name character varying(40) NOT NULL,
    manage_roles boolean DEFAULT false NOT NULL,
    manage_orders boolean DEFAULT false NOT NULL,
    kick_members boolean DEFAULT false NOT NULL,
    manage_invites boolean DEFAULT false NOT NULL,
    manage_org_details boolean DEFAULT false NOT NULL,
    manage_stock boolean DEFAULT false NOT NULL,
    manage_market boolean DEFAULT false NOT NULL,
    manage_recruiting boolean DEFAULT false NOT NULL,
    manage_webhooks boolean DEFAULT false NOT NULL
);


ALTER TABLE public.contractor_roles OWNER TO voc_sc;

--
-- Name: contractors; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.contractors (
    contractor_id uuid DEFAULT gen_random_uuid() NOT NULL,
    spectrum_id public.citext NOT NULL,
    kind character varying(30) NOT NULL,
    site_url public.url DEFAULT NULL::character varying,
    size integer NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(2000) DEFAULT ''::character varying NOT NULL,
    avatar uuid DEFAULT '3d3db169-6b57-4936-94e2-f2534b29663a'::uuid NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    default_role uuid,
    owner_role uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    official_server_id bigint,
    discord_thread_channel_id bigint,
    banner uuid DEFAULT '0008300c-fc6a-4e4e-9488-7d696f00e8b2'::uuid NOT NULL
);


ALTER TABLE public.contractors OWNER TO voc_sc;

--
-- Name: daily_activity; Type: VIEW; Schema: public; Owner: dashboard
--

CREATE VIEW public.daily_activity AS
 SELECT activity_history.date,
    count(*) AS count
   FROM public.activity_history
  GROUP BY activity_history.date;


ALTER TABLE public.daily_activity OWNER TO dashboard;

--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.deliveries (
    delivery_id uuid DEFAULT gen_random_uuid() NOT NULL,
    location character varying(30) NOT NULL,
    departure character varying(30) NOT NULL,
    destination character varying(30) NOT NULL,
    status character varying(30) NOT NULL,
    progress double precision[] NOT NULL,
    order_id uuid,
    ship_id uuid
);


ALTER TABLE public.deliveries OWNER TO voc_sc;

--
-- Name: game_item_categories; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.game_item_categories (
    category character varying(50),
    subcategory character varying(50)
);


ALTER TABLE public.game_item_categories OWNER TO dashboard;

--
-- Name: game_items; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.game_items (
    name character varying(100) NOT NULL,
    cstone_uuid uuid NOT NULL,
    image_url public.url,
    type character varying(50),
    description text,
    id uuid DEFAULT gen_random_uuid(),
    details_id uuid NOT NULL
);


ALTER TABLE public.game_items OWNER TO dashboard;

--
-- Name: image_resources; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.image_resources (
    resource_id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename text NOT NULL,
    external_url public.url
);


ALTER TABLE public.image_resources OWNER TO voc_sc;

--
-- Name: login_sessions; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.login_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.login_sessions OWNER TO voc_sc;

--
-- Name: market_aggregate_listings; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_aggregate_listings (
    aggregate_listing_id uuid DEFAULT gen_random_uuid() NOT NULL,
    aggregate_id uuid NOT NULL
);


ALTER TABLE public.market_aggregate_listings OWNER TO dashboard;

--
-- Name: market_aggregate_listings_legacy; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.market_aggregate_listings_legacy (
    listing_id uuid DEFAULT gen_random_uuid() NOT NULL,
    aggregate_id bigint NOT NULL,
    price bigint NOT NULL,
    quantity_available integer DEFAULT 1 NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    user_seller_id uuid,
    contractor_seller_id uuid,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    internal boolean DEFAULT false NOT NULL,
    CONSTRAINT market_aggregate_listings_price_check CHECK ((price >= 0)),
    CONSTRAINT market_aggregate_listings_quantity_available_check CHECK ((quantity_available >= 0))
);


ALTER TABLE public.market_aggregate_listings_legacy OWNER TO voc_sc;

--
-- Name: market_aggregates; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_aggregates (
    aggregate_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wiki_id integer,
    details_id uuid NOT NULL
);


ALTER TABLE public.market_aggregates OWNER TO dashboard;

--
-- Name: market_aggregates_legacy; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.market_aggregates_legacy (
    aggregate_id bigint NOT NULL,
    item_type character varying(50) NOT NULL,
    title character varying(100) NOT NULL,
    description character varying(2000) NOT NULL
);


ALTER TABLE public.market_aggregates_legacy OWNER TO voc_sc;

--
-- Name: market_auction_details; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.market_auction_details (
    listing_id uuid NOT NULL,
    minimum_bid_increment integer DEFAULT 1000 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    end_time timestamp without time zone NOT NULL,
    buyout_price integer,
    CONSTRAINT auction_details_minimum_bid_increment_check CHECK ((minimum_bid_increment >= 1))
);


ALTER TABLE public.market_auction_details OWNER TO voc_sc;

--
-- Name: market_bids; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.market_bids (
    bid_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_bidder_id uuid,
    contractor_bidder_id uuid,
    listing_id uuid,
    bid integer NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.market_bids OWNER TO voc_sc;

--
-- Name: market_buy_orders; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_buy_orders (
    buy_order_id uuid DEFAULT gen_random_uuid() NOT NULL,
    quantity integer NOT NULL,
    price integer NOT NULL,
    buyer_id uuid NOT NULL,
    expiry timestamp without time zone NOT NULL,
    fulfilled_timestamp timestamp without time zone,
    created_timestamp timestamp without time zone DEFAULT now() NOT NULL,
    game_item_id uuid
);


ALTER TABLE public.market_buy_orders OWNER TO dashboard;

--
-- Name: market_images; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_images (
    resource_id uuid,
    details_id uuid
);


ALTER TABLE public.market_images OWNER TO dashboard;

--
-- Name: market_images_legacy; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.market_images_legacy (
    listing_id uuid,
    resource_id uuid DEFAULT '5226c767-0599-419b-ae71-a7303c441db0'::uuid,
    aggregate_id bigint
);


ALTER TABLE public.market_images_legacy OWNER TO voc_sc;

--
-- Name: market_listing_details; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_listing_details (
    details_id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_type character varying(30) NOT NULL,
    title character varying(100) NOT NULL,
    description character varying(2000) NOT NULL,
    game_item_id uuid
);


ALTER TABLE public.market_listing_details OWNER TO dashboard;

--
-- Name: market_listings; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_listings (
    listing_id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_type character varying(30) NOT NULL,
    price bigint NOT NULL,
    quantity_available integer DEFAULT 1 NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    internal boolean DEFAULT false NOT NULL,
    user_seller_id uuid,
    contractor_seller_id uuid,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    expiration timestamp without time zone DEFAULT (now() + '4 mons'::interval) NOT NULL,
    CONSTRAINT market_listings_new_quantity_available_check CHECK ((quantity_available >= 0))
);


ALTER TABLE public.market_listings OWNER TO dashboard;

--
-- Name: market_listings_legacy; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.market_listings_legacy (
    listing_id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_type character varying(30) NOT NULL,
    price bigint NOT NULL,
    item_type character varying(30) NOT NULL,
    quantity_available integer DEFAULT 1 NOT NULL,
    title character varying(100) NOT NULL,
    description character varying(2000) NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    user_seller_id uuid,
    contractor_seller_id uuid,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    internal boolean DEFAULT false NOT NULL
);


ALTER TABLE public.market_listings_legacy OWNER TO voc_sc;

--
-- Name: market_multiple_listings; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_multiple_listings (
    multiple_listing_id uuid DEFAULT gen_random_uuid() NOT NULL,
    multiple_id uuid NOT NULL,
    details_id uuid NOT NULL
);


ALTER TABLE public.market_multiple_listings OWNER TO dashboard;

--
-- Name: market_multiples; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_multiples (
    multiple_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_seller_id uuid,
    contractor_seller_id uuid,
    details_id uuid,
    default_listing_id uuid,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.market_multiples OWNER TO dashboard;

--
-- Name: market_orders; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_orders (
    order_id uuid,
    listing_id uuid,
    quantity integer DEFAULT 1
);


ALTER TABLE public.market_orders OWNER TO dashboard;

--
-- Name: market_orders_legacy; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.market_orders_legacy (
    order_id uuid NOT NULL,
    listing_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    aggregate_id bigint,
    aggregate_listing_id uuid,
    CONSTRAINT either_listing_or_agg CHECK (((NOT ((listing_id IS NOT NULL) AND (aggregate_id IS NOT NULL))) AND ((listing_id IS NOT NULL) OR (aggregate_id IS NOT NULL)))),
    CONSTRAINT market_orders_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.market_orders_legacy OWNER TO voc_sc;

--
-- Name: market_price_history; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_price_history (
    game_item_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    price bigint NOT NULL,
    quantity_available integer NOT NULL
);


ALTER TABLE public.market_price_history OWNER TO dashboard;

--
-- Name: market_search; Type: VIEW; Schema: public; Owner: dashboard
--

CREATE VIEW public.market_search AS
SELECT
    NULL::uuid AS listing_id,
    NULL::text AS listing_type,
    NULL::character varying AS sale_type,
    NULL::bigint AS price,
    NULL::bigint AS minimum_price,
    NULL::bigint AS maximum_price,
    NULL::bigint AS quantity_available,
    NULL::timestamp without time zone AS "timestamp",
    NULL::timestamp without time zone AS expiration,
    NULL::integer AS total_rating,
    NULL::integer AS avg_rating,
    NULL::uuid AS details_id,
    NULL::tsvector AS textsearch,
    NULL::character varying AS status,
    NULL::boolean AS internal,
    NULL::uuid AS user_seller_id,
    NULL::character varying AS user_seller,
    NULL::uuid AS contractor_seller_id,
    NULL::public.citext AS contractor_seller,
    NULL::timestamp without time zone AS auction_end_time,
    NULL::integer AS rating_count,
    NULL::integer AS rating_streak,
    NULL::integer AS total_orders,
    NULL::uuid AS photo_details;


ALTER TABLE public.market_search OWNER TO dashboard;

--
-- Name: market_search_complete; Type: VIEW; Schema: public; Owner: dashboard
--

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
    ( SELECT image_resources.external_url
           FROM (public.image_resources
             LEFT JOIN public.market_images ON ((market_images.resource_id = image_resources.resource_id)))
          WHERE (market_images.details_id = market_search.photo_details)
         LIMIT 1) AS photo
   FROM (((public.market_search
     LEFT JOIN public.market_listing_details ON ((market_listing_details.details_id = market_search.details_id)))
     LEFT JOIN public.game_items ON ((market_listing_details.game_item_id = game_items.id)))
     LEFT JOIN public.game_item_categories ON (((market_listing_details.item_type)::text = (game_item_categories.subcategory)::text)));


ALTER TABLE public.market_search_complete OWNER TO dashboard;

--
-- Name: market_search_materialized; Type: MATERIALIZED VIEW; Schema: public; Owner: dashboard
--

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
    market_search_complete.photo
   FROM public.market_search_complete
  WITH NO DATA;


ALTER TABLE public.market_search_materialized OWNER TO dashboard;

--
-- Name: market_unique_listings; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.market_unique_listings (
    listing_id uuid,
    accept_offers boolean,
    details_id uuid
);


ALTER TABLE public.market_unique_listings OWNER TO dashboard;

--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.message_attachments (
    message_id uuid NOT NULL,
    resource_id uuid NOT NULL
);


ALTER TABLE public.message_attachments OWNER TO voc_sc;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.messages (
    message_id uuid DEFAULT gen_random_uuid() NOT NULL,
    content character varying(1000) NOT NULL,
    author uuid,
    chat_id uuid NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.messages OWNER TO voc_sc;

--
-- Name: monthly_activity; Type: VIEW; Schema: public; Owner: dashboard
--

CREATE VIEW public.monthly_activity AS
 SELECT date_trunc('month'::text, (activity_history.date)::timestamp with time zone) AS date,
    count(DISTINCT activity_history.user_id) AS count
   FROM public.activity_history
  GROUP BY (date_trunc('month'::text, (activity_history.date)::timestamp with time zone));


ALTER TABLE public.monthly_activity OWNER TO dashboard;

--
-- Name: notification; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.notification (
    notification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_object_id integer NOT NULL,
    notifier_id uuid NOT NULL,
    read boolean DEFAULT false NOT NULL
);


ALTER TABLE public.notification OWNER TO voc_sc;

--
-- Name: notification_actions; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.notification_actions (
    action_type_id integer NOT NULL,
    action text NOT NULL,
    entity text NOT NULL
);


ALTER TABLE public.notification_actions OWNER TO voc_sc;

--
-- Name: notification_actions_action_type_id_seq; Type: SEQUENCE; Schema: public; Owner: voc_sc
--

CREATE SEQUENCE public.notification_actions_action_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notification_actions_action_type_id_seq OWNER TO voc_sc;

--
-- Name: notification_actions_action_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: voc_sc
--

ALTER SEQUENCE public.notification_actions_action_type_id_seq OWNED BY public.notification_actions.action_type_id;


--
-- Name: notification_change; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.notification_change (
    notification_change_id integer NOT NULL,
    actor_id uuid NOT NULL,
    notification_object_id integer NOT NULL
);


ALTER TABLE public.notification_change OWNER TO voc_sc;

--
-- Name: notification_change_notification_change_id_seq; Type: SEQUENCE; Schema: public; Owner: voc_sc
--

CREATE SEQUENCE public.notification_change_notification_change_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notification_change_notification_change_id_seq OWNER TO voc_sc;

--
-- Name: notification_change_notification_change_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: voc_sc
--

ALTER SEQUENCE public.notification_change_notification_change_id_seq OWNED BY public.notification_change.notification_change_id;


--
-- Name: notification_object; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.notification_object (
    notification_object_id integer NOT NULL,
    action_type_id integer NOT NULL,
    entity_id uuid NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_object OWNER TO voc_sc;

--
-- Name: notification_object_notification_object_id_seq; Type: SEQUENCE; Schema: public; Owner: voc_sc
--

CREATE SEQUENCE public.notification_object_notification_object_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notification_object_notification_object_id_seq OWNER TO voc_sc;

--
-- Name: notification_object_notification_object_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: voc_sc
--

ALTER SEQUENCE public.notification_object_notification_object_id_seq OWNED BY public.notification_object.notification_object_id;


--
-- Name: notification_webhooks; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.notification_webhooks (
    contractor_id uuid,
    user_id uuid,
    name character varying(200) DEFAULT ''::character varying NOT NULL,
    webhook_url public.url NOT NULL,
    state text DEFAULT 'ok'::text NOT NULL,
    webhook_id uuid DEFAULT gen_random_uuid() NOT NULL,
    type character varying(20) DEFAULT 'private'::character varying NOT NULL
);


ALTER TABLE public.notification_webhooks OWNER TO voc_sc;

--
-- Name: offer_market_items; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.offer_market_items (
    offer_id uuid NOT NULL,
    listing_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    CONSTRAINT offer_market_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.offer_market_items OWNER TO dashboard;

--
-- Name: offer_sessions; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.offer_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assigned_id uuid,
    customer_id uuid NOT NULL,
    contractor_id uuid,
    thread_id bigint,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.offer_sessions OWNER TO dashboard;

--
-- Name: order_applicants; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.order_applicants (
    order_id uuid NOT NULL,
    user_applicant_id uuid,
    org_applicant_id uuid,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    message character varying(1000) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE public.order_applicants OWNER TO voc_sc;

--
-- Name: order_comments; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.order_comments (
    comment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    author uuid NOT NULL,
    content character varying(2000) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.order_comments OWNER TO voc_sc;

--
-- Name: order_deliveries; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.order_deliveries (
    delivery_id uuid NOT NULL,
    order_id uuid NOT NULL
);


ALTER TABLE public.order_deliveries OWNER TO voc_sc;

--
-- Name: order_offers; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.order_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    kind character varying(30) NOT NULL,
    cost bigint NOT NULL,
    payment_type character varying(30) DEFAULT 'one-time'::character varying NOT NULL,
    collateral bigint DEFAULT 0,
    title character varying(100) DEFAULT '{}'::character varying NOT NULL,
    description character varying(2000) DEFAULT '{}'::character varying NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    service_id uuid,
    actor_id uuid NOT NULL
);


ALTER TABLE public.order_offers OWNER TO dashboard;

--
-- Name: order_reviews; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.order_reviews (
    order_id uuid NOT NULL,
    review_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_author uuid NOT NULL,
    rating numeric(2,1),
    content character varying(2000) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    role character varying(20) DEFAULT 'customer'::character varying NOT NULL,
    contractor_author uuid
);


ALTER TABLE public.order_reviews OWNER TO voc_sc;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.orders (
    order_id uuid DEFAULT gen_random_uuid() NOT NULL,
    rush boolean DEFAULT false NOT NULL,
    departure character varying(30) DEFAULT NULL::character varying,
    destination character varying(30) DEFAULT NULL::character varying,
    kind character varying(30) NOT NULL,
    cost bigint NOT NULL,
    collateral bigint DEFAULT 0,
    title character varying(100) DEFAULT '{}'::character varying NOT NULL,
    description character varying(2000) DEFAULT '{}'::character varying NOT NULL,
    assigned_id uuid,
    customer_id uuid NOT NULL,
    contractor_id uuid,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(30) DEFAULT 'not-started'::character varying NOT NULL,
    service_id uuid,
    payment_type character varying(30) DEFAULT 'one-time'::character varying NOT NULL,
    thread_id bigint,
    offer_session_id uuid
);


ALTER TABLE public.orders OWNER TO voc_sc;

--
-- Name: order_stats; Type: VIEW; Schema: public; Owner: dashboard
--

CREATE VIEW public.order_stats AS
 SELECT count(*) AS total_orders,
    ( SELECT COALESCE(sum(orders.cost), (0)::numeric) AS "coalesce"
           FROM public.orders
          WHERE ((orders.status)::text = 'fulfilled'::text)) AS total_order_value
   FROM public.orders t;


ALTER TABLE public.order_stats OWNER TO dashboard;

--
-- Name: order_week_stats; Type: VIEW; Schema: public; Owner: dashboard
--

CREATE VIEW public.order_week_stats AS
 SELECT count(*) AS week_orders,
    ( SELECT COALESCE(sum(orders.cost), (0)::numeric) AS "coalesce"
           FROM public.orders
          WHERE (((orders.status)::text = 'fulfilled'::text) AND (orders."timestamp" > (now() - '7 days'::interval)))) AS week_order_value
   FROM public.orders t
  WHERE (t."timestamp" > (now() - '7 days'::interval));


ALTER TABLE public.order_week_stats OWNER TO dashboard;

--
-- Name: public_contract_offers; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.public_contract_offers (
    contract_id uuid NOT NULL,
    session_id uuid NOT NULL
);


ALTER TABLE public.public_contract_offers OWNER TO dashboard;

--
-- Name: public_contracts; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.public_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    departure character varying(30) DEFAULT NULL::character varying,
    destination character varying(30) DEFAULT NULL::character varying,
    kind character varying(30) NOT NULL,
    cost bigint NOT NULL,
    payment_type character varying(30) DEFAULT 'one-time'::character varying NOT NULL,
    collateral bigint DEFAULT 0,
    title character varying(100) DEFAULT '{}'::character varying NOT NULL,
    description character varying(2000) DEFAULT '{}'::character varying NOT NULL,
    customer_id uuid NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    expiration timestamp without time zone DEFAULT (now() + '1 mon'::interval) NOT NULL
);


ALTER TABLE public.public_contracts OWNER TO dashboard;

--
-- Name: recruiting_comments; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.recruiting_comments (
    comment_id uuid NOT NULL,
    post_id uuid NOT NULL
);


ALTER TABLE public.recruiting_comments OWNER TO voc_sc;

--
-- Name: recruiting_posts; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.recruiting_posts (
    post_id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    body character varying(4000) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.recruiting_posts OWNER TO voc_sc;

--
-- Name: recruiting_votes; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.recruiting_votes (
    post_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    upvote boolean NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.recruiting_votes OWNER TO voc_sc;

--
-- Name: rlflx; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.rlflx (
    key character varying(255) NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    expire bigint
);


ALTER TABLE public.rlflx OWNER TO voc_sc;

--
-- Name: service_images; Type: TABLE; Schema: public; Owner: dashboard
--

CREATE TABLE public.service_images (
    service_id uuid,
    resource_id uuid DEFAULT '5226c767-0599-419b-ae71-a7303c441db0'::uuid
);


ALTER TABLE public.service_images OWNER TO dashboard;

--
-- Name: services; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.services (
    service_id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid,
    user_id uuid,
    description character varying(2000) DEFAULT '{}'::character varying NOT NULL,
    assigned_id uuid,
    departure character varying(30) DEFAULT NULL::character varying,
    destination character varying(30) DEFAULT NULL::character varying,
    title character varying(100) DEFAULT '{}'::character varying NOT NULL,
    kind character varying(30),
    cost bigint NOT NULL,
    offer bigint DEFAULT 0,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    collateral bigint DEFAULT 0,
    service_name character varying(100) NOT NULL,
    rush boolean DEFAULT false,
    service_description character varying(2000) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    payment_type character varying(30) DEFAULT 'one-time'::character varying NOT NULL
);


ALTER TABLE public.services OWNER TO voc_sc;

--
-- Name: ship_checkins; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.ship_checkins (
    ship_id uuid NOT NULL,
    user_id uuid NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    location character varying(30) NOT NULL,
    condition character varying(30) NOT NULL,
    status character varying(30) DEFAULT 'docked'::character varying NOT NULL
);


ALTER TABLE public.ship_checkins OWNER TO voc_sc;

--
-- Name: ships; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.ships (
    ship_id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind character varying(30) NOT NULL,
    owner uuid,
    name character varying(50) NOT NULL
);


ALTER TABLE public.ships OWNER TO voc_sc;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.transactions (
    transaction_id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    amount bigint NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    contractor_sender_id uuid,
    contractor_recipient_id uuid,
    user_sender_id uuid,
    user_recipient_id uuid,
    note character varying(200) DEFAULT ''::character varying NOT NULL,
    kind character varying(30) NOT NULL
);


ALTER TABLE public.transactions OWNER TO voc_sc;

--
-- Name: user_availability; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.user_availability (
    user_id uuid NOT NULL,
    start smallint NOT NULL,
    finish smallint NOT NULL,
    contractor_id uuid
);


ALTER TABLE public.user_availability OWNER TO voc_sc;

--
-- Name: webhook_actions; Type: TABLE; Schema: public; Owner: voc_sc
--

CREATE TABLE public.webhook_actions (
    webhook_id uuid NOT NULL,
    action_type_id integer NOT NULL
);


ALTER TABLE public.webhook_actions OWNER TO voc_sc;

--
-- Name: weekly_activity; Type: VIEW; Schema: public; Owner: dashboard
--

CREATE VIEW public.weekly_activity AS
 SELECT date_trunc('week'::text, (activity_history.date)::timestamp with time zone) AS date,
    count(DISTINCT activity_history.user_id) AS count
   FROM public.activity_history
  GROUP BY (date_trunc('week'::text, (activity_history.date)::timestamp with time zone));


ALTER TABLE public.weekly_activity OWNER TO dashboard;

--
-- Name: notification_actions action_type_id; Type: DEFAULT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_actions ALTER COLUMN action_type_id SET DEFAULT nextval('public.notification_actions_action_type_id_seq'::regclass);


--
-- Name: notification_change notification_change_id; Type: DEFAULT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_change ALTER COLUMN notification_change_id SET DEFAULT nextval('public.notification_change_notification_change_id_seq'::regclass);


--
-- Name: notification_object notification_object_id; Type: DEFAULT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_object ALTER COLUMN notification_object_id SET DEFAULT nextval('public.notification_object_notification_object_id_seq'::regclass);


--
-- Name: account_settings account_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.account_settings
    ADD CONSTRAINT account_settings_pkey PRIMARY KEY (user_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (user_id);


--
-- Name: accounts accounts_username_key; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_username_key UNIQUE (username);


--
-- Name: activity_history activity_history_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.activity_history
    ADD CONSTRAINT activity_history_pkey PRIMARY KEY (user_id, date);


--
-- Name: market_auction_details auction_details_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_auction_details
    ADD CONSTRAINT auction_details_pkey PRIMARY KEY (listing_id);


--
-- Name: chats chats_pk; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pk UNIQUE (order_id);


--
-- Name: chats chats_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pkey PRIMARY KEY (chat_id);


--
-- Name: comment_votes comment_votes_actor_id_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_actor_id_comment_id_key UNIQUE (actor_id, comment_id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (comment_id);


--
-- Name: contractor_invite_codes contractor_invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_invite_codes
    ADD CONSTRAINT contractor_invite_codes_pkey PRIMARY KEY (invite_id);


--
-- Name: contractor_invites contractor_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_invites
    ADD CONSTRAINT contractor_invites_pkey PRIMARY KEY (invite_id);


--
-- Name: contractor_roles contractor_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_roles
    ADD CONSTRAINT contractor_roles_pkey PRIMARY KEY (role_id);


--
-- Name: contractors contractors_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_pkey PRIMARY KEY (contractor_id);


--
-- Name: contractors contractors_spectrum_id_key; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_spectrum_id_key UNIQUE (spectrum_id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (delivery_id);


--
-- Name: game_item_categories game_item_categories_pk; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.game_item_categories
    ADD CONSTRAINT game_item_categories_pk UNIQUE (subcategory);


--
-- Name: game_items game_items_pk; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.game_items
    ADD CONSTRAINT game_items_pk UNIQUE (name);


--
-- Name: game_items game_items_pk_2; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.game_items
    ADD CONSTRAINT game_items_pk_2 UNIQUE (id);


--
-- Name: image_resources image_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.image_resources
    ADD CONSTRAINT image_resources_pkey PRIMARY KEY (resource_id);


--
-- Name: login_sessions login_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.login_sessions
    ADD CONSTRAINT login_sessions_pkey PRIMARY KEY (sid);


--
-- Name: market_aggregate_listings market_aggregate_listings_new_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_aggregate_listings
    ADD CONSTRAINT market_aggregate_listings_new_pkey PRIMARY KEY (aggregate_listing_id);


--
-- Name: market_aggregate_listings_legacy market_aggregate_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_aggregate_listings_legacy
    ADD CONSTRAINT market_aggregate_listings_pkey PRIMARY KEY (listing_id);


--
-- Name: market_aggregates market_aggregates_new_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_aggregates
    ADD CONSTRAINT market_aggregates_new_pkey PRIMARY KEY (aggregate_id);


--
-- Name: market_aggregates_legacy market_aggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_aggregates_legacy
    ADD CONSTRAINT market_aggregates_pkey PRIMARY KEY (aggregate_id);


--
-- Name: market_bids market_bids_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_bids
    ADD CONSTRAINT market_bids_pkey PRIMARY KEY (bid_id);


--
-- Name: market_buy_orders market_buy_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_buy_orders
    ADD CONSTRAINT market_buy_orders_pkey PRIMARY KEY (buy_order_id);


--
-- Name: market_listing_details market_listing_details_new_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_listing_details
    ADD CONSTRAINT market_listing_details_new_pkey PRIMARY KEY (details_id);


--
-- Name: market_listings market_listings_new_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_listings
    ADD CONSTRAINT market_listings_new_pkey PRIMARY KEY (listing_id);


--
-- Name: market_listings_legacy market_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_listings_legacy
    ADD CONSTRAINT market_listings_pkey PRIMARY KEY (listing_id);


--
-- Name: market_multiple_listings market_multiple_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiple_listings
    ADD CONSTRAINT market_multiple_listings_pkey PRIMARY KEY (multiple_listing_id);


--
-- Name: market_multiples market_multiple_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiples
    ADD CONSTRAINT market_multiple_pkey PRIMARY KEY (multiple_id);


--
-- Name: market_price_history market_price_history_game_item_id_date_key; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_price_history
    ADD CONSTRAINT market_price_history_game_item_id_date_key UNIQUE (game_item_id, date);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (message_id);


--
-- Name: notification_actions notification_actions_action_key; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_actions
    ADD CONSTRAINT notification_actions_action_key UNIQUE (action);


--
-- Name: notification_actions notification_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_actions
    ADD CONSTRAINT notification_actions_pkey PRIMARY KEY (action_type_id);


--
-- Name: notification_change notification_change_notification_change_id_key; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_change
    ADD CONSTRAINT notification_change_notification_change_id_key UNIQUE (notification_change_id);


--
-- Name: notification_object notification_object_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_object
    ADD CONSTRAINT notification_object_pkey PRIMARY KEY (notification_object_id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (notification_id);


--
-- Name: offer_sessions offer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.offer_sessions
    ADD CONSTRAINT offer_sessions_pkey PRIMARY KEY (id);


--
-- Name: order_offers order_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.order_offers
    ADD CONSTRAINT order_offers_pkey PRIMARY KEY (id);


--
-- Name: order_reviews order_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_reviews
    ADD CONSTRAINT order_reviews_pkey PRIMARY KEY (review_id);


--
-- Name: services order_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT order_templates_pkey PRIMARY KEY (service_id);


--
-- Name: notification_webhooks order_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_webhooks
    ADD CONSTRAINT order_webhooks_pkey PRIMARY KEY (webhook_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (order_id);


--
-- Name: public_contracts public_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.public_contracts
    ADD CONSTRAINT public_contracts_pkey PRIMARY KEY (id);


--
-- Name: recruiting_posts recruiting_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.recruiting_posts
    ADD CONSTRAINT recruiting_posts_pkey PRIMARY KEY (post_id);


--
-- Name: rlflx rlflx_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.rlflx
    ADD CONSTRAINT rlflx_pkey PRIMARY KEY (key);


--
-- Name: ships ships_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_pkey PRIMARY KEY (ship_id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (transaction_id);


--
-- Name: webhook_actions webhook_actions_webhook_id_action_type_id_key; Type: CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.webhook_actions
    ADD CONSTRAINT webhook_actions_webhook_id_action_type_id_key UNIQUE (webhook_id, action_type_id);


--
-- Name: contractor_invites_user_id_contractor_id_index; Type: INDEX; Schema: public; Owner: voc_sc
--

CREATE INDEX contractor_invites_user_id_contractor_id_index ON public.contractor_invites USING btree (user_id, contractor_id);


--
-- Name: contractor_members_contractor_id_position_uindex; Type: INDEX; Schema: public; Owner: voc_sc
--

CREATE UNIQUE INDEX contractor_members_contractor_id_position_uindex ON public.contractor_roles USING btree (contractor_id, "position");


--
-- Name: contractor_members_contractor_id_user_id_uindex; Type: INDEX; Schema: public; Owner: voc_sc
--

CREATE UNIQUE INDEX contractor_members_contractor_id_user_id_uindex ON public.contractor_members USING btree (contractor_id, user_id);


--
-- Name: contractor_members_roles_user_id_role_id_uindex; Type: INDEX; Schema: public; Owner: voc_sc
--

CREATE UNIQUE INDEX contractor_members_roles_user_id_role_id_uindex ON public.contractor_member_roles USING btree (user_id, role_id);


--
-- Name: market_aggregate_listings_aggregate_id; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_aggregate_listings_aggregate_id ON public.market_aggregate_listings USING btree (aggregate_id);


--
-- Name: market_orders_listing_id_index; Type: INDEX; Schema: public; Owner: voc_sc
--

CREATE INDEX market_orders_listing_id_index ON public.market_orders_legacy USING btree (listing_id);


--
-- Name: market_orders_order_id_index; Type: INDEX; Schema: public; Owner: voc_sc
--

CREATE INDEX market_orders_order_id_index ON public.market_orders_legacy USING btree (order_id);


--
-- Name: market_search_materialized_contractor_seller_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_contractor_seller_index ON public.market_search_materialized USING btree (contractor_seller_id);


--
-- Name: market_search_materialized_item_id_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_item_id_index ON public.market_search_materialized USING btree (game_item_id);


--
-- Name: market_search_materialized_listing_id_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE UNIQUE INDEX market_search_materialized_listing_id_index ON public.market_search_materialized USING btree (listing_id);


--
-- Name: market_search_materialized_max_price_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_max_price_index ON public.market_search_materialized USING btree (maximum_price);


--
-- Name: market_search_materialized_min_price_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_min_price_index ON public.market_search_materialized USING btree (minimum_price);


--
-- Name: market_search_materialized_price_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_price_index ON public.market_search_materialized USING btree (price);


--
-- Name: market_search_materialized_quantity_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_quantity_index ON public.market_search_materialized USING btree (quantity_available);


--
-- Name: market_search_materialized_status_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_status_index ON public.market_search_materialized USING btree (status);


--
-- Name: market_search_materialized_textsearch_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_textsearch_index ON public.market_search_materialized USING btree (textsearch);


--
-- Name: market_search_materialized_timestamp_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_timestamp_index ON public.market_search_materialized USING btree ("timestamp");


--
-- Name: market_search_materialized_user_seller_index; Type: INDEX; Schema: public; Owner: dashboard
--

CREATE INDEX market_search_materialized_user_seller_index ON public.market_search_materialized USING btree (user_seller_id);


--
-- Name: market_search _RETURN; Type: RULE; Schema: public; Owner: dashboard
--

CREATE OR REPLACE VIEW public.market_search AS
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
    public.get_average_rating(market_listings.user_seller_id, market_listings.contractor_seller_id) AS avg_rating,
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
    market_listing_details.details_id AS photo_details
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
    max(public.get_average_rating(market_listings.user_seller_id, market_listings.contractor_seller_id)) AS avg_rating,
    main_details.details_id,
    to_tsvector('english'::regconfig, ((((main_details.title)::text || ' '::text) || (main_details.description)::text) || ( SELECT string_agg((((entry_details.title)::text || ' '::text) || (entry_details.description)::text), ','::text) AS string_agg))) AS textsearch,
        CASE
            WHEN (NOT every(((market_listings.status)::text = 'inactive'::text))) THEN 'active'::text
            ELSE 'inactive'::text
        END AS status,
        CASE
            WHEN (NOT every(market_listings.internal)) THEN false
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
          WHERE (market_multiple_listings.multiple_listing_id = market_multiples.default_listing_id)) AS photo_details
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
    max(public.get_average_rating(market_listings.user_seller_id, market_listings.contractor_seller_id)) AS avg_rating,
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
         LIMIT 1) AS photo_details
   FROM (((public.game_items
     JOIN public.market_listing_details ON (((market_listing_details.game_item_id = game_items.id) AND (market_listing_details.game_item_id IS NOT NULL))))
     JOIN public.market_unique_listings ON ((market_unique_listings.details_id = market_listing_details.details_id)))
     LEFT JOIN public.market_listings ON (((market_unique_listings.listing_id = market_listings.listing_id) AND (market_listings.quantity_available > 0) AND ((market_listings.status)::text = 'active'::text))))
  GROUP BY market_listing_details.game_item_id, game_items.id;


--
-- Name: market_listings extend_expiration; Type: TRIGGER; Schema: public; Owner: dashboard
--

CREATE TRIGGER extend_expiration BEFORE UPDATE ON public.market_listings FOR EACH ROW EXECUTE FUNCTION public.update_listing_expiration();


--
-- Name: market_unique_listings extend_expiration; Type: TRIGGER; Schema: public; Owner: dashboard
--

CREATE TRIGGER extend_expiration AFTER UPDATE ON public.market_unique_listings FOR EACH ROW EXECUTE FUNCTION public.update_unique_listing_expiration();


--
-- Name: public_contracts extend_expiration; Type: TRIGGER; Schema: public; Owner: dashboard
--

CREATE TRIGGER extend_expiration BEFORE UPDATE ON public.public_contracts FOR EACH ROW EXECUTE FUNCTION public.update_public_contract_expiration();


--
-- Name: account_settings account_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.account_settings
    ADD CONSTRAINT account_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;


--
-- Name: accounts accounts_avatar_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_avatar_fkey FOREIGN KEY (avatar) REFERENCES public.image_resources(resource_id);


--
-- Name: accounts accounts_banner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_banner_fkey FOREIGN KEY (banner) REFERENCES public.image_resources(resource_id);


--
-- Name: activity_history activity_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.activity_history
    ADD CONSTRAINT activity_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id);


--
-- Name: market_auction_details auction_details_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_auction_details
    ADD CONSTRAINT auction_details_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.market_listings(listing_id);


--
-- Name: chat_participants chat_participants_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(chat_id);


--
-- Name: chat_participants chat_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id);


--
-- Name: chats chats_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: chats chats_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.offer_sessions(id) ON DELETE CASCADE;


--
-- Name: comment_votes comment_votes_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;


--
-- Name: comment_votes comment_votes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(comment_id) ON DELETE CASCADE;


--
-- Name: comments comments_author_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_fkey FOREIGN KEY (author) REFERENCES public.accounts(user_id);


--
-- Name: comments comments_reply_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES public.comments(comment_id);


--
-- Name: contractor_fields contractor_fields_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_fields
    ADD CONSTRAINT contractor_fields_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_fleet contractor_fleet_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_fleet
    ADD CONSTRAINT contractor_fleet_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id);


--
-- Name: contractor_fleet contractor_fleet_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_fleet
    ADD CONSTRAINT contractor_fleet_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(ship_id);


--
-- Name: contractor_invite_codes contractor_invite_codes_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_invite_codes
    ADD CONSTRAINT contractor_invite_codes_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_invites contractor_invites_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_invites
    ADD CONSTRAINT contractor_invites_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_invites contractor_invites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_invites
    ADD CONSTRAINT contractor_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_member_roles contractor_member_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_member_roles
    ADD CONSTRAINT contractor_member_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.contractor_roles(role_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_member_roles contractor_member_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_member_roles
    ADD CONSTRAINT contractor_member_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_members contractor_members_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_members
    ADD CONSTRAINT contractor_members_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_members contractor_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_members
    ADD CONSTRAINT contractor_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractor_roles contractor_roles_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractor_roles
    ADD CONSTRAINT contractor_roles_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contractors contractors_avatar_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_avatar_fkey FOREIGN KEY (avatar) REFERENCES public.image_resources(resource_id);


--
-- Name: contractors contractors_banner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_banner_fkey FOREIGN KEY (banner) REFERENCES public.image_resources(resource_id);


--
-- Name: deliveries deliveries_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(ship_id);


--
-- Name: game_items game_items_details_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.game_items
    ADD CONSTRAINT game_items_details_id_fkey FOREIGN KEY (details_id) REFERENCES public.market_listing_details(details_id);


--
-- Name: market_aggregate_listings_legacy market_aggregate_listings_aggregate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_aggregate_listings_legacy
    ADD CONSTRAINT market_aggregate_listings_aggregate_id_fkey FOREIGN KEY (aggregate_id) REFERENCES public.market_aggregates_legacy(aggregate_id);


--
-- Name: market_aggregate_listings_legacy market_aggregate_listings_contractor_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_aggregate_listings_legacy
    ADD CONSTRAINT market_aggregate_listings_contractor_seller_id_fkey FOREIGN KEY (contractor_seller_id) REFERENCES public.contractors(contractor_id);


--
-- Name: market_aggregate_listings market_aggregate_listings_market_listings_listing_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_aggregate_listings
    ADD CONSTRAINT market_aggregate_listings_market_listings_listing_id_fk FOREIGN KEY (aggregate_listing_id) REFERENCES public.market_listings(listing_id) ON DELETE CASCADE;


--
-- Name: market_aggregate_listings market_aggregate_listings_new_aggregate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_aggregate_listings
    ADD CONSTRAINT market_aggregate_listings_new_aggregate_id_fkey FOREIGN KEY (aggregate_id) REFERENCES public.market_aggregates(aggregate_id);


--
-- Name: market_aggregate_listings_legacy market_aggregate_listings_user_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_aggregate_listings_legacy
    ADD CONSTRAINT market_aggregate_listings_user_seller_id_fkey FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id);


--
-- Name: market_aggregates market_aggregates_new_details_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_aggregates
    ADD CONSTRAINT market_aggregates_new_details_id_fkey FOREIGN KEY (details_id) REFERENCES public.market_listing_details(details_id);


--
-- Name: market_bids market_bids_contractor_bidder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_bids
    ADD CONSTRAINT market_bids_contractor_bidder_id_fkey FOREIGN KEY (contractor_bidder_id) REFERENCES public.contractors(contractor_id);


--
-- Name: market_bids market_bids_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_bids
    ADD CONSTRAINT market_bids_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.market_auction_details(listing_id);


--
-- Name: market_bids market_bids_user_bidder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_bids
    ADD CONSTRAINT market_bids_user_bidder_id_fkey FOREIGN KEY (user_bidder_id) REFERENCES public.accounts(user_id);


--
-- Name: market_buy_orders market_buy_orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_buy_orders
    ADD CONSTRAINT market_buy_orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.accounts(user_id);


--
-- Name: market_buy_orders market_buy_orders_game_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_buy_orders
    ADD CONSTRAINT market_buy_orders_game_item_id_fkey FOREIGN KEY (game_item_id) REFERENCES public.game_items(id);


--
-- Name: market_images_legacy market_images_aggregate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_images_legacy
    ADD CONSTRAINT market_images_aggregate_id_fkey FOREIGN KEY (aggregate_id) REFERENCES public.market_aggregates_legacy(aggregate_id) ON DELETE CASCADE;


--
-- Name: market_images_legacy market_images_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_images_legacy
    ADD CONSTRAINT market_images_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.market_listings_legacy(listing_id) ON DELETE CASCADE;


--
-- Name: market_images market_images_new_details_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_images
    ADD CONSTRAINT market_images_new_details_id_fkey FOREIGN KEY (details_id) REFERENCES public.market_listing_details(details_id);


--
-- Name: market_images market_images_new_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_images
    ADD CONSTRAINT market_images_new_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.image_resources(resource_id);


--
-- Name: market_images_legacy market_images_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_images_legacy
    ADD CONSTRAINT market_images_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.image_resources(resource_id) ON DELETE CASCADE;


--
-- Name: market_listing_details market_listing_details_game_item_categories_subcategory_fk; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_listing_details
    ADD CONSTRAINT market_listing_details_game_item_categories_subcategory_fk FOREIGN KEY (item_type) REFERENCES public.game_item_categories(subcategory) ON UPDATE CASCADE;


--
-- Name: market_listing_details market_listing_details_game_item_id2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_listing_details
    ADD CONSTRAINT market_listing_details_game_item_id2_fkey FOREIGN KEY (game_item_id) REFERENCES public.game_items(id);


--
-- Name: market_listings_legacy market_listings_contractor_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_listings_legacy
    ADD CONSTRAINT market_listings_contractor_seller_id_fkey FOREIGN KEY (contractor_seller_id) REFERENCES public.contractors(contractor_id);


--
-- Name: market_listings market_listings_new_contractor_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_listings
    ADD CONSTRAINT market_listings_new_contractor_seller_id_fkey FOREIGN KEY (contractor_seller_id) REFERENCES public.contractors(contractor_id);


--
-- Name: market_listings market_listings_new_user_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_listings
    ADD CONSTRAINT market_listings_new_user_seller_id_fkey FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id);


--
-- Name: market_listings_legacy market_listings_user_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_listings_legacy
    ADD CONSTRAINT market_listings_user_seller_id_fkey FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id);


--
-- Name: market_multiples market_multiple_contractor_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiples
    ADD CONSTRAINT market_multiple_contractor_seller_id_fkey FOREIGN KEY (contractor_seller_id) REFERENCES public.contractors(contractor_id);


--
-- Name: market_multiples market_multiple_default_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiples
    ADD CONSTRAINT market_multiple_default_listing_id_fkey FOREIGN KEY (default_listing_id) REFERENCES public.market_listings(listing_id);


--
-- Name: market_multiples market_multiple_details_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiples
    ADD CONSTRAINT market_multiple_details_id_fkey FOREIGN KEY (details_id) REFERENCES public.market_listing_details(details_id);


--
-- Name: market_multiple_listings market_multiple_listings_details_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiple_listings
    ADD CONSTRAINT market_multiple_listings_details_id_fkey FOREIGN KEY (details_id) REFERENCES public.market_listing_details(details_id);


--
-- Name: market_multiple_listings market_multiple_listings_multiple_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiple_listings
    ADD CONSTRAINT market_multiple_listings_multiple_id_fkey FOREIGN KEY (multiple_id) REFERENCES public.market_multiples(multiple_id);


--
-- Name: market_multiples market_multiple_user_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_multiples
    ADD CONSTRAINT market_multiple_user_seller_id_fkey FOREIGN KEY (user_seller_id) REFERENCES public.accounts(user_id);


--
-- Name: market_orders_legacy market_orders_aggregate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_orders_legacy
    ADD CONSTRAINT market_orders_aggregate_id_fkey FOREIGN KEY (aggregate_id) REFERENCES public.market_aggregates_legacy(aggregate_id);


--
-- Name: market_orders_legacy market_orders_aggregate_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_orders_legacy
    ADD CONSTRAINT market_orders_aggregate_listing_id_fkey FOREIGN KEY (aggregate_listing_id) REFERENCES public.market_aggregate_listings_legacy(listing_id);


--
-- Name: market_orders_legacy market_orders_market_listings_listing_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_orders_legacy
    ADD CONSTRAINT market_orders_market_listings_listing_id_fk FOREIGN KEY (listing_id) REFERENCES public.market_listings_legacy(listing_id);


--
-- Name: market_orders market_orders_new_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_new_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.market_listings(listing_id);


--
-- Name: market_orders market_orders_new_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_new_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: market_orders_legacy market_orders_orders_order_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.market_orders_legacy
    ADD CONSTRAINT market_orders_orders_order_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: offer_market_items market_orders_orders_order_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.offer_market_items
    ADD CONSTRAINT market_orders_orders_order_id_fk FOREIGN KEY (offer_id) REFERENCES public.order_offers(id) ON DELETE CASCADE;


--
-- Name: market_price_history market_price_history_game_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_price_history
    ADD CONSTRAINT market_price_history_game_item_id_fkey FOREIGN KEY (game_item_id) REFERENCES public.game_items(id);


--
-- Name: market_unique_listings market_unique_listings_details_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_unique_listings
    ADD CONSTRAINT market_unique_listings_details_id_fkey FOREIGN KEY (details_id) REFERENCES public.market_listing_details(details_id);


--
-- Name: market_unique_listings market_unique_listings_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.market_unique_listings
    ADD CONSTRAINT market_unique_listings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.market_listings(listing_id);


--
-- Name: message_attachments message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(message_id);


--
-- Name: message_attachments message_attachments_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.image_resources(resource_id);


--
-- Name: messages messages_author_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_author_fkey FOREIGN KEY (author) REFERENCES public.accounts(user_id);


--
-- Name: messages messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(chat_id);


--
-- Name: notification_change notification_change_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_change
    ADD CONSTRAINT notification_change_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.accounts(user_id);


--
-- Name: notification_change notification_change_notification_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_change
    ADD CONSTRAINT notification_change_notification_object_id_fkey FOREIGN KEY (notification_object_id) REFERENCES public.notification_object(notification_object_id) ON DELETE CASCADE;


--
-- Name: notification notification_notification_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_notification_object_id_fkey FOREIGN KEY (notification_object_id) REFERENCES public.notification_object(notification_object_id) ON DELETE CASCADE;


--
-- Name: notification notification_notifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_notifier_id_fkey FOREIGN KEY (notifier_id) REFERENCES public.accounts(user_id);


--
-- Name: notification_object notification_object_action_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_object
    ADD CONSTRAINT notification_object_action_type_id_fkey FOREIGN KEY (action_type_id) REFERENCES public.notification_actions(action_type_id);


--
-- Name: offer_market_items offer_market_items_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.offer_market_items
    ADD CONSTRAINT offer_market_items_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.market_listings(listing_id) ON DELETE CASCADE;


--
-- Name: offer_sessions offer_sessions_assigned_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.offer_sessions
    ADD CONSTRAINT offer_sessions_assigned_id_fkey FOREIGN KEY (assigned_id) REFERENCES public.accounts(user_id);


--
-- Name: offer_sessions offer_sessions_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.offer_sessions
    ADD CONSTRAINT offer_sessions_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id);


--
-- Name: offer_sessions offer_sessions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.offer_sessions
    ADD CONSTRAINT offer_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(user_id);


--
-- Name: order_applicants order_applicants_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_applicants
    ADD CONSTRAINT order_applicants_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: order_comments order_comments_author_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_comments
    ADD CONSTRAINT order_comments_author_fkey FOREIGN KEY (author) REFERENCES public.accounts(user_id);


--
-- Name: order_comments order_comments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_comments
    ADD CONSTRAINT order_comments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: order_deliveries order_deliveries_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_deliveries
    ADD CONSTRAINT order_deliveries_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(delivery_id);


--
-- Name: order_deliveries order_deliveries_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_deliveries
    ADD CONSTRAINT order_deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: order_offers order_offers_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.order_offers
    ADD CONSTRAINT order_offers_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;


--
-- Name: order_offers order_offers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.order_offers
    ADD CONSTRAINT order_offers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.offer_sessions(id) ON DELETE CASCADE;


--
-- Name: order_offers order_offers_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.order_offers
    ADD CONSTRAINT order_offers_template_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(service_id) ON DELETE SET NULL;


--
-- Name: order_reviews order_reviews_author_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_reviews
    ADD CONSTRAINT order_reviews_author_fkey FOREIGN KEY (user_author) REFERENCES public.accounts(user_id);


--
-- Name: order_reviews order_reviews_contractor_author_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_reviews
    ADD CONSTRAINT order_reviews_contractor_author_fkey FOREIGN KEY (contractor_author) REFERENCES public.contractors(contractor_id);


--
-- Name: order_reviews order_reviews_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.order_reviews
    ADD CONSTRAINT order_reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: services order_templates_assigned_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT order_templates_assigned_id_fkey FOREIGN KEY (assigned_id) REFERENCES public.accounts(user_id);


--
-- Name: services order_templates_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT order_templates_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id);


--
-- Name: services order_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT order_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id);


--
-- Name: notification_webhooks order_webhooks_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_webhooks
    ADD CONSTRAINT order_webhooks_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id);


--
-- Name: notification_webhooks order_webhooks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.notification_webhooks
    ADD CONSTRAINT order_webhooks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id);


--
-- Name: orders orders_assigned_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_assigned_id_fkey FOREIGN KEY (assigned_id) REFERENCES public.accounts(user_id);


--
-- Name: orders orders_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(user_id);


--
-- Name: orders orders_offer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_offer_session_id_fkey FOREIGN KEY (offer_session_id) REFERENCES public.offer_sessions(id);


--
-- Name: orders orders_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_template_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(service_id);


--
-- Name: public_contract_offers public_contract_offers_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.public_contract_offers
    ADD CONSTRAINT public_contract_offers_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.public_contracts(id);


--
-- Name: public_contract_offers public_contract_offers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.public_contract_offers
    ADD CONSTRAINT public_contract_offers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.offer_sessions(id);


--
-- Name: public_contracts public_contracts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.public_contracts
    ADD CONSTRAINT public_contracts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(user_id);


--
-- Name: recruiting_comments recruiting_comments_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.recruiting_comments
    ADD CONSTRAINT recruiting_comments_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(comment_id);


--
-- Name: recruiting_comments recruiting_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.recruiting_comments
    ADD CONSTRAINT recruiting_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.recruiting_posts(post_id);


--
-- Name: recruiting_posts recruiting_posts_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.recruiting_posts
    ADD CONSTRAINT recruiting_posts_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: recruiting_votes recruiting_votes_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.recruiting_votes
    ADD CONSTRAINT recruiting_votes_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.accounts(user_id) ON DELETE CASCADE;


--
-- Name: recruiting_votes recruiting_votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.recruiting_votes
    ADD CONSTRAINT recruiting_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.recruiting_posts(post_id) ON DELETE CASCADE;


--
-- Name: service_images service_images_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.service_images
    ADD CONSTRAINT service_images_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.image_resources(resource_id) ON DELETE CASCADE;


--
-- Name: service_images service_images_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dashboard
--

ALTER TABLE ONLY public.service_images
    ADD CONSTRAINT service_images_template_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(service_id) ON DELETE CASCADE;


--
-- Name: ship_checkins ship_checkins_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.ship_checkins
    ADD CONSTRAINT ship_checkins_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(ship_id);


--
-- Name: ship_checkins ship_checkins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.ship_checkins
    ADD CONSTRAINT ship_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.accounts(user_id);


--
-- Name: ships ships_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_owner_fkey FOREIGN KEY (owner) REFERENCES public.accounts(user_id);


--
-- Name: user_availability user_availability_accounts_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_accounts_user_id_fk FOREIGN KEY (user_id) REFERENCES public.accounts(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_availability user_availability_contractors_contractor_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_contractors_contractor_id_fk FOREIGN KEY (contractor_id) REFERENCES public.contractors(contractor_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: webhook_actions webhook_actions_action_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.webhook_actions
    ADD CONSTRAINT webhook_actions_action_type_id_fkey FOREIGN KEY (action_type_id) REFERENCES public.notification_actions(action_type_id) ON DELETE CASCADE;


--
-- Name: webhook_actions webhook_actions_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: voc_sc
--

ALTER TABLE ONLY public.webhook_actions
    ADD CONSTRAINT webhook_actions_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.notification_webhooks(webhook_id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: dashboard
--

GRANT ALL ON SCHEMA public TO voc_sc;


--
-- PostgreSQL database dump complete
--

