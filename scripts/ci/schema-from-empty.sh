#!/usr/bin/env bash
# Builds the SC Market schema on an EMPTY database the way production got it:
# the legacy SQL in config/postgres, then `npm run migrate:latest` (the command
# docker-entrypoint.sh runs on every deploy).
#
# The target comes from the same variables knexfile.ts reads:
#   DATABASE_HOST (host name, or a unix socket directory), DATABASE_PORT,
#   DATABASE_USER, DATABASE_PASS, DATABASE_TARGET (an existing, empty database)
#
# CI runs it against the workflow's Postgres service container. Never point it
# at a real database.
set -euo pipefail
cd "$(dirname "$0")/../.."

export PGHOST="$DATABASE_HOST" PGPORT="$DATABASE_PORT" PGUSER="$DATABASE_USER" \
  PGPASSWORD="$DATABASE_PASS" PGDATABASE="$DATABASE_TARGET"

psql -q -v ON_ERROR_STOP=1 -f scripts/ci/pre-legacy.sql

# The legacy files are pg_dump output with a few statements that fail on a
# clean database (materialized views of tables created later); psql carries on,
# as it did when they were first applied.
for f in $(ls config/postgres/*.sql | sort -t/ -k3 -n); do
  psql -q -f "$f" > /dev/null 2>&1 || true
done

npm run migrate:latest
