# Task 8.5: Blueprint Import Implementation

## Overview

Implemented blueprint data import functionality for the game data crafting system. This enables importing blueprint/crafting recipe information from extracted P4K game data files into the database with proper validation, type mapping, ingredient handling, and version linking.

## Implementation Summary

### Files Modified

1. **src/services/game-data/import.service.ts**
   - Added `P4KBlueprint` interface for blueprint data structure
   - Added blueprint-specific statistics to `ImportStats`
   - Implemented `importBlueprints()` method for blueprint import orchestration
   - Implemented `parseBlueprintData()` for parsing blueprint JSON (Subtask 8.5.1)
   - Implemented `validateBlueprintData()` for blueprint validation (Subtask 8.5.2)
   - Implemented `upsertBlueprint()` for database storage (Subtasks 8.5.3, 8.5.4, 8.5.5)
   - Integrated blueprint import into main `importGameData()` workflow

2. **src/services/game-data/import.service.test.ts**
   - Added comprehensive test suite with 15 new tests for blueprint import
   - Tests cover parsing, validation, type mapping, requirements, outputs, version linking, batch processing, and error handling
   - All 28 tests passing (13 mission tests + 15 blueprint tests)

## Features Implemented

### Subtask 8.5.1: Parse Blueprint Data from Extracted JSON

- Parses blueprint array from game-data.json
- Extracts blueprint properties:
  - ID, name, description (with localization key support)
  - Output item ID and quantity
  - Ingredient list with quantities and quality requirements
  - Category, subcategory, rarity, tier
  - Crafting station, time, skill requirements
  - Icon URL
- Supports both camelCase and snake_case field names for flexibility

### Subtask 8.5.2: Map Blueprint Types and Categories

- Stores blueprint categories and subcategories directly from extracted data
- Maps blueprint tier (1-5) for quality classification
- Maps rarity levels (Common, Uncommon, Rare, Epic, Legendary)
- Validates tier range (1-5)
- Validates ingredient quality ranges (1-5 for min and recommended quality)

### Subtask 8.5.3: Store Blueprint Metadata in Database

- Stores comprehensive blueprint information:
  - Blueprint identification (code, name, description)
  - Output item reference and quantity
  - Classification (category, subcategory, rarity, tier)
  - Crafting requirements (station, time, skill level)
  - Icon URL for UI display
  - Active status flag

### Subtask 8.5.4: Link Blueprints to Game Versions

- Associates each blueprint with a game version UUID
- Supports version-specific blueprint data
- Creates default LIVE version if none exists
- Enables multi-version blueprint tracking (LIVE, PTU, EPTU)
- Updates existing blueprints when re-importing for same version

### Subtask 8.5.5: Handle Blueprint Requirements and Outputs

- Links output items to game_items table via p4k_id or cstone_uuid
- Stores output quantity for recipes that produce multiple items
- Creates blueprint_ingredients records for each required material:
  - Links ingredient items to game_items table
  - Stores required quantity
  - Stores min_quality_tier and recommended_quality_tier
  - Maintains display order for UI presentation
- Handles missing ingredient items gracefully (logs warning, continues)
- Validates output item exists before creating blueprint

## Data Flow

```
game-data.json
  ↓
parseBlueprintData()
  ↓
validateBlueprintData()
  ↓
upsertBlueprint()
  ├─ Verify output item exists
  ├─ Insert/update blueprint record
  └─ Insert ingredient records
  ↓
Database (blueprints + blueprint_ingredients tables)
```

## Validation Rules

1. **Required Fields**:
   - Blueprint ID must be present
   - Blueprint name must be present
   - Output item ID must be present
   - At least one ingredient must be present

2. **Quantity Validation**:
   - Output quantity must be at least 1
   - Ingredient quantities must be at least 1

3. **Quality Validation**:
   - Min quality tier must be between 1 and 5 (if specified)
   - Recommended quality tier must be between 1 and 5 (if specified)

4. **Tier Validation**:
   - Blueprint tier must be between 1 and 5 (if specified)

5. **Item References**:
   - Output item must exist in game_items table
   - Missing ingredient items are logged but don't fail the import

## Database Operations

### Insert (New Blueprints)
- Creates new blueprint record
- Sets all metadata fields
- Links to game version
- Creates ingredient records
- Marks as active

### Update (Existing Blueprints)
- Updates blueprint by version_id + blueprint_code
- Refreshes all metadata
- Deletes old ingredient records
- Creates new ingredient records
- Preserves blueprint_id
- Updates timestamp

## Integration with Main Import

The blueprint import is integrated into the main `importGameData()` method:

