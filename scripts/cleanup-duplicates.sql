-- Cleanup duplicate items
-- Strategy: Keep item with UUID(s), merge all related data, delete duplicate
-- 
-- Related tables that reference game_items:
-- - game_item_attributes (attributes for items)
-- - market_listing_details (listings referencing items)
-- - market_buy_orders (buy orders for items)
-- - market_price_history (price history for items)

BEGIN;

-- Helper function to merge duplicate game items
-- Merges all related data from source_id to target_id, then deletes source
CREATE OR REPLACE FUNCTION merge_game_items(source_id uuid, target_id uuid) 
RETURNS void AS $$
BEGIN
    -- Merge game_item_attributes (avoid duplicates)
    INSERT INTO game_item_attributes (game_item_id, attribute_name, attribute_value)
    SELECT target_id, attribute_name, attribute_value
    FROM game_item_attributes
    WHERE game_item_id = source_id
    ON CONFLICT (game_item_id, attribute_name) DO NOTHING;
    
    DELETE FROM game_item_attributes WHERE game_item_id = source_id;
    
    -- Update market_listing_details to point to target
    UPDATE market_listing_details 
    SET game_item_id = target_id 
    WHERE game_item_id = source_id;
    
    -- Update market_buy_orders to point to target
    UPDATE market_buy_orders 
    SET game_item_id = target_id 
    WHERE game_item_id = source_id;
    
    -- Merge market_price_history (keep most recent for each date)
    INSERT INTO market_price_history (game_item_id, price, quantity_available, date)
    SELECT target_id, price, quantity_available, date
    FROM market_price_history
    WHERE game_item_id = source_id
    ON CONFLICT (game_item_id, date) DO UPDATE
    SET price = EXCLUDED.price,
        quantity_available = EXCLUDED.quantity_available;
    
    DELETE FROM market_price_history WHERE game_item_id = source_id;
    
    -- Finally, delete the source item
    DELETE FROM game_items WHERE id = source_id;
END;
$$ LANGUAGE plpgsql;

-- 1. Exact duplicates - Year envelopes (keep version with UUIDs)
SELECT merge_game_items('a59dcc1a-5152-4054-9a56-9b5669273b38'::uuid, '92fb798e-b4dc-458a-b752-4c3df61f3765'::uuid); -- Year Of The Monkey
SELECT merge_game_items('c326beb6-169f-4f39-94c8-146076bd300a'::uuid, 'e432e7be-0677-4341-b851-6aa74256dd9d'::uuid); -- Year Of The Rooster
SELECT merge_game_items('078a063f-5b99-4b02-8abe-161cf058a312'::uuid, '9b39e511-9554-4fe3-832a-414960369ebf'::uuid); -- Year Of The Dog
SELECT merge_game_items('ce1e72ac-1476-46ff-a605-43425d6d0a5d'::uuid, '3c478b61-cb45-429b-8abf-a6419baff59d'::uuid); -- Year Of The Pig

-- 2. medical supplies - keep CStone version
SELECT merge_game_items('25373d38-9f6f-4ae1-b5f9-e2615922bfd8'::uuid, '148eaaf6-b15c-4de5-bc65-9c222f2ed81a'::uuid);

