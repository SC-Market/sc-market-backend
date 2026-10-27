import type { Knex } from "knex"

/**
 * Truncate listing_views.user_agent to 256 characters on old rows.
 *
 * Since 63df9b02a trackListingView stores at most 256 characters
 * (USER_AGENT_MAX_LENGTH in src/services/listing-views/listing-view-privacy.ts);
 * rows written before kept the full user agent. Their raw IPs are already
 * gone (20261027020000 dropped the column).
 *
 * Rows only: no ALTER, no index. Runs outside a single migration transaction:
 * it walks the table by primary key, BATCH_SIZE rows per transaction, so each
 * batch is one short statement holding its row locks briefly, with
 * lock_timeout 5s. Idempotent: rows already within the limit are not touched,
 * so a second run updates nothing.
 */
export const config = { transaction: false }

export const USER_AGENT_MAX_LENGTH = 256
export const BATCH_SIZE = 5000

/** Truncates every over-long user agent. Returns the number of rows updated. */
export async function truncateListingViewUserAgents(
  knex: Knex,
  batchSize: number = BATCH_SIZE,
): Promise<number> {
  let after: string | null = null
  let total = 0
  for (;;) {
    const row: { last: string | null; updated: number } = await knex.transaction(async (trx) => {
      await trx.raw("SET LOCAL lock_timeout = '5s'")
      const result = await trx.raw(
        `WITH batch AS (
           SELECT view_id FROM listing_views
            WHERE (?::uuid IS NULL OR view_id > ?::uuid)
            ORDER BY view_id
            LIMIT ?
         ),
         updated AS (
           UPDATE listing_views lv
              SET user_agent = left(lv.user_agent, ?)
             FROM batch
            WHERE lv.view_id = batch.view_id
              AND length(lv.user_agent) > ?
           RETURNING 1
         )
         SELECT (SELECT view_id FROM batch ORDER BY view_id DESC LIMIT 1) AS last,
                (SELECT count(*)::int FROM updated) AS updated`,
        [after, after, batchSize, USER_AGENT_MAX_LENGTH, USER_AGENT_MAX_LENGTH],
      )
      return result.rows[0]
    })
    total += row.updated
    if (!row.last) return total
    after = row.last
  }
}

export async function up(knex: Knex): Promise<void> {
  await truncateListingViewUserAgents(knex)
}

/** Nothing to undo: the truncated text is gone. */
export async function down(): Promise<void> {}