1. Checks if blueprints array exists in game data
2. Gets or creates LIVE version for import
3. Calls `importBlueprints()` with version ID
4. Aggregates statistics into main import stats
5. Logs completion with blueprint-specific metrics

## Test Coverage

### Test Suites (15 tests, all passing)

1. **parseBlueprintData** (2 tests)
   - Valid blueprint data parsing with ingredients
   - Minimal data handling

2. **validateBlueprintData** (4 tests)
   - Rejection of blueprints without required fields
   - Rejection of blueprints without ingredients
   - Validation of ingredient quality ranges
   - Validation of tier range

3. **blueprint type mapping** (1 test)
   - Category and subcategory storage

4. **blueprint requirements and outputs** (2 tests)
   - Output item and quantity storage
   - Ingredient requirements with quality tiers

5. **version linking** (2 tests)
   - Correct version association
   - Update of existing blueprints

6. **batch processing** (1 test)
   - Multiple blueprint import (30 blueprints)

7. **error handling** (3 tests)
   - Continued processing after errors
   - Skipping blueprints with missing output items
   - Graceful handling of missing ingredient items

## Usage Example

```typescript
import { gameDataImportService } from './services/game-data/import.service.js'
import knex from './clients/database/knex-db.js'

// Load extracted game data
const gameData = JSON.parse(fs.readFileSync('game-data.json', 'utf-8'))

// Import blueprints for a specific version
const versionId = 'uuid-of-game-version'
const stats = await gameDataImportService.importBlueprints(
  knex,
  gameData,
  versionId
)

console.log(`Processed: ${stats.processed}`)
console.log(`Inserted: ${stats.inserted}`)
console.log(`Updated: ${stats.updated}`)
console.log(`Skipped: ${stats.skipped}`)
console.log(`Errors: ${stats.errors.length}`)
```

## Requirements Satisfied

- **Requirement 5.1**: Blueprint data extraction from game files ✓
- **Requirement 5.2**: Blueprint name and output item identification ✓
- **Requirement 5.3**: Ingredient requirements extraction ✓
- **Requirement 5.4**: Quality tier mapping ✓
- **Requirement 5.5**: Crafting station requirements ✓
- **Requirement 5.6**: Blueprint metadata storage ✓
- **Requirement 27.2**: Crafting recipe validation ✓
- **Requirement 27.3**: Quality calculation validation ✓
- **Requirement 27.4**: Reward probability validation (structure ready) ✓

## Data Structure

### P4KBlueprint Interface

```typescript
export interface P4KBlueprint {
  id: string
  name: string
  nameKey: string | null
  description: string | null
  descriptionKey: string | null
  outputItemId: string
  outputQuantity: number
  ingredients: Array<{
    itemId: string
    quantity: number
    minQuality?: number
    recommendedQuality?: number
  }>
  category: string | null
  subcategory: string | null
  rarity: string | null
  tier: number | null
  craftingStation: string | null
  craftingTime: number | null
  requiredSkill: number | null
  iconUrl: string | null
}
```

## Future Enhancements

1. **Crafting Recipe Formulas**: Parse and store quality calculation formulas
2. **Alternative Ingredients**: Support ingredient substitution groups
3. **Crafting Station Locations**: Link to starmap data for station locations
4. **Blueprint Rarity Calculation**: Compute rarity based on ingredient requirements
5. **Community Data**: Support user-submitted blueprint corrections
6. **Blueprint Chains**: Identify blueprints that require crafted components

## Performance Considerations

- Batch processing for multiple blueprints
- Transaction-based updates for data consistency
- Efficient upsert logic (check then insert/update)
- Ingredient deletion and recreation on update
- Error isolation prevents cascade failures
- Minimal database queries per blueprint

## Logging

The service provides detailed logging at multiple levels:

- **Info**: Import start/completion, blueprint counts
- **Warn**: Invalid blueprint data with reasons, missing ingredient items
- **Error**: Import failures with stack traces

All logs include structured metadata for debugging.

## Error Handling

- Invalid blueprints are skipped with error logging
- Processing continues for remaining blueprints
- Missing output items cause blueprint to be skipped
- Missing ingredient items are logged but don't fail the blueprint
- Detailed error messages for troubleshooting
- All errors collected in stats.errors array

## Conclusion

Task 8.5 successfully implements blueprint import functionality with comprehensive parsing, validation, type mapping, ingredient handling, and database storage. The implementation is well-tested, handles errors gracefully, and integrates seamlessly with the existing game data import workflow. This completes the foundation for the crafting system's blueprint discovery and recipe management features.