-- 3. Trailing space duplicates
SELECT merge_game_items('89f8a0f4-0001-41c9-af61-ef2fdd44c4f3'::uuid, '0023af85-eec8-4e2f-80b6-5e3c0d6c5e39'::uuid); -- Boreal Quasi Grazer Egg
SELECT merge_game_items('39e1a1fb-08d4-4270-a0ed-8799c1124d2c'::uuid, '62594556-2eed-4c1a-9031-6da3e332ca4f'::uuid); -- CitizenCon '54 Coin
SELECT merge_game_items('d037f147-75d1-445b-b290-7683561979b6'::uuid, '6ea3e248-e64b-45e7-b099-19e3d7f68be8'::uuid); -- DeconPen (Canoiodide)
SELECT merge_game_items('3abf5b5b-3480-4c9b-b871-0ed33cf23f4c'::uuid, '3533072a-a853-4f03-9d40-cfaf8042b334'::uuid); -- DCHS-01
SELECT merge_game_items('410c0c9d-1fd6-4956-91bc-d29ddcca27fe'::uuid, '6311a0c6-d31c-4fbd-877e-fc3f05780824'::uuid); -- Get Up Coffee
SELECT merge_game_items('b32f8f24-5f65-4531-8760-791872b72962'::uuid, 'c24188bc-cc49-4ff5-87eb-ebc083a30ca8'::uuid); -- Tracer Laser Pointer
SELECT merge_game_items('064a0316-5bc8-46d8-a815-7a6ec285105b'::uuid, 'cf1aad44-8147-49ff-8c05-a81677eb2a03'::uuid); -- Liberator
SELECT merge_game_items('4a73dc64-97f5-4f24-b082-d06f77c91701'::uuid, 'c7d6e116-eff1-41ea-a07b-b62fed983c49'::uuid); -- Pyro RYT Bloodline
SELECT merge_game_items('08bff8a9-8490-4ea8-87db-21858398d3f1'::uuid, '5cf3cc8d-5577-4846-93dc-83b7cdbd14a6'::uuid); -- Theta Pro
SELECT merge_game_items('51231e43-5160-4e98-8d83-d4646a1b3f8e'::uuid, '6e9c503b-8873-4dee-bd02-b03935d4fd04'::uuid); -- Venture Undersuit Voyager
SELECT merge_game_items('4e0deba3-da49-4516-b84e-306d5b95bcfe'::uuid, 'c17f20e6-ef86-495f-8a76-a43ad98d43c5'::uuid); -- Vulture Longhorn
SELECT merge_game_items('dce21ce5-dc69-4a43-b41d-a8bc0a689d3b'::uuid, 'e0c0bd2c-5c7b-4be9-a9f9-df9505f549ce'::uuid); -- Microid Arms
SELECT merge_game_items('dd641b88-9dc4-4565-96d2-b0d3c2702abc'::uuid, '0e5fb9e1-79f3-4430-b56f-732b9f072003'::uuid); -- Pembroke Helmet
SELECT merge_game_items('a20f97d9-b418-4512-8611-0a147024ff5d'::uuid, 'cb3d7b19-6221-4595-ae27-eb51e3cd0383'::uuid); -- Geoffrey Jacket
SELECT merge_game_items('3ee68837-2cba-402d-8ff4-0f370f518b34'::uuid, '0455f052-8ea4-4b66-be4b-ee78bbafc431'::uuid); -- P8-SC Warhawk
SELECT merge_game_items('0ee555d1-0683-4f72-935b-93e93a42bfb8'::uuid, '8cf63537-c2bf-4a24-aa53-8e5902a34b68'::uuid); -- FSK-8 Mirage
SELECT merge_game_items('e1fb31c6-8cef-450f-b724-7570c1066281'::uuid, '230e3312-47f4-44ad-bb9e-ac3e0a926163'::uuid); -- FSK-8 Ghost
SELECT merge_game_items('002dfe9f-5a98-4391-97e1-6244ee10925c'::uuid, '69eb57fd-376f-4e66-b569-a51f93a14cd9'::uuid); -- Hellion Scattergun
SELECT merge_game_items('c373a1eb-60da-42b1-96ab-177f22168834'::uuid, '80c6e1c3-668a-415a-92e5-951399a1ea51'::uuid); -- DustUp Core
SELECT merge_game_items('ccc58f8e-ba82-4790-865a-56fe5de8858c'::uuid, '2efac2b1-1258-4889-a7b5-1ded571fb7ee'::uuid); -- Arrowhead Voyager
SELECT merge_game_items('6f247c27-5744-4dc9-8873-94d01b091ef3'::uuid, '46bfe5be-3e4c-44c5-9d39-ce904958fec8'::uuid); -- P8-SC Nightstalker
SELECT merge_game_items('ae3d929b-c2a7-4c62-910a-eeae083a2c17'::uuid, 'c78d8825-fba1-4415-a253-2cd4c884ede6'::uuid); -- Inquisitor Core
SELECT merge_game_items('22a6406e-42d1-4577-9fd3-1757fbf796c4'::uuid, '13cfe6e3-9843-4bec-ae0d-dc321a76c287'::uuid); -- Torreto Pants
SELECT merge_game_items('f7b9ad89-e6e5-4f4a-9b6e-12c757a435f8'::uuid, '15f72479-afb0-4de1-a466-25f66705a231'::uuid); -- FSK-8 Bloodline
SELECT merge_game_items('2ffad804-7a11-4014-b0ba-e0661a2c2b23'::uuid, '63cc19a2-6083-4c7c-a2dc-8ac7a9064588'::uuid); -- P8-SC Midnight
SELECT merge_game_items('1d2d7556-9647-4188-aa78-cc59255e3a94'::uuid, 'dfa81ae7-dfde-48c9-83fb-2d5c84821aa4'::uuid); -- MVSA Cannon
SELECT merge_game_items('b8ef4309-0e07-4e94-b2be-e884cb87f841'::uuid, '9086f544-17a8-48c7-9a30-bb8a1c1107cc'::uuid); -- Venture Undersuit Pathfinder
SELECT merge_game_items('67c6e102-8330-4073-a90a-2d2e50edad3c'::uuid, '7bd17705-fff0-46be-b634-84312700d54d'::uuid); -- Pyro RYT Mirage
SELECT merge_game_items('d5effdbe-6882-4edb-9721-095c346b7113'::uuid, '192c85f6-8853-40b9-aab8-ab6621513101'::uuid); -- MSD-212
SELECT merge_game_items('af81c32a-ff68-4a44-a7db-884d757a228b'::uuid, '0efb41a1-25aa-474b-b66e-be5d02e5b9c3'::uuid); -- Arrowhead Pathfinder
SELECT merge_game_items('7bee687e-113e-4e69-9afd-14eedabe9c37'::uuid, 'bcc1195d-2bc1-401a-b8de-9b5ef8655e2a'::uuid); -- Microid Core
SELECT merge_game_items('df6af42b-a1e8-44f7-b7e0-608bc3bc1b66'::uuid, '9e37f53b-17f4-496b-8c10-15cb44340313'::uuid); -- Microid Helmet
SELECT merge_game_items('416f8f7a-73c8-4777-ab22-01ea62df107c'::uuid, 'd86290e1-7e24-4418-b575-7ac7eb51ee4b'::uuid); -- Luminalia Stick
SELECT merge_game_items('40afe0df-8d4c-4161-9563-557e6abe7c61'::uuid, '82987a08-97ec-4f74-8093-e0d63513c7b3'::uuid); -- Pyro RYT Ghost
SELECT merge_game_items('5a8bd1ab-32c0-430e-9752-3f48170b2b4e'::uuid, '2e968292-e8ca-4c6e-a026-69ca35935301'::uuid); -- LH86 Voyager
SELECT merge_game_items('3a5b0270-266b-49ff-986f-b6ed7fe587dd'::uuid, '726cf320-1961-4ecf-a345-0cd37e5804c6'::uuid); -- Inquisitor Full Set
SELECT merge_game_items('c5e71057-3788-4622-88e3-7f0c4eb9803d'::uuid, '4e3da8af-9f05-4c4f-a2f4-f81d6b4aacb9'::uuid); -- Microid Full Set

