# V1 Listing Types and Data Structure Audit Report

**Task:** 2.1 Research V1 listing types and data structure
**Date:** 2026-04-17T02:20:30.144Z
**Database:** scmarket @ 192.168.88.6

---


## UNIQUE LISTINGS AUDIT

### Query 1: -- PART 1: UNIQUE LISTINGS AUDIT

**Execution Time:** 417ms
**Row Count:** 2

| status | count | unique_user_sellers | unique_contractor_sellers |
| --- | --- | --- | --- |
| inactive | 23 | 1 | 2 |
| archived | 13 | 0 | 7 |


## Query 2: SELECT 

### Query 2: SELECT 

**Execution Time:** 30ms
**Row Count:** 10

| listing_id | sale_type | price | quantity_available | status | internal | user_seller_id | contractor_seller_id | timestamp | expiration | accept_offers | details_id | item_type | title | description | game_item_id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3f27de28-42bf-494a-98c4-42801df3d3e6 | sale | 5000 | 1 | archived | true | NULL | c97d9115-6d75-4e3f-b7f9-7b6c90829084 | "2025-11-13T16:00:32.249Z" | "2025-12-13T16:00:32.456Z" | false | fb70a04d-05e2-4549-9149-422d60ffe8fb | Jumpsuits | Test Archive Listing | Test listing for archive verification | NULL |
| 622706bf-5d46-4a1a-9064-dbc57f8dbc93 | sale | 5000 | 1 | archived | true | NULL | 2a722415-b15c-42b4-a30d-6ab309a20934 | "2025-11-13T16:00:51.904Z" | "2025-12-13T16:00:52.137Z" | false | a119fa32-c421-4a10-a910-52b2aa0627a8 | Other | Test Archive Listing | Test listing for archive verification | NULL |
| b4d02739-3d74-4a5a-9f39-27909bbb5f7e | sale | 1 | 2 | inactive | false | 7fe4e6a8-924b-44de-85b9-6aaea515c96a | NULL | "2025-08-01T22:49:03.236Z" | "2025-11-30T16:18:49.213Z" | false | 7f91b2e7-f78f-4037-ad2f-9eb2c1dc5df4 | Melee Weapon | Demon Fang Combat Knife | GENERAL

NAME
Demon Fang Combat Knife

MANUFACTURER
Apocalypse Arms

VOLUME
230 μSCU

STATS

SIZE
1 | 486b0d7f-ac8f-40bf-93a8-06ee233bbaeb |
| 7c3aceaa-9dda-4825-b22b-073b86d148da | sale | 1231 | 13232 | inactive | false | NULL | d95f4697-7431-4bfc-a28c-bf7d557ecb1c | "2025-08-10T13:55:03.016Z" | "2025-12-01T14:10:09.442Z" | false | 600fc24b-7e00-4963-8213-ea13241e20f8 | Flare | Test Image2 | asdaasdasddas222 | d86290e1-7e24-4418-b575-7ac7eb51ee4b |
| 56291d7c-a506-4468-b522-a06643241481 | sale | 123123 | 1350 | inactive | true | NULL | d95f4697-7431-4bfc-a28c-bf7d557ecb1c | "2025-08-10T15:17:38.820Z" | "2025-12-01T14:10:09.440Z" | false | f0e640e2-b1b8-4676-93af-3b02b9c6008c | Tractor Beam | Test Images | asdasd | 9e3cd25f-21e4-4726-a5e5-66398b0beafb |
| 85bbdee7-3626-4801-9c16-9dea79b5b8c2 | sale | 1 | 2 | inactive | false | NULL | d95f4697-7431-4bfc-a28c-bf7d557ecb1c | "2025-08-13T13:11:04.232Z" | "2025-12-01T14:10:09.442Z" | false | 22850fe5-7163-4e72-b8a6-cc2e1503ef89 | Flare | My Listing | dasd | 92f17acc-9456-4928-92cc-9d9986ff29c7 |
| d7f4f90a-23b1-4a3f-9e54-ba3d39f5d98e | sale | 2123 | 131 | inactive | false | NULL | d95f4697-7431-4bfc-a28c-bf7d557ecb1c | "2025-08-18T01:50:50.132Z" | "2025-12-01T14:10:09.442Z" | false | f94aca98-5054-40eb-862e-8d2fb8362f9f | Other | Test Listing Bad Imaged | asdasd | NULL |
| e4f4c57e-08a1-4ee7-b67b-a572d38ae9ef | sale | 123 | 1 | inactive | false | 7fe4e6a8-924b-44de-85b9-6aaea515c96a | NULL | "2025-10-01T12:41:37.447Z" | "2025-12-01T14:10:09.516Z" | false | 7872f1e2-4dec-45fa-9402-83d2aa6766b6 | Missile | Arrester III Missile | GENERAL

