ABORT;
BEGIN;

CREATE TABLE IF NOT EXISTS game_items
(
    id          UUID         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(100) NOT NULL UNIQUE,
    cstone_uuid UUID,
    image_url   URL,
    type        varchar(50),
    description TEXT
);

CREATE TABLE IF NOT EXISTS game_item_categories
(
    id          SERIAL NOT NULL PRIMARY KEY,
    category    varchar(50),
    subcategory varchar(50) UNIQUE
);

INSERT INTO game_item_categories(subcategory, category)
VALUES ('FPS Tool', 'FPS Weapon'),
       ('Full Set', 'Armor'),
       ('Arms', 'Armor'),
       ('Souvenir/Flair', 'Flair'),
       ('Undersuit', 'Armor'),
       ('Shirts', 'Clothing'),
       ('Mobiglass', 'Other'),
       ('Food/Drink', 'Consumable'),
       ('Missile Rack', 'Vehicle Weapon'),
       ('Eyewear', 'Clothing'),
       ('Hat', 'Clothing'),
       ('Handheld Mining Modifier', 'FPS Attachment'),
       ('Helmet', 'Armor'),
       ('Weapon Attachment', 'FPS Attachment'),
       ('Ship for Sale/Rental', 'Ship'),
       ('Gloves', 'Clothing'),
       ('Mining Head', 'Component'),
       ('Salvage Modifier', 'Component'),
       ('Melee Weapon', 'FPS Weapon'),
       ('Shield', 'Component'),
       ('Container', 'Other'),
       ('Torso', 'Armor'),
       ('Weapon Magazine', 'Consumable'),
       ('Quantum Drive', 'Component'),
       ('Legwear', 'Clothing'),
       ('Medical Pen', 'Consumable'),
       ('Tool Attachment', 'FPS Attachment'),
       ('Tractor Beam', 'FPS Weapon'),
       ('Footwear', 'Clothing'),
       ('Ship Livery', 'Paint / Livery'),
       ('Thrown Weapon', 'FPS Weapon'),
       ('Other', 'Other'),
       ('Mining Modifier', 'Component'),
       ('Flare', 'FPS Weapon'),
       ('Legs', 'Armor'),
       ('Salvage Head', 'Component'),
       ('Missile', 'Vehicle Weapon'),
       ('Towing Beam', 'Component'),
       ('Fuel Pod', 'Component'),
       ('Ship Turret or Gimbal', 'Vehicle Weapon'),
       ('Jumpsuits', 'Clothing'),
       ('Ship Weapon', 'Component'),
       ('Ranged Weapon', 'FPS Weapon'),
       ('Fuel Nozzle', 'Component'),
       ('Cooler', 'Component'),
       ('Backpack', 'Armor'),
       ('Jackets', 'Clothing'),
       ('Power Plant', 'Component'),
       ('Bomb', 'Vehicle Weapon'),
       ('Hacking Chip', 'Other'),
       ('Bundle', 'Other'),
       ('Location', 'Data'),
       ('Intel', 'Data');

COMMIT;
-- Import data from csv

ABORT;
BEGIN;

CREATE TEMP TABLE temp_details
(
    listing_id  uuid,
    details_id  uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    item_type   varchar(100),
    title       varchar(100),
    description varchar(2000)
) ON COMMIT DROP;
-- Populate listing details
-- Convert all aggregates into uniques
WITH all_details AS (SELECT market_listing_details.*, market_aggregate_listings.aggregate_listing_id AS listing_id
                     FROM market_aggregate_listings
                              INNER JOIN market_aggregates
                                         ON market_aggregates.aggregate_id = market_aggregate_listings.aggregate_id
                              INNER JOIN market_listing_details
                                         ON market_aggregates.details_id = market_listing_details.details_id
                              LEFT JOIN game_items gi on market_listing_details.title = gi.name),
     temp_details AS (
         INSERT INTO temp_details (listing_id, item_type, title, description)
             SELECT listing_id, item_type, title, description FROM all_details
             RETURNING *),
     new_details AS (
         INSERT INTO market_listing_details
             SELECT details_id, item_type, title, description FROM temp_details
             RETURNING market_listing_details.details_id as details_id)
INSERT
INTO market_unique_listings
SELECT listing_id, true, details_id
FROM temp_details;

UPDATE market_listings
SET sale_type = 'sale'
WHERE sale_type = 'aggregate';

UPDATE market_listing_details
SET item_type = CASE
                    WHEN item_type = 'Torso armor' THEN 'Torso'
                    WHEN item_type = 'Arms armor' THEN 'Arms'
                    WHEN item_type = 'Backpacks' THEN 'Backpack'
                    WHEN item_type = 'Undersuits' THEN 'Undersuit'
                    WHEN item_type = 'Personal weapons' THEN 'Ranged Weapon'
                    WHEN item_type = 'weapon' THEN 'Ranged Weapon'
                    WHEN item_type = 'HMGs' THEN 'Ranged Weapon'
                    WHEN item_type = 'Helmets' THEN 'Helmet'
                    WHEN item_type = 'paint' THEN 'Ship Livery'
                    WHEN item_type = 'Components' THEN 'Ship Weapon'
                    WHEN item_type = 'bundle' THEN 'Bundle'
                    WHEN item_type = 'consumable' THEN 'Food/Drink'
                    WHEN item_type = 'armor' THEN 'Torso'
                    WHEN item_type = 'flair' THEN 'Souvenir/Flair'
                    WHEN item_type = 'clothing' THEN 'Jumpsuits'
                    WHEN item_type = 'addon' THEN 'Tool Attachment'
                    WHEN item_type = 'other' THEN 'Other'
    END;

alter table market_listing_details
    add column game_item_id UUID REFERENCES game_items (id);

UPDATE market_listing_details
SET game_item_id = (SELECT id FROM game_items WHERE game_items.name = market_listing_details.title LIMIT 1);

alter table market_listing_details
    add constraint market_listing_details_game_item_categories_subcategory_fk
        foreign key (item_type) references public.game_item_categories (subcategory);

DELETE
FROM market_buy_orders;
ALTER TABLE market_buy_orders
    DROP COLUMN aggregate_id;
ALTER TABLE market_buy_orders
    ADD COLUMN game_item_id UUID REFERENCES game_items (id);


SELECT *
FROM market_listing_details;
COMMIT;

ABORT;

INSERT INTO market_listing_details(item_type, title, description, game_item_id)
SELECT type, name, description, id
FROM game_items;

ABORT;
BEGIN;
WITH resources AS (INSERT INTO image_resources (filename, external_url)
    SELECT id || '-image.jpg', image_url
    FROM market_listing_details
             JOIN game_items ON market_listing_details.game_item_id = game_items.id
    WHERE starts_with(market_listing_details.description, 'GENERAL

NAME')
    RETURNING resource_id, filename)
INSERT
INTO market_images(resource_id, details_id)
SELECT resource_id,
       (SELECT details_id
        FROM market_listing_details
        JOIN game_items ON market_listing_details.game_item_id = game_items.id
        WHERE starts_with(market_listing_details.description, 'GENERAL

NAME') AND (game_item_id || '-image.jpg') = filename)
FROM resources;

alter table public.market_multiples
    add timestamp timestamp default now() not null;

INSERT INTO game_items(name, cstone_uuid, image_url, type, description) SELECT REPLACE(name, ' Core', ''), cstone_uuid, null, 'Full Set', description FROM game_items WHERE type = 'Torso';

COMMIT;