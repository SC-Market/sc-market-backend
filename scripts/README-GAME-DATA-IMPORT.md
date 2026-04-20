# Game Data Import Script

## Overview

The `import-game-data.ts` script imports Star Citizen game data extracted from P4K files into the database. It processes the `game-data.zip` or `game-data.json` file produced by `extract-game-data.ts` and updates the `game_items` table with authoritative P4K data.

## Features

- **Input Parsing**: Accepts both ZIP and JSON formats
- **Type Mapping**: Maps 62 P4K item types to database subcategories
- **Smart Matching**: Three-tier matching strategy:
  1. Exact name match (case-insensitive)
  2. CStone UUID match
  3. Fuzzy name match (Levenshtein distance ≤ 2)
- **Database Operations**:
  - UPDATE matched items with P4K metadata
  - INSERT new items not in database
  - Regenerate "Full Set" synthetic items from "Core" items
  - Rebuild full-text search indexes
- **Dry Run Support**: Preview changes without modifying database
- **Comprehensive Logging**: Detailed progress and summary reports

## Usage

### Basic Import

```bash
npm run import-game-data -- --file ./game-data-export/game-data.json
```

### Import from ZIP

```bash
npm run import-game-data -- --file ./game-data-export/game-data.zip
```

### Dry Run (Preview Only)

```bash
npm run import-game-data -- --file ./game-data-export/game-data.json --dry-run
```

## Prerequisites

1. **Extract Game Data First**: Run `extract-game-data.ts` to generate the input file
2. **Database Connection**: Ensure database environment variables are set:
   - `DATABASE_HOST`
   - `DATABASE_PORT`
   - `DATABASE_USER`
   - `DATABASE_PASS`
   - `DATABASE_TARGET`
3. **Migrations**: Run migrations to ensure P4K columns exist:
   ```bash
   npm run migrate:latest
   ```

## Process Flow

### Step 1: Load P4K Game Data
- Extracts ZIP if needed
- Loads JSON data
- Filters items with valid names (excludes placeholders)

### Step 2: Load Existing Database Items
- Queries all items from `game_items` table
- Builds lookup maps for efficient matching

### Step 3: Match P4K Items to Database Items
- **Exact Match**: Case-insensitive name comparison
- **CStone UUID Match**: Matches CStone UUIDs to P4K IDs
- **Fuzzy Match**: Levenshtein distance ≤ 2 for similar names
- Tracks name changes and new items

### Step 4: Execute Database Updates
- Updates matched items with P4K data in batches
- Inserts new items in batches
- All operations in a single transaction

### Step 5: Regenerate Full Set Items
- Finds all "Core" armor items
- Creates corresponding "Full Set" items
- Skips existing Full Sets

### Step 6: Rebuild Full-Text Search Index
- Rebuilds `idx_game_items_search_vector` index
- Ensures search functionality works with updated names

### Step 7: Final Summary
- Reports statistics:
  - Items processed
  - Matches (by type)
  - Updates and inserts
  - Name changes
  - Full Sets created
  - Errors encountered

## P4K Type Mapping

The script maps 62 P4K item types to database subcategories. Examples:

| P4K Type | Database Subcategory |
|----------|---------------------|
| `Char_Armor_Helmet` | Helmet |
| `WeaponPersonal` | Ranged Weapon |
| `WeaponGun` | Ship Weapon |
| `PowerPlant` | Power Plant |
| `QuantumDrive` | Quantum Drive |
| `Char_Clothing_Torso_1` | Jackets |

See `P4K_TYPE_MAP` in the script for the complete mapping.

## Database Schema

The script updates the following columns in `game_items`:

### P4K Columns (added by migration `20260420010000_add_p4k_columns_to_game_items.ts`)
- `p4k_id` (UUID): Authoritative P4K record ID
- `p4k_file` (VARCHAR): Entity filename
- `item_type` (VARCHAR): P4K type (e.g., WeaponPersonal)
- `sub_type` (VARCHAR): P4K subtype
- `size` (INT): Item size class
- `grade` (INT): Item grade
- `manufacturer` (VARCHAR): Manufacturer code
- `display_type` (VARCHAR): Resolved display type
- `thumbnail_path` (VARCHAR): P4K texture/SVG path
- `name_key` (VARCHAR): Raw localization key

