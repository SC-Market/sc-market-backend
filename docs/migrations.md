# Migrations and database timeouts

Knex migrations in `migrations/` run at container start (`docker-entrypoint.sh`
runs `npm run migrate:latest`, then starts the server). A push to `main`
deploys, so a migration reaches production on merge. Never run migrations
against production by hand.

Background: on 2026-10-26 two deploys raced. The older image's entrypoint
deleted the `knex_migrations` row of a migration it didn't know, so the next
deploy ran it again. That migration took ACCESS EXCLUSIVE locks on accounts,
contractors and shops in one transaction and then failed. The serving
container's queries queued behind those locks with no timeout, its pool (5
connections) filled up, and the site returned 500s.

## Timeouts

All values live in `src/clients/database/session-settings.ts` and are applied
in each pool's `afterCreate`.

| Connection | statement_timeout | lock_timeout | idle_in_transaction |
| --- | --- | --- | --- |
| Server pool (`knex-db.ts`, max 15) | 15s | 10s | 30s |
| Background jobs (`withStatementTimeout`, per transaction) | 5min | 10s | 30s |
| Game-data import (own pool, max 2) | 30min | 10s | 5min |
| Migrations (`knexfile.ts`) | 60s | 5s | none |

- A migration that can't take its lock within 5s fails. The entrypoint runs
  under `set -e`, so the container exits before serving, the Lightsail deploy
  fails and the previous image keeps running. Fix or split the migration and
  push again; don't re-run the failed workflow.
- A migration that legitimately runs longer than 60s (a large backfill) raises
  the limit for its own transaction:

  ```ts
  export async function up(knex: Knex) {
    await knex.raw("SET LOCAL statement_timeout = '10min'")
    // ...
  }
  ```

  Keep it short anyway: everything it locks stays locked until it commits.
  Prefer batching a backfill over raising the timeout.
- Server code that runs a long statement outside a request (materialized view
  refreshes, rollups) uses `withStatementTimeout(knex, BACKGROUND_STATEMENT_TIMEOUT, trx => ...)`.
  It can't wrap statements that refuse a transaction block (CREATE INDEX
  CONCURRENTLY, REINDEX CONCURRENTLY, VACUUM).

## Locks

`src/test-utils/migration-lock-rules.test.ts` enforces these for migrations
newer than `20261026100000`:

- **One hot table per transactional migration.** Every ALTER TABLE (including
  `ADD COLUMN IF NOT EXISTS`, which still takes the lock) holds ACCESS
  EXCLUSIVE on its table until the migration's transaction ends. Several in one
  transaction add up: the first table stays blocked while the next lock is
  awaited. Put each hot-table ALTER in its own migration. The hot tables are
  listed in the test.
- **Indexes on hot tables: not in a migration.** `CREATE INDEX CONCURRENTLY`
  doesn't block writes, but before building it waits for every transaction
  already running on the database, which can outlast the deploy's health
  checks: as migration 20261027000000 it kept image a7c75ff from going live.
  Build them from a background task after the server is serving, on a
  dedicated connection with a long lock_timeout, guarded by
  `pg_try_advisory_lock` (old and new containers overlap during a deploy),
  dropping and rebuilding an INVALID index a failed build leaves behind. See
  `src/tasks/order-lookup-indexes.ts`. The lock-rules test rejects any
  `CREATE INDEX` on a hot table in a new migration.
- **Make migrations idempotent** (`IF NOT EXISTS`, `IF EXISTS`, checks before
  adding constraints). A migration can be run twice, for example if a deploy
  is rolled back to an image from before it.

## The `knex_migrations` table

- Never delete rows from it in code. A row whose file this image lacks can
  belong to a newer image; deleting it makes that image run the migration
  again.
- `knexfile.ts` sets `disableMigrationsListValidation: true`, so an older image
  boots even when the table has rows for newer migrations (knex would otherwise
  refuse with "The migration directory is corrupt").
- Don't rename or delete a migration file that has been deployed. To replace
  one, add a new migration.
- Deploy one commit at a time: wait for the running "Create and publish a
  Docker image" workflow to finish before pushing again.

## Connection budget

RDS Postgres defaults `max_connections` to
`LEAST(DBInstanceClassMemory/9531392, 5000)`. Connections the backend can hold
at once:

- Server pool: 15 per container. During a Lightsail deploy the old and new
  containers overlap, so 30.
- Migrations: 2 (only while the new container starts).
- Game-data import: 2 while an import runs.
- The discord bot container doesn't connect to the database.

That is 34 at most for the backend, plus anything else on the same instance
(sc-orgs' pool is max 10, admin sessions). Check
`SELECT setting FROM pg_settings WHERE name = 'max_connections'` before
raising the pool.