-- 4. Armor name order variations - keep CStone version (has UUID)
SELECT merge_game_items('66d0bbab-18ee-48e7-9016-956200609f09'::uuid, 'd9ef0f2d-a374-423a-9ef2-a3d6e93b08e3'::uuid); -- DCP Core Clawed Steel
SELECT merge_game_items('f9a8cec4-a41b-4a98-933e-cc751562ea29'::uuid, '093586f6-586f-40ea-a4d9-dd66a5b613ef'::uuid); -- DCP Arms New Dawn
SELECT merge_game_items('32b0724e-b1ac-42ac-a390-cd88d68a797c'::uuid, '4d70d02c-ba04-4756-b703-f502f543be2e'::uuid); -- DCP Arms Clawed Steel
SELECT merge_game_items('85e7e763-5aab-4f5f-b100-cbb062de948d'::uuid, '71dff091-a8eb-419b-80d9-2f283abb55b6'::uuid); -- DCP Legs Clawed Steel
SELECT merge_game_items('e6fd12c0-d0c0-4ded-bbe3-cbf49fe0ae5e'::uuid, '7ba591b1-a081-4802-9f86-1c592460e4eb'::uuid); -- DCP Helmet Clawed Steel
SELECT merge_game_items('1cd2b6cb-2819-41dc-8b09-280f31185036'::uuid, 'f3cd9a6c-48c8-4946-bdde-e766c1e5c5f3'::uuid); -- DCP Core New Dawn
SELECT merge_game_items('191c1ba3-39fe-4c08-8a1d-64219e9e8c26'::uuid, '4b8c531e-cc1c-42c2-8636-b8fe2d861d32'::uuid); -- DCP Helmet New Dawn
SELECT merge_game_items('6cbecd14-bb0a-4fe7-918c-e8ce1fc7e558'::uuid, '94a2f7df-92f8-44b5-9865-69de901d5778'::uuid); -- DCP Legs New Dawn
SELECT merge_game_items('eb9b59d7-2353-433f-97e1-bc7fd447fdc8'::uuid, '0e584a3d-1d88-4874-b389-fe088a5dd132'::uuid); -- Venture Helmet Executive
SELECT merge_game_items('4baddc7f-ecb1-4655-bf7a-2709570e3807'::uuid, '3be9bf05-3673-49d4-b102-e1a6753ed5d0'::uuid); -- Venture Legs Executive
SELECT merge_game_items('3fd0a7e5-e18c-45c1-9138-aad7b83aa80c'::uuid, 'c95301ea-e7bf-47f4-9b5a-0ad0d832bcda'::uuid); -- Venture Arms Executive
SELECT merge_game_items('86d455d5-6128-4349-9c16-2d689d8d4cd9'::uuid, '16ec4d48-9b1d-478a-be16-8d36bdaeaf4d'::uuid); -- Venture Core Executive
SELECT merge_game_items('230e2fbf-c4ab-44d7-81ef-35dbf1501c07'::uuid, '93b52ad5-de83-4513-8b00-c40d168c9e50'::uuid); -- ADP-mk4 Legs Red Alert
SELECT merge_game_items('effda51a-3c36-405c-b8c3-9e66084b95dd'::uuid, 'c054252e-e100-4b01-8ec0-819c53303581'::uuid); -- ADP-mk4 Arms Red Alert
SELECT merge_game_items('b5f52c4e-feb2-42a7-a88b-2d0dc9ed1f50'::uuid, '6ab2b2ba-b591-4945-a292-d7b9130a228a'::uuid); -- Aril Legs Red Alert
SELECT merge_game_items('cd3d96fa-501b-48af-a8e0-1082e95b1a74'::uuid, '9e52f845-7b50-4e2c-9182-614679f065ec'::uuid); -- Aril Arms Red Alert
SELECT merge_game_items('68284e83-8cd6-4e20-bac9-0d9ce96a0b00'::uuid, '4ffdda8a-1747-4b0a-ab22-5626dd086053'::uuid); -- Morozov-SH Arms Red Alert
SELECT merge_game_items('f7f435e6-ba95-4819-9b35-ecb08e471353'::uuid, '6bd7765a-8b3b-4458-b49e-4a301954ae0b'::uuid); -- Morozov-SH Legs Red Alert
SELECT merge_game_items('f82a43b8-4f44-458a-9087-c26a21062da6'::uuid, 'd28528c3-f902-47b0-88b5-b79bc61d8102'::uuid); -- Morozov-SH Helmet Red Alert
SELECT merge_game_items('cb9652b3-b11d-4dec-92fe-5deb5fddb21e'::uuid, '5ecad13b-cbdb-4e30-95d5-4cab9a6e94ef'::uuid); -- Morozov-CH Backpack Red Alert
SELECT merge_game_items('921a9eb0-6f89-4025-bad4-7b96ac943ecc'::uuid, '98b9e2d8-8d32-47b5-9f24-61fb15124e68'::uuid); -- Aves Legs Talon
SELECT merge_game_items('f84ddbc4-3408-4477-9448-fa087e5c98d5'::uuid, 'eaadcdc3-6c12-40d2-b54b-e2a2af82fa15'::uuid); -- Aves Helmet Talon
SELECT merge_game_items('e6220e17-9337-414a-8407-8cc94e5391a4'::uuid, '8a5e2703-bb79-4eac-9ce1-6524736627ed'::uuid); -- Aves Arms Talon
SELECT merge_game_items('5d12f62c-690f-4243-aa77-80907d2f8bd9'::uuid, 'f22c03de-a3e4-4264-90b7-3fc80ea08adc'::uuid); -- Aves Core Talon
SELECT merge_game_items('b653feb1-72fc-46e4-a018-23b072ef6b95'::uuid, 'c955f002-48ae-4705-be3c-086cc8a29818'::uuid); -- Dust Devil Arms
SELECT merge_game_items('35fe1b8c-4820-4e24-95c9-414ef01f0017'::uuid, '991cda3a-ccc6-401a-abf5-0010177c5335'::uuid); -- Dust Devil Legs
SELECT merge_game_items('b98a2f5e-56b1-43a6-a6d5-420c78ff407c'::uuid, 'c9229ae1-6342-4360-b52a-6ffa8c2d8ed7'::uuid); -- Dust Devil Core
SELECT merge_game_items('5893eaa4-6e7a-47c8-8b75-ced0ad4433af'::uuid, 'af1b64d3-7476-4575-93d2-db81652bbda1'::uuid); -- Carinite (Pure)

