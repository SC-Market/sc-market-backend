import { Knex } from "knex"

/**
 * Data fix: V1 listings that were 'inactive' were incorrectly migrated to
 * V2 'cancelled'. This restores them to V2 'inactive'.
 */
export async function up(knex: Knex): Promise<void> {
  // Update V2 listings that were V1 'inactive' from 'cancelled' back to 'inactive'
  const updated = await knex.raw(`
    UPDATE listings
    SET status = 'inactive'
    WHERE listing_id IN (
      SELECT m.v2_listing_id
      FROM v1_v2_listing_map m
      JOIN market_listings ml ON ml.listing_id = m.v1_listing_id
      WHERE ml.status = 'inactive'
    )
    AND status = 'cancelled'
  `)
  const count = updated?.rowCount ?? updated?.[0]?.affectedRows ?? 0
  if (count > 0) {
    console.log(`[migration] Restored ${count} V1 inactive listings from cancelled to inactive`)
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert: set them back to cancelled
  await knex.raw(`
    UPDATE listings
    SET status = 'cancelled'
    WHERE listing_id IN (
      SELECT m.v2_listing_id
      FROM v1_v2_listing_map m
      JOIN market_listings ml ON ml.listing_id = m.v1_listing_id
      WHERE ml.status = 'inactive'
    )
    AND status = 'inactive'
  `)
}
