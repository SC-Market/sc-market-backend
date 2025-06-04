ABORT;
BEGIN;

CREATE OR REPLACE FUNCTION get_auction_end(UUID, VARCHAR(30)) RETURNS timestamp AS
$$
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
$$
    LANGUAGE plpgsql
    STABLE;

CREATE OR REPLACE FUNCTION get_total_rating(UUID, UUID) RETURNS int AS
$$
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
$$
    LANGUAGE plpgsql
    STABLE;

CREATE OR REPLACE FUNCTION get_rating_count(UUID, UUID) RETURNS int AS
$$
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
$$
    LANGUAGE plpgsql
    STABLE;
CREATE OR REPLACE FUNCTION get_rating_streak(UUID, UUID) RETURNS int AS
$$
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
$$
    LANGUAGE plpgsql
    STABLE;
CREATE OR REPLACE FUNCTION get_total_orders(UUID, UUID) RETURNS int AS
$$
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
$$
    LANGUAGE plpgsql
    STABLE;

CREATE OR REPLACE FUNCTION get_average_rating(UUID, UUID) RETURNS int AS
$$
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
$$
    LANGUAGE plpgsql
    STABLE;

ABORT;
CREATE OR REPLACE FUNCTION get_average_rating_float(UUID, UUID) RETURNS float AS
$$
BEGIN
    IF $1 IS NOT NULL THEN
        RETURN (SELECT COALESCE(AVG(CAST(order_reviews.rating as FLOAT)), 0.) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE (CASE
                           WHEN assigned_id = $1 AND contractor_id IS null AND role = 'customer' THEN TRUE
                           WHEN customer_id = $1 AND role = 'contractor' THEN TRUE
                           ELSE FALSE
                    END)
                  AND rating > 0);
    ELSE
        RETURN (SELECT COALESCE(AVG(CAST(order_reviews.rating as FLOAT)), 0.) as t
                FROM order_reviews
                         JOIN orders ON order_reviews.order_id = orders.order_id
                WHERE contractor_id = $2
                  AND role = 'customer'
                  AND rating > 0);
    END IF;
END;
$$
    LANGUAGE plpgsql
    STABLE;

BEGIN;
DROP MATERIALIZED VIEW market_search_materialized;
DROP VIEW market_search_complete;
DROP VIEW market_search;
CREATE OR REPLACE VIEW market_search AS
SELECT market_listings.listing_id                                                                    AS listing_id,
       'unique'                                                                                      as listing_type,
       market_listings.sale_type                                                                     as sale_type,
       CASE
           WHEN market_listings.sale_type = 'auction' THEN (SELECT COALESCE((SELECT MAX(bid)
                                                                             FROM market_bids
                                                                             WHERE market_listings.listing_id = market_bids.listing_id),
                                                                            market_listings.price))
           ELSE market_listings.price
           END                                                                                       as price,
       CASE
           WHEN market_listings.sale_type = 'auction' THEN (SELECT COALESCE((SELECT MAX(bid)
                                                                             FROM market_bids
                                                                             WHERE market_listings.listing_id = market_bids.listing_id),
                                                                            market_listings.price))
           ELSE market_listings.price
           END                                                                                       as minimum_price,
       CASE
           WHEN market_listings.sale_type = 'auction' THEN (SELECT COALESCE((SELECT MAX(bid)
                                                                             FROM market_bids
                                                                             WHERE market_listings.listing_id = market_bids.listing_id),
                                                                            market_listings.price))
           ELSE market_listings.price
           END                                                                                       as maximum_price,
       market_listings.quantity_available                                                            as quantity_available,
       market_listings.timestamp                                                                     AS timestamp,
       market_listings.expiration                                                                    AS expiration,
       get_total_rating(market_listings.user_seller_id,
                        market_listings.contractor_seller_id)                                        AS total_rating,
       get_average_rating_float(market_listings.user_seller_id, market_listings.contractor_seller_id)      AS avg_rating,
       market_listing_details.details_id                                                             as details_id,
       to_tsvector('english',
                   CONCAT(ARRAY [market_listing_details.title, market_listing_details.description])) AS textsearch,
       market_listings.status                                                                        AS status,
       market_listings.internal                                                                      AS internal,
       market_listings.user_seller_id                                                                AS user_seller_id,
       (SELECT username FROM accounts WHERE accounts.user_id = market_listings.user_seller_id)       AS user_seller,
       market_listings.contractor_seller_id                                                          AS contractor_seller_id,
       (SELECT spectrum_id
        FROM contractors
        WHERE contractors.contractor_id = market_listings.contractor_seller_id)                      AS contractor_seller,
       get_auction_end(market_unique_listings.listing_id,
                       market_listings.sale_type)                                                    AS auction_end_time,

       get_rating_count(market_listings.user_seller_id, market_listings.contractor_seller_id)        AS rating_count,
       get_rating_streak(market_listings.user_seller_id, market_listings.contractor_seller_id)       AS rating_streak,
       get_total_orders(market_listings.user_seller_id, market_listings.contractor_seller_id)        AS total_orders,
       market_listing_details.details_id                                                             as photo_details
