-- Objects production has that no file in config/postgres creates. Run on an
-- empty database before the legacy SQL files and the knex migrations.
DO $$ BEGIN CREATE ROLE scmarket; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE DOMAIN public.url AS text; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- item_variants.attributes_hash is computed with pgcrypto's digest().
CREATE EXTENSION IF NOT EXISTS pgcrypto;