-- Drop helper function
DROP FUNCTION merge_game_items(uuid, uuid);

COMMIT;
DELETE FROM game_items WHERE id = 'a59dcc1a-5152-4054-9a56-9b5669273b38'; -- Year Of The Monkey (no UUID)
DELETE FROM game_items WHERE id = 'c326beb6-169f-4f39-94c8-146076bd300a'; -- Year Of The Rooster (no UUID)
DELETE FROM game_items WHERE id = '078a063f-5b99-4b02-8abe-161cf058a312'; -- Year Of The Dog (no UUID)
DELETE FROM game_items WHERE id = 'ce1e72ac-1476-46ff-a605-43425d6d0a5d'; -- Year Of The Pig (no UUID)

-- 2. medical supplies - keep CStone version
DELETE FROM game_items WHERE id = '25373d38-9f6f-4ae1-b5f9-e2615922bfd8'; -- no UUID

-- 3. Trailing space duplicates - keep version without trailing space (usually has UUID)
-- Boreal Quasi Grazer Egg
UPDATE game_item_attributes SET game_item_id = '0023af85-eec8-4e2f-80b6-5e3c0d6c5e39' 
WHERE game_item_id = '89f8a0f4-0001-41c9-af61-ef2fdd44c4f3';
DELETE FROM game_items WHERE id = '89f8a0f4-0001-41c9-af61-ef2fdd44c4f3';