FROM market_unique_listings
         JOIN market_listings
              ON market_unique_listings.listing_id = market_listings.listing_id
         JOIN market_listing_details
              ON market_unique_listings.details_id = market_listing_details.details_id
UNION
SELECT market_multiples.multiple_id                                                                  AS listing_id,
       'multiple'                                                                                    as listing_type,
       'sale'                                                                                        AS sale_type,
       (SELECT price FROM market_listings WHERE listing_id = market_multiples.default_listing_id)    AS price,
       MIN(market_listings.price)                                                                    AS minimum_price,
       MIN(market_listings.price)                                                                    AS maximum_price,
       COALESCE(SUM(market_listings.quantity_available), 0)                                          as quantity_available,
       MAX(market_listings.timestamp)                                                                AS timestamp,
       MAX(market_listings.expiration)                                                               AS expiration,
       MAX(get_total_rating(market_listings.user_seller_id, market_listings.contractor_seller_id))   AS total_rating,
       MAX(get_average_rating_float(market_listings.user_seller_id, market_listings.contractor_seller_id)) AS avg_rating,
       main_details.details_id                                                                       as details_id,
       to_tsvector('english',
                   main_details.title || ' ' || main_details.description ||
                   (SELECT STRING_AGG(entry_details.title || ' ' || entry_details.description, ','))
       )                                                                                             AS textsearch,
       CASE
           WHEN bool_or(market_listings.status = 'active') THEN 'active'
           ELSE 'inactive'
           END
                                                                                                     AS status,
       CASE
           WHEN bool_or(NOT market_listings.internal) THEN false
           ELSE true
           END
                                                                                                     AS internal,
       market_multiples.user_seller_id                                                               AS user_seller_id,
       (SELECT username FROM accounts WHERE accounts.user_id = market_multiples.user_seller_id)      AS user_seller,
       market_multiples.contractor_seller_id                                                         AS contractor_seller_id,
       (SELECT spectrum_id
        FROM contractors
        WHERE contractors.contractor_id = market_multiples.contractor_seller_id)                     AS contractor_seller,
       NULL                                                                                          AS auction_end_time,
       get_rating_count(market_multiples.user_seller_id, market_multiples.contractor_seller_id)      AS rating_count,
       get_rating_streak(market_multiples.user_seller_id, market_multiples.contractor_seller_id)     AS rating_streak,
       get_total_orders(market_multiples.user_seller_id, market_multiples.contractor_seller_id)      AS total_orders,
       (SELECT market_multiple_listings.details_id
        FROM market_multiple_listings
        WHERE market_multiple_listings.multiple_listing_id = market_multiples.default_listing_id)    AS photo_details
FROM market_multiples
         JOIN market_listing_details main_details
              ON market_multiples.details_id = main_details.details_id
         LEFT OUTER JOIN market_multiple_listings listings ON market_multiples.multiple_id = listings.multiple_id
         LEFT OUTER JOIN market_listings
                         ON listings.multiple_listing_id = market_listings.listing_id
         JOIN market_listing_details entry_details ON listings.details_id = entry_details.details_id
