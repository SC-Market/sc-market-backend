#!/bin/sh
set -e
cd /app

# Apply pending DB migrations before serving (single-replica deploys only).
# Requires DATABASE_* (and NODE_ENV) from the container environment.
npm run migrate:latest

exec node dist/src/server.js
