import type { Knex } from "knex"

/**
 * Watchlist (price alerts) options for the site's Settings -> Price Alerts:
 * - paused_at: set while the owner paused the watch; paused watches never alert.
 * - min_quality_tier: item watches only; alert only for listed lots of at least
 *   this quality tier (1-5), at the price of those lots.
 * Both are null for every existing watch, so the bot's watches behave as before.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("watchlist_items", (table) => {
    table.timestamp("paused_at").nullable()
    table.smallint("min_quality_tier").nullable()
  })
  await knex.raw(`
    ALTER TABLE watchlist_items
    ADD CONSTRAINT watchlist_items_min_quality_tier_check
    CHECK (min_quality_tier IS NULL OR (min_quality_tier BETWEEN 1 AND 5))
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_min_quality_tier_check",
  )
  await knex.schema.alterTable("watchlist_items", (table) => {
    table.dropColumn("min_quality_tier")
    table.dropColumn("paused_at")
  })
}
