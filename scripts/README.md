# Database Backup and Restore Scripts

## Backup Script

The `backup-database.sh` script creates a compressed backup of the PostgreSQL database.

### Usage

```bash
./scripts/backup-database.sh
```

This will:

- Check if the PostgreSQL container is running
- Create a timestamped backup in `./backups/`
- Compress the backup using gzip
- Display the backup location and size

### Backup Location

Backups are stored in `./backups/` with the format:

```
scmarket_backup_YYYYMMDD_HHMMSS.sql.gz
```

## Restore Script

The `restore-database.sh` script restores the database from a backup file.

### Usage

```bash
./scripts/restore-database.sh <backup_file.sql.gz>
```

Example:

```bash
./scripts/restore-database.sh ./backups/scmarket_backup_20240101_120000.sql.gz
```

**WARNING**: This will replace all data in the database. You will be prompted to confirm before proceeding.

## Before Running Migrations

It's recommended to create a backup before running any database migrations:

```bash
# 1. Create a backup
./scripts/backup-database.sh

# 2. Run your migration
# (e.g., apply 21-citizenid-integration.sql)

# 3. If something goes wrong, restore from backup
./scripts/restore-database.sh ./backups/scmarket_backup_YYYYMMDD_HHMMSS.sql.gz
```

## Database Configuration

The scripts use the following configuration (from docker-compose.yml):

- Database: `scmarket`
- User: `scmarket`
- Password: `scmarket`
- Port: `5432`

If your database uses different credentials, update the variables at the top of each script.

## Game Data Import Scripts

### ⚠️ DEPRECATED: UEX and CStone Import Scripts

**The following scripts are deprecated and will be removed in a future version:**

- `import-items-from-uex.ts` - **DEPRECATED**
- `import-items-from-cstone.ts` - **DEPRECATED**

**Reason for deprecation:**
- The new P4K-based extraction system provides more accurate and complete game data
- Eliminates dependency on third-party APIs (UEXCorp and CStone)
- Provides better attribute coverage and data consistency
- Directly extracts data from game files for authoritative information

**Migration path:**
Use the new game data import system instead:
```bash
# Via API endpoint (recommended)
POST /api/v2/admin/game-data/import

# Or via the admin import service
# See docs/task-8.3-admin-import-endpoint-implementation.md
```

The deprecated scripts will continue to work but will display deprecation warnings. They are maintained only for backward compatibility and emergency fallback scenarios.

### import-items-from-uex.ts (DEPRECATED)

**⚠️ This script is deprecated. Use P4K-based extraction instead.**

Imports game items from UEXCorp API.

**Usage:**
```bash
npm run import-uex-items           # Normal mode
npm run import-uex-items -- --dry  # Dry run mode
```

### import-items-from-cstone.ts (DEPRECATED)

**⚠️ This script is deprecated. Use P4K-based extraction instead.**

Imports game items from CStone API.

**Usage:**
```bash
npm run import-cstone-items           # Normal mode
npm run import-cstone-items -- --dry  # Dry run mode
```

## Attribute Import Script

### import-all-attributes.ts

Imports game item attributes from external data sources (finder.cstone.space and UEXCorp.space) for all existing game items in the database.

**Note:** This script still relies on UEX for some attributes (size, grade, manufacturer). Future versions will migrate these to P4K-based extraction.

**Usage:**

```bash
npm run import-attributes
```

or directly with tsx:

```bash
tsx scripts/import-all-attributes.ts
```

**What it does:**

1. Fetches all game items from the database
2. For each game item, attempts to import attributes from configured external sources
3. Upserts imported attributes into the `game_item_attributes` table
4. Refreshes the `market_search_materialized` view after all imports complete
5. Provides detailed logging and a summary report

**Features:**

- Graceful error handling - continues processing even if individual imports fail
- Progress tracking with detailed logs
- Summary statistics at completion
- Automatic materialized view refresh
- Rate limiting to avoid overwhelming external APIs

**Expected Output:**

- Success/failure count for each game item
- Total attributes imported
- List of failed items with error details
- Materialized view refresh status

**Note:** This script may take several minutes to complete depending on the number of game items and external API response times. It's recommended to create a database backup before running this script for the first time.

### refresh-materialized-view.ts

Refreshes the `market_search_materialized` view to ensure it includes the latest data from game items, market listings, and attributes.

**Usage:**

```bash
npm run refresh-view
```

or directly with tsx:

```bash
tsx scripts/refresh-materialized-view.ts
```

**What it does:**

1. Executes `REFRESH MATERIALIZED VIEW market_search_materialized`
2. Verifies the view has data
3. Checks that the `game_item_id` column is properly populated
4. Provides statistics on the refresh operation

**When to run:**

- After running the attribute import script
- After bulk updates to game items or market listings
- When search results seem out of sync with the database

**Expected Output:**

- Refresh duration
- Total rows in the materialized view
- Number of rows with populated `game_item_id`
- Percentage of rows with game item data

**Note:** This operation may take several seconds to complete depending on the size of the database. The view is refreshed automatically by the import-attributes script, so you typically only need to run this manually if you've made direct database changes.
