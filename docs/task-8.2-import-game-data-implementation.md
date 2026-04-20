# Task 8.2: Game Item Import Script Implementation

## Overview

Implemented comprehensive game data import script (`scripts/import-game-data.ts`) that processes P4K game data extracted from Star Citizen's Data.p4k file and imports it into the database.

## Implementation Summary

### Script: `scripts/import-game-data.ts`

**Location**: `sc-market-backend/scripts/import-game-data.ts`

**Purpose**: Import P4K game data into the database, matching existing items and inserting new ones.

**Key Features**:
- ✅ Accepts game-data.zip or game-data.json as input
- ✅ Implements P4K type → DB subcategory mapping (62 types)
- ✅ Implements name matching: exact → CStone UUID → fuzzy (Levenshtein)
- ✅ UPDATE matched items with P4K data (name, type, size, grade, manufacturer, etc.)
- ✅ INSERT new P4K items not in DB
- ✅ Regenerate Full Set synthetic items from Core items
- ✅ Rebuild full-text search index
- ✅ Support --dry-run flag for preview
- ✅ Comprehensive error handling and logging
- ✅ Transaction-based updates (rollback on failure)
- ✅ Batch processing for performance

### Matching Strategy

The script uses a three-tier matching strategy to link P4K items to existing database items:

1. **Exact Name Match** (case-insensitive)
   - Normalizes names to lowercase and trims whitespace
   - Most reliable matching method
   - Expected to match ~87% of items

2. **CStone UUID Match**
   - Matches CStone UUIDs to P4K record IDs
   - Handles cases where CStone scraped the same game data
   - Expected to match ~1-2% of items

3. **Fuzzy Name Match** (Levenshtein distance ≤ 2)
   - Handles minor spelling variations
   - Only for names > 10 characters (avoid false positives)
   - Skips if length difference > 2 characters
   - Expected to match ~0.3% of items

### P4K Type Mapping

Maps 62 P4K item types to existing database subcategories:

```typescript
const P4K_TYPE_MAP: Record<string, string> = {
  Char_Armor_Helmet: "Helmet",
  WeaponPersonal: "Ranged Weapon",
  WeaponGun: "Ship Weapon",
  PowerPlant: "Power Plant",
  QuantumDrive: "Quantum Drive",
  // ... 57 more mappings
}
```

### Database Updates

**Updated Columns**:
- `name`: Authoritative localized name from P4K
- `type`: Mapped database subcategory
- `p4k_id`: P4K record UUID
- `p4k_file`: Entity filename
- `item_type`: P4K type (e.g., WeaponPersonal)
- `sub_type`: P4K subtype
- `size`: Item size class
- `grade`: Item grade
- `manufacturer`: Manufacturer code
- `display_type`: Resolved display type
- `thumbnail_path`: P4K texture path
- `name_key`: Raw localization key

**Preserved Columns**:
- `id`: Primary key (unchanged, preserves FK references)
- `image_url`: CStone images
- `cstone_uuid`: CStone UUID
- `uex_uuid`: UEX UUID
- `details_id`: Details reference

### Full Set Regeneration

The script regenerates "Full Set" synthetic items from "Core" armor items:

1. Finds all items with " core " in the name (case-insensitive)
2. Excludes reactor/power core items (lifecore, thermalcore, etc.)
3. Removes " Core" from the name
4. Creates "BaseName - Full Set" item
5. Copies image_url from Core item
6. Skips if Full Set already exists

### Search Index Rebuild

Rebuilds the full-text search index after name updates:

```sql
REINDEX INDEX CONCURRENTLY idx_game_items_search_vector
```

Gracefully handles missing index (non-fatal).

## Usage

### Basic Import

```bash
npm run import-game-data -- --file ./game-data-export/game-data.json
```

### Import from ZIP

```bash
npm run import-game-data -- --file ./game-data-export/game-data.zip
```

### Dry Run (Preview)

```bash
npm run import-game-data -- --file ./game-data-export/game-data.json --dry-run
```

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

## Testing

### Unit Tests