### Updated Columns
- `name`: Updated to authoritative localized name
- `type`: Mapped to database subcategory

### Preserved Columns
- `id`: Primary key (unchanged, preserves FK references)
- `image_url`: CStone images (preserved)
- `cstone_uuid`: CStone UUID (preserved)
- `uex_uuid`: UEX UUID (preserved)
- `details_id`: Details reference (preserved)

## Output Example

```
================================================================================
P4K Game Data Import
================================================================================
Configuration { dryRun: false, file: './game-data-export/game-data.json' }

================================================================================
STEP 1: Loading P4K Game Data
================================================================================
Loaded 3847 items from P4K data
Extracted at: 2024-01-15T10:30:00.000Z
Localization keys: 45231
3621 items with usable names (226 filtered out)

================================================================================
STEP 2: Loading Existing Database Items
================================================================================
9206 existing items in database
Built lookup maps: 9206 by name, 6985 by CStone UUID, 0 by P4K ID

================================================================================
STEP 3: Matching P4K Items to Database Items
================================================================================
Matching strategy: 1) Exact name → 2) CStone UUID → 3) Fuzzy name

Matching Results:
  Total matched: 3245
    - Exact name: 3180
    - CStone UUID: 52
    - Fuzzy: 13
  New items to insert: 376
  Name changes: 87

================================================================================
STEP 4: Updating Database
================================================================================
Updating 3245 matched items...
✓ Updated 3245 items
Inserting 376 new items...
✓ Inserted 376 new items

================================================================================
STEP 5: Regenerating Full Set Items
================================================================================
Found 861 Core items
✓ Created 23 Full Set items from 861 Core items

================================================================================
STEP 6: Rebuilding Full-Text Search Index
================================================================================
✓ Search index rebuilt successfully

================================================================================
IMPORT COMPLETE
================================================================================
Summary:
  P4K Items Processed: 3621
  Existing DB Items: 9206
  Matched: 3245 (exact: 3180, cstone: 52, fuzzy: 13)
  Updated: 3245
  Inserted: 376
  Name Changes: 87
  Full Sets Created: 23
  Errors: 0

✓ Import completed successfully
```

## Error Handling

The script includes comprehensive error handling:

- **File Not Found**: Validates input file exists
- **Invalid JSON**: Catches JSON parse errors
- **Database Errors**: Wraps operations in transaction (rollback on failure)
- **Index Rebuild**: Gracefully handles missing search index
- **Batch Processing**: Processes updates/inserts in batches to avoid memory issues

## Troubleshooting

### "File not found" Error
Ensure the file path is correct and the file exists:
```bash
ls -la ./game-data-export/game-data.json
```

### Database Connection Error
Check environment variables:
```bash
echo $DATABASE_HOST
echo $DATABASE_USER
```

### "Column does not exist" Error
Run migrations to add P4K columns:
```bash
npm run migrate:latest
```

### Search Index Rebuild Failed
The index might not exist yet. This is non-fatal and can be ignored for initial imports.

## Related Scripts

- **extract-game-data.ts**: Extracts data from P4K files (prerequisite)
- **import-items-from-cstone.ts**: Legacy CStone import (deprecated)
- **import-items-from-uex.ts**: Legacy UEX import (deprecated)

## Reference

- **Plan Document**: `docs/p4k-import-plan.md`
- **Migration**: `migrations/20260420010000_add_p4k_columns_to_game_items.ts`
- **Spec**: `.kiro/specs/sc-game-data-crafting-system/`

## Notes

- The script is idempotent: running it multiple times is safe
- Dry run mode is recommended before first import
- Full Sets are synthetic items created for the marketplace
- Name changes are logged for review
- The script preserves all existing FK references by updating in place