-- CitizenCon '54 Coin (double space)
DELETE FROM game_items WHERE id = '39e1a1fb-08d4-4270-a0ed-8799c1124d2c'; -- no UUID

-- DeconPen (Canoiodide) (double space)
UPDATE game_item_attributes SET game_item_id = '6ea3e248-e64b-45e7-b099-19e3d7f68be8'
WHERE game_item_id = 'd037f147-75d1-445b-b290-7683561979b6';
DELETE FROM game_items WHERE id = 'd037f147-75d1-445b-b290-7683561979b6';

-- DCHS-01 Executive Access Protocols Comp-Board (trailing space)
DELETE FROM game_items WHERE id = '3abf5b5b-3480-4c9b-b871-0ed33cf23f4c'; -- no UUID

-- Get Up Coffee (Milk) (double space)
UPDATE game_item_attributes SET game_item_id = '6311a0c6-d31c-4fbd-877e-fc3f05780824'
WHERE game_item_id = '410c0c9d-1fd6-4956-91bc-d29ddcca27fe';
DELETE FROM game_items WHERE id = '410c0c9d-1fd6-4956-91bc-d29ddcca27fe';

-- Tracer Laser Pointer Orange (trailing space)
UPDATE game_item_attributes SET game_item_id = 'c24188bc-cc49-4ff5-87eb-ebc083a30ca8'
WHERE game_item_id = 'b32f8f24-5f65-4531-8760-791872b72962';
DELETE FROM game_items WHERE id = 'b32f8f24-5f65-4531-8760-791872b72962';

-- Liberator (trailing space)
UPDATE game_item_attributes SET game_item_id = 'cf1aad44-8147-49ff-8c05-a81677eb2a03'
WHERE game_item_id = '064a0316-5bc8-46d8-a815-7a6ec285105b';
DELETE FROM game_items WHERE id = '064a0316-5bc8-46d8-a815-7a6ec285105b';

-- Pyro RYT "Bloodline" Multi-Tool (trailing space)
DELETE FROM game_items WHERE id = '4a73dc64-97f5-4f24-b082-d06f77c91701'; -- no UUID

-- Theta Pro (8x Telescopic) (trailing space)
UPDATE game_item_attributes SET game_item_id = '5cf3cc8d-5577-4846-93dc-83b7cdbd14a6'
WHERE game_item_id = '08bff8a9-8490-4ea8-87db-21858398d3f1';
DELETE FROM game_items WHERE id = '08bff8a9-8490-4ea8-87db-21858398d3f1';

