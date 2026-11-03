/**
 * Wipe items bookkeeping (listing_wipe_items, services/listing-wipe): kept
 * apart from the wipe service so the listing refresh can import it without a
 * cycle.
 */
import type { Knex } from "knex"
import logger from "../../logger/logger.js"

/**
 * Record that paused listings went back on the market (Relist all, a renew,
 * or an edit back to active): the admin's "relisted so far". Bookkeeping
 * only; never fails the caller.
 */
export async function markWipeRelisted(
  knex: Knex,
  listingIds: string[],
): Promise<void> {
  if (!listingIds.length) return
  try {
    await knex("listing_wipe_items")
      .whereIn("listing_id", listingIds)
      .whereNull("relisted_at")
      .update({ relisted_at: knex.fn.now() })
  } catch (error) {
    logger.warn("listing wipe: failed to record relist", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