GROUP BY market_multiples.multiple_id, main_details.details_id
UNION
SELECT game_items.id                                                 AS listing_id,
       'aggregate'                                                   as listing_type,
       'sale'                                                        AS sale_type,
       MIN(market_listings.price)                                    as price,
       MIN(market_listings.price)                                    as minimum_price,
       MAX(market_listings.price)                                    as maximum_price,
       COALESCE(SUM(market_listings.quantity_available), 0)          AS quantity_available,
       MAX(market_listings.timestamp)                                AS timestamp,
       MAX(market_listings.expiration)                               AS expiration,
       MAX(get_total_rating(user_seller_id, contractor_seller_id))   AS total_rating,
       MAX(get_average_rating_float(user_seller_id, contractor_seller_id)) AS avg_rating,
       (SELECT details_id
        FROM market_listing_details d
        WHERE market_listing_details.game_item_id = d.game_item_id
        LIMIT 1)                                                     as details_id,
       to_tsvector('english', (SELECT d.description
                               FROM market_listing_details d
                               WHERE market_listing_details.game_item_id = d.game_item_id
                               LIMIT 1) || ' ' || (SELECT title
                                                   FROM market_listing_details d
                                                   WHERE market_listing_details.game_item_id = d.game_item_id
                                                   LIMIT 1))         AS textsearch,
       'active'                                                      AS status,
       false                                                         AS internal,
       null                                                          AS user_seller_id,
       null                                                          AS user_seller,
       null                                                          AS contractor_seller_id,
       null                                                          AS contractor_seller,
       NULL                                                          AS auction_end_time,
       NULL                                                          AS rating_count,
       NULL                                                          AS rating_streak,
       NULL                                                          AS total_orders,
       (SELECT details_id
        FROM market_listing_details d
        WHERE market_listing_details.game_item_id = d.game_item_id
        LIMIT 1)                                                     as photo_details
FROM game_items
         JOIN market_listing_details ON market_listing_details.game_item_id = game_items.id AND market_listing_details.game_item_id IS NOT NULL
         JOIN market_unique_listings ON market_unique_listings.details_id = market_listing_details.details_id
         LEFT JOIN market_listings ON market_unique_listings.listing_id = market_listings.listing_id AND
                                      market_listings.quantity_available > 0 AND market_listings.status = 'active'
GROUP BY market_listing_details.game_item_id, game_items.id;

CREATE OR REPLACE VIEW market_search_complete AS
SELECT market_search.listing_id,
       market_search.listing_type,
       market_search.sale_type,
       market_search.price,
       market_search.minimum_price,
       market_search.maximum_price,
       market_search.quantity_available,
       market_search.timestamp,
       market_search.expiration,
       market_search.total_rating,
       market_search.avg_rating,
       market_search.details_id,
       market_search.textsearch || to_tsvector('english', coalesce(game_items.name, ''))            AS textsearch,
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
       market_listing_details.title                                                                 AS title,
       market_listing_details.item_type                                                             as item_type,
       game_items.name                                                                              as item_name,
       market_listing_details.game_item_id                                                          as game_item_id,
       to_tsvector('english',
                   CONCAT(ARRAY [market_listing_details.item_type, game_item_categories.category])) as item_type_ts,
       (SELECT image_resources.external_url
        FROM image_resources
                 LEFT JOIN market_images ON market_images.resource_id = image_resources.resource_id
        WHERE market_images.details_id = photo_details
        LIMIT 1)                                                                                    AS photo
FROM market_search
         LEFT OUTER JOIN market_listing_details ON market_listing_details.details_id = market_search.details_id
         LEFT OUTER JOIN game_items ON market_listing_details.game_item_id = game_items.id
         LEFT OUTER JOIN game_item_categories ON market_listing_details.item_type = game_item_categories.subcategory;

CREATE MATERIALIZED VIEW market_search_materialized AS
SELECT *
FROM market_search_complete;

REFRESH MATERIALIZED VIEW market_search_materialized;

CREATE UNIQUE INDEX market_search_materialized_listing_id_index ON market_search_materialized (listing_id);
CREATE INDEX market_search_materialized_price_index ON market_search_materialized (price);
CREATE INDEX market_search_materialized_min_price_index ON market_search_materialized (minimum_price);
CREATE INDEX market_search_materialized_max_price_index ON market_search_materialized (maximum_price);
CREATE INDEX market_search_materialized_quantity_index ON market_search_materialized (quantity_available);
CREATE INDEX market_search_materialized_timestamp_index ON market_search_materialized (timestamp);
CREATE INDEX market_search_materialized_textsearch_index ON market_search_materialized (textsearch);
CREATE INDEX market_search_materialized_status_index ON market_search_materialized (status);
CREATE INDEX market_search_materialized_user_seller_index ON market_search_materialized (user_seller_id);
CREATE INDEX market_search_materialized_contractor_seller_index ON market_search_materialized (contractor_seller_id);
CREATE INDEX market_search_materialized_item_id_index ON market_search_materialized (game_item_id);


SELECT market_search_complete.*, ts_rank_cd(textsearch, query) AS rank
FROM market_search_complete,
     websearch_to_tsquery('english', 'Artimex Helmet') query
WHERE query @@ textsearch
ORDER BY rank DESC
LIMIT 10;

COMMIT;