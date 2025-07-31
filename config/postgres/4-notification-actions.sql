--
-- PostgreSQL database dump
--

-- Dumped from database version 13.20
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
-- Data for Name: notification_actions; Type: TABLE DATA; Schema: public; Owner: scmarket
--

INSERT INTO public.notification_actions VALUES (1, 'order_create', 'orders');
INSERT INTO public.notification_actions VALUES (2, 'order_assigned', 'orders');
INSERT INTO public.notification_actions VALUES (3, 'order_review', 'order_reviews');
INSERT INTO public.notification_actions VALUES (4, 'order_status_fulfilled', 'orders');
INSERT INTO public.notification_actions VALUES (5, 'order_status_in_progress', 'orders');
INSERT INTO public.notification_actions VALUES (6, 'order_status_not_started', 'orders');
INSERT INTO public.notification_actions VALUES (7, 'order_status_cancelled', 'orders');
INSERT INTO public.notification_actions VALUES (8, 'order_comment', 'order_comments');
INSERT INTO public.notification_actions VALUES (9, 'contractor_invite', 'contractor_invites');
INSERT INTO public.notification_actions VALUES (11, 'market_item_offer', 'market_listing');
INSERT INTO public.notification_actions VALUES (12, 'market_bid_accepted', 'market_bids');
INSERT INTO public.notification_actions VALUES (13, 'market_offer_accepted', 'market_offers');
INSERT INTO public.notification_actions VALUES (14, 'market_bid_declined', 'market_bids');
INSERT INTO public.notification_actions VALUES (15, 'market_offer_declined', 'market_offers');
INSERT INTO public.notification_actions VALUES (16, 'order_contractor_applied', 'order_applicants');
INSERT INTO public.notification_actions VALUES (17, 'public_order_create', 'order');
INSERT INTO public.notification_actions VALUES (10, 'market_item_bid', 'market_bids');
INSERT INTO public.notification_actions VALUES (81, 'order_message', 'orders');
INSERT INTO public.notification_actions VALUES (18, 'offer_message', 'offer_sessions');
INSERT INTO public.notification_actions VALUES (19, 'offer_create', 'offer_sessions');
INSERT INTO public.notification_actions VALUES (20, 'counter_offer_create', 'offer_sessions');


--
-- Name: notification_actions_action_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: scmarket
--

SELECT pg_catalog.setval('public.notification_actions_action_type_id_seq', 14, true);


--
-- PostgreSQL database dump complete
--

