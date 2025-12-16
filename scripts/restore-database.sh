#!/bin/bash

# Database Restore Script for SC Market
# This script restores a PostgreSQL database from a backup file
# It reads database configuration from .env file or uses defaults

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database configuration - read from env vars or use defaults
# First, try to read from environment (if already set)
DB_NAME="${DATABASE_TARGET:-scmarket}"
DB_USER="${DATABASE_USER:-scmarket}"
DB_PASSWORD="${DATABASE_PASS:-scmarket}"
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"

# If .env exists, try to read values from it
if [ -f .env ]; then
    # Read individual env vars if they exist
    if grep -q "^DATABASE_TARGET=" .env; then
        DB_NAME=$(grep "^DATABASE_TARGET=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
    fi
    if grep -q "^DATABASE_USER=" .env; then
        DB_USER=$(grep "^DATABASE_USER=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
    fi
    if grep -q "^DATABASE_HOST=" .env; then
        DB_HOST=$(grep "^DATABASE_HOST=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
    fi
    if grep -q "^DATABASE_PORT=" .env; then
        DB_PORT=$(grep "^DATABASE_PORT=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
    fi
    
    # If DATABASE_PASS is JSON (as used in the codebase), parse it
    if grep -q "^DATABASE_PASS=" .env; then
        # Extract the value after =, preserving JSON format
        DATABASE_PASS_VALUE=$(grep "^DATABASE_PASS=" .env | sed 's/^DATABASE_PASS=//')
        if [[ "$DATABASE_PASS_VALUE" == *"{"* ]]; then
            # Use Python to parse JSON (most reliable)
            if command -v python3 &> /dev/null; then
                DB_CONFIG=$(echo "$DATABASE_PASS_VALUE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f\"{d.get('host', '')}\n{d.get('port', '')}\n{d.get('username', '')}\n{d.get('password', '')}\n{d.get('dbname', '')}\")
except Exception as e:
    sys.exit(1)
" 2>/dev/null)
                if [ $? -eq 0 ] && [ -n "$DB_CONFIG" ]; then
                    DB_HOST_NEW=$(echo "$DB_CONFIG" | sed -n '1p')
                    DB_PORT_NEW=$(echo "$DB_CONFIG" | sed -n '2p')
                    DB_USER_NEW=$(echo "$DB_CONFIG" | sed -n '3p')
                    DB_PASSWORD_NEW=$(echo "$DB_CONFIG" | sed -n '4p')
                    DB_NAME_NEW=$(echo "$DB_CONFIG" | sed -n '5p')
                    
                    [ -n "$DB_HOST_NEW" ] && DB_HOST="$DB_HOST_NEW"
                    [ -n "$DB_PORT_NEW" ] && DB_PORT="$DB_PORT_NEW"
                    [ -n "$DB_USER_NEW" ] && DB_USER="$DB_USER_NEW"
                    [ -n "$DB_PASSWORD_NEW" ] && DB_PASSWORD="$DB_PASSWORD_NEW"
                    [ -n "$DB_NAME_NEW" ] && DB_NAME="$DB_NAME_NEW"
                fi
            fi
        else
            # DATABASE_PASS is a plain password
            DB_PASSWORD="$DATABASE_PASS_VALUE"
        fi
    fi
fi

# Apply defaults if still not set
DB_NAME="${DB_NAME:-scmarket}"
DB_USER="${DB_USER:-scmarket}"
DB_PASSWORD="${DB_PASSWORD:-scmarket}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: No backup file specified.${NC}"
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh ./backups/*.sql.gz 2>/dev/null || echo "  No backups found in ./backups/"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

echo -e "${YELLOW}Restoring database from backup...${NC}"
echo -e "  Backup file: ${BACKUP_FILE}"
echo -e "  Host: ${DB_HOST}:${DB_PORT}"
echo -e "  Database: ${DB_NAME}"
echo -e "  User: ${DB_USER}"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is not installed.${NC}"
    echo "Please install PostgreSQL client tools:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
    exit 1
fi

# Test database connection
echo -e "${YELLOW}Testing database connection...${NC}"
export PGPASSWORD="${DB_PASSWORD}"
if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}Error: Could not connect to database.${NC}"
    echo "Please check:"
    echo "  - Database is running and accessible at ${DB_HOST}:${DB_PORT}"
    echo "  - Credentials are correct"
    echo "  - Network/firewall allows connection"
    unset PGPASSWORD
    exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"

# Confirm before proceeding
echo -e "${YELLOW}WARNING: This will replace all data in the database!${NC}"
read -p "Are you sure you want to continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled."
    unset PGPASSWORD
    exit 0
fi

# Restore the backup
echo -e "${YELLOW}Restoring database...${NC}"

if [[ "$BACKUP_FILE" == *.gz ]]; then
    # Compressed backup
    gunzip -c "${BACKUP_FILE}" | psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"
else
    # Uncompressed backup
    psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" < "${BACKUP_FILE}"
fi

# Unset password
unset PGPASSWORD

echo -e "${GREEN}✓ Database restored successfully!${NC}"
