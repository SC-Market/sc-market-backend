# Game Item Attribute Import Guide

This guide explains how to populate and manage game item attributes in the SC Market platform.

## Overview

The attribute system allows game items to have flexible key-value attributes (like component size, armor type, weapon class, manufacturer) that can be used for filtering in the marketplace.

## Database Structure

### Tables

1. **attribute_definitions** - Defines valid attributes and their UI presentation
   - `attribute_name`: Unique identifier (e.g., "size", "class", "manufacturer")
   - `display_name`: Human-readable name shown in UI
   - `attribute_type`: UI control type (select, multiselect, range, text)
   - `allowed_values`: Array of valid values for enum-type attributes
   - `applicable_item_types`: Which game item types this attribute applies to
   - `display_order`: Order in which to display in the UI

2. **game_item_attributes** - Stores actual attribute values for game items
   - `game_item_id`: Foreign key to game_items table
   - `attribute_name`: Name of the attribute
   - `attribute_value`: Value of the attribute
   - Primary key: (game_item_id, attribute_name)

## Initial Setup

### Step 1: Apply Database Migrations

Ensure the following migrations have been applied:

```bash
# Migration 43: Creates the attribute tables
psql -U scmarket -d scmarket -f config/postgres/43-game-item-attributes.sql

# Migration 44: Seeds initial attribute definitions
psql -U scmarket -d scmarket -f config/postgres/44-attribute-definitions-seed.sql
```

### Step 2: Verify Attribute Definitions

Check that attribute definitions were created:

```sql
SELECT attribute_name, display_name, attribute_type, applicable_item_types 
FROM attribute_definitions 
ORDER BY display_order;
```

You should see definitions for:
- **size** - Component size (0-12)
- **class** - Component class (Military, Stealth, Industrial, Civilian, Competition)
- **grade** - Component grade (A, B, C, D)
- **manufacturer** - Manufacturer name (free-form text)
- **armor_type** - Armor type (Light, Medium, Heavy)
- **color** - Color (free-form text)
- **weapon_type** - Weapon type (Ballistic, Laser, Energy, Missile, Melee, etc.)
- **weapon_category** - Weapon category (FPS, Ship, Vehicle)

## Importing Attributes

### Option 1: Bulk Import All Game Items (Recommended)

Import attributes for all existing game items from external sources:

```bash
npm run import-attributes
```

This script will:
1. Fetch all game items from the database
2. For each item, attempt to import attributes from:
   - finder.cstone.space
   - UEXCorp.space API
3. Upsert attributes into the database
4. Refresh the materialized view
5. Provide a detailed summary report

**Expected Duration:** Several minutes depending on the number of game items and API response times.

**Output:**
- Progress updates for each game item
- Success/failure counts
- Total attributes imported
- List of failed items with error details

### Option 2: Import Single Game Item

Use the API endpoint to import attributes for a specific game item:

```bash
POST /api/v1/attributes/import/:gameItemId
```

Example with curl:

```bash
curl -X POST http://localhost:3000/api/v1/attributes/import/6df2652a-b0ae-4c92-83cc-1b7609098986 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Option 3: Manual Attribute Entry

Use the API to manually add attributes:

```bash
PUT /api/v1/game-items/:id/attributes
Content-Type: application/json

{
  "attribute_name": "size",
  "attribute_value": "4"
}
```

## Refreshing the Materialized View

After importing attributes or making bulk changes, refresh the materialized view:

```bash
npm run refresh-view
```

This ensures that:
- Search results include the latest attribute data
- The `game_item_id` column is properly populated
- Attribute filters work correctly in the UI

**Note:** The import-attributes script automatically refreshes the view, so you typically only need to run this manually if you've made direct database changes.

## Verifying the Import

### Check Attribute Coverage

See how many game items have attributes:

```sql
SELECT 
  COUNT(DISTINCT game_item_id) as items_with_attributes,
  COUNT(*) as total_attributes,
  AVG(attr_count) as avg_attributes_per_item