-- Venture Undersuit Voyager (trailing space)
UPDATE game_item_attributes SET game_item_id = '6e9c503b-8873-4dee-bd02-b03935d4fd04'
WHERE game_item_id = '51231e43-5160-4e98-8d83-d4646a1b3f8e';
DELETE FROM game_items WHERE id = '51231e43-5160-4e98-8d83-d4646a1b3f8e';

-- Vulture Longhorn Livery (trailing space)
UPDATE game_item_attributes SET game_item_id = 'c17f20e6-ef86-495f-8a76-a43ad98d43c5'
WHERE game_item_id = '4e0deba3-da49-4516-b84e-306d5b95bcfe';
DELETE FROM game_items WHERE id = '4e0deba3-da49-4516-b84e-306d5b95bcfe';

-- Microid Battle Suit Arms Crucible (trailing space)
UPDATE game_item_attributes SET game_item_id = 'e0c0bd2c-5c7b-4be9-a9f9-df9505f549ce'
WHERE game_item_id = 'dce21ce5-dc69-4a43-b41d-a8bc0a689d3b';
DELETE FROM game_items WHERE id = 'dce21ce5-dc69-4a43-b41d-a8bc0a689d3b';

-- Pembroke Helmet RSI Graphite Edition (trailing space)
UPDATE game_item_attributes SET game_item_id = '0e5fb9e1-79f3-4430-b56f-732b9f072003'
WHERE game_item_id = 'dd641b88-9dc4-4565-96d2-b0d3c2702abc';
DELETE FROM game_items WHERE id = 'dd641b88-9dc4-4565-96d2-b0d3c2702abc';

-- Geoffrey Jacket (trailing space)
UPDATE game_item_attributes SET game_item_id = 'cb3d7b19-6221-4595-ae27-eb51e3cd0383'
WHERE game_item_id = 'a20f97d9-b418-4512-8611-0a147024ff5d';
DELETE FROM game_items WHERE id = 'a20f97d9-b418-4512-8611-0a147024ff5d';

-- P8-SC "Warhawk" SMG (exact duplicate)
DELETE FROM game_items WHERE id = '3ee68837-2cba-402d-8ff4-0f370f518b34'; -- no UUID

-- FSK-8 "Mirage" Combat Knife (trailing space)
DELETE FROM game_items WHERE id = '0ee555d1-0683-4f72-935b-93e93a42bfb8'; -- no UUID

-- FSK-8 "Ghost" Combat Knife (trailing space)
DELETE FROM game_items WHERE id = 'e1fb31c6-8cef-450f-b724-7570c1066281'; -- no UUID

-- Hellion Scattergun (exact duplicate)
UPDATE game_item_attributes SET game_item_id = '69eb57fd-376f-4e66-b569-a51f93a14cd9'
WHERE game_item_id = '002dfe9f-5a98-4391-97e1-6244ee10925c';
DELETE FROM game_items WHERE id = '002dfe9f-5a98-4391-97e1-6244ee10925c';

-- DustUp Core (trailing space)
DELETE FROM game_items WHERE id = 'c373a1eb-60da-42b1-96ab-177f22168834'; -- no UUID

-- Arrowhead "Voyager" Sniper Rifle (exact duplicate)
DELETE FROM game_items WHERE id = 'ccc58f8e-ba82-4790-865a-56fe5de8858c'; -- no UUID

-- P8-SC "Nightstalker" SMG (exact duplicate)
DELETE FROM game_items WHERE id = '6f247c27-5744-4dc9-8873-94d01b091ef3'; -- no UUID

-- Inquisitor Core Neon Pink (trailing space)
UPDATE game_item_attributes SET game_item_id = 'c78d8825-fba1-4415-a253-2cd4c884ede6'
WHERE game_item_id = 'ae3d929b-c2a7-4c62-910a-eeae083a2c17';
DELETE FROM game_items WHERE id = 'ae3d929b-c2a7-4c62-910a-eeae083a2c17';

-- Torreto Pants Emerald (trailing space)
DELETE FROM game_items WHERE id = '22a6406e-42d1-4577-9fd3-1757fbf796c4'; -- no UUID