NAME
Arrester III Missile

MANUFACTURER
Aegis Dynamics

TYPE
CrossSection

VOLUME
46875 μSCU

STATS

SIZE
3

LOCK TIME
1 s

MINIMUM LOCK DISTANCE
1250 m

MAXIMUM LOCK DISTANCE
10000 m

MINIMUM TRACKING SIGNAL
10

SPEED
1330 m/s

DAMAGE
2526.42 dmg | 3c564efb-d18c-47e4-9cba-5f0727d6cd83 |
| 89cb6ebd-a431-4ca0-be85-70ebac4c233f | sale | 1 | 1 | inactive | false | 7fe4e6a8-924b-44de-85b9-6aaea515c96a | NULL | "2025-10-01T12:41:17.890Z" | "2025-12-01T14:10:09.516Z" | false | afff8c8d-fb60-48b5-b1f0-91646b7090e8 | Thrown Weapon | MK-4 Frag Grenade | GENERAL

NAME
MK-4 Frag Grenade

MANUFACTURER
Behring

VOLUME
900 μSCU

STATS

SIZE
1 | b7bfb702-77e6-46d9-b9dc-39a539891a17 |
| 58c71eac-fa58-4add-912c-547460b3a92e | sale | 0 | 1 | inactive | false | NULL | d95f4697-7431-4bfc-a28c-bf7d557ecb1c | "2025-10-03T12:53:32.882Z" | "2025-12-03T15:31:24.330Z" | false | cee349f9-28dc-4eff-9859-4aaf6fbb91fb | Mobiglass | asdasdasd | dsadasdsa | b05dbd56-062e-44d2-a318-ce5a5a97f078 |


## Query 3: SELECT 

### Query 3: SELECT 

**Execution Time:** 17ms
**Row Count:** 7

| edge_case | count |
| --- | --- |
| NULL user_seller_id AND contractor_seller_id | 0 |
| BOTH user_seller_id AND contractor_seller_id set | 0 |
| NULL details_id | 0 |
| Orphaned (no market_listing) | 0 |
| Zero or negative quantity | 1 |
| Zero or negative price | 5 |
| Expired but still active | 0 |


## Query 4: SELECT 

### Query 4: SELECT 

**Execution Time:** 12ms
**Row Count:** 1

| sale_type | count | min_price | max_price | avg_price |
| --- | --- | --- | --- | --- |
| sale | 36 | 0 | 123123 | 8847.8888888888888889 |


## AGGREGATE LISTINGS AUDIT

### Query 5: -- PART 2: AGGREGATE LISTINGS AUDIT

**Execution Time:** 21ms
**Row Count:** 0


*No results*



## Query 6: SELECT 

### Query 6: SELECT 

**Execution Time:** 10ms
**Row Count:** 0


*No results*



## Query 7: SELECT 

### Query 7: SELECT 

**Execution Time:** 7ms
**Row Count:** 7

| edge_case | count |
| --- | --- |
| NULL aggregate_id | 0 |
| Orphaned aggregate_listing (no market_listing) | 0 |
| Orphaned aggregate (no market_aggregate) | 0 |
| NULL wiki_id in aggregates | 0 |
| NULL details_id in aggregates | 0 |
| Zero or negative quantity | 0 |
| Zero or negative price | 0 |


## Query 8: SELECT 

### Query 8: SELECT 

**Execution Time:** 7ms
**Row Count:** 0


