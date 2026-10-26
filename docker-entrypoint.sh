#!/bin/sh
set -e
cd /app

# Apply pending DB migrations before serving. If a migration fails (for
# example it can't take its lock within MIGRATION_LOCK_TIMEOUT, see
# src/clients/database/session-settings.ts), `set -e` stops the container
# here, before it serves, so the Lightsail deploy fails and the previous
# image keeps running.
#
# Never delete knex_migrations rows here. A row without a file in this image
# can belong to a NEWER image (two deploys racing); deleting it makes the
# newer image run that migration again. knexfile.ts sets
# disableMigrationsListValidation so such rows don't stop an older image
# from booting. See docs/migrations.md.
npm run migrate:latest

exec node dist/src/server.js