-- FSK-8 "Bloodline" Combat Knife (trailing space)
DELETE FROM game_items WHERE id = 'f7b9ad89-e6e5-4f4a-9b6e-12c757a435f8'; -- no UUID

-- P8-SC "Midnight" SMG (exact duplicate)
DELETE FROM game_items WHERE id = '2ffad804-7a11-4014-b0ba-e0661a2c2b23'; -- no UUID

-- MVSA Cannon (trailing space)
UPDATE game_item_attributes SET game_item_id = 'dfa81ae7-dfde-48c9-83fb-2d5c84821aa4'
WHERE game_item_id = '1d2d7556-9647-4188-aa78-cc59255e3a94';
DELETE FROM game_items WHERE id = '1d2d7556-9647-4188-aa78-cc59255e3a94';

-- Venture Undersuit Pathfinder (trailing space)
UPDATE game_item_attributes SET game_item_id = '9086f544-17a8-48c7-9a30-bb8a1c1107cc'
WHERE game_item_id = 'b8ef4309-0e07-4e94-b2be-e884cb87f841';
DELETE FROM game_items WHERE id = 'b8ef4309-0e07-4e94-b2be-e884cb87f841';

-- Pyro RYT "Mirage" Multi-Tool (trailing space)
DELETE FROM game_items WHERE id = '67c6e102-8330-4073-a90a-2d2e50edad3c'; -- no UUID

-- MSD-212 Missile Rack (trailing space)
UPDATE game_item_attributes SET game_item_id = '192c85f6-8853-40b9-aab8-ab6621513101'
WHERE game_item_id = 'd5effdbe-6882-4edb-9721-095c346b7113';
DELETE FROM game_items WHERE id = 'd5effdbe-6882-4edb-9721-095c346b7113';

-- Arrowhead "Pathfinder" Sniper Rifle (exact duplicate)
DELETE FROM game_items WHERE id = 'af81c32a-ff68-4a44-a7db-884d757a228b'; -- no UUID

-- Microid Battle Suit Core Crucible (trailing space)
UPDATE game_item_attributes SET game_item_id = 'bcc1195d-2bc1-401a-b8de-9b5ef8655e2a'
WHERE game_item_id = '7bee687e-113e-4e69-9afd-14eedabe9c37';
DELETE FROM game_items WHERE id = '7bee687e-113e-4e69-9afd-14eedabe9c37';

-- Microid Battle Suit Helmet Crucible (trailing space)
UPDATE game_item_attributes SET game_item_id = '9e37f53b-17f4-496b-8c10-15cb44340313'
WHERE game_item_id = 'df6af42b-a1e8-44f7-b7e0-608bc3bc1b66';
DELETE FROM game_items WHERE id = 'df6af42b-a1e8-44f7-b7e0-608bc3bc1b66';

-- Luminalia Light Stick (trailing space)
UPDATE game_item_attributes SET game_item_id = 'd86290e1-7e24-4418-b575-7ac7eb51ee4b'
WHERE game_item_id = '416f8f7a-73c8-4777-ab22-01ea62df107c';
DELETE FROM game_items WHERE id = '416f8f7a-73c8-4777-ab22-01ea62df107c';

-- Pyro RYT "Ghost" Multi-Tool (trailing space)
DELETE FROM game_items WHERE id = '40afe0df-8d4c-4161-9563-557e6abe7c61'; -- no UUID

-- LH86 "Voyager" Pistol (exact duplicate)
DELETE FROM game_items WHERE id = '5a8bd1ab-32c0-430e-9752-3f48170b2b4e'; -- no UUID

-- Inquisitor Neon Pink - Full Set (double space)
DELETE FROM game_items WHERE id = '3a5b0270-266b-49ff-986f-b6ed7fe587dd'; -- no UUID

-- Microid Battle Suit Crucible - Full Set (double space)
DELETE FROM game_items WHERE id = 'c5e71057-3788-4622-88e3-7f0c4eb9803d'; -- no UUID

