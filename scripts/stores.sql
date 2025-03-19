ALTER TABLE contractors ADD COLUMN market_order_template VARCHAR(2000) DEFAULT '';
ALTER TABLE accounts ADD COLUMN market_order_template VARCHAR(2000) DEFAULT '';

ABORT;
BEGIN;

CREATE TABLE IF NOT EXISTS shop
(
    id            SERIAL UNIQUE,
    slug          VARCHAR(50)   NOT NULL,
    name          varchar(100)  NOT NULL,
    description   varchar(2000) NOT NULL,
    banner        UUID REFERENCES image_resources (resource_id),
    logo          UUID REFERENCES image_resources (resource_id),
    contractor_id UUID references contractors (contractor_id) ON DELETE CASCADE,
    user_id       UUID references accounts (user_id) ON DELETE CASCADE
    -- location varchar(100) NOT NULL, -- add later
);

CREATE TABLE IF NOT EXISTS storage_location
(
    id          UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR(100)     NOT NULL,
    description VARCHAR(1000)    NOT NULL,
    listed      BOOLEAN NOT NULL,
    shop_id     INT references shop (id) ON DELETE CASCADE,
    user_id     UUID references accounts (user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS market_inventory
(
    item_id  UUID PRIMARY KEY NOT NULL REFERENCES market_listings (listing_id),
    shop_id  INT              NOT NULL REFERENCES shop (id),
    location UUID references storage_location (id),
    quantity INTEGER,
    CHECK (quantity > 0),
    UNIQUE (item_id, shop_id, location)
);

INSERT INTO shop (slug, name, description, banner, logo, contractor_id)
SELECT spectrum_id, name, description, banner, avatar, contractor_id
FROM contractors
WHERE exists(SELECT 1
             FROM market_listings
             WHERE market_listings.contractor_seller_id = contractors.contractor_id
             UNION
             SELECT 1
             FROM services
             WHERE services.contractor_id = contractors.contractor_id);

INSERT INTO shop (slug, name, description, banner, logo, user_id)
SELECT username, display_name || '''s shop', profile_description, banner, avatar, user_id
FROM accounts
WHERE exists(SELECT 1
             FROM market_listings
             WHERE market_listings.user_seller_id = accounts.user_id
             UNION
             SELECT 1
             FROM services
             WHERE services.user_id = accounts.user_id);

INSERT INTO storage_location (name, description, shop_id, user_id)
SELECT 'Unknown Location', 'Unknown location', id, user_id
FROM shop
         JOIN contractors ON shop.contractor_id = contractors.contractor_id;

INSERT INTO market_inventory(item_id, shop_id, location, quantity)
SELECT listing_id,
       shop.id,
       storage_location.id,
       quantity_available
FROM market_listings
         INNER JOIN contractors ON market_listings.contractor_seller_id = contractors.contractor_id
         INNER JOIN shop ON contractors.contractor_id = shop.contractor_id
         LEFT JOIN storage_location ON shop.id = storage_location.shop_id
WHERE contractor_seller_id IS NOT NULL
  AND quantity_available > 0;

ALTER TABLE market_listings
    ADD COLUMN shop_id INT REFERENCES shop (id);

UPDATE market_listings
SET shop_id = (SELECT id FROM shop WHERE contractor_id = contractor_seller_id)
WHERE contractor_seller_id IS NOT NULL;
UPDATE market_listings
SET shop_id = (SELECT id FROM shop WHERE user_id = user_seller_id)
WHERE user_seller_id IS NOT NULL;

ALTER TABLE market_listings
    DROP COLUMN quantity_available;
ALTER TABLE market_listings
    DROP COLUMN user_seller_id;
ALTER TABLE market_listings
    DROP COLUMN contractor_seller_id;

-- TODO: Remove this
DROP VIEW market_search CASCADE;
ALTER TABLE market_listings
    DROP COLUMN user_seller_id;
ALTER TABLE market_listings
    DROP COLUMN contractor_seller_id;

ALTER TABLE market_multiples
    ADD COLUMN shop_id INT REFERENCES shop (id);

UPDATE market_multiples
SET shop_id = (SELECT id FROM shop WHERE contractor_id = contractor_seller_id)
WHERE contractor_seller_id IS NOT NULL;
UPDATE market_multiples
SET shop_id = (SELECT id FROM shop WHERE user_id = user_seller_id)
WHERE user_seller_id IS NOT NULL;

ALTER TABLE market_multiples
    DROP COLUMN user_seller_id;
ALTER TABLE market_multiples
    DROP COLUMN contractor_seller_id;

ALTER TABLE services
    ADD COLUMN shop_id INT REFERENCES shop (id);

UPDATE services
SET shop_id = (SELECT id FROM shop WHERE shop.contractor_id = services.contractor_id)
WHERE contractor_id IS NOT NULL;
UPDATE services
SET shop_id = (SELECT id FROM shop WHERE shop.user_id = services.user_id)
WHERE user_id IS NOT NULL;

ALTER TABLE services
    DROP COLUMN user_id;
ALTER TABLE services
    DROP COLUMN contractor_id;

ALTER TABLE orders
    ADD COLUMN shop_id INT REFERENCES shop (id);

UPDATE orders
SET shop_id = (SELECT id FROM shop WHERE shop.contractor_id = orders.contractor_id)
WHERE contractor_id IS NOT NULL;
UPDATE orders
SET shop_id = (SELECT id FROM shop WHERE shop.user_id = orders.assigned_id)
WHERE assigned_id IS NOT NULL
  AND contractor_id IS NULL;

ALTER TABLE orders
    DROP COLUMN contractor_id;

ALTER TABLE offer_sessions
    ADD COLUMN shop_id INT REFERENCES shop (id);

UPDATE offer_sessions
SET shop_id = (SELECT id FROM shop WHERE shop.contractor_id = offer_sessions.contractor_id)
WHERE contractor_id IS NOT NULL;
UPDATE offer_sessions
SET shop_id = (SELECT id FROM shop WHERE shop.user_id = offer_sessions.assigned_id)
WHERE assigned_id IS NOT NULL
  AND contractor_id IS NULL;

ALTER TABLE offer_sessions
    DROP COLUMN contractor_id;

-- TODO: Convert orders and offers to be for shops
-- TODO: Make market search no longer rely on contractor seller and user
-- TODO: I want stock to be able to move locations
-- TODO: Make contractors into orgs and make shops their own thing?
-- ALTER TABLE contractors RENAME TO organizations;
-- TODO: Store permissioning
-- Separate table for order and offer assignees
-- CREATE TABLE IF NOT EXISTS order_assignees
-- (
--     order_id UUID REFERENCES orders (order_id) ON DELETE CASCADE,
--     user_id  UUID REFERENCES accounts (user_id) ON DELETE CASCADE
-- );
--
-- CREATE TABLE IF NOT EXISTS offer_assignees
-- (
--     session_id UUID REFERENCES offer_sessions (id) ON DELETE CASCADE,
--     user_id    UUID REFERENCES accounts (user_id) ON DELETE CASCADE
-- );
--
-- INSERT INTO order_assignees
-- SELECT order_id, assigned_id
-- FROM orders
-- WHERE assigned_id IS NOT NULL;
--
-- ALTER TABLE orders
--     DROP COLUMN assigned_id;
--
-- INSERT INTO offer_assignees
-- SELECT id, assigned_id
-- FROM offer_sessions
-- WHERE offer_sessions.assigned_id IS NOT NULL;
--
-- ALTER TABLE offer_sessions
--     DROP COLUMN assigned_id;
-- TODO: Track on hold inventory, assign inventory from a location
-- TODO: to the order
-- Storage locations: Should they have a location select optionally thats editable (for ships e.g.)
-- TODO: Transaction logging. Provide ways to request funds, link transactions to orders, etc
-- TODO: Item SCU measurements and calculator
-- TODO: View customer, their order history, order stats, and current orders

ABORT;