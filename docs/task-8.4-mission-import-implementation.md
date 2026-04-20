# Task 8.4: Mission Import Implementation

## Overview

Implemented mission data import functionality for the game data crafting system. This enables importing mission information from extracted P4K game data files into the database with proper validation, type mapping, and version linking.

## Implementation Summary

### Files Modified

1. **src/services/game-data/import.service.ts**
   - Added `P4KMission` interface for mission data structure
   - Added mission-specific statistics to `ImportStats`
   - Implemented `importMissions()` method for mission import orchestration
   - Implemented `parseMissionData()` for parsing mission JSON (Subtask 8.4.1)
   - Implemented `validateMissionData()` for mission validation (Subtask 8.4.2)
   - Implemented `upsertMission()` for database storage (Subtasks 8.4.3, 8.4.4, 8.4.5)
   - Added mission type to category mapping
   - Integrated mission import into main `importGameData()` workflow

2. **src/services/game-data/import.service.test.ts** (New)
   - Created comprehensive test suite with 13 tests
   - Tests cover parsing, validation, type mapping, rewards, version linking, batch processing, and error handling
   - All tests passing

## Features Implemented

### Subtask 8.4.1: Parse Mission Data from Extracted JSON

- Parses mission array from game-data.json
- Extracts mission properties:
  - ID, name, title, description
  - Mission giver, type, location
  - Lawful status, rewards, sharing capability
  - Release status filtering

### Subtask 8.4.2: Map Mission Types and Categories

- Maps P4K mission types to database categories:
  - Combat → Combat
  - Delivery → Delivery
  - Bounty → Bounty Hunting
  - Investigation → Investigation
  - Mining → Mining
  - Salvage → Salvage
  - Rescue → Rescue
  - Transport → Transport
  - Escort → Escort
  - Assassination → Assassination
  - Patrol → Patrol
  - Recon → Reconnaissance
- Falls back to using mission type as category for unknown types
- Maps lawful boolean to legal_status enum (LEGAL, ILLEGAL, UNKNOWN)

### Subtask 8.4.3: Store Mission Metadata in Database

- Stores comprehensive mission information:
  - Mission identification (code, name, description)
  - Classification (category, type, legal status)
  - Organization and faction data
  - Credit rewards (min/max)
  - Sharing and availability flags
  - Data source and verification status

### Subtask 8.4.4: Link Missions to Game Versions

- Associates each mission with a game version UUID
- Supports version-specific mission data
- Creates default LIVE version if none exists
- Enables multi-version mission tracking (LIVE, PTU, EPTU)

### Subtask 8.4.5: Handle Mission Rewards and Requirements

- Stores credit reward ranges (min/max)
- Uses min reward as max if max not provided
- Stores mission giver organization
- Tracks sharing capability
- Preserves reward structure for future blueprint reward linking

## Data Flow

```
game-data.json
  ↓
parseMissionData()
  ↓
validateMissionData()
  ↓
upsertMission()
  ↓
Database (missions table)
```

## Validation Rules

1. **Required Fields**:
   - Mission ID must be present
   - Mission name must be present

2. **Release Status**:
   - Missions marked `notForRelease: true` are skipped

3. **Content Validation**:
   - Mission must have either title or description

4. **Error Handling**:
   - Invalid missions are skipped with error logging
   - Processing continues for remaining missions
   - Detailed error messages for troubleshooting

## Database Operations

### Insert (New Missions)
- Creates new mission record
- Sets all metadata fields
- Links to game version
- Marks as unverified extraction data

### Update (Existing Missions)
- Updates mission by version_id + mission_code
- Refreshes all metadata
- Preserves mission_id
- Updates timestamp

## Integration with Main Import

The mission import is integrated into the main `importGameData()` method:

1. Checks if missions array exists in game data
2. Gets or creates LIVE version for import
3. Calls `importMissions()` with version ID
4. Aggregates statistics into main import stats
5. Logs completion with mission-specific metrics

## Test Coverage

### Test Suites (13 tests, all passing)

1. **parseMissionData** (2 tests)
   - Valid mission data parsing
   - Minimal data handling

2. **validateMissionData** (2 tests)
   - Rejection of unreleased missions
   - Rejection of missions without ID/name

3. **mission type mapping** (2 tests)
   - Known type mapping
   - Unknown type fallback

4. **legal status mapping** (1 test)
   - Lawful flag to legal_status conversion

5. **mission rewards** (2 tests)
   - Credit reward storage
   - Min/max reward handling

6. **version linking** (2 tests)
   - Correct version association
   - Update of existing missions

7. **batch processing** (1 test)
   - Multiple mission import

8. **error handling** (1 test)
   - Continued processing after errors

## Usage Example

```typescript
import { gameDataImportService } from './services/game-data/import.service.js'
import knex from './clients/database/knex-db.js'

// Load extracted game data
const gameData = JSON.parse(fs.readFileSync('game-data.json', 'utf-8'))

// Import missions for a specific version
const versionId = 'uuid-of-game-version'
const stats = await gameDataImportService.importMissions(
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

- **Requirement 4.1**: Mission data extraction from game files ✓
- **Requirement 4.2**: Mission name, location, and reward identification ✓
- **Requirement 4.3**: Blueprint reward pool extraction (structure ready) ✓
- **Requirement 27.1**: Unique mission names per version ✓
- **Requirement 27.5**: Descriptive error messages for invalid data ✓
- **Requirement 27.6**: Validation failure logging ✓

## Future Enhancements

1. **Blueprint Reward Linking**: Parse and store mission blueprint rewards from reputation rewards data
2. **Location Parsing**: Extract and link mission locations from starmap data
3. **Mission Chain Detection**: Identify and link prerequisite missions
4. **Community Data**: Support user-submitted mission corrections
5. **Reputation Rewards**: Parse and store reputation reward details

## Performance Considerations

- Batch processing for multiple missions
- Transaction-based updates for data consistency
- Efficient upsert logic (check then insert/update)
- Minimal database queries per mission
- Error isolation prevents cascade failures

## Logging

The service provides detailed logging at multiple levels:

- **Info**: Import start/completion, mission counts
- **Warn**: Invalid mission data with reasons
- **Error**: Import failures with stack traces

All logs include structured metadata for debugging.

## Conclusion

Task 8.4 successfully implements mission import functionality with comprehensive parsing, validation, type mapping, and database storage. The implementation is well-tested, handles errors gracefully, and integrates seamlessly with the existing game data import workflow.