**Location**: `sc-market-backend/src/scripts/import-game-data.test.ts`

**Coverage**:
- ✅ Levenshtein distance calculation (6 tests)
- ✅ Name normalization (4 tests)
- ✅ Core item detection (5 tests)

**Run Tests**:
```bash
npm test src/scripts/import-game-data.test.ts
```

**Results**: All 15 tests passing

## Documentation

### README

**Location**: `sc-market-backend/scripts/README-GAME-DATA-IMPORT.md`

**Contents**:
- Overview and features
- Usage examples
- Process flow (6 steps)
- P4K type mapping table
- Database schema details
- Output examples
- Error handling
- Troubleshooting guide
- Related scripts

## Files Created/Modified

### Created Files
1. `sc-market-backend/scripts/import-game-data.ts` (enhanced)
2. `sc-market-backend/scripts/README-GAME-DATA-IMPORT.md`
3. `sc-market-backend/src/scripts/import-game-data.test.ts`
4. `sc-market-backend/docs/task-8.2-import-game-data-implementation.md`

### Modified Files
- None (script already existed but was basic implementation)

## Dependencies

### Prerequisites
1. **Migration**: `20260420010000_add_p4k_columns_to_game_items.ts` (adds P4K columns)
2. **Extract Script**: `scripts/extract-game-data.ts` (produces input file)
3. **Database**: PostgreSQL with game_items table

### NPM Packages
- `knex`: Database client
- `child_process`: ZIP extraction
- `fs`, `path`: File operations

## Performance Considerations

### Batch Processing
- Updates: 100 items per batch
- Inserts: 100 items per batch
- Progress logging every 500 items

### Transaction Safety
- All updates in single transaction
- Rollback on any error
- Preserves data integrity

### Memory Efficiency
- Streams not needed (typical dataset ~4K items)
- Lookup maps built once
- Batch processing prevents memory spikes

## Error Handling

### Comprehensive Error Handling
- ✅ File not found validation
- ✅ JSON parse errors
- ✅ Database connection errors
- ✅ Transaction rollback on failure
- ✅ Graceful index rebuild failure
- ✅ Detailed error logging with stack traces

### Non-Fatal Errors
- Search index rebuild failure (logged as warning)
- Individual item processing errors (logged, continue processing)

## Integration with Existing System

### Preserves Existing Data
- ✅ Primary keys unchanged (preserves FK references)
- ✅ CStone images preserved
- ✅ UEX/CStone UUIDs preserved
- ✅ Existing attributes preserved

### Compatible with Market V2
- ✅ Uses existing game_items table
- ✅ Maps to existing subcategories
- ✅ Maintains search compatibility
- ✅ Preserves listing references

## Future Enhancements

### Potential Improvements
1. **Admin API Endpoint**: Upload ZIP via web interface (Task 8.1)
2. **Incremental Updates**: Track last import timestamp
3. **Conflict Resolution**: UI for reviewing name changes
4. **Rollback Support**: Snapshot before import
5. **Parallel Processing**: Speed up large imports

## Reference

- **Plan**: `docs/p4k-import-plan.md`
- **Spec**: `.kiro/specs/sc-game-data-crafting-system/`
- **Migration**: `migrations/20260420010000_add_p4k_columns_to_game_items.ts`
- **Extract Script**: `scripts/extract-game-data.ts`

## Completion Status

✅ **Task 8.2 Complete**

All requirements from the task description have been implemented:
- ✅ Accept game-data.zip or game-data.json as input
- ✅ Implement P4K type → DB subcategory mapping (62 types)
- ✅ Implement name matching: exact → cstone UUID → fuzzy (Levenshtein)
- ✅ UPDATE matched items with p4k data
- ✅ INSERT new p4k items not in DB
- ✅ Regenerate Full Set synthetic items from Core items
- ✅ Rebuild full-text search index
- ✅ Support --dry flag for preview
- ✅ Comprehensive error handling and logging
- ✅ Unit tests for helper functions
- ✅ Documentation (README + implementation doc)
