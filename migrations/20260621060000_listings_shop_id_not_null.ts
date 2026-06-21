import type { Knex } from "knex"

/**
 * Makes shop_id NOT NULL on listings.
 *
 * Safe to run because:
 * - 20260621020000_backfill_shops.ts populated shop_id for all existing listings
 * - createListing requires shop_id — no fallback paths that could leave it NULL
 *
 * Includes a safety check that will fail loudly if any NULLs remain.
 */
export async function up(knex: Knex): Promise<void> {
  // Safety check: verify no NULL shop_ids remain
  const nullCount = await knex("listings").whereNull("shop_id").count("* as count").first()
  if (nullCount && Number(nullCount.count) > 0) {
    throw new Error(
      `Cannot make shop_id NOT NULL: ${nullCount.count} listings still have NULL shop_id. ` +
      `Run the backfill migration first or investigate these listings.`
    )
  }

  await knex.raw(`ALTER TABLE listings ALTER COLUMN shop_id SET NOT NULL`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE listings ALTER COLUMN shop_id DROP NOT NULL`)
}
