-- Add component attributes to market_search_complete view
-- This migration adds component_size, component_grade, component_class, manufacturer, and component_type
-- to the market search views to enable filtering by component attributes

BEGIN;

-- Drop existing materialized view and view to recreate them with component attributes
DROP MATERIALIZED VIEW IF EXISTS market_search_materialized;
DROP VIEW IF EXISTS market_search_complete;

-- Recreate market_search_complete view with component attributes
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
       market_search.total_assignments,
       market_search.response_rate,
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
        LIMIT 1)                                                                                    AS photo,
       -- Add component attributes from game_items table
       game_items.component_size                                                                    AS component_size,
       game_items.component_grade                                                                   AS component_grade,
       game_items.component_class                                                                   AS component_class,
       game_items.manufacturer                                                                      AS manufacturer,
       game_items.component_type                                                                    AS component_type
FROM market_search
         LEFT OUTER JOIN market_listing_details ON market_listing_details.details_id = market_search.details_id
         LEFT OUTER JOIN game_items ON market_listing_details.game_item_id = game_items.id
         LEFT OUTER JOIN game_item_categories ON market_listing_details.item_type = game_item_categories.subcategory;

-- Recreate materialized view with component attributes
CREATE MATERIALIZED VIEW market_search_materialized AS
SELECT *
FROM market_search_complete;

-- Recreate indexes
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

COMMIT;
