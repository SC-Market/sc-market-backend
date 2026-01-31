# Scripts

This directory contains utility scripts for database management and data import.

## Component Attributes Import Script

The `import-component-attributes.ts` script imports ship component attribute data from external APIs and updates the database.

### Usage

```bash
tsx scripts/import-component-attributes.ts
```

This will:

1. Import component attributes from CStone API (cstone.space)
   - Parses size, grade, component class, manufacturer, and type from descriptions
   - Updates game_items records using cstone_uuid as the matching key

2. Import component attributes from UEX Corp Space API
   - Fetches structured data for size, manufacturer, and component type
   - Updates game_items records by matching item names

3. Refresh the materialized view
   - Runs `REFRESH MATERIALIZED VIEW CONCURRENTLY market_search_materialized`
   - Makes the imported data available for market search queries

### Output

The script provides detailed logging and a summary:

```
=== Import Summary ===
CStone: 150 successful, 0 failed, 50 skipped
UEX: 120 successful, 0 failed, 80 skipped
Total duration: 5432ms
=====================
```

### Error Handling

- Network errors are logged and the script exits with code 1
- Individual item failures are logged but don't stop the import
- Unhandled promise rejections and uncaught exceptions are caught and logged

### Requirements

This script implements requirements 7.1, 7.2, and 7.5 from the ship-component-attributes feature spec.

## Database Backup and Restore Scripts

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