-- 4. Armor name order variations - keep CStone version (has UUID)
-- DCP Armor variations
DELETE FROM game_items WHERE id = '66d0bbab-18ee-48e7-9016-956200609f09'; -- DCP Armor Clawed Steel Core
DELETE FROM game_items WHERE id = 'f9a8cec4-a41b-4a98-933e-cc751562ea29'; -- DCP Armor New Dawn Arms
DELETE FROM game_items WHERE id = '32b0724e-b1ac-42ac-a390-cd88d68a797c'; -- DCP Armor Clawed Steel Arms
DELETE FROM game_items WHERE id = '85e7e763-5aab-4f5f-b100-cbb062de948d'; -- DCP Armor Clawed Steel Legs
DELETE FROM game_items WHERE id = 'e6fd12c0-d0c0-4ded-bbe3-cbf49fe0ae5e'; -- DCP Armor Clawed Steel Helmet
DELETE FROM game_items WHERE id = '1cd2b6cb-2819-41dc-8b09-280f31185036'; -- DCP Armor New Dawn Core
DELETE FROM game_items WHERE id = '191c1ba3-39fe-4c08-8a1d-64219e9e8c26'; -- DCP Armor New Dawn Helmet
DELETE FROM game_items WHERE id = '6cbecd14-bb0a-4fe7-918c-e8ce1fc7e558'; -- DCP Armor New Dawn Legs

-- Venture variations - keep CStone version
DELETE FROM game_items WHERE id = 'eb9b59d7-2353-433f-97e1-bc7fd447fdc8'; -- Venture Executive Helmet
DELETE FROM game_items WHERE id = '4baddc7f-ecb1-4655-bf7a-2709570e3807'; -- Venture Executive Legs
DELETE FROM game_items WHERE id = '3fd0a7e5-e18c-45c1-9138-aad7b83aa80c'; -- Venture Executive Arms
DELETE FROM game_items WHERE id = '86d455d5-6128-4349-9c16-2d689d8d4cd9'; -- Venture Executive Core

-- ADP-mk4 variations - keep CStone version
DELETE FROM game_items WHERE id = '230e2fbf-c4ab-44d7-81ef-35dbf1501c07'; -- ADP-mk4 Red Alert Legs
DELETE FROM game_items WHERE id = 'effda51a-3c36-405c-b8c3-9e66084b95dd'; -- ADP-mk4 Red Alert Arms

-- Aril variations - keep CStone version
DELETE FROM game_items WHERE id = 'b5f52c4e-feb2-42a7-a88b-2d0dc9ed1f50'; -- Aril Red Alert Legs
DELETE FROM game_items WHERE id = 'cd3d96fa-501b-48af-a8e0-1082e95b1a74'; -- Aril Red Alert Arms

-- Morozov-SH variations - keep CStone version
DELETE FROM game_items WHERE id = '68284e83-8cd6-4e20-bac9-0d9ce96a0b00'; -- Morozov-SH Red Alert Arms
DELETE FROM game_items WHERE id = 'f7f435e6-ba95-4819-9b35-ecb08e471353'; -- Morozov-SH Red Alert Legs
DELETE FROM game_items WHERE id = 'f82a43b8-4f44-458a-9087-c26a21062da6'; -- Morozov-SH Red Alert Helmet

-- Morozov-CH variations - keep CStone version
DELETE FROM game_items WHERE id = 'cb9652b3-b11d-4dec-92fe-5deb5fddb21e'; -- Morozov-CH Red Alert Backpack

-- Aves variations - keep CStone version
DELETE FROM game_items WHERE id = '921a9eb0-6f89-4025-bad4-7b96ac943ecc'; -- Aves Legs Talon
DELETE FROM game_items WHERE id = 'f84ddbc4-3408-4477-9448-fa087e5c98d5'; -- Aves Helmet Talon
DELETE FROM game_items WHERE id = 'e6220e17-9337-414a-8407-8cc94e5391a4'; -- Aves Arms Talon
DELETE FROM game_items WHERE id = '5d12f62c-690f-4243-aa77-80907d2f8bd9'; -- Aves Core Talon

-- Dust Devil variations - keep CStone version
DELETE FROM game_items WHERE id = 'b653feb1-72fc-46e4-a018-23b072ef6b95'; -- Dust Devil Arms
DELETE FROM game_items WHERE id = '35fe1b8c-4820-4e24-95c9-414ef01f0017'; -- Dust Devil Legs
DELETE FROM game_items WHERE id = 'b98a2f5e-56b1-43a6-a6d5-420c78ff407c'; -- Dust Devil Core

-- Carinite (Pure) - exact duplicate
DELETE FROM game_items WHERE id = '5893eaa4-6e7a-47c8-8b75-ced0ad4433af'; -- no CStone UUID

COMMIT;
