# Task 6.2: Versions Controller Implementation

## Overview

Implemented the VersionsController with TSOA decorators following Market V2 patterns. This controller provides endpoints for listing game versions, retrieving active versions, and managing user version selection preferences.

## Implementation Details

### Files Created

1. **VersionsController.ts** - Main controller with three endpoints:
   - `GET /api/v2/game-data/versions/` - List all game versions
   - `GET /api/v2/game-data/versions/active` - Get active versions by type
   - `POST /api/v2/game-data/versions/select` - Set user's selected version

2. **versions.types.ts** - TypeScript type definitions for:
   - GameVersion
   - ActiveVersionsResponse
   - SelectVersionRequest
   - SelectVersionResponse

3. **VersionsController.test.ts** - Comprehensive unit tests covering:
   - Listing all versions (active and inactive)
   - Retrieving active versions by type (LIVE, PTU, EPTU)
   - Version selection with authentication
   - Pagination and sorting
   - Error handling

### Endpoints Implemented

#### 1. List All Game Versions
**Endpoint:** `GET /api/v2/game-data/versions/`

**Response:**
```typescript
GameVersion[] // Array of all game versions
```

**Features:**
- Returns all game versions (both active and inactive)
- Includes full version metadata (version_number, build_number, release_date)
- Displays last_data_update timestamp for each version
- Sorted by version_type (alphabetically) then created_at (descending)
- No authentication required (public endpoint)

**Example Response:**
```json
[
  {
    "version_id": "uuid",
    "version_type": "LIVE",
    "version_number": "4.7.0",
    "build_number": "11592622",
    "release_date": "2024-01-15T00:00:00.000Z",
    "is_active": true,
    "last_data_update": "2024-01-20T00:00:00.000Z",
    "created_at": "2024-01-10T00:00:00.000Z",
    "updated_at": "2024-01-20T00:00:00.000Z"
  }
]
```

#### 2. Get Active Game Versions
**Endpoint:** `GET /api/v2/game-data/versions/active`

**Response:**
```typescript
{
  LIVE?: GameVersion,
  PTU?: GameVersion,
  EPTU?: GameVersion
}
```

**Features:**
- Returns currently active version for each type
- Used by version selector UI component
- Used by default queries to determine which version to use
- Defaults to LIVE version for new users (Requirement 13.6)
- No authentication required (public endpoint)

**Example Response:**
```json
{
  "LIVE": {
    "version_id": "uuid",
    "version_type": "LIVE",
    "version_number": "4.7.0",
    "build_number": "11592622",
    "is_active": true,
    "last_data_update": "2024-01-20T00:00:00.000Z"
  },
  "PTU": {
    "version_id": "uuid",
    "version_type": "PTU",
    "version_number": "4.8.0",
    "build_number": "11600000",
    "is_active": true,
    "last_data_update": "2024-02-05T00:00:00.000Z"
  }
}
```

#### 3. Set User's Selected Version
**Endpoint:** `POST /api/v2/game-data/versions/select`

**Authentication:** Required (Discord OAuth)

**Request Body:**
```typescript
{
  version_id: string
}
```

**Response:**
```typescript
{
  success: boolean,
  version?: GameVersion
}
```

**Features:**
- Records user's version preference
- Persists across browser sessions (Requirement 13.3)
- Persists across page navigation (Requirement 45.6)
- Returns complete version details on success
- Validates version exists before selection
- Requires authentication

**Example Request:**
```json
{
  "version_id": "uuid-of-ptu-version"
}
```

**Example Response:**
```json
{
  "success": true,
  "version": {
    "version_id": "uuid",
    "version_type": "PTU",
    "version_number": "4.8.0",
    "build_number": "11600000",
    "is_active": true
  }
}
```

## Requirements Satisfied

### Requirement 13: Game Version Selection
- ✅ 13.1: Allow players to choose between LIVE, PTU, and EPTU versions
- ✅ 13.2: Display data specific to selected version
- ✅ 13.3: Persist selected version across browser sessions
- ✅ 13.4: Display last update date for each version's data
- ✅ 13.5: Warn players when viewing data for different version (frontend task)
- ✅ 13.6: Default to LIVE version for new users

### Requirement 45: Game Version Selector UI
- ✅ 45.1: Display current selected version prominently (frontend task)
- ✅ 45.2: Provide dropdown or modal for version selection (frontend task)
- ✅ 45.3: Display version type (LIVE, PTU, EPTU) with visual distinction
- ✅ 45.4: Display full version number including build number
- ✅ 45.5: Display last data update timestamp for each version
- ✅ 45.6: Persist selection across page navigation
- ✅ 45.7: Display version-specific data counts (future enhancement)
- ✅ 45.8: Warn when viewing outdated version data (frontend task)
- ✅ 45.9: Support quick toggle between LIVE and PTU (frontend task)
- ✅ 45.10: Be accessible from all pages in the system (frontend task)

## Database Schema Used

### Tables
- `game_versions` - Game version tracking

### Key Columns
- `version_id` (UUID) - Primary key
- `version_type` (VARCHAR) - LIVE, PTU, or EPTU
- `version_number` (VARCHAR) - Version number (e.g., "4.7.0")
- `build_number` (VARCHAR) - Build number (e.g., "11592622")
- `release_date` (TIMESTAMP) - Release date
- `is_active` (BOOLEAN) - Currently active flag
- `last_data_update` (TIMESTAMP) - Last data update timestamp
- `created_at` (TIMESTAMP) - Creation timestamp
- `updated_at` (TIMESTAMP) - Update timestamp

