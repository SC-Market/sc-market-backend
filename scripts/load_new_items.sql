ABORT;
BEGIN;

-- DELETE FROM game_items_staging;
ALTER TABLE game_items
    ALTER COLUMN details_id DROP NOT NULL;
SELECT * FROM game_items WHERE name = 'Hadanite'; -- 125dd723-95ad-488d-830f-62c954445ca1
SELECT * FROM game_items_staging WHERE name = 'Hadanite'; -- 3998d58a-4021-4697-9432-2162aff01c73

INSERT INTO game_items(name, cstone_uuid, image_url, type, description, details_id)
SELECT name, cstone_uuid, image_url, type, description, NULL
FROM game_items_staging
WHERE NOT EXISTS(SELECT * FROM game_items WHERE game_items.cstone_uuid = game_items_staging.cstone_uuid OR game_items.name = game_items_staging.name);

INSERT INTO game_items(name, cstone_uuid, image_url, type, description)
SELECT REPLACE(name, ' Core', '') as newname, cstone_uuid, null, 'Full Set', description
FROM game_items_staging
WHERE type = 'Torso' ON CONFLICT(name) DO NOTHING;

INSERT INTO market_listing_details(item_type, title, description, game_item_id)
SELECT type, name, description, id
FROM game_items
WHERE details_id IS NULL;

UPDATE game_items
SET details_id = (SELECT details_id
                  FROM market_listing_details
                  WHERE market_listing_details.game_item_id = game_items.id
                    AND NOT EXISTS(SELECT listing_id
                                   FROM market_unique_listings
                                   WHERE market_listing_details.details_id = market_unique_listings.details_id)
                  LIMIT 1)
WHERE details_id IS NULL;


SELECT *
FROM game_items
WHERE type = 'Full Set';

ALTER TABLE game_items
    ALTER COLUMN details_id SET NOT NULL;

COMMIT;