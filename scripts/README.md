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