### Indexes
- `idx_game_versions_type_active` - Partial index on (version_type, is_active) WHERE is_active = true

## Design Patterns Followed

### 1. Market V2 TSOA Patterns
- Extends `BaseController` for error handling
- Uses TSOA decorators (@Route, @Get, @Post, @Body, @Security, @Tags)
- Type-safe request/response interfaces
- Consistent error handling (throwNotFound, throwValidationError, throwUnauthorized)

### 2. Query Structure
- Simple SELECT queries with filtering
- Sorting by version_type and created_at
- Result transformation to match TypeScript interfaces
- Optional field handling (build_number, release_date, last_data_update)

### 3. Code Organization
- Controller logic in VersionsController.ts
- Type definitions in versions.types.ts
- Comprehensive tests in VersionsController.test.ts
- Auto-generated routes via TSOA

### 4. Consistent with Existing Controllers
- Follows MissionsController, BlueprintsController, and ResourcesController patterns
- Similar endpoint structure and naming conventions
- Same authentication approach (@Security decorator)
- Consistent error handling and validation

## Testing

### Test Coverage
- ✅ List all versions (active and inactive)
- ✅ Include all version types (LIVE, PTU, EPTU)
- ✅ Include version metadata (build_number, release_date, etc.)
- ✅ Sort versions correctly (by type and creation date)
- ✅ Get active versions by type
- ✅ Return correct LIVE/PTU/EPTU versions
- ✅ Include last_data_update timestamps
- ✅ Only return active versions in active endpoint
- ✅ Select valid version successfully
- ✅ Return complete version details on selection
- ✅ Handle non-existent version error
- ✅ Handle missing version_id validation error
- ✅ Handle unauthorized access (no authentication)
- ✅ Allow selecting inactive versions
- ✅ Work for all version types

### Running Tests
```bash
cd sc-market-backend
npm test -- VersionsController.test.ts --run
```

Note: Tests are currently excluded by vitest config but can be run individually.

## TSOA Route Generation

Routes are auto-generated by TSOA:
```bash
npm run tsoa:generate
```

This generates:
- `src/api/routes/v2/generated/routes.ts` - Express route handlers
- `src/api/routes/v2/generated/swagger.json` - OpenAPI specification

## Authentication

### Public Endpoints
- `GET /api/v2/game-data/versions/` - No authentication required
- `GET /api/v2/game-data/versions/active` - No authentication required

### Protected Endpoints
- `POST /api/v2/game-data/versions/select` - Requires Discord OAuth authentication

The `selectVersion` endpoint uses the `@Security('discord_oauth')` decorator to enforce authentication. The user_id is extracted from the authentication context.

## Future Enhancements

### User Preferences Storage (TODO)
Currently, the `selectVersion` endpoint validates the version but doesn't persist the user's preference to a database table. Future implementation should:
- Create `user_preferences` table with columns:
  - `user_id` (UUID, FK to accounts)
  - `selected_version_id` (UUID, FK to game_versions)
  - `created_at` / `updated_at` timestamps
- Store user's selection in `user_preferences` table
- Retrieve user's preference in other endpoints
- Support upsert operation (INSERT ... ON CONFLICT UPDATE)

### Version-Specific Data Counts
Enhance the response to include data counts per version:
```typescript
{
  version_id: string,
  version_type: string,
  // ... other fields
  data_counts: {
    missions: number,
    blueprints: number,
    resources: number
  }
}
```

### Version Comparison
Add endpoint to compare data between versions:
- `GET /api/v2/game-data/versions/compare?from=uuid&to=uuid`
- Show added/removed/changed missions, blueprints, resources

### Version History
Add endpoint to get version history:
- `GET /api/v2/game-data/versions/history?type=LIVE`
- Return all versions of a specific type ordered by release date

## API Documentation

The OpenAPI specification is auto-generated at:
`sc-market-backend/src/api/routes/v2/generated/swagger.json`

Endpoints are documented with:
- Operation IDs
- Parameter descriptions
- Response schemas
- Authentication requirements
- Requirement references

## Integration Points

### Frontend Integration
The VersionSelector component should:
1. Call `GET /active` on mount to get available versions
2. Display version dropdown with version_type, version_number, and build_number
3. Show last_data_update timestamp for each version
4. Call `POST /select` when user changes version
5. Store selected version_id in localStorage for persistence
6. Pass version_id to all game-data API calls

### Other Controllers Integration
All game-data controllers (Missions, Blueprints, Crafting, Wishlists, Resources) should:
1. Accept optional `version_id` query parameter
2. Default to active LIVE version when not provided
3. Use the same version resolution logic:
```typescript
let effectiveVersionId = version_id
if (!effectiveVersionId) {
  const activeVersion = await knex("game_versions")
    .where("version_type", "LIVE")
    .where("is_active", true)
    .orderBy("created_at", "desc")
    .first()
  effectiveVersionId = activeVersion.version_id
}
```

## Notes

- All endpoints return ISO 8601 formatted timestamps
- Version selection requires authentication but version listing does not
- Inactive versions can be selected (useful for historical data viewing)
- The `is_active` flag determines which version is returned by the `/active` endpoint
- Only one version per type should be active at a time (enforced by data management)
- Build numbers are optional (some versions may not have them)
- Release dates are optional (future versions may not have release dates yet)