*No results*



## MULTIPLE LISTINGS AUDIT

### Query 9: -- PART 3: MULTIPLE LISTINGS AUDIT

**Execution Time:** 12ms
**Row Count:** 0


*No results*



## Query 10: SELECT 

### Query 10: SELECT 

**Execution Time:** 13ms
**Row Count:** 0


*No results*



## Query 11: SELECT 

### Query 11: SELECT 

**Execution Time:** 9ms
**Row Count:** 7

| edge_case | count |
| --- | --- |
| NULL multiple_id | 0 |
| NULL details_id in multiple_listings | 0 |
| Orphaned multiple_listing (no market_listing) | 0 |
| Orphaned multiple (no market_multiple) | 0 |
| NULL default_listing_id in multiples | 0 |
| Zero or negative quantity | 0 |
| Zero or negative price | 0 |


## Query 12: SELECT 

### Query 12: SELECT 

**Execution Time:** 7ms
**Row Count:** 0


*No results*



## OVERALL STATUS AND PRICING ANALYSIS

### Query 13: -- PART 4: OVERALL STATUS AND PRICING ANALYSIS

**Execution Time:** 7ms
**Row Count:** 2

| status | count |
| --- | --- |
| inactive | 23 |
| archived | 13 |


## Query 14: SELECT DISTINCT sale_type, COUNT(*) as count

### Query 14: SELECT DISTINCT sale_type, COUNT(*) as count

**Execution Time:** 9ms
**Row Count:** 1

| sale_type | count |
| --- | --- |
| sale | 36 |


## Query 15: SELECT 

### Query 15: SELECT 

**Execution Time:** 16ms
**Row Count:** 3

| listing_type | total_count | zero_price_count | min_price | max_price | avg_price | median_price |
| --- | --- | --- | --- | --- | --- | --- |
| Unique Listings | 36 | 5 | 0 | 123123 | 8847.8888888888888889 | 123 |
| Aggregate Listings | 0 | 0 | NULL | NULL | NULL | NULL |
| Multiple Listings | 0 | 0 | NULL | NULL | NULL | NULL |


## Query 16: SELECT 

### Query 16: SELECT 

**Execution Time:** 9ms
**Row Count:** 3

| listing_type | total_count | min_quantity | max_quantity | avg_quantity | median_quantity |
| --- | --- | --- | --- | --- | --- |
| Unique Listings | 36 | 0 | 13232 | 416.2777777777777778 | 1 |
| Aggregate Listings | 0 | NULL | NULL | NULL | NULL |
| Multiple Listings | 0 | NULL | NULL | NULL | NULL |


## LISTING TYPE DISTRIBUTION

### Query 17: -- PART 5: LISTING TYPE DISTRIBUTION

**Execution Time:** 12ms
**Row Count:** 4

| listing_type | count | percentage |
| --- | --- | --- |
| Unique Listings | 36 | 100.00 |
| Aggregate Listings | 0 | 0.00 |
| Multiple Listings | 0 | 0.00 |
| Unclassified (no type) | 0 | 0.00 |


## ITEM TYPE ANALYSIS

### Query 18: -- PART 6: ITEM TYPE ANALYSIS

**Execution Time:** 15ms
**Row Count:** 13

| item_type | count |
| --- | --- |
| Other | 7 |
| Thrown Weapon | 5 |
| Mobiglass | 4 |
| Tractor Beam | 3 |
| Flare | 3 |
| Ship for Sale/Rental | 3 |
| Container | 3 |
| Torso | 2 |
| Jumpsuits | 2 |
| Melee Weapon | 1 |
| Ranged Weapon | 1 |
| Missile | 1 |
| Mining Head | 1 |


## Query 19: SELECT 

### Query 19: SELECT 

**Execution Time:** 7ms
**Row Count:** 0


*No results*



## Query 20: SELECT 

### Query 20: SELECT 

**Execution Time:** 10ms
**Row Count:** 0


*No results*



---

## Summary

- **Total Queries Executed:** 20
- **Total Execution Time:** 647ms
- **Total Rows Retrieved:** 60
- **Errors:** 0