FROM (
  SELECT game_item_id, COUNT(*) as attr_count
  FROM game_item_attributes
  GROUP BY game_item_id
) subquery;
```

### Check Attributes by Type

See which attributes are most common:

```sql
SELECT 
  attribute_name,
  COUNT(*) as count,
  COUNT(DISTINCT game_item_id) as unique_items
FROM game_item_attributes
GROUP BY attribute_name
ORDER BY count DESC;
```

### Check Specific Item Attributes

View attributes for a specific game item:

```sql
SELECT 
  gi.name as item_name,
  gi.item_type,
  gia.attribute_name,
  gia.attribute_value,
  ad.display_name
FROM game_item_attributes gia
JOIN game_items gi ON gia.game_item_id = gi.id
LEFT JOIN attribute_definitions ad ON gia.attribute_name = ad.attribute_name
WHERE gi.name ILIKE '%Frontline%'
ORDER BY ad.display_order;
```

### Verify Materialized View

Check that the materialized view has game_item_id populated:

```sql
SELECT 
  COUNT(*) as total_listings,
  COUNT(game_item_id) as listings_with_game_item_id,
  ROUND(COUNT(game_item_id)::numeric / COUNT(*)::numeric * 100, 2) as percentage
FROM market_search_materialized;
```

## Troubleshooting

### Import Failures

If the import script reports failures:

1. **Check the logs** - The script provides detailed error messages
2. **Verify external API access** - Ensure the server can reach finder.cstone.space and UEXCorp.space
3. **Check rate limiting** - The script includes delays, but external APIs may still rate limit
4. **Retry failed items** - Use the single-item import endpoint for specific failures

### Missing Attributes

If game items don't have expected attributes:

1. **Check if the item type is supported** - Not all item types have attributes in external sources
2. **Verify attribute definitions** - Ensure the attribute_name exists in attribute_definitions
3. **Check external data sources** - The item may not have data in cstone or UEXCorp
4. **Manual entry** - Use the API to manually add attributes if needed

### Materialized View Issues

If search results don't reflect attribute changes:

1. **Refresh the view** - Run `npm run refresh-view`
2. **Check view definition** - Ensure game_item_id is in the SELECT clause
3. **Verify indexes** - Check that the game_item_id index exists

## API Endpoints

### Attribute Definitions (Admin Only)

- `GET /api/v1/attributes/definitions` - List all attribute definitions
- `POST /api/v1/attributes/definitions` - Create new attribute definition
- `PUT /api/v1/attributes/definitions/:name` - Update attribute definition
- `DELETE /api/v1/attributes/definitions/:name` - Delete attribute definition

### Game Item Attributes

- `GET /api/v1/game-items/:id/attributes` - Get all attributes for a game item
- `PUT /api/v1/game-items/:id/attributes` - Upsert attribute (admin only)
- `DELETE /api/v1/game-items/:id/attributes/:name` - Delete attribute (admin only)

### Import

- `POST /api/v1/attributes/import/:gameItemId` - Import attributes for a game item (admin only)

## Best Practices

1. **Backup before bulk operations** - Create a database backup before running the import script
2. **Monitor import progress** - Watch the logs for errors and adjust as needed
3. **Refresh the view after changes** - Always refresh the materialized view after bulk updates
4. **Validate attribute values** - Use allowed_values in attribute_definitions to constrain values
5. **Document custom attributes** - If adding new attribute types, update the attribute_definitions table

## Next Steps

After populating attributes:

1. **Test search filters** - Verify that attribute filters work in the UI
2. **Monitor performance** - Check query performance with attribute filters
3. **Add more attributes** - Expand the attribute schema as needed
4. **Schedule regular imports** - Set up a cron job to periodically refresh attributes from external sources

## Support

For issues or questions:
- Check the logs in `logs/combined.log` and `logs/error.log`
- Review the import script source: `scripts/import-all-attributes.ts`
- Check the import service: `src/services/attribute-import/`
