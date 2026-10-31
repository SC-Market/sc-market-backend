import type { Knex } from "knex"

/**
 * Player-market price oracle: one row per game item per UTC day, written by
 * the snapshot job (services/price-oracle). The public price feed and the
 * aggregate pages read the 30-day trend from here instead of scanning
 * listings per request. Aggregates only: no seller, buyer or listing ids.
 *
 * A new table, no foreign key (a FK would lock game_items) and no ALTER of an
 * existing table. Idempotent: IF NOT EXISTS throughout.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS game_item_price_daily (
      game_item_id uuid NOT NULL,
      day date NOT NULL,
      ask_count integer NOT NULL DEFAULT 0,
      seller_count integer NOT NULL DEFAULT 0,
      quantity_available bigint NOT NULL DEFAULT 0,
      lowest_ask bigint,
      median_ask bigint,
      highest_ask bigint,
      outliers_excluded integer NOT NULL DEFAULT 0,
      sale_count_30d integer NOT NULL DEFAULT 0,
      sale_median_30d bigint,
      median_30d bigint,
      change_pct_30d numeric,
      days_with_median_30d integer NOT NULL DEFAULT 0,
      computed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (game_item_id, day)
    )
  `)
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_game_item_price_daily_day ON game_item_price_daily (day)",
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS game_item_price_daily")
}
