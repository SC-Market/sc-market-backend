# SC Market Backend

This repository hosts the backend for [SC Market](https://sc-market.space).

## Local Development

Please use the [.env.template](.env.template) file to create a local `.env` file.

### Database

The database can be spun up using docker-compose using the default credentials in the env template.
Using docker-compose will require also cloning [SCMarketBot](https://github.com/SC-Market/SCMarketBot) in an adjacent directory.

```shell
docker-compose up -d postgres
```

### Database Migrations

This project uses Knex for database migrations. Migrations are tracked automatically and provide version control for database schema changes.

#### Creating a New Migration

To create a new migration:

```shell
npm run migrate:make <migration_name>
```

This will create a new timestamped migration file in the `migrations/` directory with `up()` and `down()` functions.

Example:
```shell
npm run migrate:make add_user_preferences_table
```

#### Running Migrations

To apply all pending migrations:

```shell
npm run migrate:latest
```

This will execute all migrations that haven't been run yet, in chronological order.

#### Rolling Back Migrations

To rollback the last batch of migrations:

```shell
npm run migrate:rollback
```

To rollback all migrations:

```shell
npm run migrate:rollback --all
```

#### Checking Migration Status

To see which migrations have been applied:

```shell
npm run migrate:status
```

#### Migration Best Practices

1. **Always test migrations locally** before deploying to production
2. **Write reversible migrations** - ensure your `down()` function properly undoes the `up()` function
3. **Use transactions** - Knex wraps migrations in transactions by default for PostgreSQL
4. **Keep migrations focused** - each migration should handle one logical change
5. **Never modify existing migrations** that have been deployed - create a new migration instead
6. **Test rollback** - verify your `down()` function works before deploying
7. **Document complex migrations** - add comments explaining non-obvious logic
8. **Preserve V1 migrations** - existing migrations (0-61) remain as-is; new V2 migrations use Knex

### Backend Server

This project uses npm to manage dependencies. You can install dependencies using the `npm` command.

```shell
npm install
```

Running the project is simple and can be done with

```shell
npm run dev
```

You can ensure your changes build with

```shell
npm run build
```
