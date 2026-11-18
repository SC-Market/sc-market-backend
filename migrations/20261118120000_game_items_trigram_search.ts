import type { Knex } from "knex"

/**
 * Ranked, typo-tolerant item search (src/services/item-search/item-search.ts).
 *
 * - pg_trgm: similarity / word_similarity and the `%` / `%>` operators for
 *   the typo tier ("verdikt"), and trigram indexes that serve ILIKE
 *   '%...%'. Available on Amazon RDS for PostgreSQL (all supported
 *   versions; a trusted extension from PG 13) and in the postgres:16 image
 *   CI uses. Checked first so a server without it fails with a clear message.
 * - GIN trigram indexes on game_items.name and name_key (name match tiers,
 *   localization-key tier, typo tier), a GIN index on the english tsvector
 *   of name (word-prefix tier) and a btree on lower(manufacturer)
 *   (manufacturer tier), so every branch of the search's WHERE can use an
 *   index.
 *
 * game_items is not a hot table (migration-lock-rules.test.ts): only the game
 * data import writes it. CREATE INDEX takes a SHARE lock (reads go on) over
 * about ten thousand rows; lock_timeout makes it fail fast rather than queue.
 * Idempotent (IF NOT EXISTS).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const available = await knex.raw(
    "SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm'",
  )
  if (available.rows.length === 0) {
    throw new Error(
      "pg_trgm is not available on this Postgres server; item search needs it",
    )
  }
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_trgm")
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_game_items_name_trgm ON game_items USING GIN (name gin_trgm_ops)",
  )
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_game_items_name_key_trgm ON game_items USING GIN (name_key gin_trgm_ops)",
  )
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_game_items_name_tsv ON game_items USING GIN (to_tsvector('english', name))",
  )
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_game_items_manufacturer_lower ON game_items (lower(manufacturer))",
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_manufacturer_lower")
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_name_tsv")
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_name_key_trgm")
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_name_trgm")
  // The extension stays: dropping it would break anything else that uses it.
}
